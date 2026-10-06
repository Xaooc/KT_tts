"""Group existing OCR by the original, catalogued atlas cells without changing art."""
import json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).parent
missing=json.loads((ROOT/'inventory/remaining-card-assets.json').read_text(encoding='utf8'))
sources={x['id']:x for x in json.loads((ROOT/'inventory/image-sources.json').read_text(encoding='utf8'))}
catalog=json.loads((ROOT/'inventory/table-cards-unique.json').read_text(encoding='utf8'))
ocr={x['id']:x for x in json.loads((ROOT/'inventory/table-card-ocr.json').read_text(encoding='utf8'))}
result={}
for id in missing:
 entries=[x for x in catalog if x['id']==id]
 if not entries or id not in ocr:continue
 cols,rows=entries[0]['cols'],entries[0]['rows'];im=Image.open(sources[id]['path']);w,h=im.size;cells={}
 for n in range(cols*rows):
  lines=[]
  for item in ocr[id]['ocr']:
   x=sum(p[0] for p in item['box'])/4;y=sum(p[1] for p in item['box'])/4
   if min(cols-1,int(x/(w/cols)))+min(rows-1,int(y/(h/rows)))*cols==n:lines.append(item)
  lines.sort(key=lambda x:(round(min(p[1] for p in x['box'])/12),min(p[0] for p in x['box'])))
  cells[str(n)]={'names':[x['name'] for x in entries if x['tile']==n],'used':any(x['tile']==n for x in entries),'ocr':'\n'.join(x['text'] for x in lines)}
 result[id]={'columns':cols,'rows':rows,'sourceSize':[w,h],'cells':cells}
(ROOT/'inventory/remaining-table-cell-text.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print({'images':len(result),'usedCells':sum(c['used'] for v in result.values() for c in v['cells'].values())})
