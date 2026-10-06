import json
from pathlib import Path
from xml.etree import ElementTree as ET
old = json.loads(Path(r'C:\Users\PC\Documents\My Games\Tabletop Simulator\Mods\Workshop\3573927734.json').read_text(encoding='utf-8'))
new = json.loads(Path(r'C:\dev\KT\output\KT24-The-Killzone-RU-preview-1.json').read_text(encoding='utf-8'))
count = 0
def shape(element):
    return (element.tag, {k:v for k,v in element.attrib.items() if k not in ('text','tooltip')}, [shape(c) for c in element])
def walk(a,b,loc):
    global count
    if isinstance(a,dict):
        for k,v in a.items():
            if k=='XmlUI' and v and v!=b[k]:
                before = ET.fromstring('<root>'+v+'</root>')
                after = ET.fromstring('<root>'+b[k]+'</root>')
                assert shape(before)==shape(after), loc
                count += 1
            elif isinstance(v,(dict,list)) and k!='TabStates':
                walk(v,b[k],loc+'/'+k)
    elif isinstance(a,list):
        for i,v in enumerate(a):
            if isinstance(v,(dict,list)): walk(v,b[i],loc+'/'+str(i))
walk(old,new,'')
print(f'Validated {count} changed XML panels: element structure, IDs, callbacks, layout, images, colors unchanged.')
