-- PostgreSQL 17 provides gen_random_uuid() without an extension.

CREATE TABLE IF NOT EXISTS ai_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version text NOT NULL,
  source_version text NOT NULL,
  captured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  checksum text NOT NULL UNIQUE,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_snapshots_received_idx ON ai_snapshots(received_at DESC);

CREATE TABLE IF NOT EXISTS monitoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text,
  metric text NOT NULL,
  operator text NOT NULL CHECK (operator IN ('gt','gte','lt','lte')),
  threshold numeric NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  cooldown_minutes integer NOT NULL DEFAULT 1440,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  source_text text NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), summary text NOT NULL, rationale text, status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS recommendations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), body text NOT NULL, context jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'proposed', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS user_feedback (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recommendation_id uuid REFERENCES recommendations(id), value text NOT NULL, detail text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS important_facts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fact text NOT NULL, provenance_type text NOT NULL, provenance_id text, confidence numeric NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS agent_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, status text NOT NULL, input_ref text, output_summary text, error text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz);
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', run_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')), attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs(status, run_at);
CREATE TABLE IF NOT EXISTS app_state (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());


ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dedupe_key text UNIQUE;
CREATE TABLE IF NOT EXISTS telegram_updates (update_id bigint PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS agent_runs_budget_idx ON agent_runs(kind,started_at);

-- GATE 2: single-owner records. No connector credentials or external execution.
CREATE TABLE IF NOT EXISTS cos_requests (
  request_key text PRIMARY KEY, payload_hash text NOT NULL, result jsonb
);
CREATE TABLE IF NOT EXISTS cos_sources (
  id text PRIMARY KEY, provider text NOT NULL, scope text NOT NULL,
  reference text NOT NULL, captured_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  approved_for_ai boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS cos_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text NOT NULL REFERENCES cos_sources(id),
  scope text NOT NULL, kind text NOT NULL, version integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cos_memory_revisions (
  memory_id uuid NOT NULL REFERENCES cos_memory(id), version integer NOT NULL,
  body text NOT NULL, confirmed boolean NOT NULL, status text NOT NULL CHECK(status IN ('active','retracted')),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(memory_id,version)
);
CREATE TABLE IF NOT EXISTS cos_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text NOT NULL REFERENCES cos_sources(id),
  summary text NOT NULL, expectation text NOT NULL, choice text NOT NULL, review_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1, outcome text, status text NOT NULL DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS cos_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text NOT NULL REFERENCES cos_sources(id),
  kind text NOT NULL, proposal text NOT NULL, status text NOT NULL DEFAULT 'waiting_approval',
  version integer NOT NULL DEFAULT 1, evidence text
);
CREATE TABLE IF NOT EXISTS cos_audit (
  sequence bigserial PRIMARY KEY, request_key text NOT NULL, event text NOT NULL,
  entity_id text NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION cos_reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit is append-only'; END $$;
DROP TRIGGER IF EXISTS cos_audit_immutable ON cos_audit;
CREATE TRIGGER cos_audit_immutable BEFORE UPDATE OR DELETE ON cos_audit
FOR EACH ROW EXECUTE FUNCTION cos_reject_audit_mutation();
