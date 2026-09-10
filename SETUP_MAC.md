# Alexander AI V0.1 — setup on Mac and Render

Do not paste secrets into Codex or commit `.env`. The application needs: an OpenAI API key, a Telegram bot token, your numeric Telegram user ID, a generated webhook secret, a generated AI sync token, and a PostgreSQL connection URL.

## Local verification

Install Node.js 20+ (22 recommended), Docker Desktop and pnpm. Then:

```bash
cd ~/Documents/Codex/alexander-os
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm test
pnpm dev
```

In a second terminal run `pnpm worker`. Fill `.env` locally. Generate both secrets with `openssl rand -hex 32`. `AI_SYNC_TOKEN` is entered in Alexander OS settings and is stored separately from its main state. Health-category transactions are excluded from AI snapshots; their totals therefore intentionally do not appear in AI financial analysis.

## Telegram

Create the bot with BotFather, put its token in the cloud secret manager as `TELEGRAM_BOT_TOKEN`, and put only your numeric ID in `TELEGRAM_ALLOWED_USER_ID`. The backend rejects every other sender. Set `PUBLIC_BASE_URL` to the HTTPS API URL. On API startup the webhook is registered with `TELEGRAM_WEBHOOK_SECRET`.

## Cloud deployment (minimal managed setup)

The included `render.yaml` defines an HTTPS web service, worker and managed PostgreSQL. Create a Render Blueprint from this repository, review the paid plan/backups, then set the unsynced secrets in Render. Run the pre-deploy migration, verify `/health`, and keep both web and worker services running. Enable PostgreSQL backups in the Render dashboard according to the retention you need.

## Connect Alexander OS

Open Settings → Alexander AI. Enter the HTTPS backend URL and the same `AI_SYNC_TOKEN`, enable sync, save, then use “Синхронизировать сейчас”. Only notes tagged exactly `ai` are shared. Confirm the successful timestamp, then send `/brief` to the Telegram bot.
