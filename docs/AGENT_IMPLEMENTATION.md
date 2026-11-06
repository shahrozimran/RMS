# Operations intelligence: first implementation

This increment implements an advisory Order + Inventory + Supervisor workflow inside the existing RMS. It is the foundation of the seven-agent academic proposal.

## Implemented

- Coalesced jobs are created inside supported order/item and stock/catalog transactions.
- Order rules check current availability and flag open orders older than 15 minutes. Order age is not a kitchen ETA.
- Inventory rules compare base-recipe requirements, on-hand stock and aggregate active/billed order demand. Missing recipes, variants and selected modifiers create explicit uncertainty.
- Supervisor rules combine evidence into at most three findings, with three structured agent messages per completed run.
- Authenticated administrator reviews are audited and checked against current SQL facts. Expired or changed evidence becomes stale. Acknowledgement records a review, not a business mutation.
- The Intelligence workspace shows evidence, collaboration history, recent queue status and the implementation status of all seven roles.

The engine is deterministic. LLM reasoning, embeddings, document RAG, live RDF queries, procurement, forecasts and learning are later stages.

## Local preview

Start the development server, then open `http://127.0.0.1:3000/preview?view=intelligence`. It models a burger order with insufficient buns. Expand evidence and the collaboration trail, then acknowledge/dismiss a sample finding. The development-only preview uses no account, live mutation APIs or database migration.

## Staging/live installation

1. Review/backup the target database through the normal deployment process. Apply migration `014_agent_review_foundation.sql` after 001–013. The application does not apply it automatically.
2. Deploy the matching Next.js application. The administrator workspace is `/admin/intelligence`.
3. Install Node.js 24 on a background worker host. Use the existing server environment: `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY`. No model API key is needed yet.
4. Run `npm run agents:worker` as a managed process/container; `npm run agents:once` attempts one claim. Never give the service-role key to browser code, uploaded documents or an LLM-controlled tool.
5. Sign in as an administrator, enable reviews and choose **Review open orders** to seed up to 25 recent open orders. Subsequent supported changes queue automatically.
6. Confirm completions/findings and their audit entries in staging before enabling this in production.

Vercel hosts the web application; the polling worker runs as a separate background process. It polls every five seconds while idle, handles shutdown signals, and can run alongside other worker instances. Pausing reviews prevents new claims/event jobs and prevents in-flight completion from being committed while paused.

## Reliability and permissions

`agent_jobs` is a transactional outbox and durable Postgres queue. Supported changes increment a per-order generation and invalidate older findings/leases. Claims use `FOR UPDATE SKIP LOCKED` with random 60-second leases. Failed/expired attempts stop after five with retry backoff and a visible dead state. An administrator can explicitly requeue to reset attempts.

Completion checks source hashes and current leases. Unique `(job_id,generation)` runs prevent duplicate completion. Worker errors use fixed codes; credentials and customer contents are not logged. SQL snapshots exclude customer names, phone numbers, addresses and order notes.

New tables have RLS, administrator-only authenticated reads and no anonymous access. RPC execution is service-role-only. Administrative RPCs check the current active actor; API routes additionally require Supabase-backed Admin sessions, existing origin protection and durable per-user rate limits.

## Limits and freshness

- SQL is authoritative. The MD5 snapshot hash is a change detector, not an authentication mechanism.
- Findings expire after 15 minutes. Review checks the latest facts and records `stale` when needed. This is review-time freshness; subsequent manual actions need their own business validation.
- Open-order demand is an estimate, **not reserved stock**. Payment-time stock deduction remains in place. Atomic stock reservations and recipe-version snapshots are required before order-acceptance automation.
- Base recipes have no variant/modifier quantities, waste or substitution model. Completeness cannot be guaranteed from a nonempty recipe mapping alone.
- Counts cover the latest 100 jobs/findings and 20 runs, not lifetime totals. One job row is retained per order; completed generations are retained as runs.
- This remains a single-restaurant installation. Add consistent restaurant-level isolation before multi-tenant use.

## Ontology foundation

`ontology/restaurant.ttl` defines RDF/OWL entities and relations. `ontology/shapes.ttl` defines SHACL constraints. `ontology/mapping.json` records SQL/unit mappings. These are versioned design assets; this increment does not run SHACL or materialize a live RDF graph.

## Remaining implementation order

1. Atomic reservations, recipe versions/variants/modifiers, kitchen tasks with started/ready/served timestamps, station capacity, staff skills, task workload, seating/waitlist and cleaning events.
2. RDFLib/pySHACL graph ingestion, stable entity IRIs, canonical unit conversion, provenance and graph query validation.
3. Private document uploads, safe extraction, uncertain mapping review, version/access metadata, pgvector retrieval and citations. Uploaded text remains untrusted data, never permission to act.
4. Kitchen, Staff and Table agents using constrained scheduling/allocation and the new operational facts.
5. Supplier catalogs/lead times, purchasing drafts, waste history and inventory forecasts evaluated against simple time-separated baselines. Purchases require human approval.
6. Sales/menu proposals based on verified margins, history and preferences; pricing changes require approval.
7. Optional grounded LLM adapter with bounded tools, JSON validation, source authorization and token/time budgets; no arbitrary SQL or database write access.
8. Version-bound approvals, idempotent transactional executors and outcome feedback. Use Mesa simulations and controlled pilots before promoting policies or models.

## Checks

Run `npm test`, `npm run typecheck` and `npm run build`. SQL tests use disposable PGlite PostgreSQL, never production Supabase. Agent checks cover calculations, uncertain recipes, closed orders, lease takeover, duplicate/stale completion, disabled mode, permissions and stale reviews.
