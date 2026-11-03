// 完整沿用第二段瀏覽器斷言，只把本輪證據寫入第三段目錄。
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const file=path.join(__dirname,'issue56-environment.cjs');
const run=new Module(file,module);run.filename=file;run.paths=module.paths;
run._compile(fs.readFileSync(file,'utf8').replaceAll('docs/design/issue56/','docs/design/issue57/回歸第二段-'),file);
