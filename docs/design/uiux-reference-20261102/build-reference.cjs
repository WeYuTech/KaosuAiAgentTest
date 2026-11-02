const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const directory=__dirname;
const fragment=fs.readFileSync(path.join(directory,'reference-fragment.html'),'utf8');
const library=path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'lucide');
const lucideExports=require(path.join(library,'dist/umd/lucide.js'));
const names=new Set([...fragment.matchAll(/['"]([a-z]+(?:-[a-z0-9]+)*)['"]/g)].map(m=>m[1]));
const icons={};
for(const name of names){const key=name.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join('');if(lucideExports.icons[key])icons[key]=lucideExports.icons[key];}
const seen=new Set(),modules=[];
function add(file){if(seen.has(file))return;seen.add(file);const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/^import .* from ['"]([^'"]+)['"];?$/gm))add(path.resolve(path.dirname(file),match[1]));modules.push(source.replace(/^import .*$/gm,'').replace(/^export .*$/gm,'').replace(/^\/\/# sourceMappingURL=.*$/gm,''));}
add(path.join(library,'dist/esm/lucide.js'));
const license=fs.readFileSync(path.join(library,'LICENSE'),'utf8');
const lucide='/*\n'+license+'\n*/\n(()=>{\n'+modules.join('\n')+'\nconst chosen='+JSON.stringify(icons)+';globalThis.lucide={icons:chosen,createIcons:options=>createIcons({...options,icons:chosen})};})();';
const html=`<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'">
<title>WeYu 全系統 UI／UX 互動參考</title>
<style>html{color-scheme:light dark;background:light-dark(#f5f6f8,#111214)}body{margin:0;padding:0 16px 16px}#weyu-ux-reference{max-width:1600px;margin:auto}@media(max-width:560px){body{padding:0 8px 8px}}</style>
<script>${lucide}</script></head><body>${fragment}</body></html>`;
fs.writeFileSync(path.join(directory,'reference.html'),html);
fs.writeFileSync(path.join(directory,'lucide-license.txt'),license);
fs.copyFileSync(path.join(directory,'reference-fragment.html'),path.join(directory,'..','weyu-uiux-reference.html'));
console.log(JSON.stringify({bytes:Buffer.byteLength(html),icons:Object.keys(icons).length,sha256:crypto.createHash('sha256').update(html).digest('hex')}));
