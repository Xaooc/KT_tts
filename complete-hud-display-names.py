"""Root-authored Russian HUD labels; raw TTS identifiers are kept intact."""
import json,re
from pathlib import Path
ROOT=Path(__file__).parent
clean=lambda x:re.sub(r'\s*\([^()]*[A-Za-z][^()]*\)\s*$','',x).strip()
names={}
for file in ('ru-card-display-names.json','ru-display-names.json'):
 names.update(json.loads((ROOT/file).read_text(encoding='utf8')))
review=json.loads((ROOT/'inventory/critic-display-coverage.json').read_text(encoding='utf8'))
for kind in ('operators','weapons'):
 for q in review['queues'][kind]:
  ev=q['existingRussianEvidence'];matches=ev.get('operativeCardTitleMatches',ev.get('verifiedCardWeaponOrTitleMatches',[]))
  matches=matches or ev.get('caseOnlyDictionaryMatches',[])
  if matches:
   ru=clean(matches[0]['russian']);key=q['rawInfoName'] if kind=='operators' else q['cleanedLookupKey'];names[key]=ru
manual='''Brother Acules|Брат Акулес
Brother Flavian|Брат Флавиан
Captain Justian|Капитан Юстиан
Auto-proxy Servitor|Автопрокси-сервитор
Breacher Servitor|Сервитор-проломщик
Combat Servitor|Боевой сервитор
Servitor Underseer|Сервитор-поднадзиратель
Technoarcheologist|Техноархеолог
Technomedic Servitor|Сервитор-техномедик
Gun Servitor|Стрелковый сервитор
Fate Dealer|Распорядитель судьбы
Felarch|Феларх
Kurnathi|Курнати
Kurnite Hunter|Охотник с курнитом
Shade Runner|Бегущий в тени
Soul Weaver|Ткач душ
Starstorm Duellist|Дуэлянт звёздной бури
Way Seeker|Искатель пути
Heavy Gunner|Тяжёлый стрелок
Gunner|Стрелок
Sergeant Veteran|Сержант-ветеран
Bruiser Veteran|Ветеран-громила
Comms Veteran|Ветеран-связист
Confidant Veteran|Ветеран-доверенный
Demolition Veteran|Ветеран-подрывник
Hardened Veteran|Закалённый ветеран
Medic Veteran|Ветеран-медик
Sniper Veteran|Ветеран-снайпер
Spotter Veteran|Ветеран-наблюдатель
Trooper Veteran|Рядовой ветеран
Zealot Veteran|Ветеран-фанатик
Lectro-maester|Электромейстер
Arbites R-VR Cyber Mastiff|Кибермастиф арбитров R-VR
R-VR Cyber Mastiff|Кибермастиф R-VR
Bow-hunter|Охотник-лучник
Cold-blood|Хладнокровный
Cut-skin|Свежеватель
Hound|Гончая
Kill-broker|Посредник убийств
Warrior|Воин
Gellerpox Mutant|Мутант геллероспы
Aspirant|Аспирант
Blood Herald|Глашатай крови
Bloodtaker|Кровопийца
Impaler|Пронзатель
Inciter|Подстрекатель
Skullclaimer|Собиратель черепов
Agent|Агент
Archsybarite|Архисибарит
Crimson Duellist|Багровый дуэлянт
Disciple of Yaelindra|Последовательница Яэлиндры
Elixicant|Эликсикант
Flayer|Свежеватель
Skysplinter Assassin|Убийца небесного осколка
Sicarian Infiltrator Tracker|Сикарианский инфильтратор-следопыт
Sicarian Ruststalker Assassin|Сикарианский растсталкер-ассасин
Skitarii Ranger Marksman|Скитарий-рейнджер меткий стрелок
Skitarii Vanguard Shocktrooper|Скитарий авангарда штурмовик
Tempestus Scion|Воин Темпестус Сцион
Tempestus Scion (Gunner)|Стрелок Темпестус Сцион
Tempestus Scion (Trooper)|Рядовой Темпестус Сцион
Combat Medic|Боевой медик
Demo-Trooper|Боец-подрывник
Recon-Trooper|Боец-разведчик
Sharpshooter|Меткий стрелок
Trooper|Рядовой
Vox-Trooper|Боец-связист
Sergeant|Сержант
Breacha Boy|Боец-проломщик
Burna Boy|Боец с горелкой
Comms Boy|Боец-связист
Dakka Boy|Боец-дакка
Grot|Грот
Kommando Nob|Ноб-коммандос
Rokkit Boy|Боец-ракетчик
Slasha Boy|Боец-резака
Snipa Boy|Боец-снайпер
Legionary Annointed|Помазанник легионеров
Abyssal|Абиссал
Chooser of the Flesh|Выбирающий плоть
Dirgemaw|Пасть скорби
Nightfiend|Ночной изверг
Shadeweaver|Ткач теней
Visionary|Провидец
Novitiate Duellist|Послушница-дуэлянт
Novitiate Hospitaller|Послушница-госпитальер
Communications Specialist Pathfinder|Следопыт-специалист связи
MV33 Grav-inhibitor Drone|Дрон-гравиингибитор MV33
Shas'la Pathfinder|Следопыт Шас'ла
Shas'ui Pathfinder|Следопыт Шас'уи
Ratling Vox-thief|Ратлинг-похититель связи
Felltalon|Гибельный коготь
Tremorscythe|Сотрясающая коса
Venomspitter|Ядоплюй
Wrecker|Разрушитель
Confessor|Исповедник
Conflagrator|Сжигатель
Death Cult Assassin|Ассасин культа смерти
Drill Abbot|Аббат-наставник
Miraculist|Чудотворец
Missionary|Миссионер
Persecutor|Преследователь
Preacher|Проповедник
Reliquant|Хранитель реликвий
Salvationist|Спаситель
Aquilon Servo-sentry|Сервочасовой Аквилона
Rubric Marine|Рубрикатор
Sorcerer|Колдун
Tzaangor Fighter|Цаангор-боец
Neophyte Brood Adept|Неофит-адепт выводка
Neophyte Brood-Adept|Неофит-адепт выводка
Augmetic claw|Аугметический коготь
Dataspikes|Инфошипы
Eradication pistol|Пистолет искоренения
Heavy arc rifle|Тяжёлая дуговая винтовка
Hydraulic pincer and lascutter|Гидравлическая клешня и лазерный резак
Incendine igniter|Инцендиновый воспламенитель
Lascutter|Лазерный резак
Phosphor blaster|Фосфорный бластер
Servo-arc claw|Дуговой сервокоготь
Servo-chirurgic claw|Хирургический сервокоготь
Servo-claw|Сервокоготь
Scorpion's claw and chainsword|Клешня скорпиона и цепной меч
Triskele|Трискель
Diabolik bomb|Дьявольская бомба
Sharpshooter's long-las|Длинноствольный лазган меткого стрелка
Stim needle|Стимуляционная игла
Chainsowrd and claw|Цепной меч и коготь
Poisoned fighting knifes|Отравленные боевые ножи
Scoped needle pistol|Игольный пистолет с прицелом
Combat shotgun|Боевой дробовик
Lightning stike|Удар молнии
Artificer shotgun|Искусно изготовленный дробовик
Digital laser|Пальцевый лазер
Laspistol|Лазпистолет
Rotor cannon|Роторная пушка
Shock Pistol|Шоковый пистолет
Accelerator bow|Ускорительный лук
Blade|Клинок
Kroot rifle|Винтовка крутов
Pulse rifle|Импульсная винтовка
Bludgeon|Дубина
Crackthorn whip|Шипастый кнут
Triple cleavers|Тройные тесаки
Frag grenades|Осколочные гранаты
Grasp and slash|Хватание и рассечение
Improvised weapon & mutated limb|Самодельное оружие и мутировавшая конечность
Mutant fist & cleaver|Кулак мутанта и тесак
Pyregut|Огненное брюхо
Writhing swipe|Извивающийся взмах
Splinter pistol|Осколочный пистолет
Stimm-needler|Стимуляционный игломёт
Autoch-patter bolt pistol|Болт-пистолет образца «Автох»
Autoch-patter bolter|Болтер образца «Автох»
L7 missile launcher|Ракетная установка L7
APM Launcher|Установка APM
Bolt shotgun|Болтовый дробовик
Chordclaw and transonic razor|Хордокоготь и трансзвуковая бритва
Plasma caliver|Плазменный каливер
Transuranic arquebus|Трансурановая аркебуза
Navis heavy shotgun|Тяжёлый дробовик Навис
Navis shotgun|Дробовик Навис
Extended stock autopistol|Автопистолет с удлинённым прикладом
Heavy bolter|Тяжёлый болтер
Navis las-volley|Залповый лазган Навис
Hot-shot marksman rifle|Усиленная лазерная винтовка меткого стрелка
Gun butt|Приклад
Hot-shot lasgun|Усиленный лазган
Burna|Горелка
Double-handed chain axe|Двуручный цепной топор
Balesurge|Гибельный всплеск
Missile launcher|Ракетная установка
Plasma gun|Плазмаган
Plasma pistol|Плазменный пистолет
Condemnor stakethrower|Кольемёт «Кондемнор»
Bonding knife|Нож братства
Burst cannon|Импульсная пушка
EMP grenade|ЭМИ-граната
Ion rifle|Ионная винтовка
Marksman rail rifle|Рельсовая винтовка меткого стрелка
Pulse carbine|Импульсный карабин
Ram|Таран
Combat knife|Боевой нож
Haywire mine|Электромагнитная мина
Marksman bolt carbine|Болтовый карабин меткого стрелка
Occulus bolt carbine|Болтовый карабин «Оккулус»
Remote explosives|Дистанционная взрывчатка
Special issue bolt pistol|Специальный болт-пистолет
Plaguesword|Чумной меч
Explosive Arsenal|Взрывной арсенал
Scything talons and crushing claws|Косовидные когти и дробящие клешни
Scything talons and rending claws|Косовидные и разрывающие когти
Hot-Shot Carbine|Усиленный лазерный карабин
Hot-shot lascarabine|Усиленный лазерный карабин
Hot-shot laspistols|Усиленные лазпистолеты
Flamer|Огнемёт
Neutron rail rifle|Нейтронная рельсовая винтовка
Fusion pistol|Термопистолет
Neuro disruptor|Нейродизраптор
Shrieker cannon|Визжащая пушка
Shuriken pistol|Сюрикен-пистолет
Force stave|Силовой посох
Inferno bolt gun|Инфернальный болтер
Soulreaper cannon|Пушка пожинателя душ
Tzaangor greataxe|Большой топор цаангора
Tzaangor greatblade|Большой клинок цаангора
'Eavy rokkit launcha|Тяжёлая ракетная установка
Sanctus sniper rifle|Снайперская винтовка Санктуса
rifle|Винтовка
scattergun|Картечница
skinner|Сдиратель
tribalest|Трибалест
heavy axe|Тяжёлый топор
improvised weapon|Самодельное оружие
pistol and melee weapon|Пистолет и оружие ближнего боя
pistol and chainsword|Пистолет и цепной меч
las-volley|Залповый лазган
meltagun|Мельтаган
grenade launcher|Гранатомёт
hot-shot volley gun|Усиленный залповый лазган
flamer|Огнемёт
big choppa|Большая рубилка
power klaw|Силовая клешня
plasma gun|Плазмаган
soulreaper cannon|Пушка пожинателя душ
warpflamer|Варп-огнемёт
Auto Bolt rifle|Автоматическая болтовая винтовка
Auxiliary grenade launcher|Подствольный гранатомёт
Bolt Sniper Rifle|Болтовая снайперская винтовка
Krak grenade|Бронебойная граната'''
for line in manual.splitlines():
 en,ru=line.split('|');names.setdefault(en,ru)
for en,ru in json.loads((ROOT/'ru-hud-additional-display-names.json').read_text(encoding='utf8')).items():names[en]=ru
for definition in json.loads((ROOT/'ru-images-all-reviewed.json').read_text(encoding='utf8')).values():
 if definition.get('titleEnglish') and definition.get('titleRussian'):
  names.setdefault(definition['titleEnglish'].split(' ·')[0],clean(definition['titleRussian'].split(' ·')[0]))
 for w in definition.get('weapons',[]):
  if w.get('english') and w.get('russian'):names.setdefault(w['english'],clean(w['russian']))
 for block in definition.get('blocks',[]):
  if block.get('headingEnglish') not in ('Rule','Rule · continuation','Rules Commentary') and block.get('headingRussian'):
   en=block['headingEnglish'].split(' ·')[0].split(' (')[0].split(':')[0]
   ru=block['headingRussian'].split(' ·')[0].split(' (')[0]
   names.setdefault(en,ru)
for en,ru in list(names.items()):names.setdefault(en+'*',ru)
lookup={k.casefold():v for k,v in names.items()}
def get(en):return lookup.get(en.casefold())
qualifiers={
 'frag':'осколочный','krak':'бронебойный','standard':'обычный','standart':'обычный','standart':'обычный','normal':'обычный','supercharge':'с перегрузкой','overcharge':'с перегрузкой','executioner':'палач','hyperfrag':'гиперосколочный','mortis':'мортис','close range':'ближняя дистанция','short range':'короткая дистанция','long range':'дальняя дистанция','defensive':'защита','offensive':'нападение','bash and slash':'удар и рассечение','lopping blow':'рубящий удар','voltaic arrow':'вольтаическая стрела','glide arror':'планирующая стрела','blast':'взрыв','focused':'сосредоточенный','armour piercing':'бронебойный','breaching':'пробивной','high explosive':'фугасный','mobile':'подвижный','moibile':'подвижный','stationary':'стационарный','sweeping':'веерный','standart':'обычный','dart round':'игольчатый снаряд','point-black':'в упор','aimed':'прицельный','skytorch':'небесный факел','burn':'сжигание','sergeant':'сержант','lead player':'ведущий игрок','voidmaster':'повелитель пустоты','kill-broker':'посредник убийств','warrior':'воин','ironhorn':'железнорог','archsybarite':'архисибарит',"shas'ui pathfinder":"следопыт Шас'уи",'mb3 recon drone':'разведывательный дрон MB3','tempestus scion':'Темпестус Сцион','prosperine khopesh':'просперинский хопеш'}
unresolved=[]
for q in review['queues']['weapons']:
 key=q['cleanedLookupKey']
 if get(key):names.setdefault(key,get(key));continue
 match=re.match(r'^(.*?)(?:\s+-\s+|\s*\()(.*?)\)?$',key)
 if match:
  base,mode=match.groups();mode=mode.strip(' ()');ru=get(base.strip());qual=qualifiers.get(mode.casefold())
  if not qual and ' (Tempestus Scion' in mode:
   qual=qualifiers.get(mode.split(' (Tempestus Scion')[0].casefold())
   if qual:qual+=' — Темпестус Сцион'
  if ru and qual:names[key]=ru+' — '+qual;lookup[key.casefold()]=names[key];continue
 unresolved.append({'kind':'weapon','key':key})
for q in review['queues']['operators']:
 key=q['rawInfoName']
 if get(key):names.setdefault(key,get(key));continue
 parts=re.split(r' w/ | with ',key,maxsplit=1)
 if len(parts)==2:
  base,loadout=parts;ru=get(base) or get(q['modelType']);weapon=get(loadout)
  if ru and weapon:names[key]=ru+' — '+weapon;continue
 ru=get(q['modelType'])
 if ru:names[key]=ru;continue
 unresolved.append({'kind':'operator','key':key,'modelType':q['modelType']})
out={k:v for k,v in names.items()}
for k,v in list(out.items()):out.setdefault(k.upper(),v)
(ROOT/'ru-hud-display-names-complete.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(ROOT/'inventory/hud-display-completion.json').write_text(json.dumps({'labels':len(out),'unresolved':unresolved},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'labels':len(out),'unresolved':unresolved},ensure_ascii=False))
