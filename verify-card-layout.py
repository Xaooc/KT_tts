"""Geometry, dark-stock contrast and stat-cell checks on actual generated PDFs."""
import hashlib,json,re
from pathlib import Path
import pdfplumber
ROOT=Path(__file__).parent
data=json.loads((ROOT/'ru-images-all-reviewed.json').read_text(encoding='utf8'))
norm=lambda s:re.sub(r'\s+','',str(s))
def lum(color):
 if color is None:return 0
 if isinstance(color,(int,float)):color=(color,)*3
 if len(color)!=3:raise ValueError('Unexpected PDF text color '+str(color))
 rgb=[float(x)/12.92 if float(x)<=.04045 else ((float(x)+.055)/1.055)**2.4 for x in color]
 return sum(a*b for a,b in zip(rgb,(.2126,.7152,.0722)))
def roster(c):
 kind=str(c.get('categoryEnglish') or '').upper()
 return not c.get('stats') and any(x in kind for x in ('KILL TEAM','ROSTER','SELECTION','DECK BACK','CARD BACK','TEAM CARD BACK'))
cards={}
for i,c in data.items():
 if c.get('kind')=='atlas':cards.update({i+'-tile-'+t:d for t,d in c['tiles'].items()})
 else:cards[i]=c
stats_count=0;dark_count=0;chars=0
for i,c in cards.items():
 with pdfplumber.open(ROOT/'tmp/cards'/(i+'.pdf')) as pdf:
  page=pdf.pages[0]
  for ch in page.chars:
   if ch['text'].strip() and not(-.5<=ch['x0']<=ch['x1']<=page.width+.5 and -.5<=ch['top']<=ch['bottom']<=page.height+.5):raise ValueError('Text outside card '+i+' '+repr(ch))
  chars+=len(page.chars)
  if c.get('stats'):
   stats_count+=1
   for n,(label,key) in enumerate(zip(['APL','MOVE','SAVE','WOUNDS'],['APL','Move','Save','Wounds'])):
    cell=page.crop((620+n*82.5,0,620+(n+1)*82.5,91))
    text=norm(cell.extract_text() or '')
    if label not in text or norm(c['stats'][key]) not in text:raise ValueError('Stat cell mismatch '+i+' '+key+' '+text)
  if roster(c):
   dark_count+=1
   for ch in page.chars:
    if ch['text'].strip() and ch['top']>=140:
     contrast=(lum(ch['non_stroking_color'])+.05)/(lum((.098,.106,.11))+.05)
     if contrast<4.5:raise ValueError('Dark card text lacks contrast '+i+' '+ch['text']+' '+str(contrast))
result={'cards':len(cards),'statHeadersChecked':stats_count,'darkCardsChecked':dark_count,'charactersWithinCardBounds':chars,'minimumDarkBodyContrast':4.5,'passed':True,'definitionFileSHA256':hashlib.sha256((ROOT/'ru-images-all-reviewed.json').read_bytes()).hexdigest()}
print(json.dumps(result))
(ROOT/'output/card-layout-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
