import hashlib,json,re,urllib.request,shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
from PIL import Image
ROOT=Path(__file__).parent;OUT=ROOT/'inventory/extra-images';OUT.mkdir(exist_ok=True)
known={x['url'] for x in json.loads((ROOT/'inventory/image-sources.json').read_text(encoding='utf8'))}
items=[]
for item in json.loads((ROOT/'inventory/extra-assets.json').read_text(encoding='utf8')):
 if item['url'] in known:continue
 texture=any(c['kind']=='structured-url' and c['path'].endswith(('/DiffuseURL','/ImageSecondaryURL')) for c in item['contexts'])
 embedded=any(c['kind']=='embedded-url' for c in item['contexts']) and (re.search(r'\.(png|jpe?g|webp)(?:\?|$)',item['url'],re.I) or 'steamusercontent' in item['url'])
 if texture or embedded:items.append(item)
cache_root=Path('C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods');cache={}
for directory in ('Images','Images Raw'):
 for path in (cache_root/directory).glob('*'):cache[path.stem]=path
def fetch(item):
 item=dict(item);path=OUT/(item['id']+'.img');item['path']=str(path)
 try:
  if path.exists() and path.stat().st_size==0:path.unlink()
  if not path.exists():
   cached=cache.get(re.sub('[^a-zA-Z0-9]','',item['url']))
   if cached:shutil.copyfile(cached,path)
   else:
    request=urllib.request.Request(item['url'],headers={'User-Agent':'KT-Russian-localization/1.0'})
    with urllib.request.urlopen(request,timeout=45) as response:data=response.read()
    if not data:raise ValueError('Empty image response')
    path.write_bytes(data)
  with Image.open(path) as image:image.verify()
  item.update(status='downloaded',sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size)
 except Exception as error:item.update(status='unavailable',error=str(error))
 return item
results=[];destination=ROOT/'inventory/extra-image-sources.json'
with ThreadPoolExecutor(max_workers=8) as executor:
 for index,future in enumerate(as_completed([executor.submit(fetch,item) for item in items]),1):
  results.append(future.result())
  if index%50==0:
   destination.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8');print(index,'/',len(items),flush=True)
destination.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'images':len(results),'unavailable':sum(x['status']=='unavailable' for x in results)}))
