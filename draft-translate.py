from pathlib import Path
from collections import Counter
import ctranslate2,sentencepiece as spm,json,re,time,sys
ROOT=Path(__file__).resolve().parent
model=next((ROOT/'tools'/'translator-model').glob('*/model'))
tokenizer=spm.SentencePieceProcessor(model_file=str(model.parent/'sentencepiece.model'))
translator=ctranslate2.Translator(str(model),device='cpu',compute_type='int8',inter_threads=2,intra_threads=2)
def sentences(text):
    text=text.replace('\u00a0',' ')
    text=re.sub(r'([A-Za-z])\?([A-Za-z])',r"\1'\2",text)
    return re.split(r'(?<=[.!?])\s+(?=[A-Z\d▶◆•])',text)
def translate_batch(texts):
    pieces=[];layout=[]
    for text in texts:
        chunks=sentences(text);layout.append(len(chunks));pieces.extend(chunks)
    tokens=[tokenizer.encode(s,out_type=str) for s in pieces]
    out=translator.translate_batch(tokens,beam_size=4,max_batch_size=32,max_input_length=512,max_decoding_length=512)
    translated=[tokenizer.decode(x.hypotheses[0]) for x in out]
    result=[];offset=0
    for count in layout:result.append(' '.join(translated[offset:offset+count]));offset+=count
    return result
if __name__=='__main__':
    source=json.loads((ROOT/'inventory'/'prose-source.json').read_text(encoding='utf8'))
    known={**json.loads((ROOT/'ru-rule-texts.json').read_text(encoding='utf8')),**json.loads((ROOT/'ru-team-prose.json').read_text(encoding='utf8'))}
    destination=ROOT/'inventory'/'prose-machine-drafts.json'
    drafts=json.loads(destination.read_text(encoding='utf8')) if destination.exists() else {}
    pending=[x for x in source if x['id'] not in known and x['id'] not in drafts]
    for start in range(0,len(pending),16):
        batch=pending[start:start+16]
        ru=translate_batch([x['english'] for x in batch])
        for x,text in zip(batch,ru):
            en_numbers=Counter(re.findall(r'\d+',x['english']));ru_numbers=Counter(re.findall(r'\d+',text))
            drafts[x['id']]={'english':x['english'],'russianDraft':text,'status':'machine-draft-unreviewed','numbersMatch':en_numbers==ru_numbers,'contexts':x['contexts']}
        destination.write_text(json.dumps(drafts,ensure_ascii=False,indent=2),encoding='utf8')
        print(min(start+16,len(pending)),'/',len(pending),'drafts; NOT release translations',flush=True)
