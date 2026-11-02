"""第 40 項並排畫面與正常速度 MP4；只裁掉啟動段，不加速、不跳接。"""
from pathlib import Path
import os
import subprocess

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/design/issue40'
FFMPEG=Path(os.environ.get('FFMPEG_PATH',str(ROOT/'.local/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe')))
(OUT/'paired').mkdir(exist_ok=True)
def run(*args):
    subprocess.run([str(FFMPEG),'-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)

for source in sorted((OUT/'reference').glob('*.png')):
    run('-i',source,'-i',OUT/'product'/source.name,'-filter_complex','[0:v][1:v]hstack=inputs=2','-frames:v','1',OUT/'paired'/source.name)
for tag in ('A','B'):
    lines=(ROOT/f'.local/issue40-video-{tag}.txt').read_text(encoding='utf-8').splitlines()
    source=Path(lines[2])
    run('-ss',lines[1],'-i',source,'-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart','-an',OUT/f'fixture-{tag}.mp4')
    print(f'已產生錄影 {tag}：{source.parent.name}')
