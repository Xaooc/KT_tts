"""Dense searchable PDF references from the same reviewed Russian card data as TTS."""
import json,re,hashlib
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate,PageTemplate,Frame,Paragraph,Spacer,Table,TableStyle,KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4,landscape
from pypdf import PdfReader
from kt_design import markup,approved
R=Path('.');OUT=R/'output/pdf/teams';OUT.mkdir(parents=True,exist_ok=True);approved()
for n,p in [('RU','arial.ttf'),('RU-Bold','arialbd.ttf')]:pdfmetrics.registerFont(TTFont(n,'C:/Windows/Fonts/'+p))
pdfmetrics.registerFontFamily('RU',normal='RU',bold='RU-Bold')
cards=json.loads((R/'ru-images-all-reviewed.json').read_text(encoding='utf8'));assets=json.loads((R/'inventory/card-assets.json').read_text(encoding='utf8'));supp=json.loads((R/'inventory/supplement-card-manifest.json').read_text(encoding='utf8'));teams=json.loads((R/'ru-team-names.json').read_text(encoding='utf8'))
norm=lambda s:re.sub('[^a-z0-9]','',s.lower())
W,H=landscape(A4);gap=22;cw=(W-52-gap)/2
styles={k:ParagraphStyle(k,fontName='RU-Bold'if k in ('title','head')else'RU',fontSize=z,leading=z*1.16,textColor=colors.HexColor(col),spaceAfter=4,keepWithNext=k in ('title','head'))for k,z,col in [('title',16,'#d94d14'),('head',11,'#b43d11'),('body',9.5,'#202627'),('small',8,'#52616a')]}
def p(t,k='body'):return Paragraph(markup(t),styles[k])
class Doc(BaseDocTemplate):
 def afterFlowable(self,f):
  if getattr(f,'cardTitle',None):
   key='card-'+str(self.seq.nextf('cards'));self.canv.bookmarkPage(key);self.canv.addOutlineEntry(f.cardTitle,key,0)
def page(c,d):
 c.saveState();c.setFillColor(colors.HexColor('#f3f3ee'));c.rect(0,0,W,H,fill=1,stroke=0);c.setFillColor(colors.HexColor('#191b1c'));c.rect(0,H-34,W,34,fill=1,stroke=0);c.setFont('RU-Bold',11);c.setFillColor(colors.white);c.drawString(26,H-22,d.teamTitle);c.setFont('RU',8);c.drawRightString(W-26,H-21,'KILL TEAM · СВЕРКА 05.10.2026');c.setFillColor(colors.HexColor('#536066'));c.drawString(26,16,'APL · MOVE · SAVE · WOUNDS · ATK · HIT · DMG · WR');c.drawRightString(W-26,16,str(d.page));c.restoreState()
report=[]
for team in sorted(set(x['team'] for x in assets if x.get('source')=='teams'and x.get('team'))):
 ids=list(dict.fromkeys([id for a in assets if norm(a.get('team')or'')==norm(team) for id in [a.get('face',{}).get('id'),a.get('back',{}).get('id')] if id in cards]+[x['id']for x in supp if norm(x['team'])==norm(team)]))
 selected=[(id,cards[id])for id in ids if not cards[id].get('decorativeSource')and not re.search('CARD BACK|DECK BACK',cards[id].get('categoryEnglish',''))]
 assert selected,team
 selected.sort(key=lambda x:(0 if 'KILL TEAM'in x[1].get('categoryEnglish','')else 1 if 'FACTION RULE'in x[1].get('categoryEnglish','')else 2 if x[1].get('stats')else 3))
 story=[p(teams.get(team,team)+' ('+team+')','title')];required=[]
 for id,c in selected:
  title=p(c.get('titleRussian')or c.get('categoryRussian'),'title');title.cardTitle=c.get('titleRussian')or team;story.append(title)
  if c.get('categoryRussian'):story.append(p(c['categoryRussian'],'small'))
  if c.get('stats'):
   st=c['stats'];row=[p(k+' '+str(st[v]),'head')for k,v in [('APL','APL'),('MOVE','Move'),('SAVE','Save'),('WOUNDS','Wounds')]];story.append(Table([row],colWidths=[cw/4]*4))
  for w in c.get('weapons',[]):
   txt=w['russian']+' · ATK '+str(w['atk'])+' · HIT '+str(w['hit'])+' · DMG '+str(w['dmg'])+'\n'+w.get('wrRussian','');story.append(p(txt));required.append(txt)
  if c.get('flavorRussian'):story.append(p(c['flavorRussian'],'small'));required.append(c['flavorRussian'])
  for b in c.get('blocks',[]):
   if b.get('headingRussian')and b.get('headingEnglish')not in ('Rule',c.get('titleEnglish')):story.append(p(b['headingRussian'],'head'))
   if b.get('russian'):story.append(p(b['russian']));required.append(b['russian'])
   if b.get('columnsRussian')or b.get('rowsRussian'):
    rows=([b['columnsRussian']]if b.get('columnsRussian')else[])+b.get('rowsRussian',[])
    story.append(Table([[p(str(t),'small')for t in row]for row in rows],colWidths=[cw/max(map(len,rows))]*max(map(len,rows)),style=TableStyle([('GRID',(0,0),(-1,-1),.3,colors.HexColor('#bfc8c3')),('VALIGN',(0,0),(-1,-1),'TOP')])))
   for key in ('captionRussian','legendRussian'):
    if b.get(key):story.append(p(str(b[key]),'small'))
  if c.get('footerRussian'):story.append(p(c['footerRussian'],'small'))
  story.append(Spacer(1,9))
 path=OUT/(re.sub('[^a-z0-9]+','-',team.lower())+'-ru.pdf')
 doc=Doc(str(path),pagesize=(W,H));doc.teamTitle=teams.get(team,team)+' ('+team+')';doc.addPageTemplates(PageTemplate(id='dense',frames=[Frame(26,34,cw,H-80,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0),Frame(26+cw+gap,34,cw,H-80,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=page));doc.build(story)
 pdf=PdfReader(path);body=[]
 for number,pg in enumerate(pdf.pages,1):
  lines=(pg.extract_text()or'').splitlines();assert lines[:4]==[doc.teamTitle,'KILL TEAM · СВЕРКА 05.10.2026','APL · MOVE · SAVE · WOUNDS · ATK · HIT · DMG · WR',str(number)];body.append('\n'.join(lines[4:]))
 text=re.sub(r'\s+','',''.join(body))
 for value in required:assert re.sub(r'\s+','',value)in text,(team,value[:60])
 report.append({'team':team,'path':str(path.resolve()),'pages':len(pdf.pages),'cards':len(selected),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'russianRuleTextPresent':True})
 print(team,len(pdf.pages),flush=True)
(R/'output/current-team-guides.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
