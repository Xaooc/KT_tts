"""Render newly typeset vector cards; original raster card images are never modified."""
import argparse,hashlib,html,io,json,math,re
from pathlib import Path
from PIL import Image as PILImage
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph,Table,TableStyle,Spacer,Flowable
from kt_design import markup,DESIGN,approved
from pypdf import PdfReader
import pypdfium2

ROOT=Path(__file__).parent;OUT=ROOT/'output/images';TMP=ROOT/'tmp/cards'
OUT.mkdir(parents=True,exist_ok=True);TMP.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('RU','C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('RU-Bold','C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('RU',normal='RU',bold='RU-Bold')
NAVY=colors.HexColor('#191b1c');ORANGE=colors.HexColor('#f45c21');PALE=colors.HexColor('#e9e9e5')
class SourceFigure(Flowable):
 """Place a verified source illustration through a vector viewport, with Russian labels."""
 def __init__(self,block,width,size):
  super().__init__();self.block=block;self.size=size
  sources={x['id']:x for x in json.loads((ROOT/'inventory/image-sources.json').read_text(encoding='utf8'))}
  self.path=sources[block['sourceimageid']]['path'];im=PILImage.open(self.path);self.ow,self.oh=im.size
  self.l,self.t,self.r,self.b=[x*(self.ow if i%2==0 else self.oh) for i,x in enumerate(block['sourceBox'])]
  self.scale=min(width/(self.r-self.l),block.get('maxHeight',300)/(self.b-self.t));self.width=(self.r-self.l)*self.scale;self.height=(self.b-self.t)*self.scale
 def wrap(self,w,h):return self.width,self.height
 def draw(self):
  c=self.canv;c.saveState();p=c.beginPath();p.rect(0,0,self.width,self.height);c.clipPath(p,stroke=0,fill=0)
  c.drawImage(ImageReader(self.path),-self.l*self.scale,-(self.oh-self.b)*self.scale,self.ow*self.scale,self.oh*self.scale)
  for label in self.block.get('labelOverlays',[]):
   x,t,w,h=label['box'];x*=self.width;w*=self.width;h*=self.height;y=self.height-t*self.height-h
   bg=colors.HexColor(label.get('background','#f45c21'));fg=colors.HexColor(label.get('foreground','#ffffff'))
   c.setFillColor(bg);c.rect(x,y,w,h,fill=1,stroke=0)
   label_size=min(self.size*.75,14)
   while True:
    p=para(label['russian'],label_size,True,fg);ph=p.wrap(w-6,h)[1]
    if ph<=h-6:break
    label_size-=.5
    if label_size<5:raise ValueError('Figure label overflow')
   p.drawOn(c,x+3,y+h-3-ph)
  c.restoreState()
class ColumnBreak(Flowable):
 _columnBreak=True
 def wrap(self,w,h):return 0,0
 def draw(self):pass
class ActionHeading(Flowable):
 def __init__(self,text,size):
  super().__init__();self.p=para(text,size,True,colors.white);self._is_heading=True
 def wrap(self,w,h):self.width=w;self.height=self.p.wrap(w-16,h)[1]+12;return w,self.height
 def draw(self):
  c=self.canv;c.setFillColor(ORANGE);c.rect(0,0,self.width,self.height,fill=1,stroke=0);self.p.drawOn(c,8,6)

class ActionLine(Flowable):
 def __init__(self,text,size,restriction=False):
  super().__init__();self.p=para(text,size);self.restriction=restriction
 def wrap(self,w,h):self.width=w;self.height=self.p.wrap(w-18,h)[1];return w,self.height
 def draw(self):
  c=self.canv;col=colors.HexColor('#b32c24') if self.restriction else colors.HexColor('#248d49');c.setFillColor(col)
  y=self.height-10;p=c.beginPath()
  if self.restriction:p.moveTo(0,y);p.lineTo(6,y+6);p.lineTo(12,y);p.lineTo(6,y-6)
  else:p.moveTo(0,y-6);p.lineTo(12,y);p.lineTo(0,y+6)
  p.close();c.drawPath(p,fill=1,stroke=0);self.p.drawOn(c,18,0)
class SkytorchDiagram(Flowable):
 def __init__(self,width):super().__init__();self.width=width;self.height=100
 def draw(self):
  c=self.canv;left=65;right=self.width-65;y=51;r=23
  c.setFillColor(colors.HexColor('#fff0e8'));c.rect(left,y-r,right-left,2*r,fill=1,stroke=0)
  c.setStrokeColor(ORANGE);c.setLineWidth(1);c.setDash(4,3)
  for dy in (-r,r):c.line(left,y+dy,right,y+dy)
  c.setDash();c.setFillColor(NAVY);c.circle(left,y,r,fill=1,stroke=0)
  c.setFillColor(colors.HexColor('#82949f'));c.circle(right,y,r,fill=1,stroke=0)
  c.setFillColor(colors.white);c.setFont('RU-Bold',8);c.drawCentredString(left,y-3,'28 мм')
  c.setFillColor(ORANGE);c.setFont('RU-Bold',10);c.drawCentredString((left+right)/2,y+3,'ПОЛОСА ОГНЯ')
  c.setFillColor(NAVY);c.setFont('RU',8);c.drawCentredString(left,11,'Предыдущее положение');c.drawCentredString(right,11,'Текущее положение')

class SlingshotDiagram(Flowable):
 def __init__(self,width):super().__init__();self.width=width;self.height=165
 def draw(self):
  c=self.canv;centre=self.width/2;left=34;right=self.width-34;y=47
  c.setFillColor(colors.HexColor('#cfd6d3'));c.rect(centre-30,y,60,90,fill=1,stroke=0)
  c.setFillColor(NAVY);c.setFont('RU-Bold',9);c.drawCentredString(centre,123,'ТЕРРЕЙН')
  for x,label in [(left,'Новое положение'),(right,'Исходное положение')]:
   c.setFillColor(ORANGE);c.circle(x,y+25,13,fill=1,stroke=0)
   c.setFillColor(NAVY);c.setFont('RU',8);c.drawCentredString(x,y+49,label)
  c.setStrokeColor(NAVY);c.setLineWidth(1.3);c.setDash(4,3)
  c.line(left,y+25,centre,y);c.line(centre,y,right,y+25);c.setDash()
  c.setFillColor(ORANGE);c.circle(centre,y,4,fill=1,stroke=0)
  c.setFillColor(NAVY);c.setFont('RU-Bold',8)
  c.drawCentredString((left+centre)/2,y-2,'ЦЕЛИКОМ В ПРЕДЕЛАХ 6"')
  c.drawCentredString((right+centre)/2,y-2,'В ПРЕДЕЛАХ 6"')
  c.setFont('RU',8);c.drawCentredString(centre,12,'При повторном выставлении измеряйте по горизонтали')

class GoreTankDiagram(Flowable):
 def __init__(self,width):super().__init__();self.width=width;self.height=210
 def draw(self):
  c=self.canv;c.translate(0,15);centre=self.width/2;box_w=min(190,self.width*.43)
  c.setFont('RU-Bold',11)
  for y,label in [(153,'ПОЛНЫЙ'),(88,'ПОЛОВИННЫЙ'),(23,'ПУСТОЙ')]:
   c.setFillColor(NAVY);c.roundRect(centre-box_w/2,y-20,box_w,40,5,fill=1,stroke=0)
   c.setFillColor(colors.white);c.drawCentredString(centre,y-3,label)
  c.setFillColor(NAVY);c.setFont('RU',9);c.drawCentredString(centre,-10,'Пустой резервуар: убрать жетон')
  for y in (120,55):
   for x,direction,col,label in [(centre-box_w/2-38,1,'#169c45','ПОВЫСИТЬ'),(centre+box_w/2+38,-1,'#bc2a21','ПОНИЗИТЬ')]:
    c.setFillColor(colors.HexColor(col));c.rect(x-4,y-19,8,31,fill=1,stroke=0)
    p=c.beginPath();p.moveTo(x-10,y+12*direction);p.lineTo(x+10,y+12*direction);p.lineTo(x,y+22*direction);p.close();c.drawPath(p,fill=1,stroke=0)
    c.setFont('RU-Bold',7);c.drawCentredString(x,y-31,label)

class BeamDiagram(Flowable):
 def __init__(self,width):super().__init__();self.width=width;self.height=245
 def draw(self):
  c=self.canv;left=35;target=self.width*.48;r=23
  for x,y,col,label in [(left,145,ORANGE,''),(target,145,colors.HexColor('#b92c28'),'A'),(self.width*.29,117,colors.HexColor('#169c45'),'B'),(self.width*.83,166,colors.HexColor('#169c45'),'C'),(self.width*.65,209,colors.HexColor('#169c45'),'D')]:
   c.setFillColor(col);c.circle(x,y,r,fill=1,stroke=0)
   if label:c.setFillColor(colors.white);c.setFont('RU-Bold',19);c.drawCentredString(x,y-6,label)
  c.setStrokeColor(NAVY);c.setFillColor(NAVY);c.setLineWidth(1.5);c.setDash(4,3)
  end=self.width-18;c.line(left,122,end,163);c.setDash()
  p=c.beginPath();p.moveTo(end,163);p.lineTo(end-10,168);p.lineTo(end-9,156);p.close();c.drawPath(p,fill=1,stroke=0)
  c.setFont('RU-Bold',9);c.drawString(5,181,'Харткин-стрелок');c.drawCentredString(self.width*.68,94,'Линия луча')
  c.setFont('RU',9);c.drawCentredString(self.width/2,58,'A — первоначальная цель; луч её не поражает.')
  c.drawCentredString(self.width/2,42,'B и C — на линии; D — вне линии.')

class FlankDiagram(Flowable):
 def __init__(self,width):super().__init__();self.width=width;self.height=235
 def draw(self):
  c=self.canv;x=self.width*.29;w=self.width*.42;bottom=23;h=196
  c.setFillColor(colors.HexColor('#ffe0c4'));c.rect(x,bottom+h/2,w,h/2,fill=1,stroke=0)
  c.setFillColor(colors.HexColor('#d6dfe2'));c.rect(x,bottom,w,h/2,fill=1,stroke=0)
  c.setStrokeColor(NAVY);c.rect(x,bottom,w,h,fill=0,stroke=1);c.line(x,bottom+h/2,x+w,bottom+h/2)
  c.setFillColor(NAVY);c.setFont('RU-Bold',8)
  c.drawCentredString(x+w/2,bottom+h-12,'Территория игрока 1')
  c.drawCentredString(x+w/2,bottom+7,'Территория игрока 2')
  for dx,dy,col in [(.22,.72,NAVY),(.66,.78,NAVY),(.18,.37,ORANGE),(.5,.25,ORANGE),(.82,.37,ORANGE)]:
   cx=x+w*dx;cy=bottom+h*dy;c.setFillColor(col);c.circle(cx,cy,10,fill=1,stroke=0)
   c.setFillColor(NAVY);c.setFont('RU-Bold',8);c.drawCentredString(cx,cy+16,'APL 2')
  c.setFillColor(NAVY);c.setFont('RU',8);c.drawCentredString(x+w/2,4,'Игрок 1: 6 APL > игрок 2: 4 APL')

class CoordinationDiagram(Flowable):
 def __init__(self,width):super().__init__();self.width=width;self.height=290
 def draw(self):
  c=self.canv;ax=self.width*.78;fx=self.width*.19;enemy_y=228;friend_y=190;r=29
  c.setFillColor(colors.HexColor('#82948b'));c.rect(self.width*.54,160,self.width*.42,17,fill=1,stroke=0)
  for x,y,col,label in [(fx,friend_y,ORANGE,''),(ax,enemy_y,NAVY,''),(ax,45,ORANGE,'A')]:
   c.setFillColor(col);c.circle(x,y,r,fill=1,stroke=0)
   if label:c.setFillColor(colors.white);c.setFont('RU-Bold',20);c.drawCentredString(x,y-7,label)
  def arrow(x0,y0,x1,y1,col):
   c.setStrokeColor(col);c.setFillColor(col);c.setLineWidth(1.7);c.setDash(5,4);c.line(x0,y0,x1,y1);c.setDash()
   angle=math.atan2(y1-y0,x1-x0);p=c.beginPath();p.moveTo(x1,y1)
   for sign in (-1,1):p.lineTo(x1-10*math.cos(angle)+sign*4*math.sin(angle),y1-10*math.sin(angle)-sign*4*math.cos(angle))
   p.close();c.drawPath(p,fill=1,stroke=0)
  green=colors.HexColor('#179846');red=colors.HexColor('#b82b20')
  for dy in (-r,r):arrow(fx,friend_y+r,ax-5,enemy_y+dy,green)
  arrow(ax-8,45+r,ax+r*.75,enemy_y-r*.65,red)
  c.setFillColor(NAVY);c.setFont('RU-Bold',10)
  c.drawCentredString(self.width*.36,277,'Виден, промежуточного террейна нет')
  c.drawCentredString(self.width*.43,118,'Виден, но есть промежуточный террейн')
  c.setFont('RU',8);c.drawCentredString(fx,friend_y-r-15,'Другой дружественный оперативник')
def bilingual(russian,english):
 russian=str(russian or '')
 if not russian:raise ValueError('Missing Russian card text')
 # Action headings already contain the English name with a translated AP suffix.
 key=re.sub(r'\s*\(?\d+\s*AP\)?\s*$', '', str(english or ''),flags=re.I).rstrip(' (,')
 compact=lambda s:re.sub(r'[^\w]+','',str(s)).lower()
 return russian if not english or compact(key) in compact(russian) else russian+' ('+english+')'
def para(text,size=10,bold=False,color=NAVY):
 style=ParagraphStyle('card',fontName='RU-Bold' if bold else 'RU',fontSize=size,leading=size*1.27,textColor=color,spaceAfter=0,allowWidows=0,allowOrphans=0)
 result=Paragraph(markup(text),style)
 result._is_heading=bool(bold and color==ORANGE)
 return result
def cell(text,size,bold=False):return para(text,size,bold)
def table(rows,widths,head=True):
 t=Table(rows,colWidths=widths,hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#b8c9d1')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
 return t
def body(card,width,size):
 flows=[]
 if card.get('flavorRussian'):flows += [para(card['flavorRussian'],size*.85,color=colors.HexColor('#59707e')),Spacer(1,size)]
 stats=None if card.get('_headerStats') else card.get('stats')
 if stats:
  if not all(k in stats for k in ('APL','Move','Save','Wounds')):raise ValueError('Incomplete operative stats')
  names=['APL','MOVE','SAVE','WOUNDS']
  rows=[[cell(n,size*.82,True) for n in names],[cell(stats[k],size*1.35,True) for k in ('APL','Move','Save','Wounds')]]
  flows += [table(rows,[width/4]*4),Spacer(1,size)]
 weapons=card.get('weapons')
 if weapons:
  header_size=min(size*.82,12)
  value_size=min(size,width*.085/2.25)
  rows=[[cell(n,header_size,True) for n in ['Оружие','ATK','HIT','DMG','WR']]]
  for w in weapons:
   if not all(k in w for k in ('english','russian','atk','hit','dmg')):raise ValueError('Incomplete weapon row')
   name=(w.get('type','')+' · ' if w.get('type') else '')+bilingual(w['russian'],w['english'])
   wr=w.get('wrRussian') or ('—' if not w.get('wrEnglish') or w.get('wrEnglish')=='-' else None)
   if wr is None:raise ValueError('Untranslated weapon rules')
   rows.append([cell(name,size*.88),cell(w['atk'],value_size),cell(w['hit'],value_size),cell(w['dmg'],value_size),cell(wr,size*.85)])
  flows += [table(rows,[width*x for x in [.35,.075,.075,.09,.41]]),Spacer(1,size*.6)]
 for block in card.get('blocks',[]):
  if block.get('type')=='column-break':flows.append(ColumnBreak());continue
  if block.get('headingEnglish')=='Card table labels':continue
  heading=block.get('headingRussian')
  action=bool(heading and re.search(r'\d+\s*AP\b',str(block.get('headingEnglish',''))+' '+heading,re.I))
  if heading and block.get('headingEnglish') not in ('Rule',card.get('_suppressHeadingEnglish')):
   htext=bilingual(heading,block.get('headingEnglish'))
   flows += [ActionHeading(htext,size*1.04) if action else para(htext,size*1.04,True,ORANGE),Spacer(1,size*.35)]
  if block.get('type')=='table' and block.get('rowsRussian'):
   columns=block.get('columnsRussian',[]);rows=([columns] if columns else [])+block['rowsRussian'];n=max(map(len,rows))
   flows += [table([[cell(v,size*.9) for v in row] for row in rows],[width/n]*n),Spacer(1,size*.6)]
  elif block.get('type')=='table' and block.get('rows'):
   data=block['rows'];keys=list(data[0]);rows=[[cell(str(row[k]),size*.9) for k in keys] for row in data]
   flows += [table(rows,[width/len(keys)]*len(keys)),Spacer(1,size*.6)]
  if block.get('russian'):
   if action:
    lines=re.split(r'\n|(?<=[.!?])\s+(?=(?:Этот оперативник|Оперативник|Это действие)\b)',block['russian'])
    for line in lines:
     if line.strip():flows += [ActionLine(line,size,bool(re.match(r'(?:Это действие|Оперативник|Этот оперативник).*?(?:нельзя|не может|не могут|запрещено)',line,re.I))),Spacer(1,size*.45)]
   else:
    for text in (block['russian'].split('\n') if card.get('splitBodyParagraphs') else [block['russian']]):
     if text.strip():flows += [para(text,size),Spacer(1,size*.7)]
  elif block.get('english') and block.get('type')!='figure' and not (block.get('type')=='table' and block.get('rowsRussian')):raise ValueError('Untranslated card block')
  if block.get('type')=='figure':
   labels=block.get('labelsRussian') or block.get('legendRussian') or block.get('fullRULegend') or block.get('captionRussian')
   if isinstance(labels,dict):labels='\n'.join(str(k)+' — '+str(v) for k,v in labels.items())
   elif isinstance(labels,list):labels='\n'.join(map(str,labels))
   if not labels and not block.get('russian'):raise ValueError('Missing Russian diagram legend')
   if labels:flows += [para(labels,size*.9),Spacer(1,size)]
   # Complex source diagrams need a separately rebuilt vector schematic before publication.
   if block.get('sourceBox') and block.get('illustrationOnly'):
    flows += [SourceFigure(block,width,size),Spacer(1,size*.5)]
   elif card['titleEnglish'].upper()=='VESPID SWARMGUARD' or card['titleEnglish'].upper()=='SWARMGUARD':
    flows += [SkytorchDiagram(width),Spacer(1,size*.5)]
   elif block.get('sourceimageid')=='af8238bdb99e2543':
    flows += [GoreTankDiagram(width),Spacer(1,size*.5)]
   elif block.get('sourceimageid')=='00d3bda095035692':
    flows += [CoordinationDiagram(width),Spacer(1,size*.5)]
   elif block.get('sourceimageid')=='27a2f36841ab2946':
    flows += [FlankDiagram(width),Spacer(1,size*.5)]
   elif block.get('sourceimageid')=='99850bfb8e970c6b':
    flows += [BeamDiagram(width),Spacer(1,size*.5)]
   elif block.get('sourceimageid')=='6545722b8b502917':
    flows += [SlingshotDiagram(width),Spacer(1,size*.5)]
   elif block.get('sourceBox') or block.get('sourcebox') or block.get('sourceRegion') or block.get('sourceImageID') or block.get('sourceimageid'):raise ValueError('Diagram requires vector reconstruction')
 if card.get('footerRussian'):flows += [Spacer(1,size*.4),para(card['footerRussian'],size*.72,color=colors.HexColor('#59707e'))]
 return flows

def render(id,card,source,original_size=None):
 from approved_card_layout import render_card
 return render_card(id,card,source,original_size,body,para)
def render_legacy(id,card,source,original_size=None):
 if card.get('kind')!='card':raise ValueError('Unsupported asset kind '+str(card.get('kind')))
 if not card.get('verifiedAgainstPixels'):raise ValueError('Unreviewed image translation '+id)
 if card.get('stats') and not card.get('weapons'):
  catalog=json.loads((ROOT/'inventory/card-assets.json').read_text(encoding='utf8'))
  # These three original drone/skull sides contain stats and abilities, but no weapons.
  # Their image hashes bind the exception to the actual originals inspected by the reviewer.
  verified_unarmed={'0510e2cf00490dcf':'65eb45f49a75d06c977c354af9da9be7634921b5a777fdfc7cb914d427aaf7ee','dc7e38f33dc20696':'94a6a4d4d140a743a12e97afe1bed5dc174300b492e348755aec30751b1a2793','becc4d80ee3c0d47':'cdbadb513457cfcb809882e5f19701fdd212318b796e7c80308fcc129b776b83'}
  if any(x.get('face',{}).get('id')==id for x in catalog) and verified_unarmed.get(id)!=source['sha256']:raise ValueError('Operative front has no weapon profiles: '+id)
 original=PILImage.open(source['path']);original_w,original_h=original_size or original.size
 scale=2048/max(original_w,original_h);pixels_w=round(original_w*scale);pixels_h=round(original_h*scale)
 W,H=pixels_w/2,pixels_h/2;margin=18;content_w=W-2*margin
 title=bilingual(card['titleRussian'],card['titleEnglish'])
 category=card.get('categoryRussian','')
 # Measurement is performed before painting, so no text can be silently clipped.
 chosen=None
 for base_size in [24,22,20,18,16,15,14,13,12,11,10.5,10,9.5,9,8.5,8,7.5]:
  flows=[para(title,max(14,base_size*1.65),True,colors.white),Spacer(1,7)]
  if category:flows += [para(category,base_size*.9,True,colors.white)]
  title_height=sum(f.wrap(content_w,10000)[1] for f in flows)
  header_height=title_height+margin*1.35
  content=body(card,content_w,base_size)
  total=sum(f.wrap(content_w,10000)[1] for f in content)
  if header_height+total+margin*2+10<=H:chosen=(base_size,flows,header_height,content,total);break
 if chosen is None:raise ValueError(f'{id}: card needs larger layout; would overflow even at 7.5pt')
 size,title_flows,header_height,flows,total=chosen
 scratch=TMP/(id+'.pdf');c=canvas.Canvas(str(scratch),pagesize=(W,H),pageCompression=1)
 c.setFillColor(colors.white);c.rect(0,0,W,H,fill=1,stroke=0)
 c.setFillColor(NAVY);c.rect(0,H-header_height,W,header_height,fill=1,stroke=0)
 c.setFillColor(ORANGE);c.rect(0,H-header_height-4,W,4,fill=1,stroke=0)
 y=H-margin*.7
 for flow in title_flows:
  _,h=flow.wrap(content_w,10000);y-=h;flow.drawOn(c,margin,y)
 y=H-header_height-margin
 for flow in flows:
  _,h=flow.wrap(content_w,10000);y-=h;flow.drawOn(c,margin,y)
 if y<margin:raise ValueError('Card layout overflow')
 c.showPage();c.save()
 reader=PdfReader(str(scratch));text=re.sub(r'\s+','',reader.pages[0].extract_text() or '')
 for block in card.get('blocks',[]):
  if block.get('headingEnglish')=='Card table labels':continue
  if block.get('russian') and re.sub(r'\s+','',block['russian']) not in text:raise ValueError('Missing rendered Russian rules')
 doc=pypdfium2.PdfDocument(str(scratch));img=doc[0].render(scale=2).to_pil()
 if img.size!=(pixels_w,pixels_h):raise ValueError('Unexpected texture dimensions')
 out=OUT/(id+'-ru.png');img.save(out,format='PNG',optimize=True)
 return {'id':id,'path':str(out),'sourceSHA256':source['sha256'],'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'width':pixels_w,'height':pixels_h,'originalWidth':original_w,'originalHeight':original_h,'bodyFontSize':size,'verifiedAgainstPixels':True,'visuallyVerified':False,'sourceCardIDPreserved':True}

def render_atlas(id,atlas,source):
 if not atlas.get('verifiedAgainstPixels'):raise ValueError('Unreviewed atlas '+id)
 cols,rows=atlas['columns'],atlas['rows'];original=PILImage.open(source['path'])
 # TTS grids use equal UV fractions even when texture pixels are not divisible.
 tile_size=(original.width/cols,original.height/rows)
 tiles=atlas['tiles'];blank=atlas.get('blankTiles',[])
 if set(map(int,tiles))&set(blank) or set(map(int,tiles))|set(blank)!=set(range(cols*rows)):raise ValueError('Missing atlas tile declaration')
 catalog=json.loads((ROOT/'inventory/card-assets.json').read_text(encoding='utf8'))
 for entry in catalog:
  if entry.get('face',{}).get('id')==id or entry.get('back',{}).get('id')==id and entry['back'].get('uniqueBack'):
   if (entry['face']['columns'],entry['face']['rows'])!=(cols,rows):raise ValueError('Atlas layout differs from source deck')
 reports={}
 # PDFium rounds each cell upwards; reserve one pixel per grid dimension.
 texture_edge=min(2048,int(8192*max(tile_size)/max(original.size))-max(cols,rows))
 for tile,card in tiles.items():
  temporary=dict(card);temporary['_textureEdge']=texture_edge
  reports[tile]=render(id+'-tile-'+tile,temporary,source,tile_size)
 if not reports:raise ValueError('No translated atlas cells')
 first=next(iter(reports.values()));w,h=first['width'],first['height']
 if max(w*cols,h*rows)>8192:raise ValueError('Atlas exceeds texture size limit')
 # Assemble only newly typeset vector cards; no original raster pixels are edited.
 combined=PILImage.new('RGB',(w*cols,h*rows),'#172d3a')
 for tile,report in reports.items():
  if (report['width'],report['height'])!=(w,h):raise ValueError('Unequal atlas cells')
  combined.paste(PILImage.open(report['path']),(int(tile)%cols*w,int(tile)//cols*h))
 out=OUT/(id+'-ru.png');combined.save(out,format='PNG',optimize=True)
 return {'id':id,'path':str(out),'sourceSHA256':source['sha256'],'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'width':combined.width,'height':combined.height,'originalWidth':original.width,'originalHeight':original.height,'columns':cols,'rows':rows,'tiles':reports,'blankTiles':blank,'verifiedAgainstPixels':True,'visuallyVerified':False,'sourceCardIDPreserved':True,'designSystem':DESIGN}

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('translations');parser.add_argument('--ids',nargs='*');parser.add_argument('--skip-unchanged',action='store_true');args=parser.parse_args()
 source={x['id']:x for x in json.loads((ROOT/'inventory/image-sources.json').read_text(encoding='utf8'))}
 translations=json.loads(Path(args.translations).read_text(encoding='utf8'));requested=args.ids or list(translations)
 report_path=ROOT/'output/card-render-report.json';report=json.loads(report_path.read_text(encoding='utf8')) if report_path.exists() else {}
 for id in requested:
  definition=translations[id]
  definition_sha=hashlib.sha256(json.dumps(definition,ensure_ascii=False,separators=(',',':')).encode('utf8')).hexdigest()
  old=report.get(id,{})
  if args.skip_unchanged and old.get('designSystem')==DESIGN and old.get('definitionSHA256')==definition_sha and Path(old.get('path','')).is_file() and hashlib.sha256(Path(old['path']).read_bytes()).hexdigest()==old.get('sha256'):continue
  report[id]=render_atlas(id,definition,source[id]) if definition.get('kind')=='atlas' else render(id,definition,source[id])
  report[id]['definitionSHA256']=definition_sha
  print(id,report[id].get('bodyFontSize','atlas'),flush=True)
  report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
