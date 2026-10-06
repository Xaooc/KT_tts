Загрузка ассетов для сетевой игры в Tabletop Simulator

GitHub: создайте публичный репозиторий, загрузите содержимое этой папки (включая подпапки),
затем используйте базовый адрес:
https://raw.githubusercontent.com/<user>/<repo>/main/
Проверка URL: node relink-assets.cjs --base <URL> --check-urls <количество>. Ошибки HEAD записываются в relink-report.json.
Установка: добавьте --install, чтобы скопировать связанные файлы в Saves. При совпадении имён сохраняются обе версии.
Передавайте этот адрес скрипту relink-assets.cjs через --base.

Steam Cloud: загрузка через TTS Modding → Cloud Manager выполняется по одному файлу.
Для более чем 1300 файлов такой способ непрактичен.
