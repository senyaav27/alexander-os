# Alexander AI V0.1 — senior review, 2026-09-17

Review base: `feat/alexander-ai-v0-1`, commit `aebdd36`. Changes remain uncommitted and unstaged. No push, deployment or real credentials were used.

## Verdict

**READY for owner-controlled V0.1 live setup.** Node 22 Docker build, all 34 unique tests, real PostgreSQL 17.11 TCP smoke tests, repeated migrations, concurrent workers/quotas, recovery and volume persistence passed. No live deployment or external API exchange was performed.

The next owner action is to review the changes and follow `SETUP_MAC.md` to enter live credentials locally when ready. The synthetic review stack is separate from live setup.

## Confirmed defects fixed

1. Telegram updates previously ran after an immediate 200 response, with no durable enqueue/deduplication. Updates are now authenticated, restricted to a private chat matching the allowed numeric sender, and committed before acknowledgement. Replays enqueue once.
2. No persisted daily OpenAI quota or bounded output existed. Attempts now reserve one of 20 UTC-day slots in PostgreSQL, including failures. Output is capped at 1,800 tokens; one turn, two hosted search calls, bounded context and 45-second timeout. OpenAI HTTP retries are explicitly disabled. A failure regression initially observed three HTTP calls despite Agents SDK retry=0; this is fixed using a compatible OpenAI client.
3. Worker jobs could remain `running` forever; daily scheduling was non-atomic and missed the entire day after an outage. Jobs now reclaim stale five-minute leases, stop at three attempts and use a unique daily job key with same-day catch-up. The worker loop no longer overlaps its own ticks.
4. A generated answer was not persisted before delivery. It is saved in the job payload before Telegram send, and retries reuse that answer. Completed jobs clear their payload.
5. Memory tables were unused. Recommendations, decisions from explicit feedback, feedback, agent runs and explicit facts with provenance are saved and bounded memory is supplied to ordinary questions. Goals/projects remain in stored snapshots. `/rules` reads stored rules.
6. Expected/received income was deducted as obligations, investments counted as available cash, future transactions counted, and month targets did not use the OS month override. The DTO now includes obligation type and target month, and cash/cent arithmetic/month boundaries are deterministic. A previous month's target becomes unknown.
7. Monitoring matched project substrings/only the first project and could treat questions as commands. It now requires an explicit instruction, exact project name and evaluates all matching projects; unsupported compound rules fail visibly. Cooldown rows are locked in the transaction.
8. Cyrillic research activation used an unsuitable word boundary; search-enabled runs received private snapshot context. Research now starts only from explicit request prefixes and receives no snapshot/memory. Ordinary questions have no tools. Tracing and response storage are disabled.
9. Snapshot validation allowed arbitrary metric names/unbounded text and weak dates. It now bounds inputs, enforces metric names and known private categories, omits conflicting AI-note tags, redacts common secret patterns, binds the sync token to its endpoint and rejects insecure remote HTTP/redirects. Imported advertising input values are escaped to prevent HTML injection.
10. Docker/Compose had an invalid/missing workspace declaration, localhost database address inside containers and no health/migration dependency. These are corrected. Render service secrets are linked, migrations serialized, private database access constrained and internal/external TLS behavior distinguished.
11. The original reported 19 tests represented only 10 unique cases because test modules imported another test module for fixtures. Fixtures now live in a separate file.

## Checks actually run

Final Docker verification (2026-09-17): Node **22.23.2**, PostgreSQL **17.11**, Docker Engine **29.8.0**. Production Docker build and build-stage `pnpm test` passed: **34 unique tests, 0 failures/skips**. PostgreSQL and API became healthy; migration exited 0 before API/worker started. Migrations succeeded twice before smoke and twice again against populated data.

Real TCP checks passed: locked oldest row skipped using `SKIP LOCKED`; stale running recovery and attempt ceiling; two separate Node worker processes handled 40 jobs exactly once in this test and persisted every reply before mock send; eight competing quota processes admitted exactly two; eight repeated HTTP updates enqueued once. Two actual Compose worker replicas delivered eight distinct alerts without duplicates. Snapshot, facts/recommendations, feedback/decisions, quota and update rows survived restart and container recreation via `down` (without `-v`) / `up`. Quota remained exhausted after recreation. These normal-run concurrency checks do not imply exactly-once delivery across a crash.

Earlier checks retained for context:

- Node.js v24.19.0, pnpm 9.15.9: `pnpm run build` PASS.
- `pnpm run test`: **34 unique tests, 34 PASS, 0 FAIL, 0 SKIP**. Includes 14 PGlite/HTTP/mock-SDK integration cases; no duplicate test registration.
- `node --check app.js`, `node --check sw.js`, `git diff --check`: PASS.
- Production-only install in an isolated directory using pnpm 9.15.9, `--frozen-lockfile --ignore-scripts`: PASS. This is a macOS dependency install, not a Linux Docker build.
- Render YAML validates against the official Render JSON schema; Compose/workspace YAML parses. These are static checks, not a deployment.
- Browser smoke on a fresh local origin: Home, Finance, Tasks, Projects, Progress and AI Sync settings render; sync is off; no captured browser console errors. Not an exhaustive OS regression or backup/import test.
- Heuristic secret scan of 286 text blobs across all local Git refs: no matches for real-looking OpenAI/Telegram/GitHub credentials or private keys. Only `.env.example` is tracked. This is not proof that every arbitrary secret format is absent.

## SQL paths actually exercised

PGlite runs the schema without substitutions. Tests cover repeated migration and database reopen, snapshot insert/retrieval/exact-retry deduplication, rules/cooldown/alert enqueue, update deduplication and rollback, UTC quota reservation, daily uniqueness, stale job recovery/attempt cap, memory/feedback/decisions/provenance, reply persistence before send and deterministic worker delivery. Real loopback HTTP tests use the Express handlers and the PGlite-backed adapter. SDK/Telegram transports are mocked; no paid calls occurred.

The PGlite adapter serializes transactions through one connection. The final real PostgreSQL TCP tests above separately verify locks/concurrency and clean restart/recreation durability. PostgreSQL TLS handshakes, abrupt host/power-loss durability, Render deployment and live Telegram/OpenAI exchanges remain untested.

## Remaining scope limits and risks

- Final Compose stop left the API with exit 137 (OOMKilled=false); graceful HTTP shutdown/draining is not implemented. PostgreSQL and workers stopped with exit 0. Saved-data restart/recreation checks passed; abrupt host/power-loss was not tested.

- At-least-once Telegram delivery: a crash after delivery but before marking the job done can duplicate a notification. A crash before reply persistence can repeat generation within the persisted quota.
- A request quota is not a dollar billing cap; pricing and the owner-selected model still affect cost.
- Private categories/modules are excluded structurally. Arbitrary sensitive prose inside allowed titles/notes or a direct research request cannot be guaranteed absent by an allowlist/regex. User-selected text needs care. Search has no OS/memory context, but sees the explicit research request.
- Prompt injection can affect answer wording; it cannot create absent SQL/HTTP/write tools. No external write tools are exposed to the LLM. Telegram delivery is performed only by application code to the configured owner.
- Single-metric rules only; compound budget/purchases rules are rejected. Feedback attaches to the latest recommendation; “why” repeats its stored explanation. No automatic extraction of every decision from chat.
- Financial output uses a partial, last-synced dataset; health/private expenses are absent, cash is conservative, and it is not a full OS/bank reconciliation.
- No new milestone, integrations or architecture expansion was implemented.

Deployment configuration references: [Render Blueprint specification](https://render.com/docs/blueprint-spec), [Render PostgreSQL TLS behavior](https://render.com/docs/postgresql-creating-connecting). Both were checked during review; static validation does not substitute for a live Render deployment check.
