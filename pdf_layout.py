"""Semantic PDF typography. Splitting and highlighting never rewrite a rule."""
import html,re
from kt_design import markup,DESIGN
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph,Spacer,HRFlowable

NAVY=colors.HexColor('#172f40')
INK=colors.HexColor('#243746')
TEAL=colors.HexColor('#176b61')
RED=colors.HexColor('#9c302e')
BLUE=colors.HexColor('#245d8b')
WIDTH=547.28
STYLES={
 'title':ParagraphStyle('TitleRU',fontName='RU-Bold',fontSize=21,leading=25,textColor=NAVY,spaceAfter=10),
 'heading':ParagraphStyle('HeadingRU',fontName='RU-Bold',fontSize=13,leading=16,textColor=BLUE,spaceBefore=9,spaceAfter=5,keepWithNext=True),
 'subheading':ParagraphStyle('SubheadingRU',fontName='RU-Bold',fontSize=11.5,leading=14,textColor=BLUE,spaceBefore=7,spaceAfter=4,keepWithNext=True),
 'paragraph':ParagraphStyle('BodyRU',fontName='RU',fontSize=10.5,leading=12.915,textColor=INK,spaceAfter=5,allowWidows=0,allowOrphans=0),
 'caption':ParagraphStyle('CaptionRU',fontName='RU',fontSize=9,leading=11,textColor=INK,spaceAfter=6),
 'cell':ParagraphStyle('CellRU',fontName='RU',fontSize=8.5,leading=10.5,textColor=INK),
 'cell-head':ParagraphStyle('HeadCellRU',fontName='RU-Bold',fontSize=8.5,leading=10.5,textColor=colors.white),
 'small':ParagraphStyle('SmallRU',fontName='RU',fontSize=8,leading=10,textColor=colors.HexColor('#586b77'),spaceAfter=5),
}
for key,col,bg,label in [('condition',BLUE,'#edf4fa','УСЛОВИЕ'),('effect',TEAL,'#edf6f3','ДЕЙСТВИЕ / ЭФФЕКТ'),('restriction',RED,'#fcf0ed','ОГРАНИЧЕНИЕ')]:
 STYLES[key]=ParagraphStyle(key,fontName='RU',fontSize=10.5,leading=12.915,textColor=col,spaceBefore=2,spaceAfter=5,allowWidows=0,allowOrphans=0)

def legacy_markup(text):
 value=html.escape(str(text))
 # Decimal values, dice and AP costs remain exact; emphasis changes presentation only.
 value=re.sub(r'(?<![\w;])(?:\d+D[36]|D[36]|\d+(?:[.,/]\d+)?\+?)(?:\s*(?:ОД|AP|CP|VP|дюйм(?:а|ов)?|ран(?:ы)?))?(?![\w;])',lambda m:'<b>'+m[0]+'</b>',value)
 value=re.sub(r'(&quot;|«)([^<>\n]{2,95}?)(»|&quot;)',lambda m:m[1]+'<b>'+m[2]+'</b>'+m[3],value)
 value=re.sub(r'\(([^()<>]*[A-Za-z][^()<>]*)\)',lambda m:'<font color="#637684">('+m[1]+')</font>',value)
 return value.replace('\n','<br/>')

def p(text,kind='paragraph'):
 if isinstance(text,list):text='\n'.join(str(t) for t in text)
 out=Paragraph(markup(text),STYLES[kind])
 if kind in ('heading','subheading'):out._ru_heading=str(text)
 return out

def logical_units(text):
 """Return every source character except whitespace, in original order."""
 text=str(text);units=[]
 for line in text.splitlines():
  line=line.strip()
  if not line:continue
  if len(line)<160 and re.search('[А-Яа-яЁёA-Za-z]',line) and line.upper()==line:
   units.append(('subheading',line));continue
  # A line is split only at a complete sentence boundary, keeping punctuation.
  for sentence in re.split(r'(?<=[.!?])\s+(?=[А-ЯЁ0-9«])',line):
   if not sentence:continue
   kind='paragraph'
   if re.match(r'^(?:Этот оперативник|Оперативник|Вы|Игрок|Немезида|NPO|Действие|Это действие|Эту способность|Это правило).*?(?:не может|нельзя|не могут|запрещено)',sentence,re.I):kind='restriction'
   elif re.match(r'^(?:Нельзя|Запрещено|Не выполняйте|Не выбирайте|Не может|Невозможно)',sentence,re.I):kind='restriction'
   elif re.match(r'^(?:Если|Когда|Каждый раз|При\s|До\s|Пока\s|В начале|В конце)',sentence):kind='condition'
   elif re.match(r'^(?:Выберите|Бросьте|Выполните|Удалите|Добавьте|Поместите|Переместите|Увеличьте|Уменьшите|Проведите|Затем\s)',sentence):kind='effect'
   units.append((kind,sentence))
 assert re.sub(r'\s+','',text)==re.sub(r'\s+','',''.join(x[1] for x in units)), 'Rule text was lost while formatting'
 return units

def formatted(text,kind='paragraph'):
 if kind not in ('paragraph','caption'):return [p(text,kind)]
 units=logical_units(text);flows=[]
 i=0
 while i<len(units):
  role,value=units[i];parts=[value];i+=1
  # Consecutive related sentences share one labelled panel.
  while role!='subheading' and i<len(units) and units[i][0]==role and sum(map(len,parts))+len(units[i][1])<1600:
   parts.append(units[i][1]);i+=1
  # Color is an emphasis only: inferred labels must not reinterpret a rule.
  if kind=='caption':role='caption'
  if role in ('condition','effect'):role='paragraph'
  flows.append(p(' '.join(parts),role))
 return flows

def column_widths(rows,total=WIDTH):
 count=max(map(len,rows));weights=[]
 for col in range(count):
  values=[str(row[col]) for row in rows if len(row)>col]
  longest=max((len(v) for v in values),default=1)
  weights.append(max(1.5,min(6.5,longest**.5)))
 widths=[total*w/sum(weights) for w in weights]
 return widths
