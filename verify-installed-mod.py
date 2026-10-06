import json,hashlib,re
from pathlib import Path
R=Path(__file__).parent
T=Path(r'C:\Users\PC\Documents\My Games\Tabletop Simulator')
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
source_table=T/'Mods/Workshop/3573927734.json'
source_pack=T/'Saves/Saved Objects/Chaos Cult.json'
assert sha(source_table)=='084defe19b419b080afb5747bb6c36cc70d27342fbf1a111c8f442ef42ea72c7'
assert sha(source_pack)=='120e3a2ece8f12a39fea67fb0ea1145f2e653f4adb262c734f24ebea111b36b1'
installation=read(R/'output/installation-workshop.json')
assert installation['completeTranslation'] and not installation['nativeTTSRuntimeTested']
for record in installation['files']:
 assert sha(record['source'])==sha(record['destination'])==record['sha256']
for record in installation.get('preservedFiles',[]):assert sha(record['path'])==record['sha256']
assets=read(R/'output/asset-integration-report.json')['assets']
for asset in assets:assert sha(asset['translatedPath'])==asset['sha256']
def guid_paths(obj,loc=''):
 result={}
 if isinstance(obj,dict):
  if 'GUID' in obj:result[loc]=obj['GUID']
  for key,value in obj.items():result.update(guid_paths(value,loc+'/'+key))
 elif isinstance(obj,list):
  for index,value in enumerate(obj):result.update(guid_paths(value,loc+'/'+str(index)))
 return result
comparisons=[]; local_refs=0
targets=[(source_table,T/'Saves/KT24-The-Killzone-RU.json',0)]
if installation.get('scope')!='reader-fix':targets.append((source_pack,T/'Saves/Saved Objects/KT41-RU.json',75))
for source,destination,extras in targets:
 original=guid_paths(read(source));final=read(destination);current=guid_paths(final)
 for path,guid in original.items():assert current.get(path)==guid,(path,guid)
 assert len(current)-len(original)==extras,(len(current),len(original))
 def refs(value):
  global local_refs
  if isinstance(value,dict):
   for key,item in value.items():
    if key in ['FaceURL','BackURL','PDFUrl'] and isinstance(item,str) and '/Mods/KT-RU/' in item.replace('\\','/'):
     assert Path(item).is_file(),item;local_refs+=1
    refs(item)
  elif isinstance(value,list):
   for item in value:refs(item)
 refs(final)
 comparisons.append({'originalGUIDsPreserved':len(original),'addedObjects':extras})
result={'passed':True,'installedFiles':len(installation['files']),'preservedFiles':installation.get('preservedFiles',[]),'images':sum(a['kind']=='image' for a in assets),'pdfAssets':sum(a['kind']=='pdf' for a in assets),'localAssetReferencesChecked':local_refs,'sourcesUnchanged':True,'objectChecks':comparisons,'nativeTTSRuntimeTested':False}
(R/'output/final-installation-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result))
