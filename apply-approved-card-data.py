"""Apply explicit typography preferences and individually verified current rules."""
import ast,json,re
from pathlib import Path
ROOT=Path(__file__).parent
path=ROOT/'ru-images-all-reviewed.json';data=json.loads(path.read_text(encoding='utf8'))
fields={'titleRussian','categoryRussian','headingRussian','russian','flavorRussian','footerRussian','wrRussian','fullRULegend','legendRussian','labelsRussian'}
changes=[]
def walk(value,key='',at=''):
 if isinstance(value,str) and key in fields:
  new=re.sub(r'(\d+)\s*ОД\b',r'\1 AP',value)
  new=new.replace('AP (AP)','AP')
  new=re.sub('Хиеротек','Иеротек',new);new=re.sub('ХИЕРОТЕК','ИЕРОТЕК',new)
  if new!=value:changes.append(at)
  return new
 if isinstance(value,list):return [walk(v,key,at+'/'+str(i)) for i,v in enumerate(value)]
 if isinstance(value,dict):return {k:walk(v,k,at+'/'+k) for k,v in value.items()}
 return value
data=walk(data)
examples=json.loads((ROOT/'output/team-card-example-report.json').read_text(encoding='utf8'))
current=[]
for card in examples['cards']:
 if not card.get('ruleBody'):continue
 definition=data[card['id']]
 blocks=[b for b in definition['blocks'] if b.get('russian')]
 if len(blocks)!=1:raise ValueError('Ambiguous current rule override '+card['id'])
 blocks[0]['russian']=card['ruleBody']
 definition['currentRuleSource']={'url':examples['sourcePage'],'checked':examples['checked'],'scope':'This single selected rule; full team audit pending.'}
 current.append(card['id'])
ravener_ids=['3aea641e04eb7913','ceb2622e815f0273','4a30376f0f8b8147','b17872d2cdc2f544','b7a06da132cee3ef','8cd9ba5ec84a201f']
for id in ravener_ids:
 definition=data[id]
 old=definition['stats']['Wounds'];new='19' if id=='8cd9ba5ec84a201f' else '18'
 if str(old) not in (new,'21' if new=='19' else '20'):raise ValueError('Unexpected Raveners Wounds '+id)
 definition.setdefault('sourceStats',dict(definition['stats']))
 definition['stats']['Wounds']=new
 definition['currentRuleSource']={'url':'https://assets.warhammer-community.com/eng_raveners_online_rules-8vfeyxgbks-nf6lxfcbfw.pdf','checked':'2026-10-05','pages':[1,2,8],'scope':'Wounds only; full team audit pending.'}
 current.append(id)
prime=data['8cd9ba5ec84a201f']
synaptic=next(b for b in prime['blocks'] if b.get('headingEnglish')=='Synaptic Link (Strategic Gambit)')
synaptic['russian']='Стратегический манёвр (Strategic Gambit), если этот оперативник не выведен из строя. Бросьте D6 и сравните результат с номером текущего раунда: если результат как минимум вдвое больше, получите 1 CP; если он меньше номера раунда, нанесите этому оперативнику урон, равный результату; в остальных случаях ничего не происходит.'
prime['currentRuleSource']['scope']='Wounds and Synaptic Link; full team audit pending.'
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
# Production uses a dedicated dictionary; samples no longer own live typography.
tree=ast.parse((ROOT/'build-dense-layout-sample.py').read_text(encoding='utf8'))
terms=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='TERMS' for t in n.targets))
(ROOT/'inventory/game-term-patterns.json').write_text(json.dumps(terms,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(ROOT/'output/approved-card-data-report.json').write_text(json.dumps({'typographicChanges':changes,'selectedCurrentRules':current,'allTeamsCurrentRulesVerified':False},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'cards':len(data),'typographicFieldsUpdated':len(changes),'selectedCurrentRules':len(current)}))
