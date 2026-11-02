from pathlib import Path
import json,subprocess,shutil
root=Path.cwd();ff=root/'.local/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';out=root/'docs/design/issue33-review';shots=root/'.local/issue33-captures'
for tag in ('A','B'):
    meta=json.loads((root/f'.local/issue33-round1-{tag}.json').read_text(encoding='utf-8'))
    video=next(Path(meta['dir']).glob('*.webm'))
    subprocess.run([str(ff),'-y','-hide_banner','-loglevel','error','-i',str(video),'-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',str(out/f'操作錄影-{tag}-fixture.mp4')],check=True)
for tag in ('P01','P02','P03','P04','P05','B06','B07','B08','B09','B10'):
    subprocess.run([str(ff),'-y','-hide_banner','-loglevel','error','-i',str(shots/f'reference-{tag}.jpg'),'-i',str(shots/f'product-{tag}.jpg'),'-filter_complex','[0:v][1:v]hstack=inputs=2[v]','-map','[v]','-frames:v','1',str(out/f'並排-{tag}.png')],check=True)
for side in ('reference','product'):
    subprocess.run([str(ff),'-y','-hide_banner','-loglevel','error','-i',str(shots/f'{side}-P06.jpg'),'-i',str(shots/f'{side}-P07.jpg'),'-i',str(shots/f'{side}-P08.jpg'),'-filter_complex','[0:v]scale=683:384[a];[1:v]scale=683:384[b];[2:v]scale=683:384[c];[a][b][c]vstack=inputs=3[v]','-map','[v]','-frames:v','1',str(root/f'.local/issue33-{side}-states.png')],check=True)
subprocess.run([str(ff),'-y','-hide_banner','-loglevel','error','-i',str(root/'.local/issue33-reference-states.png'),'-i',str(root/'.local/issue33-product-states.png'),'-filter_complex','[0:v][1:v]hstack=inputs=2[v]','-map','[v]','-frames:v','1',str(out/'並排-P06-P08.png')],check=True)
for name in ('B06-top','B09-impact','B10-times'):shutil.copy2(shots/f'product-{name}.jpg',out/f'product-{name}.jpg')
print('正常速度 MP4 與並排圖完成；未改寫時間軸。')
