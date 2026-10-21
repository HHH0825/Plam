"""Isolated image measurements; never presented as cloud or handset peak memory."""
import argparse
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/images/photo-compression-20261009'
STAGE=ROOT/'deploy/cloudbase/photo-compression-20261009/candidate/palm-api'

def worker(sample, client_prepared):
    sys.path.insert(0,str(STAGE))
    from palm.photo import normalized_photo,thumbnail_bytes
    from PIL import Image,__version__ as pillow_version
    from werkzeug.datastructures import FileStorage
    spec=importlib.util.spec_from_file_location('memory_observer',ROOT/'deploy/cloudbase/photo_memory_check.py')
    observer=importlib.util.module_from_spec(spec);spec.loader.exec_module(observer)
    raw=sample.read_bytes()
    if client_prepared:
        # A separate fixture-production process encodes the JPEG before measured processing.
        pass
    baseline=observer.peak_bytes();started=time.perf_counter()
    full=normalized_photo(FileStorage(stream=io.BytesIO(raw),filename=sample.name));thumb=thumbnail_bytes(full)
    elapsed=round((time.perf_counter()-started)*1000,2)
    with Image.open(io.BytesIO(full)) as photo: width,height=photo.size
    with Image.open(io.BytesIO(thumb)) as photo: tw,th=photo.size
    assert len(full)<=200*1024 and len(thumb)<=30*1024 and max(width,height)<=1280 and max(tw,th)<=320
    name=sample.stem
    (OUT/(name+'-full.jpg')).write_bytes(full);(OUT/(name+'-thumb.jpg')).write_bytes(thumb)
    return {'sample':sample.name,'input_bytes':len(raw),'full_bytes':len(full),'thumb_bytes':len(thumb),
        'full_dimensions':[width,height],'thumb_dimensions':[tw,th],'elapsed_ms':elapsed,
        'baseline_peak_bytes':baseline,'process_peak_bytes':observer.peak_bytes(),
        'client_prepared_fixture':client_prepared,'pillow_version':pillow_version}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--sample',type=Path);parser.add_argument('--client-prepared',action='store_true');args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    if args.sample: print(json.dumps(worker(args.sample,args.client_prepared)));return
    from PIL import Image,ImageOps
    folder=ROOT/'.qa-stability/photos';prepared=ROOT/'.qa-stability/photo-compression-20261009';prepared.mkdir(parents=True,exist_ok=True)
    samples=list(folder.glob('*.jpg'))+list(folder.glob('*.png'))+list(folder.glob('*.webp'))
    for source in samples:
        with Image.open(source) as image:
            image.thumbnail((1280,1280))
            with ImageOps.exif_transpose(image) as oriented:
                with oriented.convert('RGB') as picture:
                    buf=io.BytesIO();picture.save(buf,'JPEG',quality=82)
                    while len(buf.getvalue())>200*1024:
                        picture.thumbnail((max(1,int(picture.width*.8)),max(1,int(picture.height*.8))))
                        buf=io.BytesIO();picture.save(buf,'JPEG',quality=68)
                    (prepared/(source.stem+'-client.jpg')).write_bytes(buf.getvalue())
    rows=[]
    for sample in samples+list(prepared.glob('*.jpg')):
        cmd=[sys.executable,__file__,'--sample',str(sample)]
        if sample.parent==prepared: cmd.append('--client-prepared')
        reply=subprocess.run(cmd,capture_output=True,text=True,encoding='utf8',errors='replace',timeout=60)
        if reply.returncode: raise RuntimeError('Isolated worker failed: '+sample.name)
        rows.append(json.loads(reply.stdout))
    report={'date':'2026-10-09','platform':sys.platform,'scope':'isolated_local_server_processing','cloud_peak_proven':False,
        'handset_peak_proven':False,'cloud_memory_bytes':256*1024*1024,'reference_gate_bytes':int(256*1024*1024*.8),
        'rows':rows,'legacy_direct_input_risk':any(r['process_peak_bytes']>256*1024*1024*.8 for r in rows if not r['client_prepared_fixture'])}
    (OUT/'measurements.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    # Use synthetic texture only; original user photos are not copied to this report.
    original=folder/'png-texture.png';processed=OUT/'png-texture-full.jpg'
    sheet=Image.new('RGB',(870,370),'#F7F4EF')
    for source,offset in ((original,12),(processed,447)):
        with Image.open(source) as picture:
            picture.thumbnail((410,330));sheet.paste(picture,(offset,18))
    sheet.save(OUT/'texture-comparison.png')
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}));print(json.dumps(rows))

if __name__=='__main__': main()
