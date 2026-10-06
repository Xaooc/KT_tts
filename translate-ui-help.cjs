const fs=require('fs');
const dictionary=JSON.parse(fs.readFileSync('ru-ui-extra.json','utf8'));
const items=JSON.parse(fs.readFileSync('inventory/pending-ui-strings.json','utf8'));
const help=items.find(x=>x.english.startsWith('This object records Kill team game events for:'));
if(!help)throw Error('Expected help text missing');
dictionary[help.english.trim()]=`Этот объект записывает события партии Kill Team:
  • перемещения;
  • броски кубиков;
  • приказы;
  • раны;
  • изменения состояния игровых объектов: дверей и маркеров целей;
  • жетоны с тегом KTUIToken.

Кнопки «Назад» (Back) и «Вперёд» (Forward) в правом нижнем углу экрана позволяют отменять и повторять события.

Кнопка «Отправить игру» (Send game) сохраняет историю партии удалённо: обрабатывает журнал и публикует часть игровой статистики в канале #kt-tts-bot на Discord-сервере Wargames Castellano.

https://discord.gg/wargamescastellano

Приятной игры!`;
fs.writeFileSync('ru-ui-extra.json',JSON.stringify(dictionary,null,2));
