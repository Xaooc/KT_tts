import hashlib,json,re,urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).parent;OUT=ROOT/'inventory/linked-scripts';OUT.mkdir(exist_ok=True)
items=[x for x in json.loads((ROOT/'inventory/extra-assets.json').read_text(encoding='utf8')) if x['url'].endswith('.lua')]
def fetch(item):
 path=OUT/(item['id']+'.lua')
 if not path.exists():
  request=urllib.request.Request(item['url'],headers={'User-Agent':'KT-Russian-localization/1.0'})
  with urllib.request.urlopen(request,timeout=45) as response:path.write_bytes(response.read())
 source=path.read_text(encoding='utf8');assert 'function ' in source
 return {**item,'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'chars':len(source)}
with ThreadPoolExecutor(max_workers=5) as executor:results=list(executor.map(fetch,items))
known={x['url'] for x in results};cursor=0
while cursor<len(results):
 parent=results[cursor];cursor+=1
 source=Path(parent['path']).read_text(encoding='utf8')
 for url in re.findall(r'WebRequest\.get\(["\']([^"\']+)["\']',source):
  if url in known:continue
  if not url.startswith('https://raw.githubusercontent.com/'):raise ValueError('Unexpected linked-script host '+url)
  known.add(url)
  item={'id':hashlib.sha256(url.encode()).hexdigest()[:16],'url':url,'kind':'linked-script','contexts':[{'source':parent['url'],'role':'WebRequest.get'}]}
  results.append(fetch(item))
(ROOT/'inventory/linked-scripts.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'downloadedScripts':len(results),'chars':sum(x['chars'] for x in results)}))
