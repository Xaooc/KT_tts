"""Apply source-scoped, root-authored current-rule corrections after the base merge."""
import copy,json,re
from pathlib import Path
ROOT=Path(__file__).parent
def read(name):return json.loads((ROOT/name).read_text(encoding='utf8'))
def write(name,data):(ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def norm(s):return re.sub(r'[^a-z0-9]','',s.lower())
def team(s):return norm({'Hearthkyn Salvagers':'Hearthkyn Salvager','Fellgor Ravagers':'Fellgor Ravager','Vespid Stingwings':'Vespids Stingwing'}.get(s,s))
def main():
 cards=read('ru-images-all-reviewed.json');prose=read('ru-team-prose.json');segments=read('inventory/prose-source.json')
 audit=[];scopedProse={}
 for file in sorted(ROOT.glob('ru-current-updates-*.json')):
  for patch in read(file.name):
   id=patch['id'];c=cards[id]
   assert c['titleEnglish'] in (patch['expectedTitle'],patch.get('titleEnglish')) or c.get('originalTitleEnglish')==patch['expectedTitle'],(id,c['titleEnglish'],patch['expectedTitle'])
   provenance=patch['source'];changes=[]
   for heading in patch.get('deleteBlocks',[]):
    c['blocks']=[b for b in c.get('blocks',[]) if b.get('headingEnglish')!=heading];changes.append('deleted:'+heading)
   for update in patch.get('blocks',[]):
    matches=[b for b in c.get('blocks',[]) if b.get('headingEnglish') in (update['heading'],update.get('newHeadingEnglish'))]
    if update.get('append'):
     if not matches:
      b={'type':'paragraph','headingEnglish':update['heading'],'headingRussian':update['headingRussian']};c.setdefault('blocks',[]).append(b);matches=[b]
    assert len(matches)==1,(id,update['heading'],len(matches))
    b=matches[0]
    if 'english' not in b and b.get('sourceEnglish'):b['english']=b['sourceEnglish']
    if 'sourceEnglish' not in b and b.get('english') and not b.get('currentRuleSource'):b['sourceEnglish']=b['english']
    for key in ('english','russian','rowsRussian','columnsRussian','headingRussian'):
     if key in update:b[key]=copy.deepcopy(update[key])
    if update.get('newHeadingEnglish'):b['headingEnglish']=update['newHeadingEnglish']
    b['currentRuleSource']=provenance;changes.append(update['heading'])
    if update.get('proseTitles'):
     titles={norm(x) for x in update['proseTitles']}
     for s in segments:
      if any(team(x['team'])==team(patch['team']) and norm(x.get('title','')) in titles for x in s['contexts']):
       # A source hash can be shared. Scope-dependent conflicts must be reviewed explicitly.
       outside={x['team'] for x in s['contexts'] if team(x['team'])!=team(patch['team'])}
       scopedProse.setdefault(team(patch['team']),{})[s['id']]=update['russian']
       if not outside:prose[s['id']]=update['russian']
       changes.append('prose:'+s['id'])
   if patch.get('stats'):
    c.setdefault('sourceStats',copy.deepcopy(c['stats']));c['stats'].update(patch['stats']);changes.append('stats')
   for wpatch in patch.get('weapons',[]):
    matches=[w for w in c.get('weapons',[]) if w['english']==wpatch['name']]
    if not matches and wpatch.get('append'):
     w={'english':wpatch['name']};c.setdefault('weapons',[]).append(w);matches=[w]
    assert len(matches)==1,(id,wpatch['name'])
    w=matches[0];w.setdefault('sourceProfile',copy.deepcopy(w))
    w.update({k:v for k,v in wpatch.items() if k not in ('name','append')});changes.append('weapon:'+wpatch['name'])
   for key in ('titleEnglish','titleRussian'):
    if patch.get(key):c.setdefault('originalTitleEnglish',c['titleEnglish']);c[key]=patch[key];changes.append(key)
   if patch.get('keyword'):
    en,ru=patch['keyword']
    if en not in c.get('footerEnglish',''):c['footerEnglish']=en+', '+c.get('footerEnglish','')
    if ru not in c.get('footerRussian',''):c['footerRussian']=ru+', '+c.get('footerRussian','')
    changes.append('keyword:'+en)
   if patch.get('baseSizeNote'):
    note=patch['baseSizeNote']
    if note not in c.get('footerRussian',''):c['footerRussian']=c.get('footerRussian','')+' · '+note
    changes.append('base-size')
   c['currentRuleSources']=list({json.dumps(x,sort_keys=True):x for x in c.get('currentRuleSources',[])+[provenance]}.values())
   audit.append({'id':id,'team':patch['team'],'changes':changes,'source':provenance})
 write('ru-images-all-reviewed.json',cards);write('ru-team-prose.json',prose)
 write('ru-current-prose-overrides.json',scopedProse)
 write('inventory/current-rule-applied.json',{'checkedOn':'2026-10-05','patches':len(audit),'cards':len({x['id'] for x in audit}),'changes':audit,'allTeamsCurrentRulesVerified':False})
 print(json.dumps({'patches':len(audit),'cards':len({x['id'] for x in audit})}))
if __name__=='__main__':main()
