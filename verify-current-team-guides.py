import json,hashlib
from pathlib import Path
import pypdfium2
R=Path(__file__).parent
guides=json.loads((R/'output/current-team-guides.json').read_text(encoding='utf-8'))
characters=pages=0
for guide in guides:
 p=Path(guide['path']); assert hashlib.sha256(p.read_bytes()).hexdigest()==guide['sha256']
 doc=pypdfium2.PdfDocument(str(p)); assert len(doc)==guide['pages']
 for page in doc:
  w,h=page.get_size(); text=page.get_textpage()
  for i in range(text.count_chars()):
   value=text.get_text_range(i,1)
   if value.isspace() or not value: continue
   l,b,r,t=text.get_charbox(i)
   assert -.5<=l<=r<=w+.5 and -.5<=b<=t<=h+.5,(guide['team'],pages,value,(l,b,r,t))
   characters+=1
  text.close();page.close();pages+=1
 doc.close()
result={'teamGuides':len(guides),'pages':pages,'charactersWithinPages':characters,'passed':True}
(R/'output/current-team-guides-verification.json').write_text(json.dumps(result),encoding='utf-8')
print(json.dumps(result))
