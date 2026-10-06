"""Four review pages only. No installed mod or bulk PDF is changed."""
import json,re,html,hashlib
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph,Table,TableStyle,Spacer
from pypdf import PdfReader
import pypdfium2

ROOT=Path(__file__).parent;OUT=ROOT/'output/pdf';TMP=ROOT/'tmp/layout-samples';TMP.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('RU','C:/Windows/Fonts/arial.ttf'));pdfmetrics.registerFont(TTFont('RU-Bold','C:/Windows/Fonts/arialbd.ttf'));pdfmetrics.registerFontFamily('RU',normal='RU',bold='RU-Bold')
INK=colors.HexColor('#193342');MUTED=colors.HexColor('#5c6f7b');LINE=colors.HexColor('#dbe3e7');BG=colors.HexColor('#f3f5f6');BLUE=colors.HexColor('#235e88');ORANGE=colors.HexColor('#b54a1e');RED=colors.HexColor('#a13c32')
W,H=A4;M=31;WIDTH=W-2*M
source=json.loads((ROOT/'ru-pdfs-root.json').read_text(encoding='utf8'))['02236cd1de991b9e']
steps=[b['russian'] for b in source['pages'][1]['blocks'][12:18]]
titles=['Оружие','Допустимая цель','Кубики атаки','Кубики защиты','Блокирование','Урон']
intro=source['pages'][1]['blocks'][11]['russian'];restriction=source['pages'][0]['blocks'][32]['russian'].split('\n')[1]
def rich(text):
 t=html.escape(text).replace('\n','<br/>')
 return re.sub(r'(?<![\w;])(?:\d+D[36]|D[36]|\d+(?:[./]\d+)?\+?)(?![\w;])',lambda m:'<b>'+m[0]+'</b>',t)
def paragraph(text,size=11,bold=False,color=INK,leading=None):
 return Paragraph(rich(str(text)),ParagraphStyle('s',fontName='RU-Bold' if bold else 'RU',fontSize=size,leading=leading or size*1.42,textColor=color))
def paint(p,x,y,w):
 _,h=p.wrap(w,10000);p.drawOn(c,x,y-h);return y-h
def flow_list(items,x,y,w):
 for item,gap in items:y=paint(item,x,y,w)-gap
 return y
def box(text,x,y,w,label='ОГРАНИЧЕНИЕ',col=RED,size=11):
 heading=paragraph(label,8.2,True,col);body=paragraph(text,size)
 h=heading.wrap(w-22,10000)[1]+body.wrap(w-22,10000)[1]+25
 c.setFillColor(colors.HexColor('#fcf0ed') if col==RED else colors.HexColor('#edf4fa'));c.rect(x,y-h,w,h,fill=1,stroke=0)
 c.setStrokeColor(col);c.setLineWidth(2);c.line(x,y-h,x,y)
 yy=paint(heading,x+11,y-9,w-22)-5;paint(body,x+11,yy,w-22)
 return y-h-16
def section(title,x,y,w):
 c.setStrokeColor(LINE);c.setLineWidth(.6);c.line(x,y,x+w,y)
 return paint(paragraph(title,13,True),x,y-11,w)-12
def step(i,x,y,w,size=11,card=False):
 body=re.sub(r'^\d+\.\s*','',steps[i]);
 if card:
  a=paragraph(str(i+1)+'. '+titles[i],12,True);b=paragraph(body,size)
  ah=a.wrap(w-22,10000)[1];bh=b.wrap(w-22,10000)[1];h=ah+bh+34
  c.setFillColor(colors.white);c.rect(x,y-h,w,h,fill=1,stroke=0)
  c.setStrokeColor(ORANGE if i<3 else BLUE);c.setLineWidth(2);c.line(x,y,x+w,y)
  yy=paint(a,x+11,y-10,w-22)-10;paint(b,x+11,yy,w-22)
  return y-h-12,h
 else:
  c.setFillColor(ORANGE);c.setFont('RU-Bold',11);c.drawString(x,y-11,str(i+1)+'.')
  return paint(paragraph(body,size),x+23,y,w-23)-12,0
def header(variant):
 c.setFillColor(BG);c.rect(0,0,W,H,fill=1,stroke=0)
 c.setFillColor(INK);c.rect(0,H-59,W,59,fill=1,stroke=0)
 c.setFont('RU-Bold',15);c.setFillColor(colors.white);c.drawString(M,H-28,'KILL TEAM')
 c.setFont('RU',9);c.drawString(M+119,H-27,'РУССКИЙ СПРАВОЧНИК')
 c.setFont('RU',8);c.drawRightString(W-M,H-46,'Образец оформления / '+variant)
 c.setFillColor(MUTED);c.setFont('RU',8.4);c.drawString(M,H-81,'Lite Rules из исходного мода. Актуальность этого фрагмента ещё не сверена.')
 c.setFillColor(INK);c.setFont('RU-Bold',27);c.drawString(M,H-118,'Стрельба')
 c.setFillColor(MUTED);c.setFont('RU',9);c.drawString(M,H-135,'SHOOT  /  ПОРЯДОК РАЗРЕШЕНИЯ')
 c.setFillColor(INK);c.roundRect(W-M-58,H-124,58,29,3,fill=1,stroke=0);c.setFillColor(colors.white);c.setFont('RU-Bold',14);c.drawCentredString(W-M-29,H-114,'1 ОД')
 return box(restriction,M,H-153,WIDTH)
def foot(page,label):
 c.setStrokeColor(LINE);c.setLineWidth(.6);c.line(M,43,W-M,43)
 c.setFont('RU',8);c.setFillColor(MUTED);c.drawString(M,29,label);c.drawRightString(W-M,29,str(page))
def minimum(y):
 if y<58:raise ValueError('Sample content would overlap footer: '+str(y))
out=OUT/'KT-RU-layout-examples.pdf';c=canvas.Canvas(str(out),pagesize=A4,title='Kill Team - образцы оформления',author='Русский справочник Kill Team')

y=header('Справочник');main_w=WIDTH-139;aside_x=M+main_w+19;aside_w=120
y=section('Порядок стрельбы',M,y,main_w)
aside_y=y
for i in range(6):y,_=step(i,M,y,main_w,11)
ay=section('Результаты кубиков',aside_x,aside_y+24,aside_w)
ay=paint(paragraph(intro,10.5),aside_x,ay,aside_w)-22
paint(paragraph('Номер шага выделен оранжевым. Числа, кубики и стоимость действия - жирным. Ограничения - в красном блоке.',9.5),aside_x,ay,aside_w)
minimum(y);foot(1,'Справочник / полная процедура и контекстная справка');c.showPage()

y=header('Тактический лист');gap=20;cw=(WIDTH-gap)/2
left_y=section('Атака · шаги 1-3',M,y,cw);right_y=section('Защита и урон · шаги 4-6',M+cw+gap,y,cw)
for i in range(3):left_y,_=step(i,M,left_y,cw,11)
for i in range(3,6):right_y,_=step(i,M+cw+gap,right_y,cw,11)
y=min(left_y,right_y)-2;y=section('Успехи и провалы',M,y,WIDTH);y=paint(paragraph(intro,11),M,y,WIDTH)
minimum(y);foot(2,'Тактический лист / две колонки и короткая справка');c.showPage()

y=header('Карточки правил');gap=12;cw=(WIDTH-gap*2)/3
for start in (0,3):
 bottom=[]
 for i in range(start,start+3):bottom.append(step(i,M+(i%3)*(cw+gap),y,cw,11,True)[0])
 y=min(bottom)
y=section('Успехи и провалы',M,y,WIDTH);y=paint(paragraph(intro,11),M,y,WIDTH)
minimum(y);foot(3,'Карточки правил / самостоятельные блоки быстрого поиска');c.showPage()

# A table/stats example, independently checked against the linked current Apprentek.
card=json.loads((ROOT/'ru-images-all-reviewed.json').read_text(encoding='utf8'))['c54f0514d3523963']
c.setFillColor(BG);c.rect(0,0,W,H,fill=1,stroke=0)
c.setFillColor(INK);c.rect(0,H-59,W,59,fill=1,stroke=0);c.setFillColor(colors.white);c.setFont('RU-Bold',15);c.drawString(M,H-28,'KILL TEAM');c.setFont('RU',9);c.drawString(M+119,H-27,'ОПЕРАТИВНИК / КРУГ ИЕРОТЕК')
c.setFillColor(MUTED);c.setFont('RU',8.5);c.drawString(M,H-81,'Характеристики и способность ниже сверены с Wahapedia 05.10.2026.')
c.setFillColor(INK);c.setFont('RU-Bold',27);c.drawString(M,H-118,'Подмастерье');c.setFont('RU',10);c.setFillColor(MUTED);c.drawString(M,H-137,'APPRENTEK · КРУГ ИЕРОТЕК · БАЗА 32 ММ')
y=H-164;stats=card['stats'];labels=['ЛИМИТ ОД (APL)','ПЕРЕМЕЩЕНИЕ','СПАСБРОСОК','РАНЫ'];values=[str(stats['APL']),stats['Move'],stats['Save'],str(stats['Wounds'])]
sw=WIDTH/4
for i in range(4):
 x=M+i*sw;c.setFillColor(colors.white);c.rect(x,y-63,sw-7,63,fill=1,stroke=0)
 c.setFillColor(MUTED);c.setFont('RU',8.5);c.drawString(x+10,y-16,labels[i]);c.setFillColor(INK);c.setFont('RU-Bold',23);c.drawString(x+10,y-47,values[i])
y-=85;y=section('Профили оружия',M,y,WIDTH)
rows=[['Оружие','Атк','Поп.','Урон','Правила'],['Арканный проводник\nСтрелковое (ranged)','4','3+','4/5','Бронебойное 1;\nУвеличение*'],['Арканный проводник\nБлижний бой (melee)','3','4+','3/5','-']]
table=Table([[paragraph(value,10.5,i==0,colors.white if i==0 else INK) for value in row] for i,row in enumerate(rows)],colWidths=[WIDTH*.38,WIDTH*.075,WIDTH*.09,WIDTH*.1,WIDTH*.355])
table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#edf3f5')]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
_,th=table.wrap(WIDTH,10000);table.drawOn(c,M,y-th);y-=th+24
y=paint(paragraph('* Увеличение (Magnify): полное правило отряда доступно по ссылке на Wahapedia ниже.',9.5),M,y,WIDTH)-18
y=section('Помощь подмастерья',M,y,WIDTH);y=paint(paragraph(card['blocks'][0]['russian'],12),M,y,WIDTH)-19
y=box('За раунд можно выполнить только одно уникальное действие криптека.',M,y,WIDTH,label='ЛИМИТ ПРИМЕНЕНИЯ',size=11)
y=section('Источники для сверки',M,y,WIDTH)
links=[('Wahapedia: Apprentek','https://wahapedia.ru/kill-team3/kill-teams/hierotek-circle/#Apprentek'),('Официальный каталог актуальных правил','https://www.warhammer-community.com/en-gb/downloads/kill-team/')]
for label,url in links:
 p=Paragraph('<link href="'+url+'" color="#235e88">'+html.escape(label)+'</link>',ParagraphStyle('link',fontName='RU',fontSize=10.5,leading=15));y=paint(p,M,y,WIDTH)-8
minimum(y);foot(4,'Пример оформления таблиц / сверена эта карточка, не весь отряд');c.showPage();c.save()

check=PdfReader(out);assert len(check.pages)==4
norm=lambda s:re.sub(r'\s+','',s)
for page in check.pages[:3]:
 text=norm(page.extract_text())
 for part in steps:
  # Step numbers are laid out separately; all rule text and bullets remain.
  body=re.sub(r'^\d+\.\s*','',part);assert norm(body) in text,body[:80]
 assert norm(intro) in text;assert norm(restriction) in text
assert 'APPRENTEK' in check.pages[3].extract_text()
doc=pypdfium2.PdfDocument(str(out))
for i,page in enumerate(doc):page.render(scale=1.7).to_pil().save(TMP/(str(i+1)+'.png'))
report={'path':str(out),'pages':4,'sampleOnly':True,'bulkLayoutApprovalRequired':True,'allSampleRuleTextsPresent':True,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'visuallyVerified':False}
(ROOT/'output/layout-sample-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
