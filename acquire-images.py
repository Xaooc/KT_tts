from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import urllib.request,shutil,json,hashlib
ROOT=Path(__file__).resolve().parent
out=ROOT/'inventory'/'original-images';out.mkdir(exist_ok=True)
assets=[x for x in json.loads((ROOT/'inventory'/'all-assets.json').read_text(encoding='utf8')) if x['kind']=='image']
def fetch(x):
    dest=out/(x['id']+'.img');x=dict(x);x['path']=str(dest)
    try:
        if not dest.exists():
            if x['cache']:shutil.copyfile(x['cache'],dest)
            else:
                req=urllib.request.Request(x['url'],headers={'User-Agent':'KT-Russian-localization/1.0'})
                with urllib.request.urlopen(req,timeout=45) as resp,dest.open('wb') as f:shutil.copyfileobj(resp,f)
        x['bytes']=dest.stat().st_size;x['status']='downloaded'
        x['sha256']=hashlib.sha256(dest.read_bytes()).hexdigest()
    except Exception as e:
        if dest.exists() and dest.stat().st_size==0:dest.unlink()
        x['status']='unavailable';x['error']=str(e)
    return x
results=[]
with ThreadPoolExecutor(max_workers=8) as pool:
    for i,f in enumerate(as_completed([pool.submit(fetch,x) for x in assets]),1):
        x=f.result();results.append(x)
        if i%50==0 or x['status']=='unavailable':print(i,'/',len(assets),x['status'],x.get('error',''),flush=True)
        if i%100==0:(ROOT/'inventory'/'image-sources.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
(ROOT/'inventory'/'image-sources.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print('Finished',len(results),'unavailable',sum(x['status']=='unavailable' for x in results),flush=True)
