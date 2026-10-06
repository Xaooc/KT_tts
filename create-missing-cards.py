"""Root translations of missing selection pages and effective official commentaries."""
import json,re
from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('battle_cards','create-battleclade-cards.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
R=Path('.');a=m.read('inventory/critic-full-team-audit-c.json');e=m.read('inventory/critic-full-team-audit-e.json');b=m.read('inventory/critic-full-team-audit-b.json')
teamNames=m.read('ru-team-names.json')
def team(name):
 m.activeTeam=name;m.activeRussian=teamNames.get(name,name).upper()
 if name in a['sources']['teams']:
  s=a['sources']['teams'][name];url=s['officialPdf'];date=s['officialCatalogLastUpdated'];w=s['wahapedia']
 else:
  s=next(x for x in e['sources']+b['sources'] if x['team']==name);url=s.get('officialPdfUrl',s.get('officialPdf'));date=s.get('catalogDate',s.get('officialCatalogDate'));w=s.get('wahapediaPage',s.get('wahaPage'))
 m.sourceUrl=url;m.provenance={'officialPdf':url,'date':date,'wahapedia':w,'checkedOn':'2026-10-05'}
def textCard(en,ru,kind,text,source):
 m.names['Rule']='Правило';return m.add(en,ru,kind,[m.block('Rule',text,source)])
faqTexts={
'Sanctifiers':[
'Если правило требует стрелять или сражаться с определённым оперативником, иначе активация отменяется, и «Властное провозглашение» (Commanding Declamation) Исповедника (CONFESSOR) отменило это действие, активацию врага не отменяйте. Он может выполнять другие действия как обычно.',
'Если «Властное провозглашение» (Commanding Declamation) отменяет «Стрельбу» (Shoot) или «Ближний бой» (Fight) оперативника на «Дозоре» (Guard), он остаётся на дозоре, если соблюдены остальные условия.',
'Если «Властное провозглашение» (Commanding Declamation) отменяет действие, требуемое уловкой перестрелки, потраченные CP не возвращаются. Правила с ограниченным числом применений, например «На шаг впереди» (One Step Ahead), также считаются использованными.',
'Если Исповедник отменил «Ближний бой» (Fight) или «Стрельбу» (Shoot), выбранные врагом при прерывании по «Дозору» (Guard), противник может выбрать другое из этих действий в том же прерывании.'],
'Exaction Squad':[
'Если ваша отмеченная цель (Mark) выведена из строя во время действия с несколькими стрелковыми последовательностями, например «Взрыв» (Blast) или «Поток» (Torrent), новую цель по гамбиту «Отмечен для правосудия» (Marked for Justice) выбирают в конце действия, после удаления выведенных из строя оперативников.',
'Если оперативник пытается стрелять или сражаться с врагом, указанным в «Приказе о казни» (Execution Order), но правило противника запрещает это действие, активация не отменяется. Продолжайте её так, будто условия уловки выполнены.',
'«Вина выдаёт себя» (Guilt Reveals Itself) увеличивает исключение с 2 до 4 дюймов и для правил, запрещающих выбор допустимой целью и имеющих приоритет над всеми правилами, кроме нахождения в пределах 2 дюймов, например «На позиции» (In Position).',
'При одновременной активации Поводыря (LEASHMASTER) и R-VR Кибер-мастифа (CYBER-MASTIFF) по «Дрессировщику» (Handler) нельзя с помощью «Жестокой поддержки» (Brutal Backup) повторно выполнить «Ближний бой» (Fight) оперативником, уже выполнившим его в эту активацию.'],
'Warpcoven':[
'«Психический кабал» (Psychic Cabal) не передаёт Колдуну (SORCERER) преимущества «Даров Тзинча» (Boons of Tzeentch), имеющихся у выбранного другого Колдуна, например «Искажения судьбы» (Twist of Fate).',
'Выбранного для «Временного потока» (Temporal Flux) оперативника нельзя убрать и выставить заново, если он активируется либо заканчивает активацию в области, запрещающей дополнительные правила ПСИХИЧЕСКОЕ (PSYCHIC), например «Нуль-жезл» (Null Rod).'],
'Ratlings':[
'Боевой пёс (BATTLEMUTT) может применить «Раннее предупреждение» (Early Warning), даже если враг переместился или был выставлен заново вне фазы перестрелки (Firefight).',
'Отряд Ратлингов (RATLING) всегда состоит из одного Решалы (FIXER) и десяти других оперативников. До трёх из этих десяти могут быть Булгринами (BULLGRYN) или Огринами (OGRYN). За каждый из трёх вариантов, в котором вы не выбираете Булгрина либо Огрина, выберите другого оперативника Ратлингов и одну уловку, которая будет стоить вам 0 CP весь бой.']}
for name,texts in faqTexts.items():
 team(name);x=next(x for x in a['queue'] if x['team']==name and x['kind']=='faq_not_captured');parts=x['currentFullEnglish'].split('\n\n');assert len(parts)==len(texts)
 for i in range(0,len(texts),2):
  blocks=[]
  for j in range(i,min(i+2,len(texts))):
   key='Rules commentary '+str(j+1);m.names[key]='Разъяснение '+str(j+1);blocks.append(m.block(key,texts[j],parts[j]))
  m.add(name+' Rules Commentary '+str(i//2+1),teamNames.get(name,name)+' · разъяснения '+str(i//2+1),'RULES COMMENTARY',blocks)
team('Warpcoven')
textCard('Warpcoven Kill Team','Отряд Варп-ковена','KILL TEAM','Архетипы: Охрана (Security), Разведка (Recon).\nВыберите 5 вариантов из списка: Колдун судьбы (SORCERER OF DESTINY), Колдун Темпириона (SORCERER OF TEMPYRION), Колдун варп-пламени (SORCERER OF WARPFIRE); Стрелок Рубрик-десантников (RUBRIC MARINE GUNNER) с варп-огнемётом и кулаками либо пушкой «Жнец душ» и кулаками; Знаменосец Рубрик-десантников (RUBRIC MARINE ICON BEARER); Воин Рубрик-десантников (RUBRIC MARINE WARRIOR); Чемпион Цаангоров (TZAANGOR CHAMPION) с двуручным топором либо двуручным клинком; Горнист Цаангоров (TZAANGOR HORN BEARER); Знаменосец Цаангоров (TZAANGOR ICON BEARER); Воин Цаангоров (TZAANGOR WARRIOR) с клинками, клинком и щитом либо автопистолетом и цепным мечом.\nКаждый Цаангор считается половиной варианта выбора: два Цаангора занимают один вариант. \nКаждый Колдун вооружён силовым посохом, PSYCHIC-оружием своей карточки и одним из вариантов: инферно болт-пистолет, просперинский хопеш либо пистолет варп-пламени. В отряде может быть не больше одного пистолета варп-пламени (Warpflame pistol) и не больше одной пушки «Жнец душ» (Soulreaper cannon).','5 WARPCOVEN operatives selected from the following list:\n• SORCERER OF DESTINY¹\n• SORCERER OF TEMPYRION¹\n• SORCERER OF WARPFIRE¹\n• RUBRIC MARINE GUNNER with one of the following options:\n  ○ Warpflamer; fists\n  ○ Soulreaper cannon²; fists\n• RUBRIC MARINE ICON BEARER\n• RUBRIC MARINE WARRIOR\n• TZAANGOR CHAMPION³ with one of the following options:\n  ○ Greataxe\n  ○ Greatblade\n• TZAANGOR HORN BEARER³\n• TZAANGOR ICON BEARER³\n• TZAANGOR WARRIOR³ with one of the following options:\n  ○ Tzaangor blades\n  ○ Tzaangor blade & shield\n  ○ Autopistol; chainsword\n¹ With force stave, PSYCHIC weapons on their datacard and one of the following options:\n• Inferno bolt pistol\n• Prosperine khopesh\n• Warpflame pistol²\n² Your kill team can only include up to one warpflame pistol and up to one soulreaper cannon.\n³ These operatives count as half a selection each, meaning you can select both of them and it’s treated as one selection in total.')
team('Plague Marines')
textCard('Plague Marines Kill Team','Отряд Чумных десантников','KILL TEAM','Архетипы: Найти и уничтожить (Seek & Destroy), Охрана (Security).\n1 Чемпион Чумных десантников (PLAGUE MARINE CHAMPION).\nЕщё 5 Чумных десантников: Бомбардир (BOMBARDIER), Боец (FIGHTER), Тяжёлый стрелок (HEAVY GUNNER), Знаменосец (ICON BEARER), Злокозненный чумной колдун (MALIGNANT PLAGUECASTER), Воин (WARRIOR).\nКаждого оперативника из этого списка можно включить только один раз.','1 PLAGUE MARINE CHAMPION; 5 PLAGUE MARINE operatives from BOMBARDIER, FIGHTER, HEAVY GUNNER, ICON BEARER, MALIGNANT PLAGUECASTER, WARRIOR. Each operative on this list once. Seek & Destroy / Security.')
team('Scout Squad')
textCard('Tactical Vox-link','Тактическая вокс-связь','FACTION EQUIPMENT','Сержант разведчиков поддерживает постоянную вокс-связь с вверенными ему неофитами и с безупречной точностью направляет их атаки.\nОдин раз за раунд можно применить уловку перестрелки «Подготовка Астартес» (Astartes Training) либо «Воодушевлённый неофит» (Emboldened Aspirant) за 0 CP, если дружественный Сержант (SERGEANT) находится в зоне боя.','The Scout Sergeant maintains a constant vox-link with the aspirants in his charge, directing their aggression with deadly precision. Once per turning point, you can use the Astartes Training or Emboldened Aspirant firefight ploy for 0CP if a friendly SERGEANT operative is in the killzone.')
team('Void-dancer Troupe')
textCard('The Curtain Falls Rules Commentary','Занавес падает · разъяснение','RULES COMMENTARY','Если бесплатное «Отступление» (Fall Back) по уловке «Занавес падает» (The Curtain Falls) запрещено, например «Цепными силками» (Chain Snares), потраченные CP не возвращаются. Если вы использовали «Удачу Смеющегося бога» (Luck of the Laughing God), эта уловка перестрелки также считается использованной для того правила.','Q: When using The Curtain Falls firefight ploy, if the free Fall Back action is prevented (e.g. MANDRAKES Chain Snares), is the spent CP refunded? A: No. If Luck of the Laughing God was used, that firefight ploy counts as being used for that rule as well.')
for name,data in [('ru-images-supplement.json',m.cards),('inventory/image-sources.json',m.sources),('inventory/card-assets.json',m.assets),('inventory/supplement-card-manifest.json',m.manifest)]:
 (R/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'supplements':len(m.cards)}))
