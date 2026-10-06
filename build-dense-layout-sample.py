"""Dense review sample only: never connects to the installed TTS mod."""
import html, json, re, hashlib
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader
import pypdfium2

ROOT=Path(__file__).parent
OUT=ROOT/'output/pdf/KT-RU-layout-examples.pdf'
TMP=ROOT/'tmp/dense-layout';TMP.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('RU','C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('RU-Bold','C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('RU',normal='RU',bold='RU-Bold')
W,H=A4;M=24;WIDTH=W-2*M;GAP=16;CW=(WIDTH-GAP)/2
INK=colors.HexColor('#193342');MUTED=colors.HexColor('#586b77')
BLUE=colors.HexColor('#235e88');RED=colors.HexColor('#a13c32')
LINE=colors.HexColor('#d6e0e5');BG=colors.HexColor('#f5f7f8')
source=json.loads((ROOT/'ru-pdfs-root.json').read_text(encoding='utf8'))['02236cd1de991b9e']
b1=source['pages'][0]['blocks'];b2=source['pages'][1]['blocks'];b3=source['pages'][2]['blocks']
card=json.loads((ROOT/'ru-images-all-reviewed.json').read_text(encoding='utf8'))['c54f0514d3523963']

# Longest phrases precede their constituent terms. Inflections are matched,
# but ordinary connecting words remain in the normal font.
TERMS=[
 r'дистанци\w*\s+контрол\w*',r'оружи\w*\s+(?:дальнего|ближнего)\s+боя',
 r'кубик\w*\s+(?:атаки|атак|защиты)',r'(?:обычн\w*|критическ\w*)\s+(?:успех\w*|урон\w*)',
 r'уникальн\w*\s+действи\w*',r'активн\w*\s+оперативник\w*',
 r'допустим\w*\s+цел\w*',r'характеристик\w*\s+(?:перемещения|ран|урона)',
 r'командн\w*\s+очк\w*',r'очк\w*\s+действи\w*',r'лимит\s+очков\s+действий',
 r'арканн\w*\s+проводник\w*',r'помощь\s+подмастерья',r'ближн\w*\s+бо\w*',
 r'приказ\w*',r'скрытност\w*',r'бой',r'стрельб\w*',r'стреля\w*',r'атак\w*',
 r'перемещени\w*',r'рыв(?:ок|ка|ку|ком|ке)',r'отступлени\w*',r'контрдействи\w*',
 r'оперативник\w*',r'активаци\w*',r'укрыти\w*',r'спасброс\w*',r'попадани\w*',
 r'ран(?:ы|а|ам|ами|ах|ен|еным|еный)?',r'тяжело\s+ранен\w*',r'выведен\w*\s+из\s+строя',
 r'урон\w*',r'успех\w*',r'провал\w*',r'кубик\w*',r'переброс\w*',
 r'видимост\w*',r'видим\w*',r'террейн\w*',r'заслон[её]н\w*',
 r'подмастерь\w*',r'криптек\w*',r'раунд\w*',r'удар\w*',r'блок\w*',
 r'защищающ\w*',r'цель|цели|целью|целями|целям|целях',r'оружи\w*',
 r'действи\w*',r'характеристик\w*',r'вид(?:на|ны|но|ен|еть|ит)',r'дружественн\w*',
 r'критическ\w*',r'обычн\w*',r'дальн\w*\s+бо\w*',
 r'результат\w*',r'успешн\w*|успешен',r'враг\w*',r'стрел(?:ок|ка|ку|ком|ке)',
 r'бо(?:ец|йца|йцу|йцом|йце|йцы|йцов|йцам|йцами|йцах)',
 r'бронебойн\w*',r'увеличени\w*',r'непрерывн\w*',r'сбалансированн\w*',
 r'раздирающ\w*',r'разрушительн\w*',r'смертоносн\w*',
 r'Normal\s+Dmg',r'Critical\s+Dmg',r'Action\s+Point\s+Limit',
 r'Control\s+Range',r'Valid\s+Target',r'Arcane\s+conduit',
 r'Apprentek\s+Assistance',r'Turning\s+Points?',
 r'APL|AP|WR|WND|WDS|ОД|CP|Atk|Hit|Dmg|Move|Save|Wounds|Shoot|Fight|Strike|Block|Cover|Visible|Conceal|Engage|Obscured|Magnify|Piercing|Ceaseless|Balanced|Rending|Devastating|Lethal|Apprentek|Cryptek',
 r'\d+D[36]|D[36]|\d+(?:[./]\d+)?\+?'
]
PAT=re.compile(r'(?<!\w)(?:'+ '|'.join(TERMS)+r')(?!\w)',re.I)
bold_matches=[]
def rich(text):
 text=str(text);parts=[];last=0
 for match in PAT.finditer(text):
  parts.append(html.escape(text[last:match.start()]))
  parts.append('<b>'+html.escape(match[0])+'</b>');bold_matches.append(match[0]);last=match.end()
 parts.append(html.escape(text[last:]));return ''.join(parts).replace('\n','<br/>')
def para(text,size=10.5,bold=False,color=INK):
 return Paragraph(rich(text),ParagraphStyle('dense',fontName='RU-Bold' if bold else 'RU',fontSize=size,leading=size*1.23,textColor=color))
def height(p,w):return p.wrap(w,10000)[1]
def paint(p,x,y,w):
 h=height(p,w);p.drawOn(c,x,y-h);return y-h
def section(text,x,y,w):
 c.setStrokeColor(LINE);c.setLineWidth(.6);c.line(x,y,x+w,y)
 return paint(para(text,12,True,BLUE),x,y-6,w)-6
def block(text,x,y,w):return paint(para(text),x,y,w)-5
def notice(text,x,y,w,label='ОГРАНИЧЕНИЕ'):
 col=RED if label=='ОГРАНИЧЕНИЕ' else BLUE
 a=para(label,7.8,True,col);b=para(text,10)
 h=height(a,w-16)+height(b,w-16)+17
 c.setFillColor(colors.HexColor('#fcf0ed' if col==RED else '#eaf2f7'));c.rect(x,y-h,w,h,fill=1,stroke=0)
 c.setStrokeColor(col);c.setLineWidth(1.5);c.line(x,y-h,x,y)
 yy=paint(a,x+8,y-6,w-16)-3;paint(b,x+8,yy,w-16)
 return y-h-8
def numbered(text,x,y,w):
 m=re.match(r'^(\d+)\.\s*(.*)',text,re.S)
 c.setFont('RU-Bold',10.5);c.setFillColor(BLUE);c.drawString(x,y-10.5,m[1]+'.')
 return paint(para(m[2]),x+17,y,w-17)-5
def header(title,subtitle):
 c.setFillColor(BG);c.rect(0,0,W,H,fill=1,stroke=0)
 c.setFillColor(INK);c.rect(0,H-35,W,35,fill=1,stroke=0)
 c.setFillColor(colors.white);c.setFont('RU-Bold',12);c.drawString(M,H-23,'KILL TEAM')
 c.setFont('RU',8.5);c.drawRightString(W-M,H-22,'РУССКИЙ СПРАВОЧНИК / ОБРАЗЕЦ ВЁРСТКИ')
 c.setFillColor(INK);c.setFont('RU-Bold',21);c.drawString(M,H-63,title)
 c.setFillColor(MUTED);c.setFont('RU',8);c.drawString(M,H-78,subtitle)
 return H-92
def footer(page,text):
 c.setStrokeColor(LINE);c.setLineWidth(.5);c.line(M,32,W-M,32)
 c.setFont('RU',7.5);c.setFillColor(MUTED);c.drawString(M,20,text);c.drawRightString(W-M,20,str(page))
def check_y(y):
 if y<43:raise ValueError('Footer collision '+str(y))

c=canvas.Canvas(str(OUT),pagesize=A4,title='Kill Team - плотный справочник, образец',author='Русский справочник Kill Team')
included=[[],[]]
y=header('Боевые действия','Исходные Lite Rules из мода. Актуальность этого фрагмента не сверена.')
left=section('Стрельба (Shoot) / 1 AP',M,y,CW)
right=section('Ближний бой (Fight) / 1 AP',M+CW+GAP,y,CW)
left=notice(b1[32]['russian'].split('\n')[1],M,left,CW)
right=notice(b1[34]['russian'].split('\n')[1],M+CW+GAP,right,CW,label='УСЛОВИЕ ПРИМЕНЕНИЯ')
left=block(b2[11]['russian'],M,left,CW);included[0].append(b2[11]['russian'])
for i in range(12,18):
 left=numbered(b2[i]['russian'],M,left,CW);included[0].append(b2[i]['russian'])
right=block(b2[19]['russian'],M+CW+GAP,right,CW);included[0].append(b2[19]['russian'])
for i in range(20,24):
 right=numbered(b2[i]['russian'],M+CW+GAP,right,CW);included[0].append(b2[i]['russian'])
right=section('Допустимая цель (Valid Target)',M+CW+GAP,right-4,CW)
right=block(b2[5]['russian'],M+CW+GAP,right,CW);included[0].append(b2[5]['russian'])
right=section('Укрытие (Cover)',M+CW+GAP,right,CW)
right=block(b2[7]['russian'],M+CW+GAP,right,CW);included[0].append(b2[7]['russian'])
check_y(min(left,right));footer(1,'Плотность: 2 колонки / игровые термины и значения выделены жирным');c.showPage()

# Brief self-authored explanation of verified mechanics. Not a claim of a full team audit.
magnify=('При Стрельбе этим оружием цель должна быть видима стрелку. Другой дружественный Подмастерье или Криптек должен быть видим стрелку, иметь приказ «Бой» (Engage) и не находиться в дистанции контроля врагов. Можно считать этого бойца активным оперативником при определении допустимой цели, укрытия и заслонённости (Obscured). Тогда до конца действия оружие получает Непрерывное (Ceaseless).')
from card_original_style_sample import draw_card
card_report=draw_card(c,rich,card,magnify)
included[1].extend([card['blocks'][0]['russian'],magnify])
c.showPage();c.save()

pdf=PdfReader(OUT);assert len(pdf.pages)==2
for label in ['APL','MOVE','SAVE','WOUNDS','ATK','HIT','DMG','WR']:
 assert label in pdf.pages[1].extract_text(),label
assert pdf.pages[0].extract_text().count('1 AP')==2
norm=lambda text:re.sub(r'\s+','',text)
for i,parts in enumerate(included):
 text=norm(pdf.pages[i].extract_text())
 for part in parts:
  part=re.sub(r'^\d+\.\s*','',part)
  assert norm(part) in text,part[:80]
rendered=pypdfium2.PdfDocument(str(OUT))
for i,page in enumerate(rendered):page.render(scale=1.8).to_pil().save(TMP/(str(i+1)+'.png'))
preview_path=ROOT/'output/images/KT-RU-Apprentek-layout-example.png'
rendered[1].render(scale=1900/rendered[1].get_width()).to_pil().save(preview_path)
report={'path':str(OUT),'pages':2,'sampleOnly':True,'bulkLayoutApprovalRequired':True,'layout':'dense-reference-original-card-v3','bodyFontSize':10.5,'bodyLeading':12.915,'marginPoints':24,'card':card_report,'allIncludedRuleTextsPresent':True,'boldTermsOccurrences':len(bold_matches),'boldTerms':sorted(set(bold_matches)),'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'visuallyVerified':False}
(ROOT/'output/layout-sample-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='boldTerms'},ensure_ascii=False))
