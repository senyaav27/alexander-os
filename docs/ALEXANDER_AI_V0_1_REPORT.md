# Alexander AI V0.1 — technical report

## Delivered

- Authenticated, strictly validated and versioned snapshot ingestion.
- Allowlisted PWA snapshot with opt-in, debounce, manual fallback and last-sync state.
- PostgreSQL memory tables for snapshots, decisions, recommendations, rules, runs, feedback, facts and durable jobs.
- Deterministic finance/project calculations, advertising threshold rules and snapshot-triggered alert jobs.
- Telegram webhook restricted to one numeric user ID; commands and ordinary-language questions.
- One Chief of Staff built on the OpenAI Agents SDK, using precomputed context and hosted web search only for explicit research requests.
- Independent worker for daily briefs, alerts and retryable PostgreSQL jobs.
- Redacted errors, no raw financial snapshot logs, no LLM SQL or generic network tool.
- Docker/Render deployment configuration and synthetic tests.

## Verification

TypeScript build, frontend syntax check and repository whitespace check pass. The local test suite passes 19/19 tests, including deterministic finance calculations, project bottlenecks, snapshot allowlisting, secret redaction, natural-language monitoring rules, snapshot-triggered CPA alert evaluation, Daily Brief, an in-process synthetic vertical flow and a mocked Telegram send. A real PostgreSQL/Telegram/OpenAI run remains part of owner setup because this Mac currently has no Docker command and no credentials were requested or used.

## Boundaries

V0.1 is read/analyze/recommend/notify only. It cannot transfer or invest money, purchase, change ads, delete user data, sign contracts, or send messages as the user. Research uses the hosted OpenAI web-search tool only when the Telegram request explicitly asks to find/research/check online; no generic browser/HTTP tool is exposed.

## Live setup remaining

Real OpenAI, Telegram, PostgreSQL and cloud values must be entered by the owner following `SETUP_MAC.md`. A live Telegram end-to-end run is intentionally not possible without those secrets; the alert pipeline is covered with synthetic data and deterministic tests.
