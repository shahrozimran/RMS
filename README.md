# Restaurant Management System

Next.js 16, React 19 and Supabase restaurant POS, administration and customer QR ordering.

## Setup

1. Install Node.js 20.20+ and run `npm ci`.
2. Copy `.env.local.example` to `.env.local` and configure the Supabase URL, public anon key, server-only service-role key and unique random JWT secret of at least 32 bytes.
3. Apply `supabase/migrations/*.sql` in numeric order. Existing installations through 010 must apply **011, 012 and 013** before running the updated application.
4. Set the `BOOTSTRAP_ADMIN_*` environment values and run `npm run create-admin`. Remove the bootstrap password afterwards. Administrators use the Admin tab and Supabase Auth.
5. Create staff through the administrator portal with unique passwords. No default-password accounts are created.
6. Run `npm run dev`, or `npm run build` followed by `npm start`.

Read [security changes and deployment requirements](docs/SECURITY_FIXES.md) before upgrading an existing database. The migrations suspend the identifiable legacy demo administrator and accounts still using the exact seeded password hash.

## Access and transactions

- Public customers use table-token QR APIs. Anonymous business-table access and privileged function execution are revoked.
- Staff use HttpOnly JWT cookies. Every session resolves the current active account, role, permissions and token generation from the database.
- Order creation, editing, QR processing, payment and voiding use service-only PostgreSQL transactions with permission, ownership, pricing and state checks.
- Administrator reports retain guarded read RPCs. Financial, table and settings changes use authenticated APIs.
- Staff QR queues use authenticated visible-tab polling. Custom staff cookies are not Supabase Realtime credentials.
- The installable PWA uses a network-only worker; authenticated data is not cached for offline access.

## Checks

```sh
npm test
npm run typecheck
npm run build
npm run lint
npm audit --omit=dev
```

Database tests run SQL migrations in disposable PGlite PostgreSQL with Supabase identity/grant fixtures. They do not connect to your Supabase project. Production deployment, actual payment-processor capture and load testing need environment validation.


## UI workspace and local preview

Run `npm run dev -- --hostname 127.0.0.1 --port 3000`, then open [the design preview](http://127.0.0.1:3000/preview) or [sign in](http://127.0.0.1:3000/login).

The shared design covers admin and staff navigation, dashboards, menu management, POS, guest ordering, tables, team management, settings and common billing/form styles. The administrator POS is at `/admin/pos`.

The preview is development-only, uses labelled sample data and shares the real UI components for the main screens. Preview interactions never call restaurant mutation APIs; the production route returns 404. Sign in to use real restaurant data. Apply the previously documented database migrations before exercising live financial workflows. See [UI details](docs/UI_REDESIGN.md).
