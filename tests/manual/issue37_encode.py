"""組合第 37 項並排證據；錄影僅裁去啟動畫面，不變更播放速度。"""
from pathlib import Path
import os
import subprocess

ROOT=Path(__file__).resolve().parents[2]
FFMPEG=Path(os.environ.get('FFMPEG_PATH',str(ROOT/'.local/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe')))
OUT=ROOT/'docs/design/issue37'
(OUT/'paired').mkdir(exist_ok=True)

def run(*args):
    subprocess.run([str(FFMPEG),'-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)

for number in range(1,6):
    for phase in ('sheet','review'):
        name=f'B{number:02}-{phase}'
        run('-i',OUT/'reference'/f'{name}.png','-i',OUT/'product'/f'product-{name}.jpg','-filter_complex','[0:v][1:v]hstack=inputs=2','-frames:v','1',OUT/'paired'/f'{name}.png')
for name in ('A','B'):
    lines=(ROOT/f'.local/issue37-video-{name}.txt').read_text(encoding='utf-8').splitlines()
    source=next(Path(lines[0]).glob('*.webm'))
    run('-ss',lines[1],'-i',source,'-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart','-an',OUT/f'fixture-{name}.mp4')
    run('-i',OUT/f'fixture-{name}.mp4','-frames:v','1',ROOT/f'.local/issue37-video-{name}-first.png')
    print(f'完成並排截圖與正常速度錄影 {name}')
