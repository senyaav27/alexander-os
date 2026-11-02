# Alexander OS: проверяемые этапы (issue #3)

База: main `94e0a08`, интерфейс V15.8, схема состояния 14.3.
PR #1 `93c7bd4` содержит полезный backend, но его frontend устарел.
Не запускать `install-v16.mjs` и `apply_sync_hotfix.py` на текущей версии.

| Источник | Роль | Ограничение |
| --- | --- | --- |
| PWA localStorage | Основное состояние устройства, JSON backup/export | Не является многопользовательской БД; сбой записи требует экспорта открытой сессии |
| Google Sheets | Односторонняя финансовая проекция | Не импортируется автоматически; расхождения блокируют запись |
| PostgreSQL (следующий этап) | Snapshot, память, решения, задания, аудит | Пока не источник истины финансов; автоматическая миграция запрещена |

## GATE 0

- Повреждённый JSON сохраняется без перезаписи. Постоянное предупреждение о сбое хранения; последняя сессия доступна для экспорта.
- Сравнение исходных байтов предотвращает перезапись из устаревшей вкладки при последовательных сохранениях. Это не распределённая блокировка.
- Импорт проверяет структуру, ID и финансовые суммы; сначала сохраняет оригинальные байты и backup текущей сессии; не объявляет успех при отказе записи.
- Sheets проверяет полный набор столбцов, ID и checkpoint предыдущей синхронизации. Одно атомарное `spreadsheets.batchUpdate` заменяет раздельные write/clear; затем полный readback. Pending checkpoint допускает повтор после неясного результата.
- Удаление удалённых строк приостановлено даже при наличии корзины. Восстановление/старый snapshot не дают права удалять Google-строки.
- Последние 50 результатов sync сохраняются локально в `aos_sheets_audit_v1`; не публикуются в GitHub.
- Sheets и brand CSS включены в precache; изменённые ресурсы версионированы. Пользовательские/старые кеши не удаляются при загрузке/активации.

Проверки: `node tests/gate0.test.cjs`; `python3 tests/gate0-browser.py`
(Chromium + Python Playwright, либо `uv run tests/gate0-browser.py`).
Синтаксис: `for f in *.js *.mjs; do node --check "$f" || exit; done`.
Тесты используют только синтетические записи; browser test открывает временный профиль и локальный сервер, не обращается к Google.

Осталось до закрытия GATE 0: реальный iPhone, OAuth expiry и readback на отдельной тестовой Google-таблице; 7 дней наблюдения; разрешение конфликтов. Google Sheets API не предоставляет используемому клиенту compare-and-swap: два устройства могут одновременно пройти проверку checkpoint. До server-side single-writer/lock синхронизация с нескольких устройств не считается безопасной. Серверная атомарность запроса не решает этот конфликт.

### Проверка на iPhone после разрешённого обновления

1. В текущем приложении экспортировать полный JSON; убедиться, что файл доступен вне PWA. Не удалять PWA, localStorage, кеш и не вводить повторно пропавшие операции.
2. На отдельном профиле/устройстве восстановить копию, сверить количество и ID задач, операций, счетов, переводов, обязательств, заметок и балансы. Не импортировать поверх единственной рабочей копии.
3. Для теста Google использовать отдельную таблицу и синтетические записи. Проверить offline → online, повторный вход OAuth, повтор sync, изменение суммы вручную, конфликт и запрет удаления. Не включать второй writer.
4. При ошибке persistence экспортировать именно открытую сессию до закрытия. Не считать отсутствие строк доказательством отсутствия расходов.

## Следующие безопасные границы

GATE 1: перенос backend PR #1 отдельно от фронтенда; локальные build/SQL/security tests; аутентифицированный allowlist snapshot текущей PWA, без сохранения токена в export. Live Telegram/OpenAI и production требуют отдельного разрешения, приватной БД, проверенного TLS и backup/restore.

GATE 2: версионируемая память с provenance, correction и отменой; журнал решений, каталог источников со scope/freshness; очередь действий и append-only audit. Read-only по умолчанию. Никаких внешних writes только на основании текста модели.

GATE 3–4: Calendar — read-only OAuth scope и только выбранный календарь; финансовые источники — свежесть/полнота и reconciliation; SenyaMarketing, TVOЁ, RIFT — отдельные scopes, явные списки разрешённых проектов, без переноса контекста работодателя. Рекомендация должна иметь источник, дату, один следующий шаг и критерий проверки. Не создавать scheduler/уведомления, дублирующие существующие автоматизации.

### Подготовленное ядро GATE 1

Backend и его 34 теста перенесены из PR #1 без старого frontend, Docker/Render deployment не выполняется. `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`. `pnpm dev` / `pnpm worker` требуют отдельную PostgreSQL и миграцию `pnpm db:migrate`. Рабочую БД пользователя тесты не используют. SQL-тесты используют PGlite: это PostgreSQL WASM, не доказательство TCP/TLS или многопроцессных блокировок.

`window.AlexanderAI.snapshot()` формирует allowlist DTO текущего приложения; `connect(origin, token)` держит credential только в памяти вкладки, `sync()` отправляет его явно, `disconnect()` забывает credential. По умолчанию запросов нет, автоматической отправки нет, пользовательский UI не заменён. Настройка end-user интерфейса подключения ещё предстоит. Для браузера backend требует точный HTTPS `PWA_ORIGIN`; owner token не должен совпадать с sync token. Токены и реальные данные не помещать в консольные логи или GitHub.

Проверено на синтетике: 34 backend теста (в том числе миграции, HTTP authorization, snapshot dedup, SQL persistence/reopen, quota, worker retry, Telegram authorization), build, 15 GATE 0 тестов и браузерный сценарий. Telegram/OpenAI transport замокан, не live. Для Google нужен отдельный single-writer протокол; для live backend — приватные секреты, PostgreSQL с доверенным TLS, защищённый backup/restore и отдельное разрешение deployment.

### Реализованный локальный контур GATE 2

`backend/src/records.ts`, `records-api.ts`, additive SQL migration:

- Каталог неизменяемых источников: provider, scope, reference, captured/expiry, отдельное разрешение использования в AI. Обновлённый источник регистрируется новой записью; подключений к внешним сервисам это не создаёт.
- Память: тип (fact/preference/hypothesis/principle/procedure/decision), последовательные ревизии, optimistic version, correction/retraction. Retrieval берёт текущую подтверждённую ревизию, только personal scope и одобренный непросроченный источник; тип памяти сохраняется. Старые версии остаются в owner export, но не в контексте AI.
- Решения: ожидание, выбор, срок проверки, отдельно зафиксированный результат. Действия: waiting_approval → approved/rejected → user_confirmed с evidence. Последнее означает подтверждение пользователя, а не исполнение сервером. Исполнитель внешних действий отсутствует; финансовые операции не поддерживаются.
- Idempotency key обязателен для owner mutations; повтор с новым содержимым или устаревшей версией возвращает 409. Аудит добавляется в той же транзакции; UPDATE/DELETE запрещены триггером.
- Owner API `/v1/owner/*` выключен без отдельного OWNER_API_TOKEN. Snapshot token не даёт к нему доступа. API не предоставляет generic SQL, shell, HTTP или tool execution.
- `/v1/owner/export` читает согласованную транзакционную копию записей, ревизий, решений, действий и аудита; для больших наборов требуется DB backup. Это не API физического удаления. Ретракция исключает запись из retrieval, не уничтожает историю.
- Подтверждённое Telegram «запомни» пишет в тот же версионируемый контур с dedup по update ID. Legacy important_facts сохранена без удаления, но автоматически в новый retrieval не мигрируется: если PR #1 где-то запускался с настоящими данными, нужен отдельный проверенный импорт.
- Daily scheduler выключен по умолчанию (`ENABLE_DAILY_BRIEF=false`), чтобы не дублировать существующие автоматизации. Устаревшие snapshots не создают monitoring alerts. Пустые/старые финансы в brief обозначены «нет подтверждения», без заявления о нулевых расходах.

Проверено: 48 backend tests, 15 GATE 0 tests, build, JS syntax, Chromium workflow. В том числе disk reopen и dump/restore синтетической PGlite БД, correction, scope, source expiry, duplicate requests, approval, immutable audit и пустые финансы. **PGlite не заменяет тест настоящей PostgreSQL по TCP, процессы server/worker и live OAuth/Telegram/OpenAI.** End-user UI управления памятью и безопасного входа в backend ещё не реализован; существующий интерфейс сохранён.

Границы безопасности: публичная PWA → authenticated snapshot ingress; owner client → отдельный owner API; Telegram → allowlisted user/webhook; worker → ограниченный provider; LLM/web → недоверенный текст без внешних write tools. Известные ограничения: статический frontend всё ещё имеет legacy native dialogs и localStorage; это не защита от XSS/получившего owner token клиента. Для production нужны отдельная DB role без DDL/TRUNCATE, ограничения доступа, ротация credentials, retention policy и проверка backup/restore настоящей БД. Данные с явно заданными scope work/private/health/security и aiExcluded исключены из PWA DTO; у старых записей scope может отсутствовать — перед реальным sync нужна проверка выбранных данных.

Порядок review веток: `feat/aos-gate0-data-integrity` → main; `feat/aos-gate1-backend` → gate0; `feat/aos-gate2-memory-audit` → gate1. Зависимые этапы нельзя независимо сливать в main, обходя GATE 0. Никакой merge/deployment не выполнялся.

### Дополнительная проверка настоящей PostgreSQL

`node --import tsx backend/test/postgres-smoke.ts` — PASS. Тест намеренно использует только отдельный контейнер `aos-gates-postgres-test`, loopback `55432`, синтетическую учётную запись и уникальные схемы; DATABASE_URL пользователя игнорируется. Перед запуском: локальный `postgres:17-alpine` с `POSTGRES_USER=aos_test`, `POSTGRES_PASSWORD=synthetic-local-test-only`, `POSTGRES_DB=aos_test`, port `127.0.0.1:55432:5432`, затем `pnpm build`. Не направлять этот тест в рабочую БД.

Проверены по TCP: две миграции подряд, HTTP owner API, два конкурентных исправления одной версии (200/409), отдельные процессы API/worker и их restart без дубля задания, restart контейнера PostgreSQL с восстановлением API, сохранность memory/audit, настоящий `pg_dump` → `psql` restore в другую синтетическую БД. Обработчик idle pool error не даёт процессу API завершиться при рестарте БД. Удаления рабочих данных не было; синтетические схемы оставлены для инспекции, тестовый контейнер после проверки остановлен.

Это локальный plain TCP, **не проверка production TLS, managed database, Telegram delivery или OpenAI billing**. Ранние проверки GATE 1 используют PGlite; этот дополнительный прогон относится к итоговой ветке GATE 2.
