import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {translations} from '../src/translations.ts';
function files(path){return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(path,e.name)):[join(path,e.name)]);}
test('所有固定 t() 中文介面文字都有英文及泰文，防止漏翻回歸',()=>{
 const missing=[];
 for(const path of files('src').filter(p=>p.endsWith('.tsx'))){
  const text=readFileSync(path,'utf8');
  for(const match of text.matchAll(/\bt\(['"]([^'"]+)['"]/g)){
   const key=match[1];if(!/[\u3400-\u9fff]/.test(key))continue;
   if(!translations[key]?.every(v=>v.trim()&&!/[\u3400-\u9fff]/.test(v)))missing.push(`${path}: ${key}`);
  }
 }
 assert.deepEqual(missing,[]);
});
test('獨立確認的動作名稱具備三語，插值不可混入中文',()=>{
 for(const key of ['整張排程完工','今天想完成什麼？','選擇／更換對象','完成','取消'])assert.ok(translations[key]?.every(v=>!/[\u3400-\u9fff]/.test(v)));
});
