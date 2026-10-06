"""Original card chassis with measured flow frames; source images remain intact."""
import copy,hashlib,io,re
from pathlib import Path
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Frame,Spacer,Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from pypdf import PdfReader
import pypdfium2
from kt_design import ROOT,DESIGN,approved,markup

ORANGE=colors.HexColor('#f45c21');INK=colors.HexColor('#191b1c');PAPER=colors.HexColor('#e9e9e5')

def image_view(c,path,x,y,w,h):
 c.saveState();p=c.beginPath();p.rect(x,y,w,h);c.clipPath(p,stroke=0,fill=0)
 iw,ih=Image.open(path).size;s=max(w/iw,h/ih)
 c.drawImage(ImageReader(str(path)),x+(w-iw*s)/2,y+(h-ih*s)/2,iw*s,ih*s);c.restoreState()

def dark_stock(c,W,H):
 path=ROOT/'inventory/original-images/8eb2d3bab6fa0765.img'
 c.saveState();p=c.beginPath();p.rect(0,0,W,H);c.clipPath(p,stroke=0,fill=0)
 s=max(W/600,H/600);c.drawImage(ImageReader(str(path)),(W-600*s)/2,0,600*s,950*s);c.restoreState()

def fit(c,text,x,y,width,size=30,col=colors.white):
 size=min(size,size*width/max(1,pdfmetrics.stringWidth(text,'RU-Condensed',size)))
 c.setFillColor(col);c.setFont('RU-Condensed',size);c.drawString(x,y,text)

def title_para(text,size,col=colors.white):
 match=re.match(r'^(.*?)\s*(\([^()]*[A-Za-z][^()]*\))$',text,re.S)
 content=markup(text) if not match else markup(match[1])+'<br/><font size="'+str(round(size*.46,1))+'">'+markup(match[2])+'</font>'
 return Paragraph(content,ParagraphStyle('title',fontName='RU-Condensed',fontSize=size,leading=size*1.15,textColor=col))

def frame(c,flows,x,y,w,h):
 f=Frame(x,y,w,h,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
 while flows:
  head=flows[0]
  if getattr(head,'_columnBreak',False):flows.pop(0);break
  if getattr(head,'_is_heading',False):
   group=head.wrap(w,10000)[1];i=1
   while i<len(flows) and isinstance(flows[i],Spacer):group+=flows[i].wrap(w,10000)[1];i+=1
   if i<len(flows):group+=flows[i].wrap(w,10000)[1]
   if group>f._y-f._y1p+.001:break
  if not f.add(head,c,trySplit=0):break
  flows.pop(0)
 return flows

def place(c,flows,x,y,w,h,columns):
 remaining=list(flows);gap=20;cw=(w-gap*(columns-1))/columns
 for i in range(columns):frame(c,remaining,x+i*(cw+gap),y,cw,h)
 return remaining

def icon(c,i,x,y):
 c.setFillColor(ORANGE);c.setStrokeColor(ORANGE);c.setLineWidth(2)
 if i==0:
  for shift in (0,6):
   p=c.beginPath();p.moveTo(x,y+16+shift);p.lineTo(x+9,y+shift);p.lineTo(x+18,y+16+shift);c.drawPath(p)
 elif i==1:
  p=c.beginPath();p.moveTo(x,y+6);p.lineTo(x+8,y+11);p.lineTo(x+2,y+18);p.lineTo(x+24,y+23);p.lineTo(x+19,y);p.lineTo(x+13,y+8);p.close();c.drawPath(p,fill=1,stroke=0)
 elif i==2:
  p=c.beginPath();p.moveTo(x,y+23);p.lineTo(x+18,y+23);p.lineTo(x+18,y+7);p.lineTo(x+9,y);p.lineTo(x,y+7);p.close();c.drawPath(p);c.line(x+5,y+19,x+5,y+8)
 else:
  p=c.beginPath();p.moveTo(x+9,y+24);p.lineTo(x+16,y+5);p.lineTo(x+9,y);p.lineTo(x+2,y+5);p.close();c.drawPath(p,fill=1,stroke=0)

def render_card(id,card,source,original_size,body,para):
 approved()
 if card.get('kind')!='card' or not card.get('verifiedAgainstPixels'):raise ValueError('Unreviewed card '+id)
 if card.get('decorativeSource'):return render_decorative(id,card,source,original_size,para)
 original=Image.open(source['path']);ow,oh=original_size or original.size
 W,H=ow,oh;landscape=W>H;stats=bool(card.get('stats'))
 scale=card.get('_textureEdge',2048)/max(W,H);pw,ph=round(W*scale),round(H*scale)
 if card.get('referenceSheet'):W=card.get('referenceWidth',1400);H=W*oh/ow
 elif landscape:W,H=950,550
 else:H=950;W=950*ow/oh
 M=25;wide=W-2*M;header=91 if landscape else 130;bottom=58 if landscape else 35
 category=str(card.get('categoryRussian') or 'KILL TEAM')
 kind=str(card.get('categoryEnglish') or '').upper()
 roster=any(k in kind for k in ('KILL TEAM','ROSTER','SELECTION','DECK BACK','CARD BACK','TEAM CARD BACK')) and not stats
 title=card['titleRussian']
 # Operative fronts retain only the middle portrait of the original header.
 art=stats and abs(ow/oh-950/550)<.04 and original_size is None and not card.get('generatedSupplement')
 # Body copies exclude information explicitly painted in the header/footer.
 content_card=copy.deepcopy(card);content_card['_headerStats']=stats
 content_card['_suppressHeadingEnglish']=card.get('titleEnglish')
 if roster:
  for b in content_card.get('blocks',[]):
   if b.get('russian'):b['russian']=re.sub(r'(?<=[.;])\s+(?=[А-ЯЁ])','\n',b['russian'])
 content_card.pop('footerRussian',None)
 weapons=content_card.pop('weapons',None) if landscape and stats else None
 chosen=None
 candidates=[18,17,16,15,14,13,12,11,10,9] if landscape else [22,21,20,19,18,17,16,15,14,13,12]
 for size in candidates:
  top=H-header-M;cols=card.get('layoutColumns',3 if card.get('referenceSheet') else 2 if landscape else 1);cw=(wide-20*(cols-1))/cols
  banner=title_para(title,29) if not landscape and not roster else None
  banner_h=banner.wrap(wide-16,10000)[1]+20 if banner else 0
  weapon_flows=body({'weapons':weapons},wide,size) if weapons else []
  weapon_h=sum(f.wrap(wide,10000)[1] for f in weapon_flows)
  available=top-bottom-weapon_h-banner_h
  flows=body(content_card,cw,size)
  trial=canvas.Canvas(io.BytesIO(),pagesize=(W,H))
  if available>0 and not place(trial,flows,M,bottom,wide,available,cols):chosen=(size,weapon_flows,weapon_h,flows,available,cols,banner,banner_h);break
 if chosen is None:raise ValueError(id+': card text overflow')
 size,weapon_flows,weapon_h,flows,available,cols,banner,banner_h=chosen
 scratch=ROOT/'tmp/cards'/(id+'.pdf');c=canvas.Canvas(str(scratch),pagesize=(W,H),pageCompression=1,invariant=1)
 if roster:
  dark_stock(c,W,H)
  c.setFillColor(INK);c.rect(0,H-header,W,header,fill=1,stroke=0)
 else:
  image_view(c,ROOT/'inventory/reference-assets/kt-original-paper-texture.jpg',0,0,W,H)
  c.setFillColor(INK);c.rect(0,H-header,W,header,fill=1,stroke=0)
 if art:
  c.saveState();p=c.beginPath();p.rect(402,H-header,218,header);c.clipPath(p,stroke=0,fill=0)
  c.drawImage(ImageReader(source['path']),0,0,W,H);c.restoreState()
 title_w=370 if stats and landscape else wide
 cp=para(category,9 if landscape else 12,True,ORANGE)
 ch=cp.wrap(wide,10000)[1] if not stats else 0
 tp=title_para(category if banner else title,28 if landscape else 35)
 if banner:cp=para(str(card.get('categoryEnglish') or 'KILL TEAM'),11,True,ORANGE);ch=cp.wrap(wide,10000)[1]
 while tp.wrap(title_w,10000)[1]>header-30-ch:
  fs=tp.style.fontSize-1
  if fs<12:raise ValueError('Unfit card title '+id)
  tp=title_para(category if banner else title,fs)
 th=tp.wrap(title_w,10000)[1];tp.drawOn(c,M,H-15-th)
 # Category goes below the top strip, never over the portrait or stat cells.
 c.setStrokeColor(ORANGE);c.setLineWidth(2);c.line(M,H-header+7,M+title_w,H-header+7)
 if stats:
  st=card['stats'];labels=['APL','MOVE','SAVE','WOUNDS'];keys=['APL','Move','Save','Wounds']
  if not all(k in st for k in keys):raise ValueError('Incomplete stat header '+id)
  for i,(lab,key) in enumerate(zip(labels,keys)):
   x=620+i*82.5;c.setFillColor(INK);c.rect(x,H-header,82.5,header,fill=1,stroke=0)
   c.setStrokeColor(colors.HexColor('#c7c9c5'));c.setLineWidth(1);c.line(x,H-header,x,H)
   fit(c,lab,x+5,H-29,72.5,20);icon(c,i,x+9,H-header+13)
   c.setFillColor(colors.white);c.setFont('RU-Condensed',29);c.drawRightString(x+77,H-header+15,str(st[key]))
  c.setFillColor(INK);c.rect(0,0,W,bottom-8,fill=1,stroke=0)
  fp=para(category+'\n'+(card.get('footerRussian') or ''),8,True,colors.white)
  fh=fp.wrap(wide,10000)[1]
  if fh>bottom-15:raise ValueError('Stat footer overflow '+id)
  fp.drawOn(c,M,12)
 else:
  # The type bar follows the original visual grammar.
  cp.drawOn(c,M,H-header+10)
 if banner:
  color=colors.HexColor('#656f6a') if 'STRATEGY PLOY' in kind else INK
  if 'FACTION EQUIPMENT' in kind:color=colors.HexColor('#656f6a')
  c.setFillColor(color);c.rect(M,H-header-M-banner_h+8,wide,banner_h-8,fill=1,stroke=0)
  banner.drawOn(c,M+8,H-header-M-banner_h+16)
 if roster:
  # Rebuild on dark stock with white text; the input and rule order stay exact.
  flows=body(content_card,(wide-20*(cols-1))/cols,size)
  for f in flows:
   if hasattr(f,'style'):
    f.style=copy.copy(f.style);col=colors.white if f.style.textColor!=ORANGE else ORANGE;f.style.textColor=col
    for frag in getattr(f,'frags',[]):
     if hasattr(frag,'textColor'):frag.textColor=col
 if weapon_flows:
  if frame(c,list(weapon_flows),M,H-header-M-weapon_h,wide,weapon_h+1):raise ValueError('Weapon table frame overflow '+id)
 remaining=place(c,flows,M,bottom,wide,available,cols)
 if remaining:raise ValueError('Unexpected layout remainder '+id)
 if not stats and card.get('footerRussian'):
  fp=para(card['footerRussian'],9,False,colors.white if roster else INK)
  if fp.wrap(wide,1000)[1]>bottom-5:raise ValueError('Footer overflow '+id)
  fp.drawOn(c,M,10)
 c.showPage();c.save()
 text=re.sub(r'\s+','',PdfReader(scratch).pages[0].extract_text() or '')
 for key in ('titleRussian','flavorRussian','footerRussian'):
  if card.get(key) and re.sub(r'\s+','',card[key]) not in text:raise ValueError('Missing card text '+id+' '+key)
 for b in card.get('blocks',[]):
  if b.get('russian') and re.sub(r'\s+','',b['russian']) not in text:raise ValueError('Missing Russian block '+id)
 doc=pypdfium2.PdfDocument(str(scratch));img=doc[0].render(scale=pw/W).to_pil()
 # PDFium rounds dimensions upwards; derive exact integer texture dimensions.
 if img.size!=(pw,ph):
  pw,ph=img.size
 out=ROOT/'output/images'/(id+'-ru.png');img.save(out,format='PNG',optimize=True)
 return {'id':id,'path':str(out),'sourceSHA256':source['sha256'],'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'width':pw,'height':ph,'originalWidth':ow,'originalHeight':oh,'bodyFontSize':size,'verifiedAgainstPixels':True,'visuallyVerified':False,'sourceCardIDPreserved':True,'designSystem':DESIGN,'portraitPreserved':art,'statLabels':['APL','MOVE','SAVE','WOUNDS'] if stats else [],'weaponStatLabels':['ATK','HIT','DMG','WR'] if weapons else [],'columns':cols}

def render_decorative(id,card,source,original_size,para):
 """Preserve the source emblem/artwork, replacing category plates in the PDF composition."""
 original=Image.open(source['path']);ow,oh=original_size or original.size;H=950;W=H*ow/oh
 box=card.get('decorativeSourceBox',[0,0,1,1]);l,t,r,b=box;sw,sh=original.size
 scratch=ROOT/'tmp/cards'/(id+'.pdf');c=canvas.Canvas(str(scratch),pagesize=(W,H),pageCompression=1,invariant=1)
 c.saveState();p=c.beginPath();p.rect(0,0,W,H);c.clipPath(p,stroke=0,fill=0)
 c.drawImage(ImageReader(source['path']),-l*W/(r-l),-(1-b)*H/(b-t),W/(r-l),H/(b-t));c.restoreState()
 paper=bool(card.get('paperBack'));background=colors.HexColor('#ededeb') if paper else INK;foreground=INK if paper else colors.white
 def plate(y,height,rotation=False,tag=True):
  c.saveState()
  if rotation:c.translate(W,H);c.rotate(180)
  c.setFillColor(background);c.rect(0,y,W,height,fill=1,stroke=0)
  text=card['titleRussian'];size=27
  while True:
   pp=title_para(text,size,foreground);ph=pp.wrap(W-36,10000)[1]
   if ph<=height-30:break
   size-=1
   if size<10:raise ValueError('Decorative title overflow '+id)
  pp.drawOn(c,18,y+height-10-ph)
  if tag:
   cp=para(card['categoryRussian'],9,False,foreground);ch=cp.wrap(W-36,10000)[1];cp.drawOn(c,18,y+5)
  c.restoreState()
 if paper:
  plate(80,250)
  if card.get('footerRussian'):
   cp=para(card['footerRussian'],13,True,INK);ph=cp.wrap(W-36,1000)[1]
   c.setFillColor(background);c.rect(0,20,W,65,fill=1,stroke=0);cp.drawOn(c,18,80-ph)
 else:
  plate(H-140,140);plate(H-140,140,True,False)
 c.showPage();c.save()
 scale=card.get('_textureEdge',2048)/max(ow,oh);pw,ph=round(ow*scale),round(oh*scale)
 doc=pypdfium2.PdfDocument(str(scratch));im=doc[0].render(scale=pw/W).to_pil();pw,ph=im.size
 out=ROOT/'output/images'/(id+'-ru.png');im.save(out,format='PNG',optimize=True)
 return {'id':id,'path':str(out),'sourceSHA256':source['sha256'],'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'width':pw,'height':ph,'originalWidth':ow,'originalHeight':oh,'bodyFontSize':0,'verifiedAgainstPixels':True,'visuallyVerified':False,'sourceCardIDPreserved':True,'designSystem':DESIGN,'originalArtworkPreserved':True,'columns':1}
