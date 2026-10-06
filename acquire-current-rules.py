"""Save full current team references with provenance for a complete rules audit."""
import concurrent.futures,hashlib,json,time
from pathlib import Path
import urllib.request
from html.parser import HTMLParser
class PageText(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.ignore=0
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style'):self.ignore+=1
  if tag=='br' and not self.ignore:self.parts.append('\n')
 def handle_endtag(self,tag):
  if tag in ('script','style'):self.ignore=max(0,self.ignore-1)
  if tag in ('div','p','li','tr','h1','h2','h3','h4','h5','td'):self.parts.append('\n')
 def handle_data(self,text):
  if not self.ignore:self.parts.append(text)
ROOT=Path(__file__).parent
DEST=ROOT/'inventory/current-team-rules';DEST.mkdir(exist_ok=True)
catalog=json.loads((ROOT/'inventory/critic-current-sources.json').read_text(encoding='utf8'))
def fetch(team):
 slug=team['officialSlug'];url=team['wahapediaPageUrl'];path=DEST/(slug+'.html')
 if not path.exists():
  with urllib.request.urlopen(url,timeout=60) as r:content=r.read().decode('utf-8')
  path.write_text(content,encoding='utf8');time.sleep(.8)
 parser=PageText();parser.feed(path.read_text(encoding='utf8'));text='\n'.join(line.strip() for line in ''.join(parser.parts).splitlines() if line.strip())
 if len(text)<5000 or team['officialTitle'].split()[0].lower() not in text.lower():raise ValueError('Unexpected full reference '+slug)
 (DEST/(slug+'.txt')).write_text(text,encoding='utf8')
 return {'team':team['ruTeam'],'slug':slug,'url':url,'officialPdfUrl':team['officialPdfUrl'],'officialLastUpdated':team['officialCatalogLastUpdatedISO'],'wahapediaPdfMatchesOfficial':team['wahapediaBookUrlMatchesOfficialCurrentCatalogPdf'],'path':str(path),'textPath':str(DEST/(slug+'.txt')),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'characters':len(text),'fetched':'2026-10-05','completeComparisonPerformed':False}
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for result in pool.map(fetch,catalog['targetTeams']):
  results.append(result);print(result['slug'],result['characters'],flush=True)
  (DEST/'sources.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
