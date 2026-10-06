import importlib.util,json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
ROOT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('ocr_assets',ROOT/'ocr-assets.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
sources=json.loads((ROOT/'inventory/extra-image-sources.json').read_text(encoding='utf8'))
destination=ROOT/'inventory/extra-image-ocr-en.json';existing=json.loads(destination.read_text(encoding='utf8')) if destination.exists() else []
done={x['id']:x for x in existing if x['status'] in ('recognized','non-image-resource')}
pending=[x for x in sources if x['status']=='downloaded' and x['id'] not in done]
with ThreadPoolExecutor(max_workers=4) as executor:
 for index,future in enumerate(as_completed([executor.submit(module.process,x) for x in pending]),1):
  item=future.result();done[item['id']]=item
  if index%25==0:
   destination.write_text(json.dumps(list(done.values()),ensure_ascii=False,indent=2),encoding='utf8');print(index,'/',len(pending),'text-bearing',sum(bool(x.get('ocr')) for x in done.values()),flush=True)
destination.write_text(json.dumps(list(done.values()),ensure_ascii=False,indent=2),encoding='utf8');print('Finished',len(done),flush=True)
