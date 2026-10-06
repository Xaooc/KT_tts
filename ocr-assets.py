from pathlib import Path
from rapidocr_onnxruntime import RapidOCR
from PIL import Image
from concurrent.futures import ThreadPoolExecutor,as_completed
import threading,json,sys,time
ROOT=Path(__file__).resolve().parent
local=threading.local()
def engine():
    if not hasattr(local,'ocr'):
        options={'intra_op_num_threads':1,'inter_op_num_threads':1}
        if '--english' in sys.argv:
            options.update(rec_model_path=str(ROOT/'tools/en_PP-OCRv4_rec_mobile.onnx'),text_score=0.2,det_box_thresh=0.35,det_limit_side_len=1280)
        local.ocr=RapidOCR(**options)
    return local.ocr
def process(x):
    x=dict(x)
    try:
        if Path(x['path']).read_bytes()[:7]==b'UnityFS':
            x['status']='non-image-resource';x['format']='UnityFS';x['ocr']=[];return x
        with Image.open(x['path']) as im:x['width'],x['height']=im.size
        lines,elapsed=engine()(x['path'])
        x['ocr']=[{'box':box,'text':text,'confidence':float(score)} for box,text,score in (lines or [])]
        x['status']='recognized'
    except Exception as e:x['status']='ocr-failed';x['error']=str(e)
    return x
if __name__=='__main__':
    sources=json.loads((ROOT/'inventory'/'image-sources.json').read_text(encoding='utf8'))
    destination=ROOT/'inventory'/('image-ocr-en.json' if '--english' in sys.argv else 'image-ocr.json')
    existing=json.loads(destination.read_text(encoding='utf8')) if destination.exists() else []
    done={x['id']:x for x in existing if x['status'] in ('recognized','non-image-resource')}
    pending=[x for x in sources if x['status']=='downloaded' and x['id'] not in done]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i,f in enumerate(as_completed([pool.submit(process,x) for x in pending]),1):
            x=f.result();done[x['id']]=x
            if i%25==0:
                destination.write_text(json.dumps(list(done.values()),ensure_ascii=False,indent=2),encoding='utf8')
                print(i,'/',len(pending),'text-bearing',sum(bool(y.get('ocr')) for y in done.values()),flush=True)
    destination.write_text(json.dumps(list(done.values()),ensure_ascii=False,indent=2),encoding='utf8')
