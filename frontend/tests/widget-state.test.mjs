import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function mount(storage = new Map()) {
  const elements = [], messages = [], listeners = {};
  const createElement = tag => {
    const element = {tag, dataset: {}, style: {}, attributes: {}, listeners: {},
      setAttribute(key, value) {this.attributes[key] = value;}, focus() {}, append() {},
      getBoundingClientRect() {return {width:parseFloat(this.style.width),height:parseFloat(this.style.height)};},
      addEventListener(name, handler) {this.listeners[name] = handler;},
      attachShadow() {return {append() {}};},
      contentWindow: {postMessage(message, origin) {messages.push({message, origin});}},
    };
    elements.push(element); return element;
  };
  runInNewContext(readFileSync(new URL('../public/widget-loader.js', import.meta.url), 'utf8'), {
    document: {currentScript: {src: 'http://mes.local/KSS_MES/ai-agent/widget-loader.js', dataset: {}}, querySelector: () => null, createElement, body: {append() {}}},
    location: new URL('http://mes.local/KSS_MES/wwwroot/index.html'), URL, URLSearchParams,
    localStorage: {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    window: {innerWidth:1366,innerHeight:768,addEventListener(name, handler) {listeners[name] = handler;}},
  });
  const frame = elements.find(el => el.tag === 'iframe'), launcher = elements.find(el => el.tag === 'button');
  const message = (type, value = {}, source = frame.contentWindow, origin = 'http://mes.local') => listeners.message({source, origin, data: {type, ...value}});
  return {elements, frame, launcher, messages, message};
}
test('宿主收合再開啟保留同一 iframe，放大時隱藏入口且重新開啟可恢復尺寸', () => {
  const {elements, frame, launcher, messages, message} = mount();
  assert.equal(frame.src, undefined);
  launcher.listeners.click();
  const original = frame.src;
  assert.equal(launcher.style.display, '');
  message('kaosu-assistant:resize', {expanded: true});
  assert.equal(launcher.style.display, 'none');
  message('kaosu-assistant:close');
  assert.equal(frame.style.display, 'none');
  assert.equal(launcher.attributes['aria-expanded'], 'false');
  launcher.listeners.click();
  message('kaosu-assistant:resize', {expanded: true});
  assert.equal(frame.style.display, 'block');
  assert.equal(frame.dataset.expanded, 'true');
  assert.equal(frame.src, original);
  assert.equal(elements.filter(el => el.tag === 'iframe').length, 1);
  assert.equal(messages.length, 2);
  assert.ok(messages.every(entry => entry.origin === 'http://mes.local' && entry.message.type === 'kaosu-assistant:open'));
});
test('其他視窗或跨站訊息不能控制助理外框', () => {
  const {frame, launcher, message} = mount();
  launcher.listeners.click();
  message('kaosu-assistant:close', {}, {});
  message('kaosu-assistant:resize', {expanded: true}, frame.contentWindow, 'http://other.invalid');
  assert.equal(frame.style.display, 'block');
  assert.equal(frame.dataset.expanded, undefined);
});
test('宿主接收三語與深色偏好只更新外觀，不重建 iframe', () => {
  const {frame, launcher, message} = mount();
  launcher.listeners.click();
  const original = frame.src;
  message('kaosu-assistant:preferences', {locale: 'th', theme: 'dark', resolvedTheme: 'dark'});
  assert.equal(launcher.attributes['aria-label'], 'ปิดผู้ช่วยการผลิต');
  assert.equal(frame.style.background, '#18181b');
  assert.equal(frame.src, original);
});

test('浮窗鍵盤調整、重新掛載恢復與重設不重建 iframe', () => {
  const storage = new Map();
  const {elements, frame, launcher, message} = mount(storage);
  const resize = elements.find(el=>el.className==='kaosu-resize');
  launcher.listeners.click();
  const original = frame.src;
  resize.listeners.keydown({key:'ArrowLeft',shiftKey:true,preventDefault(){}});
  assert.equal(frame.style.width,'628px');
  assert.equal(frame.src,original);
  assert.equal(mount(storage).frame.style.width,'628px');
  message('kaosu-assistant:resize',{expanded:true});
  assert.equal(resize.style.display,'none');
  message('kaosu-assistant:resize',{expanded:false});
  assert.equal(resize.style.display,'block');
  resize.listeners.keydown({key:'Enter',preventDefault(){}});
  assert.equal(frame.style.width,'564px');
  assert.equal(storage.has('kaosu-assistant:size'),false);
  message('kaosu-assistant:preferences',{locale:'en',theme:'navy',resolvedTheme:'navy'});
  assert.equal(frame.style.background,'#10182d');
  assert.equal(frame.src,original);
});
