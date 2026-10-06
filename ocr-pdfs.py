from pathlib import Path
import json
import pypdfium2 as pdfium
from rapidocr_onnxruntime import RapidOCR
ROOT=Path(__file__).resolve().parent
sources=json.loads((ROOT/'inventory/pdf-sources.json').read_text(encoding='utf8'))
out=ROOT/'inventory/pdf-ocr.json'
done=json.loads(out.read_text(encoding='utf8')) if out.exists() else []
keys={(x['id'],x['page']) for x in done}
ocr=RapidOCR(intra_op_num_threads=1,inter_op_num_threads=1)
for item in sources:
    doc=pdfium.PdfDocument(item['path'])
    for i in range(len(doc)):
        if (item['id'],i) in keys: continue
        page=doc[i]
        bitmap=page.render(scale=2)
        im=bitmap.to_pil()
        lines,_=ocr(im)
        done.append({'id':item['id'],'page':i,'width':im.width,'height':im.height,'ocr':[{'box':b,'text':t,'confidence':float(c)} for b,t,c in (lines or [])]})
        out.write_text(json.dumps(done,ensure_ascii=False,indent=2),encoding='utf8')
        print(item['id'],i+1,'/',len(doc),len(lines or []),flush=True)
        im.close();bitmap.close();page.close()
    doc.close()
