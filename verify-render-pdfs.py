import argparse,json,re
from pathlib import Path
from pypdf import PdfReader
import pypdfium2
from PIL import Image,ImageDraw
from pdf_layout import logical_units

ROOT=Path(__file__).parent;TMP=ROOT/'tmp/pdfs'
norm=lambda t:re.sub(r'\s+','',t)
def russian_parts(value):
 if isinstance(value,dict):
  if 'russian' in value:yield str(value['russian'])
  else:
   for v in value.values():yield from russian_parts(v)
 elif isinstance(value,list):
  for v in value:yield from russian_parts(v)
 elif value:yield str(value)
def translations():
 result={}
 for name in ('ru-pdfs-root.json','ru-pdfs-a.json','ru-pdfs-b.json'):
  file=ROOT/name;reviewed=ROOT/(Path(name).stem+'-final.json')
  if reviewed.exists():file=reviewed
  if file.exists():result.update(json.loads(file.read_text(encoding='utf8')))
 return result
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--ids',nargs='*');args=parser.parse_args()
 definitions=translations()
 for id in args.ids or list(definitions):
  definition=definitions[id];path=ROOT/'output/pdf'/(id+'-ru.pdf');reader=PdfReader(path)
  text=norm(''.join(re.sub(r'^KILL TEAM\s*РУССКИЙ СПРАВОЧНИК\s*Kill Team • русский перевод материалов исходного мода\s*\d+\s*','',p.extract_text() or '') for p in reader.pages))
  for page in definition['pages']:
   for block in page['blocks']:
    if block.get('figure') or block.get('tables'):raise ValueError('Unverified nested PDF diagram/table '+id)
    if block.get('russian') and block['type'] not in ('source-images',):
     last=-1
     for role,part in logical_units(block['russian']):
      where=text.find(norm(part),last+1)
      if where<0:raise ValueError('Missing or reordered Russian PDF text '+id+': '+part[:120])
      last=where
    for key in ('legendRussian','captionRussian','labelsRussian','captionsRussian'):
     for s in russian_parts(block.get(key)):
      for role,part in logical_units(s):
       if norm(part) not in text:raise ValueError('Missing Russian legend '+id+': '+part[:120])
    rows=block.get('rowsRussian') or block.get('table',{}).get('rowsRussian',[])
    columns=block.get('columnsRussian') or block.get('table',{}).get('columnsRussian',[])
    if columns:rows=[columns]+rows
    if rows:
     for row in rows:
      for cell in row:
       if str(cell).strip() and norm(str(cell)) not in text:raise ValueError('Missing Russian table cell '+id+': '+str(cell))
  doc=pypdfium2.PdfDocument(str(path));dest=TMP/id;dest.mkdir(parents=True,exist_ok=True)
  for i,page in enumerate(doc):page.render(scale=1).to_pil().save(dest/(str(i+1)+'.png'))
  for start in range(0,len(doc),6):
   sheet=Image.new('RGB',(1500,1500),'#e5ecf0');draw=ImageDraw.Draw(sheet)
   for offset in range(min(6,len(doc)-start)):
    img=Image.open(dest/(str(start+offset+1)+'.png'));img.thumbnail((480,700))
    x=(offset%3)*500;y=(offset//3)*750;sheet.paste(img,(x+10,y+30));draw.text((x+10,y+10),str(start+offset+1),fill='black')
   sheet.save(TMP/(id+'-sheet-'+str(start)+'.png'))
  print(id,'all text blocks present;',len(doc),'pages rendered',flush=True)
