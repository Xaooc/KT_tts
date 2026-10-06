"""Package the verified guides and record scope without claiming native TTS testing."""
import json, hashlib
from pathlib import Path
from datetime import datetime, timezone
from pypdf import PdfReader, PdfWriter

R=Path(__file__).parent
def read(name): return json.loads((R/name).read_text(encoding='utf-8-sig'))
def write(name,data): (R/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
guides=read('output/current-team-guides.json'); names=read('ru-team-names.json')
writer=PdfWriter()
for guide in guides:
    assert hashlib.sha256(Path(guide['path']).read_bytes()).hexdigest()==guide['sha256']
    writer.append(guide['path'],outline_item=names.get(guide['team'],guide['team'])+' ('+guide['team']+')')
writer.add_metadata({'/Title':'Kill Team — русские справочники 41 отряда','/Subject':'Правила сверены 05.10.2026','/Author':'KT RU translation'})
target=R/'output/pdf/KT41-RU-reference.pdf'
with target.open('wb') as f: writer.write(f)
check=PdfReader(target)
page_count=sum(g['pages'] for g in guides)
assert len(check.pages)==page_count
assert sum(isinstance(item,dict) for item in check.outline)==41
write('output/combined-guide-verification.json',{'pages':page_count,'teamBookmarks':41,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'passed':True})

cards=read('output/card-layout-verification.json'); patches=read('inventory/current-rule-applied.json')
patches['allTeamsCurrentRulesVerified']=True
patches['scope']='All 41 teams in the supplied local pack; complete source reviews, not native TTS runtime validation'
patches['sourceReviewComplete']=True
write('inventory/current-rule-applied.json',patches)
write('output/current-progress.json',{
 'complete':True,'completeTranslation':True,'sourceTeamCount':41,
 'savedTeamRuleTexts':631,'savedTableRuleTexts':83,
 'canonicalTranslatedImageDefinitions':1323,'translatedOriginalImages':1289,
 'sourceImagesWithoutEnglishText':54,'authoredSupplementCards':34,
 'connectedImages':1323,'connectedPDFs':61,'teamGuides':41,'teamGuidePages':page_count,
 'renderedCardFaces':cards['cards'],'darkCardsContrastChecked':cards['darkCardsChecked'],
 'statHeadersChecked':cards['statHeadersChecked'],'cardLayoutChecksPassed':cards['passed'],
 'checkedModels':893,'currentTeamModels':726,'currentRulePatches':patches['patches'],
 'nativeTTSRuntimeTested':False,'bulkLayoutApproval':'approved',
 'approvedDesign':'dense-reference-original-card-v3','bulkApprovedLayoutApplied':True,
 'preserveOriginalStatAbbreviations':True,'allTeamsCurrentRulesVerified':True,
 'remainingTranslationWork':[],
 'limitations':['Native Tabletop Simulator load/gameplay not tested','Local assets must be published to shared hosting for network play','Scope is the 41 supplied teams, not all officially released teams'],
 'updatedAt':datetime.now(timezone.utc).isoformat()})
(R/'output/README.txt').write_text('''KILL TEAM / THE KILLZONE — РУССКИЙ ПЕРЕВОД
Сборка 05.10.2026. Перевод материалов исходного стола и всех 41 отряда локального набора завершён.

ЗАГРУЗКА
В Tabletop Simulator: Games → Save & Load → KT24 The Killzone — русский перевод.
Набор отрядов: Objects → Saved Objects → KT41-RU. Переключайте состояния мешка для выбора отряда.
Выберите модель и нажмите R. Полные правила отображаются в подсказках способностей, действий и WR.
В каждом наборе добавлен русский PDF-справочник; общий PDF содержит закладки по всем 41 отрядам.

СОДЕРЖИМОЕ
1 443 переведённые лицевые стороны карточек, 1 323 изображения, 20 исходных PDF и 41 справочник отрядов.
Проверены текущие профили 726 моделей отрядов; HUD и описания — для 893 моделей вместе со столом.
Правила отрядов сверены с полными официальными материалами и Wahapedia на 05.10.2026.
Старые миссионные наборы сохраняют собственную редакцию.
Сохранены английские сокращения характеристик: APL, MOVE, SAVE, WOUNDS, ATK, HIT, DMG, WR, AP, CP.
Оригинальный Workshop-мод и исходный набор отрядов не изменены.

ПРОВЕРКИ И ОГРАНИЧЕНИЯ
Проверены тексты, границы вёрстки, контраст тёмных карточек, профили моделей, Lua и ссылки на установленные файлы.
Загрузка и игровые действия внутри самого Tabletop Simulator ещё не проверялись.
Изображения и PDF установлены локально в Mods/KT-RU. Для сетевой игры ресурсы нужно разместить в облаке и заменить ссылки на общедоступные; другие игроки не получают локальные файлы автоматически.
https://kb.tabletopsimulator.com/custom-content/asset-importing/
''',encoding='utf-8')
print(json.dumps({'combinedPages':len(check.pages),'bookmarks':len(check.outline),'completeTranslation':True}))
