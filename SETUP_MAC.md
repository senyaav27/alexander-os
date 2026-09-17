# Alexander AI V0.1 — local verification and live setup

Do not send secrets to Codex chat or commit `.env`. No deployment or real credentials were used during review.

## 1. Verify locally before entering live credentials

Install Node.js 22, pnpm 9.15.9 and Docker Desktop. This Mac's system `node` was v8; check `node --version` in your own terminal before proceeding.

```bash
cd ~/Documents/Codex/alexander-os
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

The default tests include a test-only PGlite PostgreSQL WASM engine, synthetic fixtures, real loopback HTTP requests and mocked OpenAI/Telegram transports. They do not use your database or live keys. PGlite does not validate PostgreSQL TCP/TLS or locks between separate server processes.

Final local verification passed on 2026-09-17: Docker Node 22.23.2 image, all 34 unique tests, Compose with PostgreSQL 17.11, repeated migrations, real TCP concurrency/recovery/quota tests and volume persistence after restart/recreation. Only synthetic credentials and mocked transport were used; live Telegram/OpenAI and Render remain owner setup checks.

## 2. Configure the local services

Copy `.env.example` to `.env`. Set `AI_SYNC_TOKEN` to a locally generated value (`openssl rand -hex 32`). Leave OpenAI and Telegram fields empty during initial database/API verification. Never use a sample token for live operation.

```bash
cp .env.example .env
# Edit .env locally: set AI_SYNC_TOKEN; do not paste its value into chat.
docker compose up -d postgres migrate api worker
curl --fail http://127.0.0.1:3000/health
docker compose logs migrate api worker
```

Compose binds local ports to 127.0.0.1, uses the `postgres` hostname inside containers, waits for database health, then runs the migration before API/worker. The example database password is for this loopback-only development database, never a cloud credential. Without a bot token, Telegram jobs will not deliver and eventually fail after three attempts.

Alternatively, run only `docker compose up -d postgres`, then `pnpm db:migrate`, `pnpm dev` and `pnpm worker` in separate terminals. For these host processes use the example `localhost` database URL.

## 3. Telegram and OpenAI

Create a bot with BotFather. Set its token, your numeric user ID and a separate generated `TELEGRAM_WEBHOOK_SECRET` (at least 24 URL-safe characters). All three must be present together. The bot accepts only direct private-chat messages whose sender and chat ID equal your allowed user ID.

Set `PUBLIC_BASE_URL` to the public HTTPS API URL. API startup registers the webhook. Local loopback alone is not reachable by Telegram; use the cloud endpoint for live Telegram verification. Keep `PUBLIC_BASE_URL` empty before this step.

Put `OPENAI_API_KEY` on the worker. Defaults: `gpt-5-mini`, 20 AI attempts per UTC day, at most one model turn, 1,800 output tokens, two hosted search calls, 45-second timeout, no HTTP retries. Failures consume a daily slot. Set `OPENAI_DAILY_REQUEST_LIMIT=0` to stop model requests while deterministic commands, alerts and briefs keep working. This is a request/token bound, not a currency-denominated OpenAI billing cap.

Incoming Telegram updates have durable deduplication and an admission cap of 100 accepted updates in a rolling day. Above this cap new updates are ignored until capacity is available.

## 4. Render configuration (prepared, not deployed)

The Blueprint contains a web service, a separate worker and PostgreSQL 17 in one region. Review the selected paid plans and backup retention before creating any resources. Deployment and credentials entry are owner actions, not part of this review.

Enter the same `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_USER_ID` for API and worker. Generated webhook/sync secrets are referenced by the worker from the API service. Both services run the serialized, repeatable migration before deployment. The OpenAI key is needed only on the worker.

`DATABASE_SSL=render-internal` is explicitly restricted to Render's private `dpg-...` hostname. It requires TLS but accepts Render's self-signed internal certificate. External hosts must use `DATABASE_SSL=true` with certificate verification. External database access is disabled by `ipAllowList: []`. See [Render connection/TLS documentation](https://render.com/docs/postgresql-creating-connecting) and [Blueprint specification](https://render.com/docs/blueprint-spec).

Verify `/health`, migration logs and worker logs after setup. Then verify an actual private Telegram `/brief`, a repeated update, a monitoring alert, and a daily brief. Multi-process job claiming and quota admission passed the separate real PostgreSQL review smoke tests. Repeat those checks if changing queue or quota behavior; PGlite alone does not prove concurrency.

## 5. Connect Alexander OS

Open Settings → Alexander AI. Enter the HTTPS backend URL, sync token, enable sync, save, then use “Синхронизировать сейчас”. HTTP is allowed only for localhost/127.0.0.1 in local testing. The token is bound to the configured endpoint; re-enter it if the endpoint changes. This prevents an imported state from silently redirecting an existing token.

Only the explicit DTO is sent. Health/security/private transaction categories and notes with those tags are excluded; a note must have the exact `ai` tag to be shared. Security, health modules, backups, history and account names are not part of the DTO. Arbitrary sensitive content manually typed into an otherwise permitted title or AI note cannot be identified reliably by an allowlist: do not place secrets or health data there. Redaction covers common key/token/card patterns, not every possible secret.

The DTO includes obligation type and the active month's income target. Cash excludes investments, the cushion and all open payment/debt obligations. Expected income is not deducted. Expense totals exclude private categories and can differ from the full OS totals. A target from a previous month is reported as unknown, not reused for the new month.

## 6. V0.1 interactions and limits

- `/brief`, `/status`, `/finance`, `/projects`, `/rules` use stored data without OpenAI.
- `Следи за CPA RIFT, если выше 700` stores a single-metric threshold. Project names match exactly (case-insensitive). Compound conditions/percentages are rejected, never silently simplified.
- `полезно`, `не полезно`, `сделал`, `отклоняю` apply to the latest saved recommendation. `почему?` repeats its stored text, not a new model explanation. `запомни: ...` stores an explicit fact with Telegram provenance. This is bounded structured memory, not full chat history.
- Requests beginning `Найди`, `Исследуй`, `Проверь`, `research` or `web research` enable hosted web search. That run gets only the user's request, with no OS snapshot or memory. Describe the public research subject explicitly; “this project” has no private context in research mode.
- Daily Brief uses deterministic calculations and the latest stored snapshot; it does not run OpenAI autonomously. It can catch up later on the same local day after the configured hour.
- Worker jobs reclaim stale locks after five minutes and stop after three attempts. A generated reply is saved before delivery and reused on transport retry. Telegram delivery is at-least-once: a crash after Telegram accepts a message but before database acknowledgement can duplicate delivery. A crash before reply persistence can repeat generation, still within the persisted daily quota.
- No SQL, generic HTTP/browser, financial or advertising write tool is exposed to the LLM. Prompt-injection defenses constrain capabilities; they do not guarantee that model wording cannot be influenced by untrusted text.
