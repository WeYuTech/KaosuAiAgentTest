// 正常速度操作正式 React；公開 HTTP 全為 fixture，無模型及 MES 寫入。
const {start,fixture,prepare,root}=require('./issue58-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
(async()=>{const app=await start(),dir=path.join(root,'.local/issue58-video');fs.mkdirSync(dir,{recursive:true});try{
 const context=await app.browser.newContext({viewport:{width:1366,height:768},colorScheme:'dark',recordVideo:{dir,size:{width:1366,height:768}}});const p=await context.newPage();
 async function load(scene){await p.unroute('**/api/**');const c=await fixture(p,scene);await p.goto(app.url+'/?embed=1');await prepare(p,c);await p.waitForTimeout(1400);return c;}
 const fail=await load('save-error');fail.fail=false;await p.getByRole('button',{name:'重試儲存',exact:true}).click();await p.waitForTimeout(1800);
 const submitting=await load('submitting');await p.waitForTimeout(2500);submitting.release();await p.locator('.operation-receipt').waitFor();await p.waitForTimeout(1800);await p.locator('.operation-receipt summary').click();await p.waitForTimeout(1800);
 await load('unknown');await p.getByRole('button',{name:'查核執行結果',exact:true}).click();await p.waitForTimeout(2000);
 const video=p.video();await context.close();const input=await video.path();fs.writeFileSync(path.join(dir,'標示.txt'),'fixture／模擬分類 · 非正式 MES · 正常速度 · 提交延遲超過 2 秒 · 僅隔離 HTTP 模擬提交');
 const ff=path.join(root,'.local/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');const r=spawnSync(ff,['-y','-hide_banner','-loglevel','error','-i',input,'-vf',"pad=iw:ih+32:0:32:color=black,drawtext=fontfile='C\\:/Windows/Fonts/msjh.ttc':textfile='.local/issue58-video/標示.txt':fontcolor=white:fontsize=16:x=12:y=8",'-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',path.join(root,'docs/design/issue58/正常速度-fixture.mp4')],{cwd:root,encoding:'utf8'});if(r.status)throw new Error(r.stderr);console.log('正常速度 H.264 MP4 完成');
}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});
