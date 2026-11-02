"""第35項正常速度錄影：僅統一畫布、串接兩尺寸，不加速不跳接。"""
from pathlib import Path
import os, subprocess
root=Path(__file__).resolve().parents[2]
ff=Path(os.environ.get('FFMPEG_PATH',str(root/'.local/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe')))
out=root/'docs/design/issue35'
files=(root/'.local/issue35-videos.txt').read_text(encoding='utf-8').splitlines()
label=root/'.local/issue35-video-label.txt'
label.write_text('fixture／模擬分類 — 隔離資料，未寫入正式 MES',encoding='utf-8')
def escaped(p): return str(p).replace('\\','/').replace(':','\\:')
text=f"drawtext=fontfile='{escaped(Path('C:/Windows/Fonts/msjh.ttc'))}':textfile='{escaped(label)}':fontsize=18:fontcolor=white:box=1:boxcolor=black@0.8:x=12:y=h-28"
args=[str(ff),'-hide_banner','-loglevel','error','-y']
for file in files[:2]: args+=['-i',file]
args+=['-filter_complex',f'[0:v]pad=1366:844:(ow-iw)/2:0:black,setsar=1[a];[1:v]pad=1366:844:(ow-iw)/2:0:black,setsar=1[b];[a][b]concat=n=2:v=1:a=0,{text}[v]','-map','[v]','-c:v','libx264','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(out/'錄影A-宿主.mp4')]
subprocess.run(args,check=True)
if not os.environ.get('ONLY_A'):
 subprocess.run([str(ff),'-hide_banner','-loglevel','error','-y','-i',files[2],'-vf',text,'-c:v','libx264','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(out/'錄影B-鍵盤與外觀.mp4')],check=True)
for p in out.glob('*.mp4'):
 b=p.read_bytes();assert b'avc1' in b and b.index(b'moov')<b.index(b'mdat')
print('兩段 H.264 MP4 已完成，faststart 檢查通過')
