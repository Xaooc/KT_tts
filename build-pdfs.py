"""Reflow reviewed translations into readable Russian PDF documents.

Source artwork is embedded unchanged; every textual diagram key must have a Russian legend.
"""
import argparse,hashlib,html,io,json,re
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate,PageTemplate,Frame,NextPageTemplate,Paragraph,Spacer,PageBreak,Table,TableStyle,Image,KeepTogether
from kt_design import DESIGN,approved
from reportlab.platypus.tableofcontents import TableOfContents
from pypdf import PdfReader
from PIL import Image as PILImage
import pypdfium2

ROOT=Path(__file__).parent
OUT=ROOT/'output/pdf'; TMP=ROOT/'tmp/pdfs'
OUT.mkdir(parents=True,exist_ok=True);TMP.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('RU','C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('RU-Bold','C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('RU',normal='RU',bold='RU-Bold')
ORANGE=colors.HexColor('#df5a22'); NAVY=colors.HexColor('#172d3a')
STYLES={
 'title':ParagraphStyle('TitleRU',fontName='RU-Bold',fontSize=23,leading=28,textColor=NAVY,spaceAfter=18),
 'heading':ParagraphStyle('HeadingRU',fontName='RU-Bold',fontSize=13,leading=17,textColor=ORANGE,spaceBefore=10,spaceAfter=7,keepWithNext=True),
 'paragraph':ParagraphStyle('BodyRU',fontName='RU',fontSize=10.5,leading=14.5,textColor=NAVY,spaceAfter=9,allowWidows=0,allowOrphans=0),
 'caption':ParagraphStyle('CaptionRU',fontName='RU',fontSize=9,leading=12,textColor=NAVY,spaceAfter=12),
 'cell':ParagraphStyle('CellRU',fontName='RU',fontSize=8.3,leading=11,textColor=NAVY),
 'small':ParagraphStyle('SmallRU',fontName='RU',fontSize=8,leading=10.5,textColor=colors.HexColor('#526773'),spaceAfter=10)
}
def p(text,kind='paragraph'):
 if isinstance(text,list):text='\n'.join(str(t) for t in text)
 return Paragraph(html.escape(str(text)).replace('\n','<br/>'),STYLES[kind])
from pdf_layout import STYLES,p,formatted,logical_units,column_widths,WIDTH

class GuideDoc(BaseDocTemplate):
 def beforeDocument(self):self._heading_count=0;self._running=''
 def afterFlowable(self,flowable):
  title=getattr(flowable,'_ru_heading',None)
  if title:
   self._heading_count+=1;key='section-'+str(self._heading_count)
   self.canv.bookmarkPage(key);self.canv.addOutlineEntry(title,key,level=0,closed=False)
   if title!='Содержание' and flowable.style.name=='HeadingRU':self.notify('TOCEntry',(0,title,self.page,key))
   self._running=title

def legend(block):
 result=[]
 def entry(value):
  if isinstance(value,dict):
   if 'russian' in value:
    ru=str(value['russian']);en=str(value.get('english',''))
    return ru if not en or ru==en else ru+' ('+en+')'
   return '\n'.join(str(k)+' — '+entry(v) for k,v in value.items())
  if isinstance(value,list):return '\n'.join(entry(x) for x in value)
  return str(value)
 for key in ('legendRussian','captionRussian','labelsRussian'):
  value=block.get(key)
  if value:result.append(entry(value))
 return '\n'.join(result)
def source_figure(source_path,page_index,block):
 doc=pypdfium2.PdfDocument(str(source_path));page=doc[page_index]
 width,height=page.get_size();region=block.get('sourceRegion')
 if isinstance(region,dict):region=[region[k] for k in ('x0','y0','x1','y1')]
 kwargs={}
 if region:
  x0,y0,x1,y1=map(float,region)
  # Authoring coordinates can use the rounded size of another page of the same spread.
  # A small overhang contains no source pixels; clip it to the actual page boundary.
  if not(0<=x0<width and x0<x1<=width+5 and 0<=y0<height and y0<y1<=height+5):raise ValueError('Figure region outside source page')
  x1=min(x1,width);y1=min(y1,height)
  kwargs['crop']=(x0,y0,width-x1,height-y1) if block.get('sourceOrigin')=='bottom-left' else (x0,height-y1,width-x1,y0)
 bitmap=page.render(scale=1.7,**kwargs);data=io.BytesIO();bitmap.to_pil().save(data,format='PNG');data.seek(0)
 return data
def picture(data,max_w=480,max_h=460):
 img=PILImage.open(data);w,h=img.size;scale=min(max_w/w,max_h/h)
 data.seek(0);return Image(data,width=w*scale,height=h*scale)
def footer(c,doc):
 c.saveState();w,h=A4;c.setFillColor(colors.HexColor('#f5f7f8'));c.rect(0,0,w,h,fill=1,stroke=0)
 c.setFillColor(NAVY);c.rect(0,h-35,w,35,fill=1,stroke=0)
 c.setFont('RU-Bold',12);c.setFillColor(colors.white);c.drawString(24,h-23,'KILL TEAM')
 c.setFont('RU',8);c.drawRightString(w-24,h-22,'РУССКИЙ СПРАВОЧНИК')
 c.setStrokeColor(colors.HexColor('#d6e0e5'));c.setLineWidth(.5);c.line(24,32,w-24,32)
 c.setFont('RU',7.5);c.setFillColor(colors.HexColor('#586b77'));c.drawString(24,20,'Kill Team • русский перевод материалов исходного мода')
 c.setFont('RU-Bold',9);c.drawRightString(w-24,20,str(doc.page));c.restoreState()

def build(id,translation,source):
 approved()
 if translation.get('status')=='draft':raise ValueError('PDF translation still draft '+id)
 if len(translation['pages'])!=source['pages']:raise ValueError(f'{id}: missing source pages')
 seen=set();story=[p(translation['titleRussian'],'title')]
 story.append(p('Русский перевод редакции, включённой в мод.','small'))
 story.append(p('Игровые термины выделены жирным. Ограничения отмечены красным; сокращения характеристик сохранены.','small'))
 headings=sum(1 for page in translation['pages'] for b in page['blocks'] if b.get('type')=='heading')+sum(1 for page in translation['pages'] for b in page['blocks'] if b.get('type')=='paragraph' for role,value in logical_units(b.get('russian','')) if role=='subheading')
 navigation=sum(1 for page in translation['pages'] for b in page['blocks'] if b.get('type')=='heading')>=15
 if navigation:
  story.append(p('Содержание','heading'))
  toc=TableOfContents();toc.levelStyles=[ParagraphStyle('ContentsRU',fontName='RU',fontSize=9,leading=11,textColor=NAVY,spaceBefore=2,leftIndent=0,firstLineIndent=0)]
  toc.tableStyle=TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0)])
  story.append(toc);story.append(PageBreak())
 reader=PdfReader(source['path'])
 def wide_page(page):return any(b.get('type') in ('figure','source-images') or b.get('type')=='table' and max((len(row) for row in b.get('rowsRussian',b.get('table',{}).get('rowsRussian',[]))),default=0)>=4 for b in page['blocks'])
 for_page=lambda page:'wide' if wide_page(page) else 'dense'
 for page in translation['pages']:
  n=page['sourcePage']
  if n in seen or n<1 or n>source['pages']:raise ValueError(f'{id}: invalid sourcePage')
  if seen and for_page(page)!=previous_template:story.extend([NextPageTemplate(for_page(page)),PageBreak()])
  elif not seen and navigation:story.insert(-1,NextPageTemplate(for_page(page)))
  content_width=WIDTH if wide_page(page) else (WIDTH-16)/2
  seen.add(n);previous_template=for_page(page)
  for b in page['blocks']:
   if b.get('figure') or b.get('tables'):raise ValueError('Nested source diagram/table has not been normalized: '+id)
   kind=b.get('type','paragraph');text=b.get('russian','')
   if kind=='table':
    columns=b.get('columnsRussian') or b.get('table',{}).get('columnsRussian',[])
    rows=b.get('rowsRussian') or b.get('table',{}).get('rowsRussian',[])
    if not rows:raise ValueError('Empty translated table')
    cells=([columns] if columns else [])+rows
    count=max(map(len,cells))
    table=Table([[p(v,'cell-head' if columns and i==0 else 'cell') for v in row]+['']*(count-len(row)) for i,row in enumerate(cells)],colWidths=column_widths(cells,content_width),repeatRows=int(bool(columns)),hAlign='LEFT')
    styles=[('ROWBACKGROUNDS',(0,int(bool(columns))),(-1,-1),[colors.white,colors.HexColor('#edf3f5')]),('LINEBELOW',(0,0),(-1,-1),.35,colors.HexColor('#cfdae0')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]
    if columns:styles.append(('BACKGROUND',(0,0),(-1,0),NAVY))
    table.setStyle(TableStyle(styles))
    if text:story.extend(formatted(text));story.extend([table,Spacer(1,6)])
    else:story.extend([table,Spacer(1,6)])
    translated_key=legend(b)
    if translated_key:story.extend(formatted(translated_key,'caption'))
   elif kind=='figure':
    if text:story.extend(formatted(text))
    story.append(picture(source_figure(source['path'],n-1,b),max_w=content_width,max_h=390))
    translated_key=legend(b)
    if not b.get('decorative') and not(text or translated_key):raise ValueError('Diagram missing Russian explanation')
    if translated_key:
     story.append(p('Пояснение схемы','subheading'));story.extend(formatted(translated_key,'caption'))
   elif kind=='source-images':
    images=list(reader.pages[n-1].images)[1:]
    captions=b['captionsRussian']
    if len(images)!=len(captions):raise ValueError(f'{id} page {n}: image captions missing ({len(images)} images / {len(captions)} captions)')
    for image,caption in zip(images,captions):
     story.append(KeepTogether([picture(io.BytesIO(image.data),max_w=content_width,max_h=270),*formatted(caption,'caption')]))
   else:
    if not str(text).strip():raise ValueError(f'{id} empty Russian {kind}')
    story.extend(formatted(text,'heading' if kind=='heading' else 'paragraph'))
 out=OUT/(id+'-ru.pdf')
 doc=GuideDoc(str(out),pagesize=A4,rightMargin=24,leftMargin=24,topMargin=47,bottomMargin=43,title=translation['titleRussian'],author='Неофициальный русский перевод',pageCompression=1)
 height=A4[1]-90;cw=(WIDTH-16)/2
 templates={
 'wide':PageTemplate(id='wide',frames=[Frame(24,43,WIDTH,height,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=footer),
 'dense':PageTemplate(id='dense',frames=[Frame(24,43,cw,height,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0),Frame(24+cw+16,43,cw,height,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=footer)}
 first='wide' if navigation else for_page(translation['pages'][0]);doc.addPageTemplates([templates[first],templates['dense' if first=='wide' else 'wide']]);doc.multiBuild(story)
 check=PdfReader(str(out));extracted='\n'.join(x.extract_text() or '' for x in check.pages)
 if '\ufffd' in extracted or not re.search('[А-Яа-яЁё]',extracted):raise ValueError('Invalid Cyrillic PDF text')
 return {'id':id,'path':str(out),'sourcePages':source['pages'],'translatedSourcePages':len(seen),'outputPages':len(check.pages),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'russianTextChars':len(extracted),'sourceSHA256':source['sha256'],'layoutVersion':3,'designSystem':DESIGN,'bodyFontSize':10.5,'bodyLeading':12.915,'marginPoints':24,'hasNavigation':navigation,'visuallyVerified':False}

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--ids',nargs='*');args=parser.parse_args()
 sources={x['id']:x for x in json.loads((ROOT/'inventory/pdf-sources.json').read_text(encoding='utf8'))}
 translations={}
 for file in ('ru-pdfs-root.json','ru-pdfs-a.json','ru-pdfs-b.json'):
  path=ROOT/file
  reviewed=ROOT/(Path(file).stem+'-final.json')
  if reviewed.exists():path=reviewed
  if path.exists():
   data=json.loads(path.read_text(encoding='utf8'))
   if translations.keys()&data.keys():raise ValueError('Duplicate PDF authoring ownership')
   translations.update(data)
 requested=args.ids or [id for id,v in translations.items() if v.get('status')!='draft']
 report_path=ROOT/'output/pdf-build-report.json'
 report=json.loads(report_path.read_text(encoding='utf8')) if report_path.exists() else {}
 for id in requested:
  report[id]=build(id,translations[id],sources[id]);print(id,report[id]['outputPages'],'pages',flush=True)
  report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
