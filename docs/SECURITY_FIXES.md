# Security and backend changes — 2 November 2026

The application-source audit recorded 13 validated findings before remediation. The changes are implemented in this checkout. **No migration, credential rotation or deployment was performed against the live Supabase project.**

## Deployment requirements

Apply these migrations to a database already at 010, in order, before deploying the corresponding application:

| Migration | Effect |
| --- | --- |
| `011_security_and_atomic_operations.sql` | Current-session generation, active-role RLS, anonymous grant removal, service-only financial transactions, exact stock movements, shared rate limits, open-shift uniqueness and indexes. |
| `012_guarded_reads_and_configuration.sql` | Guarded report reads, grouped aggregates, catalog/QR projections, table transactions and logout revocation. |
| `013_menu_image_storage.sql` | Creates or configures the public menu image bucket with a 5MB limit and supported image MIME types. |

These grants change access used by old browser clients. Coordinate the database and application upgrade and reload clients afterwards. The new network-only service worker clears old RMS data caches.

Migration 011 suspends the identifiable legacy Supabase demo administrator and any staff account still containing the exact seeded password hash, including renamed staff accounts. Provision a unique administrator through `npm run create-admin`, or use an existing administrator whose account was not a demo identity. Reset and reactivate legitimate suspended staff through that administrator. Remove or rotate the old demo Supabase Auth identity; inactive-account checks already block its database privileges.

Administrator accounts require a Supabase Auth identity and active Admin database role. The staff API cannot create or promote a custom-JWT-only administrator. Reprovision existing custom-JWT Admin accounts through the operator CLI.

Migration 011 requires one application user per Supabase Auth identity. Check and resolve ambiguous mappings first:

```sql
SELECT auth_user_id, count(*)
FROM public.users
WHERE auth_user_id IS NOT NULL
GROUP BY auth_user_id
HAVING count(*) > 1;
```

The migration fails atomically if this invariant is violated. It does not guess which duplicate identity to preserve.

## Fixed boundaries

| Area | Result |
| --- | --- |
| Public admin provisioning | Known-password bootstrap returns 404; login no longer triggers it. Fresh seeds omit default-password staff. |
| Direct database bypass | Anonymous business-table access and public privileged-function execution are revoked. Browser financial writes cannot bypass transactional APIs. |
| Session revocation | Current account/role/permissions are checked per request. Password, role, username and status changes invalidate staff tokens. Logout revokes the current generation. Inactive Supabase identities lose privileged RLS access. |
| Administrator routing | Role and authentication type are checked in the layout and immediately before privileged Server Component reads. Authentication provider alone grants no admin access. |
| Order edits | Arbitrary column/status updates are removed. Strict full edits enforce ownership and mutable state atomically. Failed edits preserve existing items and totals. |
| Pricing | SQL derives product, variant, tax and modifier values. Required variants cannot fall back to hidden base prices. Foreign/duplicate modifiers and unavailable products are rejected; trusted modifier snapshots persist. |
| Settlement | State, ownership, exact payment sum, cash tender, enabled methods and discount minimum/expiry/cap are checked before committing. Percent discounts use subtotal; zero-total bills need no fictitious payment. |
| Concurrent processing | Order, discount, ingredient, pending-order and table rows are locked by their owning transactions. Duplicate settlement/confirmation and confirm/reject conflicts are rejected. |
| Inventory | Payment records exact deductions. Void reverses those movements once rather than using a changed recipe. Low-stock notifications no longer raise a SQL formatting exception. |
| Table capabilities | Public token enumeration is removed; staff projections omit tokens. Table release checks other open orders. Rotation invalidates confirmation of old pending tokens. |
| Request validation | Streamed body sizes are bounded, including chunked requests. Mutation origins are checked. Uploads use bounded parsing, image signatures, MIME matching and generated names. |
| QR availability | Shared menu, submission and polling budgets are separate. Polls no longer exhaust submission quotas. Table-level limits do not depend on forwarding headers. |
| Browser integration | Staff reads use authenticated APIs. QR polling pauses in hidden tabs and prevents overlap. API responses are private/no-store; sensitive offline caches are retired. |

## Other correctness and performance changes

- Staff listing no longer combines contradictory NULL filters. Blank optional contacts can be edited or cleared.
- A partial unique index prevents duplicate open shifts. Existing duplicates are closed with an explanatory note.
- Dashboards and staff performance aggregate in PostgreSQL, avoiding the REST row cap. Performance returns only ten recent shifts per employee.
- Report aggregates run concurrently, with one grouped staff leaderboard instead of one RPC per employee. Report ranges and item limits are bounded.
- Catalog/menu aggregates avoid default REST truncation. Historical order views have pagination; pending queues have an explicit 200-order bound.
- Redundant QR-token indexes were removed and query indexes added. No throughput percentage is claimed without load measurements.
- The menu quick toggle sends JSON PUT; the missing categories page exists.
- Product updates preserve omitted fields instead of applying creation defaults to tax, availability and variants.
- Open-order editing refreshes current menu prices, tax and modifiers. Unavailable selections remain visible for replacement. Paid historical totals are not repriced.
- Cent-based previews sum rounded line taxes, matching PostgreSQL amounts.

## Historical inventory reconciliation

The old deduction function recorded requested quantities even when it clamped insufficient stock to zero, and the old payment API never called it. Recipes cannot reliably reconstruct actual historical movements.

Paid orders with old deduction transactions but no exact movement ledger are **blocked from voiding with a reconciliation error**, without changing order/payment/stock state. Reconcile those orders with physical stock and original records before supplying verified movement ledger entries or a separately audited accounting adjustment. The migration does not fabricate quantities or retroactively deduct stock for old sales.

Open orders created before modifier snapshots were persisted can also be ambiguous. Review their lines before saving; missing modifiers cannot be inferred safely.

## Configuration and verification limits

`TRUST_PROXY_HEADERS` defaults to false. The fallback budget is shared and sized for restaurant Wi-Fi. Set it to true only when the trusted ingress overwrites `x-forwarded-for`; otherwise callers can forge identities. Table-level submission limits remain enforced.

If a reverse proxy presents a different internal request origin, set `APP_ORIGIN` to the exact external browser origin so legitimate same-origin mutations pass the origin check.

Noncash payments remain staff-confirmed tender records. No payment-gateway capture or verification integration exists.

Next.js and affected lockfile dependencies were updated after advisory checks. Production dependencies report zero vulnerabilities. Remaining development-tool advisories are described by `npm audit`; the suggested forced ESLint downgrade is incompatible and was not applied. The maintainers' [security advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) documents the need to update the older image dependencies.

Tests cover SQL grants/RLS, financial validation, rollback, replay, stock, variants, session generation, permissions, request origins/sizes, QR projections, history aggregation and edit repricing. PGlite uses Supabase Auth/Storage fixtures and core PostgreSQL UUID generation. Actual Supabase infrastructure and concurrent separate-client load were not exercised. Validate real sessions and deployment grants in staging before rollout.

Final local checks: 32 regression tests pass, production build and TypeScript checks pass, and production dependency audit reports zero vulnerabilities. Full audit still reports 16 moderate development-tool advisories. The last full-repository lint run reported 125 errors and 41 warnings, mostly frontend typing and React hooks; the original revision has 195 errors under the same current rules. No lint rule was disabled to pass security tests. Scanner token accounting was unavailable. Eleven HTTP smoke checks confirmed anonymous access denial, role-page redirects, removed bootstrap behavior, invalid QR input handling, private cache headers and cross-site mutation rejection.
