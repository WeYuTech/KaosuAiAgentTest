"""第44項錄影轉碼：不調整時間軸；保留原始畫面，在額外頂部留白標明模擬。"""
import os
import subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
ff=Path(os.getenv('FFMPEG_PATH',str(root/'.local/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe')))
out=root/'docs/design/issue44'
label=root/'.local/issue44-video-label.txt';label.write_text('fixture／模擬分類 · 隔離資料，未寫入正式 MES',encoding='utf-8')
def escape(path):return str(path).replace('\\','/').replace(':','\\:')
def overlay(size):return f"pad=iw:ih+32:0:32:black,drawtext=fontfile='{escape(Path('C:/Windows/Fonts/msjh.ttc'))}':textfile='{escape(label)}':fontsize={size}:fontcolor=white:x=8:y=6"
common=[str(ff),'-hide_banner','-loglevel','error','-y']
encode=['-c:v','libx264','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart','-an']
source=(root/'.local/issue44-video.txt').read_text('utf-8').strip()
subprocess.run(common+['-i',source,'-vf',overlay(18)]+encode+[str(out/'錄影A-串流停止與恢復.mp4')],check=True)
files=(root/'.local/issue44-matrix-videos.txt').read_text('utf-8').splitlines()
args=common.copy()
for source in files:args+=['-i',source]
filters=''.join(f'[{i}:v]' for i in range(len(files)))+f'concat=n={len(files)}:v=1:a=0,'+overlay(12)+'[v]'
subprocess.run(args+['-filter_complex',filters,'-map','[v]']+encode+[str(out/'錄影B-三語窄版.mp4')],check=True)
for file in out.glob('*.mp4'):
    data=file.read_bytes();assert b'avc1' in data and data.index(b'moov')<data.index(b'mdat')
print('H.264／yuv420p／faststart 完成，沒有加速或抽掉等待時間')
