import json,re
from pathlib import Path

root=Path(__file__).parent
sources={x['id']:x for x in json.loads((root/'inventory/pdf-sources.json').read_text(encoding='utf8'))}
def blocks(text):
    result=[]
    for group in re.split(r'\n\s*\n',text.strip()):
        lines=group.splitlines()
        first=lines[0]
        is_heading=first.upper()==first and bool(re.search('[А-ЯЁA-Z]',first))
        if len(first)<120 and not first.endswith(('.',':',';')) and (is_heading or not re.match(r'^[\d•▶◆]',first) and len(lines)>1):
            result.append({'type':'heading','russian':first})
            if len(lines)>1: result.append({'type':'paragraph','russian':'\n'.join(lines[1:])})
        else:
            if re.match(r'^\d+\. ',first) and len(lines)>1:
                chunks=re.split(r'(?m)^(?=\d+\. )',group)
                result.extend({'type':'paragraph','russian':chunk.strip()} for chunk in chunks if chunk.strip())
            else:result.append({'type':'paragraph','russian':group})
    return result

lite=(root/'ru-lite-rules.txt').read_text(encoding='utf8')
lite=lite.replace('Сохранена редакция исходного файла; схемы находятся в оригинальной PDF.','Сохранена редакция исходного файла.')
part1,part23=lite.split('ДИСТАНЦИЯ КОНТРОЛЯ (CONTROL RANGE)',1)
part2,part3=part23.split('ПРАВИЛА ОРУЖИЯ',1)
liteparts=[part1,'ДИСТАНЦИЯ КОНТРОЛЯ (CONTROL RANGE)'+part2,'ПРАВИЛА ОРУЖИЯ'+part3]
result={
    '02236cd1de991b9e':{'titleEnglish':'Kill Team Lite Rules','titleRussian':'Kill Team — краткие правила',
                      'pages':[{'sourcePage':i+1,'english':sources['02236cd1de991b9e']['texts'][i],'blocks':blocks(t)} for i,t in enumerate(liteparts)]}
}
manual=(root/'ru-manual.txt').read_text(encoding='utf8')
manual=manual.replace('Перевод текста 10-страничного руководства из этого мода. Нумерация разделов соответствует страницам оригинала; иллюстрации и их цифровые указатели смотрите в исходной PDF. Авторские названия сохранены. Отдельные команды в тестовой русской сборке ещё могут отображаться по-английски.',
    'Перевод десятистраничного руководства из мода. Номера разделов сохранены. Снимки интерфейса из исходника сопровождаются русскими пояснениями; английские названия помогают найти команду в оригинальном интерфейсе.')
sections=re.split(r'(?m)^(?=СОДЕРЖАНИЕ$|[2-9]\. [А-ЯЁA-Z0-9 ()—+\-]+$)',manual)
if len(sections)!=10: raise ValueError('Expected all ten manual pages')
pages=[{'sourcePage':i+1,'english':sources['cad5d0b5bd72d52d']['texts'][i],'blocks':blocks(t)} for i,t in enumerate(sections)]
for page in pages:
    for b in page['blocks']:
        b['russian']=b['russian'].replace('Цифры соответствуют иллюстрации в оригинале:','Цифры соответствуют иллюстрации ниже:').replace('Элементы на иллюстрации оригинала:','Элементы на иллюстрации ниже:')
# Screenshots are unchanged source images, extracted from the PDF. Captions/keys are Russian.
captions={
  4:['Измерение расстояния: удерживайте Tab.','Отметка курсора: нажмите Tab.','Размещение объектов рядами: цифровые клавиши.','Перенос объектов ниже: обе кнопки мыши.','Режим измерения: 2D / 3D.','Контекстное меню: правая кнопка мыши.','Режим камеры: P; на снимке включён вид сверху.'],
  5:['Меню «Начните здесь» в начале игры.','Меню после настройки поля.','«Отменить последний выбор» находится в заголовке меню.','Выбор миссии: по номеру или случайно; затем «Подтвердить выбор».','Кнопка случайной карты.'],
  6:['Панель красного игрока: слева задачи и скрытая область, далее универсальное снаряжение, материалы отряда и область подготовки.'],
  7:['Табло счёта. Номера 1–12 соответствуют перечню элементов в этом разделе.'],
  8:['Планшет расширителя интерфейса и инструменты. Номера 1–11 соответствуют перечню элементов в этом разделе.'],
  9:['Панель над оперативником: 1 — раны, 2 — приказ, 3 — тяжёлое ранение, 4 — прикреплённый жетон, 5 — счётчик.','Контекстное меню оперативника.','Шаблон перемещения.','Инструмент линий прицеливания.'],
  10:['Пример карты данных в интерфейсе. Полный перевод текста примера приведён ниже.']
}
for page_num,labels in captions.items():
    pages[page_num-1]['blocks'].append({'type':'source-images','captionsRussian':labels,'russian':'Иллюстрации из исходного руководства.'})
keys={
  4:'Heavy Rubble — тяжёлые обломки; This is Heavy terrain — это тяжёлый террейн. Custom — настройка; Toggles — переключатели; Tags — теги; Save Object — сохранить объект; Color Tint — оттенок; Physics — физика; Flip — перевернуть; Rotate — повернуть; Scale — масштаб; Scripting — скрипты; Clone — клонировать; Copy — копировать; Delete — удалить. Inch — дюймы; Auto — автоматически; Edge — измерение от края; No Log — без записи. Top down camera activated — включён вид сверху.',
  5:'START HERE — начните здесь; GAME MODE — режим игры; SELECT KILLZONE — выбор зоны боя; SELECT MISSION — выбор миссии; MISSION PACK — набор миссий; CONFIRM SELECTION — подтвердить выбор; CANCEL — отменить; CANCEL LAST SELECTION — отменить последний выбор; RANDOM MAP — случайная карта.',
  6:'PRIMARY / TAC OP — приоритетная / тактическая задача; HIDDEN AREA — скрытая область; UNIVERSAL EQUIPMENT — универсальное снаряжение; SHOW — показать; KILL TEAM LOADOUT — материалы отряда; EQUIPMENT — снаряжение; STRATEGY PLOYS — стратегические приёмы; OPS SELECTION — выбранные задачи; FACTION RULES — правила фракции; FIREFIGHT PLOYS — приёмы перестрелки; SETUP AREA — область подготовки.',
  7:'SCOREBOARD — табло счёта; CASUALTIES — потери; OP SELECTION — выбранные задачи; RED / BLUE — красный / синий игрок; CRIT OP — основная задача миссии; KILL OP — задача на уничтожение; RESET OPS — сброс задач; HELP — помощь; ROLL — бросок кубиков; VP — победные очки; CP — командные очки.',
  8:'KTUI EXTENDER + TOOLS — расширитель интерфейса Kill Team и инструменты; EXTEND UI / EXTEND KTUI — расширить интерфейс; FIX DISPLAY ISSUES — исправить отображение; TABLE CONTROLS — управление всем столом; MAT CONTROLS — управление моделями на планшете; SAVE PLACE — сохранить позиции; LOAD PLACE — восстановить позиции; READY — подготовить; ENGAGE — приказ «Бой»; CONCEAL — приказ «Скрытность»; CLEAR TOKENS — убрать жетоны; COMMAND NODE — командный узел; 3D RANGE TOOL — измеритель дальности в 3D; LOS — линия видимости.',
  9:'Save place — сохранить позицию; Load place — восстановить позицию; Movement — шаблон перемещения; Targeting Lines — линии прицеливания; Update stats — обновить характеристики; Change UI position — переместить интерфейс; HP — оставшиеся раны; Ready — готов; Expended — использован; Engage — «Бой»; Conceal — «Скрытность»; Guard — «Дозор»; Guard (Concealed) — «Дозор в скрытности». Подсказка шаблона перемещения: наведите курсор и нажимайте 1–6, чтобы менять расстояние; 8 — отменить последний отрезок; 9 — подтвердить отрезок; 0 — закончить и переместить модель. Max 2 дюйма — максимальное расстояние 2 дюйма.'
}
for n,text in keys.items(): pages[n-1]['blocks'].append({'type':'paragraph','russian':'Обозначения на снимках: '+text})
pages[-1]['blocks']+=blocks('''ПРИМЕР КАРТЫ НА ИЛЛЮСТРАЦИИ

Дуэлянт со звёздным штормом (Voidscarred Starstorm Duellist). APL: 2; перемещение (Move): 7 дюймов; спасбросок (Save): 4+; раны (Wounds): 8.

Кулаки (Fists): 3 атаки, попадание 3+, урон 2/3, дополнительных правил нет.
Фузионный пистолет (Fusion pistol): 4 атаки, попадание 3+, урон 5/3; дальность (Range) 3 дюйма, разрушительное (Devastating) 3, бронебойное (Piercing). Значение Piercing на исходном снимке обрезано.
Сюрикенный пистолет (Shuriken pistol): 4 атаки, попадание 3+, урон 3/4; дальность 8 дюймов, раздирающее (Rending).

Быстрый спуск (Quick on the Trigger)
Этот оперативник может выполнять действие «Стрельба» (Shoot), находясь в дистанции контроля вражеского оперативника. В таком случае допустимой целью может быть только враг в дистанции контроля исполнителя. Это также можно делать с приказом «Скрытность» (Conceal).

Пистолетный шквал (Pistol Barrage) — 1 ОД
Выполните два бесплатных действия «Стрельба» этим оперативником. Это имеет приоритет над ограничениями действий. Для одного действия выберите его фузионный пистолет, для другого — сюрикенный; порядок произвольный.
''')
result['cad5d0b5bd72d52d']={'titleEnglish':'The Killzone Mod User Manual','titleRussian':'The Killzone Mod — руководство','pages':pages}
(root/'ru-pdfs-root.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Prepared two complete text translations; manual illustration captions included.')
