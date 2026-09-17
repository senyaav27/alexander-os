# Alexander AI V0.1 — implementation plan

One cloud-deployable TypeScript service provides the API and Telegram webhook; one worker claims durable jobs from PostgreSQL. Alexander OS remains a static PWA and emits only `alexander-ai-snapshot/v1` DTOs when AI Sync is enabled.

The vertical slice is: PWA allowlist → authenticated snapshot API → PostgreSQL → deterministic finance/project/rule checks → durable alert/daily-brief job → Telegram. Natural-language questions use one OpenAI Agents SDK agent with a bounded, precomputed context. Explicit research requests can use only the hosted OpenAI web-search tool. No SQL, generic HTTP, external-write, money or advertising action is exposed to the model.

V0.1 stops at deployment and real-secret configuration. Future integrations and approval-gated actions are deliberately outside scope.
