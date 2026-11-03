import {test} from 'node:test';
import assert from 'node:assert/strict';
import {entryPresentation} from '../src/chat-title.ts';
const messages=[{role:'user',content:'你能幫我做什麼？'}];
test('中立聊天只採相同識別的清單標題與選中狀態',()=>{
 assert.deepEqual(entryPresentation('a',messages,[{id:'a',title:'MC37 今日生產'}]),{title:'MC37 今日生產',selectedId:'a'});
 assert.deepEqual(entryPresentation('a',messages,[{id:'b',title:'MC37 今日生產'}]),{title:messages[0].content,selectedId:null});
 assert.deepEqual(entryPresentation('a',messages,[{id:'a',title:'已刪除',is_deleted:true}]),{title:messages[0].content,selectedId:null});
});
test('沒有標題時依清單規則取第一句前六十個字，不切斷 Unicode 字元',()=>{
 const first='😀'.repeat(65);assert.equal(entryPresentation('a',[{role:'user',content:first},{role:'user',content:'第二句'}],[]).title,'😀'.repeat(60));
 assert.equal(entryPresentation('a',messages,[{id:'a',title:''}]).title,messages[0].content);
 assert.deepEqual(entryPresentation('a',[],[{id:'a',title:'舊聊天'}]),{title:'',selectedId:null});
});
