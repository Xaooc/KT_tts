import json
from pathlib import Path

R = Path(__file__).parent
def read(name): return json.loads((R/name).read_text(encoding='utf-8-sig'))
def write(name, value): (R/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

proof = {x['team']:x['effectiveEnglish'] for x in read('inventory/critic-missing-cards-source.json')['missingCards']}
flavor = 'Сержант разведчиков поддерживает постоянную вокс-связь с вверенными ему неофитами и с безупречной точностью направляет их атаки.\n'
changed = []
for name in ['ru-images-supplement.json', 'ru-images-all-reviewed.json']:
    data = read(name)
    for ident, card in data.items():
        if card.get('titleEnglish') == 'Warpcoven Kill Team':
            b = card['blocks'][0]
            for word in ['DESTINY','TEMPYRION','WARPFIRE']:
                b['russian'] = b['russian'].replace('SORCERER '+word, 'SORCERER OF '+word)
            b['russian'] = b['russian'].replace('варп-плазменный пистолет', 'пистолет варп-пламени').replace('варп-плазменного пистолета', 'пистолета варп-пламени')
            b['english'] = proof['Warpcoven']
            changed.append(ident)
        if card.get('titleEnglish') == 'Tactical Vox-link' and card.get('generatedSupplement'):
            b = card['blocks'][0]
            if not b['russian'].startswith(flavor): b['russian'] = flavor + b['russian']
            b['english'] = proof['Scout Squad']
            changed.append(ident)
    write(name, data)

# Keep the source generator consistent with the reviewed production definitions.
p = R/'create-missing-cards.py'
t = p.read_text(encoding='utf-8')
for word in ['DESTINY','TEMPYRION','WARPFIRE']: t = t.replace('SORCERER '+word, 'SORCERER OF '+word)
t = t.replace('варп-плазменный пистолет', 'пистолет варп-пламени').replace('варп-плазменного пистолета', 'пистолета варп-пламени')
t = t.replace("'Full team selection: official PDF p.1; Waha full snapshot lines 62–91.'", repr(proof['Warpcoven']))
t = t.replace("'Один раз за раунд можно применить уловку перестрелки", repr(flavor)[0:-1]+"Один раз за раунд можно применить уловку перестрелки")
t = t.replace("'Once per turning point, you can use the Astartes Training or Emboldened Aspirant firefight ploy for 0CP if a friendly SERGEANT operative is in the killzone.'", repr(proof['Scout Squad']))
p.write_text(t, encoding='utf-8')
p = R/'create-battleclade-cards.py'
t = p.read_text(encoding='utf-8').replace("'generatedSupplement':True,'currentRuleSources'", "'generatedSupplement':True,'layoutRevision':1,'currentRuleSources'")
p.write_text(t, encoding='utf-8')

p = R/'connect-translated-assets.cjs'
t = p.read_text(encoding='utf-8').replace('Для изображений и PDF нужны установленные файлы Mods/KT-RU этого компьютера.', 'Для изображений и PDF нужны установленные файлы Mods/KT-RU этого компьютера. Это локальные ресурсы: для сетевой игры их необходимо разместить в облаке и заменить ссылки на общедоступные.')
p.write_text(t, encoding='utf-8')
print(json.dumps({'rerender':sorted(set(changed))}))
