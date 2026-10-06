from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import json, hashlib, urllib.request, shutil
ROOT=Path(__file__).resolve().parent
out=ROOT/'inventory'/'original-pdfs'
out.mkdir(exist_ok=True)
assets=json.loads((ROOT/'output'/'remaining-assets.json').read_text(encoding='utf8'))['pdfObjects']
sources={}
for x in assets:
    sources.setdefault(x['url'], []).append(x)
def fetch(pair):
    url, contexts=pair
    key=hashlib.sha256(url.encode()).hexdigest()[:16]
    dest=out/(key+'.pdf')
    result={'id':key,'url':url,'path':str(dest),'contexts':contexts}
    try:
        if not dest.exists():
            cached=next((x['cache'] for x in contexts if x.get('cache') and Path(x['cache']).exists()),None)
            if cached: shutil.copyfile(cached,dest)
            else:
                req=urllib.request.Request(url,headers={'User-Agent':'KT-Russian-localization/1.0'})
                with urllib.request.urlopen(req,timeout=45) as resp, dest.open('wb') as f:shutil.copyfileobj(resp,f)
        if not dest.read_bytes().startswith(b'%PDF'): raise ValueError('Not a PDF response')
        result['status']='downloaded'
        result['sha256']=hashlib.sha256(dest.read_bytes()).hexdigest()
    except Exception as e:result['status']='unavailable';result['error']=str(e)
    return result
results=[]
with ThreadPoolExecutor(max_workers=4) as pool:
    for f in as_completed([pool.submit(fetch,pair) for pair in sources.items()]):
        x=f.result();results.append(x);print(x['id'],x['status'],x.get('error',''),flush=True)
(ROOT/'inventory'/'pdf-sources.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
