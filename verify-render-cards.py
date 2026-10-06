import argparse,hashlib,json,re
from pathlib import Path
from pypdf import PdfReader
from PIL import Image,ImageDraw
ROOT=Path(__file__).parent
norm=lambda x:re.sub(r'\s+','',str(x))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('translations');parser.add_argument('--no-contact-sheets',action='store_true');args=parser.parse_args()
 definitions=json.loads(Path(args.translations).read_text(encoding='utf8'));cards={}
 for id,definition in definitions.items():
  if definition.get('kind')=='atlas':
   for tile,card in definition['tiles'].items():cards[id+'-tile-'+tile]=card
  else:cards[id]=definition
 for id,card in cards.items():
  reader=PdfReader(ROOT/'tmp/cards'/f'{id}.pdf');assert len(reader.pages)==1
  text=norm(reader.pages[0].extract_text())
  for key in ('titleRussian','categoryRussian','flavorRussian','footerRussian'):
   if card.get(key):assert norm(card[key]) in text,(id,key)
  for weapon in card.get('weapons',[]):
   for key in ('russian','atk','hit','dmg','wrRussian'):
    if weapon.get(key):assert norm(weapon[key]) in text,(id,key)
  for block in card.get('blocks',[]):
   for key in ('headingRussian','russian'):
    if block.get(key) and (key!='headingRussian' or block.get('headingEnglish') not in ('Rule',card.get('titleEnglish'),'Card table labels')):assert norm(block[key]) in text,(id,key)
  Image.open(ROOT/'output/images'/f'{id}-ru.png').verify()
 ids=list(cards);dest=ROOT/'tmp/cards';sheets=[]
 for start in ([] if args.no_contact_sheets else range(0,len(ids),6)):
  sheet=Image.new('RGB',(1700,1500),'#e5ecf0');draw=ImageDraw.Draw(sheet)
  for offset,id in enumerate(ids[start:start+6]):
   image=Image.open(ROOT/'output/images'/f'{id}-ru.png');image.thumbnail((820,450))
   x=offset%2*850;y=offset//2*500;sheet.paste(image,(x+10,y+35));draw.text((x+10,y+10),id,fill='black')
  prefix=Path(args.translations).stem
  path=dest/f'{prefix}-sheet-{start}.png';sheet.save(path);sheets.append(str(path))
 result={'cards':len(cards),'allRussianTextPresent':True,'definitionFileSHA256':hashlib.sha256(Path(args.translations).read_bytes()).hexdigest(),'contactSheets':sheets}
 (ROOT/'output/card-text-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(json.dumps(result))
