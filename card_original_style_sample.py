"""Vector card layout with the unmodified original portrait embedded in its header."""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph,Table,TableStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import html
ROOT=Path(__file__).parent
pdfmetrics.registerFont(TTFont('RU-Condensed','C:/Windows/Fonts/DejaVuSansCondensed-Bold.ttf'))
def draw_card(c,rich,card,magnify):
 c.setPageSize((595.276,344.635))
 c.saveState();c.scale(595.276/950,344.635/550)
 source=ROOT/'inventory/original-images/c54f0514d3523963.img'
 # Embed the original image as a PDF image; viewport retains only the portrait/header.
 c.saveState();p=c.beginPath();p.rect(0,459,950,91);c.clipPath(p,stroke=0,fill=0)
 c.drawImage(ImageReader(str(source)),0,0,950,550);c.restoreState()
 c.setFillColor(colors.HexColor('#e9e9e5'));c.rect(0,63,950,396,fill=1,stroke=0)
 c.setFillColor(colors.HexColor('#08090a'));c.rect(0,0,950,63,fill=1,stroke=0)
 # Dark title field; original image of the actual Apprentek stays visible at x=410..618.
 c.setFillColor(colors.HexColor('#101112'));c.rect(0,460,402,90,fill=1,stroke=0)
 c.setFillColor(colors.white);c.setFont('RU-Condensed',30);c.drawString(22,493,'ПОДМАСТЕРЬЕ')
 c.setFont('RU-Bold',10);c.setFillColor(colors.HexColor('#aeb5b8'));c.drawString(23,474,'APPRENTEK')
 orange=colors.HexColor('#f05a23');c.setStrokeColor(orange);c.setLineWidth(3);c.line(22,487,289,487)
 # Header retains original characteristic order; numbers are unchanged source values.
 labels=['APL','MOVE','SAVE','WOUNDS']
 stats=card['stats'];vals=[str(stats['APL']),stats['Move'],stats['Save'],str(stats['Wounds'])]
 for i in range(4):
  x=620+i*82.5
  c.setFillColor(colors.HexColor('#101112'));c.rect(x,461,82.5,89,fill=1,stroke=0)
  c.setStrokeColor(colors.HexColor('#c7c9c5'));c.setLineWidth(1.3);c.line(x,461,x,550)
  c.setFillColor(colors.white)
  label_size=20;label_width=pdfmetrics.stringWidth(labels[i],'RU-Condensed',label_size)
  label_scale=min(1,72.5/label_width)
  c.saveState();label_text=c.beginText(x+41-label_width*label_scale/2,519)
  label_text.setFont('RU-Condensed',label_size);label_text.setHorizScale(label_scale*100)
  label_text.textOut(labels[i]);c.drawText(label_text);c.restoreState()
  c.setFillColor(orange);c.setStrokeColor(orange);c.setLineWidth(2)
  ix=x+11;iy=477
  if i==0:
   for shift in (0,6):
    path=c.beginPath();path.moveTo(ix,iy+16+shift);path.lineTo(ix+10,iy+shift);path.lineTo(ix+20,iy+16+shift);c.drawPath(path,stroke=1,fill=0)
  elif i==1:
   path=c.beginPath();path.moveTo(ix,iy+6);path.lineTo(ix+8,iy+11);path.lineTo(ix+2,iy+18);path.lineTo(ix+24,iy+23);path.lineTo(ix+19,iy);path.lineTo(ix+13,iy+8);path.lineTo(ix+5,iy+2);path.close();c.drawPath(path,stroke=0,fill=1)
  elif i==2:
   path=c.beginPath();path.moveTo(ix,iy+23);path.lineTo(ix+18,iy+23);path.lineTo(ix+18,iy+7);path.lineTo(ix+9,iy);path.lineTo(ix,iy+7);path.close();c.drawPath(path,stroke=1,fill=0)
   c.line(ix+5,iy+19,ix+5,iy+8);c.line(ix+5,iy+8,ix+9,iy+5)
  else:
   path=c.beginPath();path.moveTo(ix+9,iy+24);path.lineTo(ix+16,iy+5);path.lineTo(ix+9,iy);path.lineTo(ix+2,iy+5);path.close();c.drawPath(path,stroke=0,fill=1)
  c.setFillColor(colors.white);c.setFont('RU-Condensed',29);c.drawRightString(x+76,475,vals[i])
 def p(text,size=16,bold=False,color=colors.HexColor('#161a1c')):
  return Paragraph(rich(text),ParagraphStyle('card',fontName='RU-Bold' if bold else 'RU',fontSize=size,leading=size*1.2,textColor=color))
 rows=[['Оружие','ATK','HIT','DMG','WR'],['Арканный проводник (Arcane conduit)\nДальний бой','4','3+','4/5','Бронебойное 1; Увеличение*'],['Арканный проводник (ближний бой)','3','4+','3/5','-']]
 table=Table([[p(v,15,i==0) for v in row] for i,row in enumerate(rows)],colWidths=[340,65,70,70,350])
 table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f5f5f0'),colors.HexColor('#d5d7d5')]),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LEFTPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,0),1.5,orange),('LINEBELOW',(0,-1),(-1,-1),1.5,orange)]))
 table.setStyle(TableStyle([('LEFTPADDING',(0,1),(0,-1),34)]))
 height=table.wrap(902,1000)[1];table.drawOn(c,24,451-height);y=451-height-17
 c.setFillColor(orange)
 cy=451-table._rowHeights[0]-table._rowHeights[1]/2
 for ix in (31,38,45):
  path=c.beginPath();path.moveTo(ix,cy-7);path.lineTo(ix+5,cy-7);path.lineTo(ix+5,cy+3);path.lineTo(ix+2.5,cy+7);path.lineTo(ix,cy+3);path.close();c.drawPath(path,fill=1,stroke=0)
 cy=451-table._rowHeights[0]-table._rowHeights[1]-table._rowHeights[2]/2
 path=c.beginPath();path.moveTo(31,cy-3);path.lineTo(45,cy-3);path.lineTo(53,cy+2);path.lineTo(31,cy+2);path.close();c.drawPath(path,fill=1,stroke=0)
 c.rect(29,cy-6,3,11,fill=1,stroke=0)
 def draw(text,x,yy,width,size=16,bold=False):
  item=p(text,size,bold);hh=item.wrap(width,1000)[1];item.drawOn(c,x,yy-hh);return yy-hh
 left=draw('Помощь подмастерья (Apprentek Assistance)',24,y,433,16,True)-4
 left=draw(card['blocks'][0]['russian'],24,left,433,16)-14
 left=draw('Бронебойное 1 (Piercing 1)',24,left,433,16,True)-4
 left=draw('Защищающийся бросает на один кубик защиты меньше.',24,left,433,16)-14
 left=draw('Непрерывное (Ceaseless)',24,left,433,16,True)-4
 left=draw('Можно перебросить любые кубики атаки с одним выбранным результатом.',24,left,433,16)
 right=draw('* Увеличение (Magnify)',491,y,434,16,True)-4
 right=draw(magnify,491,right,434,14)-14
 right=draw('APL - лимит очков действий; MOVE - перемещение.\nSAVE - спасбросок; WOUNDS - раны.\nATK - атаки; HIT - попадание; DMG - урон; WR - правила оружия.',491,right,434,11)-10
 c.setStrokeColor(colors.HexColor('#b6bcb9'));c.setLineWidth(.6);c.line(477,78,477,y)
 right=draw('Сверено: Wahapedia, 05.10.2026.\nОбразец оформления; весь отряд не проверен.',491,right,434,11)
 if min(left,right)<78:raise ValueError('Card text hits keyword strip '+str((left,right)))
 c.setFillColor(orange);c.setFont('RU-Bold',14);c.drawString(24,31,'КРУГ ИЕРОТЕК')
 c.setFillColor(colors.white);c.setFont('RU-Bold',12);c.drawString(171,31,'НЕКРОН · ПОДМАСТЕРЬЕ (APPRENTEK)')
 c.setStrokeColor(colors.white);c.setLineWidth(1);c.circle(910,31,16,stroke=1,fill=0)
 c.setFont('RU-Bold',10);c.drawCentredString(910,28,'32 мм')
 c.linkURL('https://wahapedia.ru/kill-team3/kill-teams/hierotek-circle/#Apprentek',(491,right-4,925,right+29),relative=0)
 c.restoreState()
 return {'portraitSource':str(source),'portraitPreserved':True,'cardAspectRatio':'950:550','statLabels':labels,'statLabelFontSize':20,'weaponStatLabels':['ATK','HIT','DMG','WR'],'originalAbbreviationsPreserved':True,'footerClearancePoints':min(left,right)-63}
