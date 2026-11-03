// 正常速度操作；API 是本機 fixture，分類延遲至少 2.1 秒，非正式 MES。
const {start,fixture,root}=require('./issue55-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
(async()=>{const app=await start();const dir=path.join(root,'.local/issue55-video');fs.mkdirSync(dir,{recursive:true});try{
 const context=await app.browser.newContext({viewport:{width:1366,height:768},colorScheme:'dark',recordVideo:{dir,size:{width:1366,height:768}}});
 const page=await context.newPage();await fixture(page,'capabilities');await page.goto(app.url+'/?embed=1');await page.locator('#entry-input').waitFor();await page.waitForTimeout(1000);
 await page.locator('#entry-input').pressSequentially('你能幫我做什麼？',{delay:140});await page.locator('#entry-input').press('Enter');await page.locator('.entry-message.assistant').waitFor();await page.waitForTimeout(1500);
 await page.getByRole('button',{name:'搜尋聊天',exact:true}).click();await page.waitForTimeout(1100);await page.locator('input[aria-label="搜尋聊天"]').pressSequentially('MC99',{delay:180});await page.waitForTimeout(1400);
 await page.getByRole('button',{name:'清除搜尋',exact:true}).click();await page.waitForTimeout(1000);await page.getByRole('button',{name:'關閉搜尋',exact:true}).click();
 await page.getByRole('button',{name:'聊天室選單：MC37 今日生產',exact:true}).click();await page.getByRole('menuitem',{name:'重新命名',exact:true}).click();await page.waitForTimeout(1000);await page.locator('.history-dialog input').fill('MC37 今日生產追蹤');await page.waitForTimeout(1000);await page.getByRole('button',{name:'儲存',exact:true}).click();await page.waitForTimeout(1200);
 const handle=page.getByRole('separator');const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+100);await page.mouse.down();await page.mouse.move(box.x+70,box.y+100,{steps:25});await page.mouse.up();await page.waitForTimeout(1000);await handle.focus();await page.keyboard.press('Backspace');await page.waitForTimeout(1000);
 await page.getByRole('button',{name:'收合側欄',exact:true}).click();await page.waitForTimeout(800);await page.getByRole('button',{name:'展開側欄',exact:true}).click();await page.waitForTimeout(1200);
 const video=page.video();await context.close();const file=await video.path();
 const label=path.join(dir,'標示.txt');fs.writeFileSync(label,'fixture／模擬分類 · 非正式 MES · 正常速度 · 回應延遲 2.1 秒');
 const ff=path.join(root,'.local/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
 const result=spawnSync(ff,['-y','-hide_banner','-loglevel','error','-i',file,'-vf',"pad=iw:ih+32:0:32:color=black,drawtext=fontfile='C\\:/Windows/Fonts/msjh.ttc':textfile='.local/issue55-video/標示.txt':fontcolor=white:fontsize=16:x=12:y=8",'-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',path.join(root,'docs/design/issue55/正常速度-fixture.mp4')],{cwd:root,encoding:'utf8'});
 if(result.status)throw new Error(result.stderr);console.log('H.264 MP4 錄製完成');
}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});
