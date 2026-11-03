"""第47項錄影：正常速度 H.264／yuv420p／faststart，額外頂列標示隔離來源。"""
import os, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
ff=Path(os.getenv('FFMPEG_PATH',str(root/'.local/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe')))
out=root/'docs/design/issue47'
def escape(path):return str(path).replace('\\','/').replace(':','\\:')
for mode,title,note in [('fixture','錄影A-分段與停止','fixture／模擬分類 · 隔離資料 · 完整緩衝代理'),('real','錄影B-真實模型分段','真實模型 · 隔離業務資料 · 完整緩衝代理 · 唯讀查詢')]:
    folder=root/('.local/issue47-'+mode+('-verified' if mode=='fixture' else ''))
    source=(folder/'video.txt').read_text('utf-8').strip()
    label=folder/'label.txt';label.write_text(note,encoding='utf-8')
    overlay=f"pad=iw:ih+32:0:32:black,drawtext=fontfile='{escape(Path('C:/Windows/Fonts/msjh.ttc'))}':textfile='{escape(label)}':fontsize=18:fontcolor=white:x=8:y=6"
    target=out/(title+'.mp4')
    subprocess.run([str(ff),'-hide_banner','-loglevel','error','-y','-i',source,'-vf',overlay,'-c:v','libx264','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(target)],check=True)
    data=target.read_bytes();assert b'avc1' in data and data.index(b'moov')<data.index(b'mdat')
print('兩段正常速度 H.264 MP4 已完成')
