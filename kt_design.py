"""Shared typography for the user-approved original cards and dense reference."""
import ast, html, json, re
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT=Path(__file__).parent
DESIGN='dense-reference-original-card-v3'
for name,file in [('RU','arial.ttf'),('RU-Bold','arialbd.ttf'),('RU-Italic','ariali.ttf'),('RU-Condensed','DejaVuSansCondensed-Bold.ttf')]:
 if name not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont(name,'C:/Windows/Fonts/'+file))
pdfmetrics.registerFontFamily('RU',normal='RU',bold='RU-Bold',italic='RU-Italic')
terms=json.loads((ROOT/'inventory/game-term-patterns.json').read_text(encoding='utf8'))
terms=[r'Круг\w*\s+Иеротек',r'стратегическ\w*\s+фаз\w*',r'шаг\w*\s+подготовк\w*',r'Протокол\w*\s+реанимаци\w*',r'Поддержк\w*',r'снаряжени\w*',r'разведк\w*',r'маркер\w*',r'жетон\w*',r'контроль\w*',r'критическ\w*\s+операци\w*',r'тактическ\w*\s+операци\w*',r'VP|ATK|HIT|DMG|AP|APL|CP|WND|WR|SUPPORT|CRYPTEK|APPRENTEK|PLASMACYTE|Engage|Conceal']+terms
# Exact names from the reviewed translations supplement the inflection matcher.
names=set()
for card in json.loads((ROOT/'ru-images-all-reviewed.json').read_text(encoding='utf8')).values():
 for b in card.get('blocks',[]):
  for key in ('headingEnglish','headingRussian'):
   value=str(b.get(key,''))
   if 3<len(value)<90 and value not in ('Rule','Правило','Card table labels'):names.add(value)
terms=sorted((re.escape(s) for s in names),key=len,reverse=True)+terms
PAT=re.compile(r'(?<!\w)(?:'+'|'.join(terms)+r')(?!\w)',re.I)

def markup(text):
 text=str(text);parts=[];last=0
 for m in PAT.finditer(text):
  parts.extend([html.escape(text[last:m.start()]),'<b>'+html.escape(m[0])+'</b>']);last=m.end()
 parts.append(html.escape(text[last:]));return ''.join(parts).replace('\n','<br/>')

def approved():
 a=json.loads((ROOT/'inventory/layout-approval.json').read_text(encoding='utf8'))
 if a.get('status')!='approved' or a.get('selectedStyle')!=DESIGN:raise ValueError('Approved design missing')
 return a
