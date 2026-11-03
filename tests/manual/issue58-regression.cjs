// 沿用前兩段的實際瀏覽器回歸；證據獨立寫入第四段，不覆蓋歷史。
const fs=require('fs'),path=require('path'),Module=require('module');
const stage=process.env.STAGE==='2'?'56':'57';const file=path.join(__dirname,`issue${stage}-environment.cjs`);
const run=new Module(file,module);run.filename=file;run.paths=module.paths;
run._compile(fs.readFileSync(file,'utf8').replaceAll(`docs/design/issue${stage}/`,`docs/design/issue58/回歸第${stage==='56'?'二':'三'}段-`),file);
