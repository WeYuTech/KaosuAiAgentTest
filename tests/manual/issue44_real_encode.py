"""真實模型煙霧錄影：正常速度串接三次操作，無剪除等待。"""
import os
import subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
ff=Path(os.getenv('FFMPEG_PATH',str(root/'.local/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe')))
label=root/'.local/issue44-real/錄影標題.txt'
label.write_text('真實 OpenAI 模型／隔離模擬業務資料／未確認寫入',encoding='utf-8')
def escape(path):return str(path).replace('\\','/').replace(':','\\:')
files=(root/'.local/issue44-real/錄影來源.txt').read_text('utf-8').splitlines()
args=[str(ff),'-hide_banner','-loglevel','error','-y']
for source in files:args+=['-i',source]
filters=''.join(f'[{i}:v]' for i in range(len(files)))+f"concat=n={len(files)}:v=1:a=0,pad=iw:ih+32:0:32:black,drawtext=fontfile='{escape(Path('C:/Windows/Fonts/msjh.ttc'))}':textfile='{escape(label)}':fontsize=18:fontcolor=white:x=8:y=6[v]"
target=root/'docs/design/issue44/錄影C-真實模型煙霧.mp4'
subprocess.run(args+['-filter_complex',filters,'-map','[v]','-c:v','libx264','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(target)],check=True)
data=target.read_bytes();assert b'avc1' in data and data.index(b'moov')<data.index(b'mdat')
