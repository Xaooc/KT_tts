import json
from pathlib import Path
ROOT=Path(__file__).parent
a=json.loads((ROOT/'inventory/current-team-audit-c-stable.json').read_text(encoding='utf8'));q=a['queue'];c=json.loads((ROOT/'ru-images-all-reviewed.json').read_text(encoding='utf8'));out=[]
def patches(n,stats=None,name=None,values=None):
 x=q[n];s=a['sources']['teams'][x['team']]
 for id in x['localIds']:
  p={'id':id,'expectedTitle':c[id]['titleEnglish'],'team':x['team'],'source':{'officialPdf':s['officialPdf'],'date':s['officialCatalogLastUpdated'],'wahapedia':s['wahapedia'],'pdfPages':x['source']['pdfPages'],'checkedOn':'2026-10-05'}}
  if stats:p['stats']=stats
  if name:p['weapons']=[{'name':name,**values}]
  out.append(p)
patches(21,name='Grenade launcher',values={'atk':5,'dmg':'4/5'})
patches(38,name='Marksman rail rifle (dart round)',values={'dmg':'3/3'})
patches(43,name='Tempestus dagger',values={'wrEnglish':'Ceaseless, Lethal 5+','wrRussian':'«Непрерывное» (Ceaseless); «Смертоносное 5+» (Lethal 5+)'})
patches(45,stats={'Save':'2+'});patches(46,stats={'Wounds':15})
patches(52,name='Sniper rifle (mobile)',values={'hit':'3+'})
patches(53,name='Suppressed sniper rifle (mobile)',values={'hit':'3+'})
patches(54,name='Suppressed sniper rifle (stationary)',values={'wrEnglish':'Devastating 2, Heavy, Silent','wrRussian':'«Разрушительное 2» (Devastating 2); «Тяжёлое» (Heavy); «Бесшумное» (Silent)'})
patches(71,name='Power weapon',values={'wrEnglish':'—','wrRussian':'—'})
(ROOT/'ru-current-updates-c-profiles.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'profilePatches':len(out)}))
