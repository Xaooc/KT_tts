"""Review examples for six roster/ploy/equipment/rule faces; no mod changes."""
import ast,html,json,re,hashlib
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader
import pypdfium2

ROOT=Path(__file__).parent;OUT=ROOT/'output/pdf/KT-RU-team-card-examples.pdf'
IMG=ROOT/'output/images';TMP=ROOT/'tmp/team-card-examples';TMP.mkdir(parents=True,exist_ok=True)
for name,file in [('RU','arial.ttf'),('RU-Bold','arialbd.ttf'),('RU-Italic','ariali.ttf'),('RU-Condensed','DejaVuSansCondensed-Bold.ttf')]:
 pdfmetrics.registerFont(TTFont(name,'C:/Windows/Fonts/'+file))
pdfmetrics.registerFontFamily('RU',normal='RU',bold='RU-Bold',italic='RU-Italic')
# Read the established term matcher without executing the separate sample builder.
tree=ast.parse((ROOT/'build-dense-layout-sample.py').read_text(encoding='utf8'))
terms=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='TERMS' for t in n.targets))
terms=[r'Бессмертн\w*\s+деспотек\w*|Страж\w*[- ]бессмертн\w*',r'Круг\w*\s+Иеротек',r'стратегическ\w*\s+фаз\w*',r'шаг\w*\s+подготовк\w*',r'Протокол\w*\s+реанимаци\w*',r'Поддержк\w*',r'SUPPORT|CRYPTEK|APPRENTEK|PLASMACYTE',r'Хрономант\w*|Психомант\w*|Техномант\w*',r'Плазмацит\w*(?:[- ](?:ускоритель|реаниматор))?',r'Деспотек\w*|Страж\w*|Метчик\w*\s+смерти',r'эон[- ]посох\w*|энтропийн\w*\s+копь\w*',r'гаусс[- ]бластер\w*|карабин\w*\s+Теслы|штык\w*',r'Разведк\w*|Безопасност\w*',r'Chronomancer|Psychomancer|Technomancer|Plasmacyte Accelerator|Plasmacyte Reanimator|Deathmark|Immortal Despotek|Immortal Guardian|Aeonstave|Entropic lance|Gauss blaster|Tesla carbine|Bayonet|Ready step|Strategy phase|Reanimation Protocols|Recon|Security']+terms
pat=re.compile(r'(?<!\w)(?:'+'|'.join(terms)+r')(?!\w)',re.I)
def rich(s):
 s=str(s);pieces=[];last=0
 for m in pat.finditer(s):pieces.extend([html.escape(s[last:m.start()]),'<b>'+html.escape(m[0])+'</b>']);last=m.end()
 pieces.append(html.escape(s[last:]));return ''.join(pieces).replace('\n','<br/>')
ORANGE=colors.HexColor('#f45c21');INK=colors.HexColor('#191b1c');WHITE=colors.HexColor('#f5f5f0');GREY=colors.HexColor('#656f6a')
cards=json.loads((ROOT/'ru-images-all-reviewed.json').read_text(encoding='utf8'))
texture=ROOT/'inventory/original-images/8eb2d3bab6fa0765.img'
paper=ROOT/'inventory/reference-assets/kt-original-paper-texture.jpg'
if not paper.exists():
 paper.parent.mkdir(parents=True,exist_ok=True)
 official=PdfReader(ROOT/'inventory/official-review/hierotek-circle-2026-08.pdf')
 image=next(img for img in official.pages[3].images if img.image.width==1509 and img.image.height==906)
 paper.write_bytes(image.data)
roster_front='3f5dc96fe76bfae2';roster_back='8eb2d3bab6fa0765'
ids=[roster_front,roster_back,'7d6e3e1cfaab5468','185e0e8f7462686d','0afc2316bf68f135','7d02f6c1baab8125']
c=canvas.Canvas(str(OUT),pagesize=(300,475),title='Kill Team - состав отряда и приёмы, образцы',author='Русский справочник Kill Team')
included=[];report=[]
def drawpara(text,x,y,width,size=21,bold=False,color=INK,italic=False):
 font='RU-Italic' if italic else ('RU-Bold' if bold else 'RU')
 p=Paragraph(rich(text),ParagraphStyle('card',fontName=font,fontSize=size,leading=size*1.24,textColor=color))
 h=p.wrap(width,10000)[1];p.drawOn(c,x,y-h);return y-h
def fit_title(text,x,y,width,size=34,color=WHITE):
 size=min(size,size*width/max(1,pdfmetrics.stringWidth(text,'RU-Condensed',size)))
 c.setFont('RU-Condensed',size);c.setFillColor(color);c.drawString(x,y,text)
def dark_texture(x,y,width,height):
 # Fit one continuous empty source area into a PDF viewport, avoiding tile seams.
 c.saveState();p=c.beginPath();p.rect(x,y,width,height);c.clipPath(p,stroke=0,fill=0)
 scale=max(width/600,height/600)
 c.drawImage(ImageReader(str(texture)),x+(width-600*scale)/2,y,600*scale,950*scale);c.restoreState()
def backdrop(id,dark=False):
 if dark:dark_texture(0,0,600,950);return
 source=ROOT/'inventory/original-images'/f'{id}.img'
 # The lower source area contains only paper and watermark, without English text.
 # Place it continuously through a PDF viewport; source bitmaps remain untouched.
 c.saveState();p=c.beginPath();p.rect(0,0,600,823);c.clipPath(p,stroke=0,fill=0)
 scale=823/906
 c.drawImage(ImageReader(str(paper)),(600-1509*scale)/2,0,1509*scale,823);c.restoreState()
 cutoff={'7d6e3e1cfaab5468':385,'185e0e8f7462686d':385,'0afc2316bf68f135':285,'7d02f6c1baab8125':455}[id]
 # Fade the original watermark area into the paper instead of leaving a sharp seam.
 fade=64
 c.saveState();p=c.beginPath();p.rect(0,0,600,cutoff-fade);c.clipPath(p,stroke=0,fill=0)
 c.drawImage(ImageReader(str(source)),0,0,600,950);c.restoreState()
 for k in range(16):
  c.saveState();c.setFillAlpha(1-(k+.5)/16)
  p=c.beginPath();p.rect(0,cutoff-fade+k*fade/16,600,fade/16);c.clipPath(p,stroke=0,fill=0)
  c.drawImage(ImageReader(str(source)),0,0,600,950);c.restoreState()
 dark_texture(0,823,600,127)
def page_start(id,dark=False):c.saveState();c.scale(.5,.5);backdrop(id,dark)
def footer():
 c.setFont('RU',10);c.setFillColor(colors.HexColor('#777f7a'))
 c.drawString(25,24,'Образец · сверка выбранных правил: 05.10.2026 · Wahapedia')
 c.linkURL('https://wahapedia.ru/kill-team3/kill-teams/hierotek-circle/',(25,18,575,38),relative=0)
def roster_header(back=False):
 fit_title('КРУГ ИЕРОТЕК',25,898,550,41)
 fit_title('ОТРЯД KILL TEAM'+(' / ОБОРОТ' if back else ''),25,854,550,35)
 c.setFillColor(ORANGE);c.rect(0,789,600,34,fill=1,stroke=0)
 fit_title('АРХЕТИПЫ: РАЗВЕДКА (RECON), БЕЗОПАСНОСТЬ (SECURITY)',25,799,548,16)
 fit_title('ОПЕРАТИВНИКИ'+(' / ПРОДОЛЖЕНИЕ' if back else ''),25,749,550,29)
 c.setStrokeColor(ORANGE);c.setLineWidth(2);c.line(25,735,575,735)
 return 718
def roster_item(text,y,indent=0,big=False):
 x=25+indent
 c.setFillColor(ORANGE);c.setFont('RU-Bold',20);c.drawString(x,y-20,'›' if big else '•')
 return drawpara(text,x+22,y,552-indent-22,21,big,WHITE)-8

page_start(roster_front,True);y=roster_header()
roster_rows=[
 ('1 оперативник Круга Иеротек на выбор:',0,True),
 ('Хрономант (Chronomancer):\nэон-посох (Aeonstave) или энтропийное копьё (Entropic lance)',30,False),
 ('Психомант (Psychomancer)',30,False),('Техномант (Technomancer)',30,False),
 ('1 Плазмацит-ускоритель (Plasmacyte Accelerator)',0,True),
 ('1 Плазмацит-реаниматор (Plasmacyte Reanimator)',0,True),
 ('5 оперативников Круга Иеротек из списка:',0,True),
 ('Подмастерье (Apprentek)',30,False),('Метчик смерти (Deathmark)',30,False)]
for text,indent,big in roster_rows:y=roster_item(text,y,indent,big)
if y<104:raise ValueError('Roster front overflow '+str(y))
c.setFillColor(ORANGE);c.rect(25,69,550,32,fill=1,stroke=0);fit_title('ПРОДОЛЖЕНИЕ НА ОБОРОТЕ  ›',31,78,530,21)
footer();c.restoreState();c.showPage();included.append([r[0] for r in roster_rows]);report.append({'id':roster_front,'minimumY':y})

page_start(roster_back,True);y=roster_header(True)
back_rows=[('Бессмертный деспотек (Immortal Despotek):',0,True),('гаусс-бластер (Gauss blaster) и штык (Bayonet);\nили карабин Теслы (Tesla carbine) и штык',30,False),('Страж-бессмертный (Immortal Guardian):',0,True),('гаусс-бластер и штык;\nили карабин Теслы и штык',30,False)]
for text,indent,big in back_rows:y=roster_item(text,y,indent,big)
limit='Кроме Метчиков смерти (Deathmark) и Стражей-бессмертных (Immortal Guardian), каждый оперативник из этого списка может быть включён в отряд только один раз.'
y=drawpara(limit,25,y-14,550,21,color=WHITE)
footer();c.restoreState();c.showPage();included.append([r[0] for r in back_rows]+[limit]);report.append({'id':roster_back,'minimumY':y})

types={ids[2]:('СТРАТЕГИЧЕСКИЙ ПРИЁМ','STRATEGY PLOY'),ids[3]:('ПРИЁМ ПЕРЕСТРЕЛКИ','FIREFIGHT PLOY'),ids[4]:('СНАРЯЖЕНИЕ ОТРЯДА','FACTION EQUIPMENT'),ids[5]:('ПРАВИЛО ОТРЯДА','FACTION RULE')}
for id in ids[2:]:
 card=cards[id];page_start(id)
 c.setFillColor(ORANGE);c.setFont('RU-Bold',28);c.drawCentredString(300,900,'КРУГ ИЕРОТЕК')
 kind,english=types[id];fit_title(kind,25,853,550,35)
 c.setFont('RU-Bold',13);c.setFillColor(colors.HexColor('#b9bfbc'));c.drawCentredString(300,831,english)
 title=card['titleRussian'].split(' (')[0]
 if id==ids[3]:title='Кортикальный контроль'
 if id==ids[5]:
  fit_title(title.upper(),25,778,550,31,ORANGE)
  c.setStrokeColor(ORANGE);c.setLineWidth(2);c.line(25,763,575,763)
 else:
  bar=GREY if id==ids[2] else (colors.HexColor('#24211f') if id==ids[3] else None)
  c.setStrokeColor(GREY);c.setLineWidth(1)
  if bar:c.setFillColor(bar);c.rect(25,760,550,42,stroke=0,fill=1)
  else:c.rect(25,760,550,42,stroke=1,fill=0)
  fit_title(title.upper(),31,772,535,29,WHITE if bar else INK)
 y=drawpara(card['titleEnglish'],25,748,550,13,color=colors.HexColor('#636c67'))-9
 y=drawpara(card['flavorRussian'],25,y,550,18,italic=True,color=colors.HexColor('#59675e'))-20
 body=card['blocks'][0]['russian'].replace('Хиеротек','Иеротек')
 if id==ids[2]:
  body=('Когда дружественный оперативник Круга Иеротек стреляет по оперативнику в пределах 8 дюймов от самого стрелка, дальнобойное оружие этого дружественного оперативника получает свойство «Сбалансированное» (Balanced). При использовании «Увеличения» (Magnify) сам стрелок всё равно должен находиться в пределах 8 дюймов от цели. Расстояние от другого оперативника, через которого определяется допустимая цель, не заменяет расстояние от стрелка до цели.')
 if id==ids[4]:
  body=('Раз за раунд, когда дружественный Подмастерье (APPRENTEK) или Криптек (CRYPTEK) Круга Иеротек выполняет Стрельбу (Shoot), можно выбрать другого дружественного оперативника Круга Иеротек, кроме Плазмацита (PLASMACYTE). Он должен иметь приказ «Бой» (Engage), быть видим стрелку и не находиться в дистанции контроля врагов. До конца действия выбранный боец может считаться активным оперативником для правила «Увеличение» (Magnify).')
 if id==ids[5]:
  body=('На шаге подготовки (Ready step) каждой стратегической фазы (Strategy phase), перед разрешением всех остальных правил фракции на этом шаге, включая Протоколы реанимации (Reanimation Protocols), каждый дружественный оперативник Круга Иеротек восстанавливает до D3+1 утраченных ран. Бросок для каждого оперативника выполняется отдельно.')
 y=drawpara(body,25,y,550,22)
 if y<65:raise ValueError('Rule overflow '+id+' '+str(y))
 footer();c.restoreState();c.showPage();included.append([card['flavorRussian'],body]);report.append({'id':id,'category':english,'minimumY':y,'ruleBody':body,'currentRuleCorrections':id in (ids[4],ids[5])})
c.save()
pdf=PdfReader(OUT);assert len(pdf.pages)==6
norm=lambda s:re.sub(r'\s+','',s)
for i,parts in enumerate(included):
 text=norm(pdf.pages[i].extract_text())
 for part in parts:assert norm(part) in text,part[:70]
doc=pypdfium2.PdfDocument(str(OUT));paths=[]
for i,page in enumerate(doc):
 path=IMG/('KT-RU-'+['team-roster-front','team-roster-back','strategy-ploy','firefight-ploy','equipment','faction-rule'][i]+'-example.png')
 page.render(scale=4).to_pil().save(path);paths.append(str(path))
# A document-native contact sheet makes the three main types easy to compare.
contact=TMP/'main-card-preview.pdf';sheet=canvas.Canvas(str(contact),pagesize=(1840,990))
sheet.setFillColor(colors.HexColor('#ffffff'));sheet.rect(0,0,1840,990,stroke=0,fill=1)
for j,i in enumerate([0,2,3]):sheet.drawImage(paths[i],20+j*600,20,580,950,preserveAspectRatio=True,anchor='c')
sheet.showPage();sheet.save()
overview=IMG/'KT-RU-team-and-ploy-examples.png';pypdfium2.PdfDocument(str(contact))[0].render(scale=1).to_pil().save(overview)
result={'path':str(OUT),'pages':6,'sampleOnly':True,'completeTeamAudit':False,'sourcePage':'https://wahapedia.ru/kill-team3/kill-teams/hierotek-circle/','checked':'2026-10-05','allSelectedRuleTextsPresent':True,'originalPortraitRatio':'600:950','cards':report,'images':paths,'overview':str(overview),'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'visuallyVerified':False}
(ROOT/'output/team-card-example-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k not in ('cards','images')},ensure_ascii=False))
