# GATE 0: отдельная тестовая сборка — на подтверждение

Версия `15.8.8-gate0-review`, существующая PWA из PR #4. **Пакет подготовлен локально; сайт, Cloudflare-проект, Google-проект, OAuth client и таблица агентом не создавались. Публикация/подключение запрещены до отдельного подтверждения владельца.**

## Выбранный способ и планируемый адрес

Cloudflare Pages **Direct Upload**, новый отдельный проект `alexander-os-gate0-test`.
Планируемый origin: `https://alexander-os-gate0-test.pages.dev`.
Он нами не зарегистрирован, доступность имени не проверена. Если Cloudflare предлагает случайный суффикс или другое имя — остановиться, согласовать точный новый origin и пересобрать пакет. Не использовать существующий проект, preview alias или custom domain.

Нельзя разместить тест просто в другом пути/репозитории на рабочем хосте: например, `https://senyaav27.github.io/alexander-os/` и `https://senyaav27.github.io/aos-test/` имеют один origin. Здесь нужен другой hostname, не новый путь. Собственный домен/DNS, GitHub Pages settings, main и действующий сайт не меняются.

Планируемая стоимость — **$0**: Cloudflare Pages Free, только статические файлы, без Workers/Functions, платного backend, AI API или покупки домена. Google Sheets/тестовая OAuth-конфигурация не требуют подключения платных ресурсов для этого сценария. Billing не включать. Перед созданием проверить доступность Free в своём аккаунте; предложение платного плана/обязательного billing — причина остановиться, а не согласие на оплату.

Права: владельцу нужен доступ создать **новый** Pages-проект и вручную загрузить его статические assets. Агенту сейчас не нужны Cloudflare API token, DNS-права, GitHub integration, client secret или доступ к рабочему Google Drive. Direct Upload не требует выдавать Cloudflare доступ к репозиторию. Если публикацию делает владелец через dashboard, передавать credentials агенту не нужно.

Риски/границы:

- Сайт и исходники статического пакета публичны. `noindex` не является авторизацией. Поэтому только B0; реальный финансовый JSON не загружать и не вводить.
- Браузерное хранилище отделено origin и дополнительно префиксом `gate0_test__`; service worker и cache имеют тестовую идентичность. Другой origin блокируется до запуска приложения. Это защита от ошибочного размещения, не от злоумышленника, редактирующего свой JS.
- Google в первоначальном пакете отключён. Разрешение размещения само по себе **не** разрешает Google login/API.
- Scope текущего GIS клиента `https://www.googleapis.com/auth/spreadsheets` даёт доступ не к одной таблице, а ко всем доступным таблицам вошедшего Google-аккаунта. Ограничение ID в тестовом клиенте — дополнительный guard, не серверная OAuth-граница. Нужен отдельный Google-аккаунт **без рабочих документов**.
- В Direct Upload проекте нельзя впоследствии просто переключить режим на Git integration: для этого потребуется другой проект. Для одноразовой приёмки автоматический deploy не нужен.
- iPhone, реальный HTTPS-hosting, Google OAuth и настоящая двухклиентная блокировка пока не проверены. Локальные Chromium/mocks не закрывают GATE 0.

Официальные источники: [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Pages Free limits](https://developers.cloudflare.com/pages/platform/limits/), [Sheets API limits](https://developers.google.com/workspace/sheets/api/limits), [Google OAuth client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid). Cloudflare-условия сверены также с официальным `cloudflare/cloudflare-docs`; страницы Google из текущей среды возвращают 403, поэтому названия экранов Console ниже могут незначительно отличаться.

## Что подготовлено и как воспроизвести без публикации

Из корня репозитория:

```sh
node scripts/prepare-gate0-test.mjs
```

Команда только читает текущие reviewed assets и пишет новый каталог `/tmp/aos-gate0-test-<buildId>/site`. Никаких network/upload/login команд нет. В checkout ничего не перезаписывает. Отчёт выводит `published: false` (команда не публиковала; это не проверка существования сайта у провайдера), `googleEnabled: false`, origin, version, buildId и путь. `_aos-build.json` фиксирует исходный commit, SHA256 исходных/выходных файлов. Повтор идентичной сборки даёт те же байты; неизвестные/отличающиеся файлы в output не перезаписываются.

Пакет включает только используемые HTML/CSS/JS, manifest, иконки, service worker, guard, `B0.json`, `_headers`, `404.html` и build manifest. В него не входят `.git`, `.github`, backend, `.env`, node_modules, старые installers и рабочие exports. По запросу владельца получить скачиваемый ZIP добавлена выдача пакета через GitHub Actions artifact: только после успешных тестов при push в ветку GATE 0, срок хранения 7 дней. Это передача файла в существующем репозитории, не публикация сайта; Google выключен, deploy job отсутствует. Для скачивания artifact нужен вход в GitHub.

Отличия **только тестовой копии**, бизнес-код рабочей PWA не изменён:

1. Проверка точного origin перед запуском каждого JS/inline bootstrap; на другом origin нет инициализации состояния или service worker.
2. Namespaced localStorage/security/sync/journal keys; отдельный cache и PWA name `AOS TEST B0`, видимая отметка TEST B0.
3. При первом запуске синхронно создаётся только фиксированный B0. Существующая тестовая сессия не перезаписывается при reload.
4. Backup без маркера `testDataset: B0-synthetic/v1` не импортируется; копии/варианты B0 можно использовать для негативных тестов. «Вернуть B0» восстанавливает только локальный B0, не очищает Google.
5. В disabled-пакете Google login и внешние fetch заблокированы; `_headers` задаёт CSP без Google connect/script/frame sources.
6. В отдельно разрешённом Google-enabled пакете принимаются только утверждённые Client ID и Spreadsheet ID; токены не вшиваются и client secret не используется.

## B0: точный синтетический набор

Дата фиксирована: 2026-11-02. Если выбран другой месяц в UI, переключить на ноябрь 2026; не менять данные ради текущей даты.

| Сущность | ID | Значение |
| --- | --- | --- |
| Счёт A | `b0-account-a` | `B0 A`, начальные 10 000 ₽; после операций/перевода 10 389 ₽ |
| Счёт B | `b0-account-b` | `B0 B`, начальные 0 ₽; после перевода 500 ₽ |
| Расход | `b0-expense-111` | 111 ₽, счёт A |
| Доход | `b0-income-1000` | 1 000 ₽, счёт A |
| Перевод | `b0-transfer-500` | A → B, 500 ₽ |
| Задача | `b0-task` | `G0-task`, без даты, todo |
| Заметка | `b0-note` | `G0-note`, синтетический текст |

Всего: 2 счёта, 2 операции, 1 перевод, 1 задача, 1 заметка. Сумма счетов **10 889 ₽**. Внутренний `baseBalance` A = 9 500 ₽ и B = 500 ₽: существующая модель учитывает перевод через базовые балансы, а не второй доход/расход. Это специально проверено на реальном коде загрузки PWA.

## Проверки подготовки

`node tests/gate0.test.cjs` — 27 тестов; `node tests/gate0-test-build.test.cjs` — 7 тестов; `python3 tests/gate0-browser.py` — 9 групп; `python3 tests/gate0-isolation-browser.py` — 5 групп. Проверяются детерминированность B0/сборки, сохранность checkout (включая symlink), allowlist файлов, namespaces, отдельный cache, отказ на неверном origin, блокировка обычного backup, отсутствие Google запросов и ограничения разрешённого test ID на fetch mock. В двух-origin Chromium тесте используются **локальные HTTP loopback origins** с явным `--allow-loopback-for-tests`; это не проверка реального HTTPS-hosting/iPhone. Обычная команда сборки принимает только отдельный HTTPS `*gate0*.pages.dev` origin.

## После подтверждения №1: только отдельный HTTPS-hosting

1. Создать **новый пустой** Pages Direct Upload project, не изменять существующие. Проверить фактически выданный hostname до upload. Если dashboard объединяет создание и deploy и не позволяет проверить origin заранее — не нажимать Deploy; сначала создать пустой проект через разрешённый владельцем способ. Имя/суффикс, отличающийся от согласованного, требует нового подтверждения.
2. Пересобрать default disabled-пакет для согласованного origin. Проверить `_aos-build.json`: версия, commit, origin, `googleEnabled=false`, SHA256.
3. Загрузить **содержимое** `site` в этот новый проект; без Git integration, custom domains, Functions и auto-deploy. Надпись Cloudflare «production deployment» относится только к новому тестовому проекту, не к действующей Alexander OS.
4. Открыть точный HTTPS origin в Safari iPhone. Проверить TEST B0, B0-балансы и PWA name, затем offline/JSON тесты из [GATES.md](GATES.md#ручная-приёмка-iphone-и-отдельная-тестовая-google-таблица). Рабочую PWA/её storage не трогать.
5. До отдельного подтверждения №2 Google остаётся отключённым даже при нажатии «Войти».

## После подтверждения №2: тестовая Google Таблица и OAuth

### A. Аккаунт и таблица

1. Использовать отдельный тестовый Google-аккаунт без личных/рабочих таблиц. На обоих устройствах входить именно им. Рабочий аккаунт в popup не выбирать.
2. В Google Sheets создать новую пустую таблицу `AOS GATE0 B0 TEST — 15.8.8`.
3. Share → General access → **Restricted**; не публиковать таблицу в интернете, не выбирать Anyone with link. Если тестируется второй пользователь, явно добавить только его тестовый аккаунт как Editor. Для двух устройств одного человека второй пользователь не нужен.
4. Оставить обычный пустой `Sheet1`. Не создавать заранее `AOS_*` и `_AOS_SYNC_LOCK_V1`: клиент создаёт служебные листы сам.
5. ID взять из `https://docs.google.com/spreadsheets/d/<ID>/edit`. Это ID только новой тестовой таблицы. Не использовать существующую финансовую таблицу и не импортировать её содержимое.

### B. Google Cloud и OAuth client

1. В Google Cloud Console создать отдельный проект `aos-gate0-test`. Не использовать рабочий OAuth client. Не привязывать billing/не включать платные API.
2. APIs & Services → Library → **Google Sheets API** → Enable. Drive API, Calendar API, Gmail и service accounts для этого теста не нужны.
3. Google Auth Platform / OAuth consent screen:
   - Branding: имя `AOS GATE0 TEST`, тестовый support email/contact.
   - Audience: **External**, publishing status **Testing**; не переводить в Production.
   - Test users: добавить точный email тестового аккаунта (и второго, только если нужен).
   - Data Access / Scopes: только `https://www.googleapis.com/auth/spreadsheets`. Scope широкий; изоляция реальных документов обеспечивается отдельным пустым аккаунтом, не одним URL таблицы.
4. Clients / Credentials → Create OAuth client → **Web application**. Имя `AOS GATE0 TEST Web`.
5. Authorized JavaScript origins: **ровно** `https://alexander-os-gate0-test.pages.dev` — только после проверки фактически созданного и согласованного hostname. Без завершающего `/`, пути, wildcard, production-origin, localhost и preview aliases.
6. Authorized redirect URIs: оставить пустыми. Текущий код использует `google.accounts.oauth2.initTokenClient` и popup token flow; backend callback/client secret не нужны. Не добавлять выдуманный `/callback`.
7. Сохранить **Client ID** вида `...apps.googleusercontent.com`. Client secret не копировать в приложение, репозиторий, чат или build. Client ID публичный идентификатор; его наличие не выдаёт доступ к таблицам.

### C. Только затем разрешённая Google-enabled сборка

После подтверждения origin, отдельного аккаунта/Testing client и тестовой таблицы владелец передаёт только публичные test Client ID и Spreadsheet ID через согласованный способ. Без access token/client secret.

```sh
node scripts/prepare-gate0-test.mjs \
  --origin 'https://alexander-os-gate0-test.pages.dev' \
  --enable-google \
  --client-id 'REPLACE_WITH_TEST_CLIENT_ID.apps.googleusercontent.com' \
  --spreadsheet-id 'REPLACE_WITH_TEST_SPREADSHEET_ID'
```

Эта команда тоже только локально готовит пакет, не публикует и не входит в Google. Загрузка нового пакета на тестовый хост — отдельное действие после разрешения. Реальные test IDs будут видны в статическом JS, поэтому доступ к таблице должен оставаться Restricted; данные только синтетические.

После разрешённого размещения обновлённого пакета открыть его online, проверить origin/build marker, нажать Google → «Войти через Google» и выбрать тестовый аккаунт. Первый login сразу запускает sync текущего B0. Не нажимать login, пока в хранилище не проверен B0.

Ожидается: `AOS_Операции` — 2 записи; `AOS_Переводы` — 1; `AOS_Обязательства` — 0; `AOS_Счета` — 2 с 10 389 ₽/500 ₽. После успеха временного lock-листа нет. Далее выполнить таблицу приёмки в GATES.md. При ошибке popup/origin/403/401 сохранить точный текст и остановиться; не подставлять рабочий OAuth client и не ослаблять глобальные настройки Safari.

## Очерёдность GATE 1/2 — зафиксировано, сейчас не выполняется

Замечание PR #5 прочитано: GATE 1 на момент head `84745a3` отставал от GATE 0 на 3 коммита; GATE 2 основан на старом GATE 1. Подготовка тестового пакета добавит ещё изменения GATE 0. Сейчас эти ветки не обновляются: сначала реальная приёмка GATE 0 (HTTPS/iPhone/JSON/Google/two-device), затем согласованный итог GATE 0.

После приёмки: fetch актуальных heads → интегрировать принятый GATE 0 в существующую ветку PR #5 → сохранить актуальный frontend и backend bridge/security → повторить GATE 0, build/isolation/browser и backend tests → обновить существующий PR #6 новым GATE 1 → повторить все тесты и отдельную синтетическую PostgreSQL TCP/backup/restart проверку. Не переносить старый frontend PR #1, не переписывать историю/не force-push без необходимости. Обновить описания #5/#6 фактическими результатами. **Никакого merge в main или изменения рабочего сайта.**
