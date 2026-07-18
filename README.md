# Restaurant Management System (RMS)

A full-stack, enterprise-grade Restaurant Management System (RMS) designed for high-concurrency table-side order taking, desktop admin operations, and self-service customer QR ordering. Built using **Next.js**, **Supabase (PostgreSQL)**, and a unified light-theme design system.

---

## 🌟 Key Features

### 1. 📱 Public Customer QR Self-Ordering
*   **Unique QR Token Generators**: Every table has a cryptographically secure, unguessable UUID token (`qr_token`). Scanning it instantly loads the public ordering menu at `/order/[tableToken]`.
*   **Themed Customer Menu**: Fully responsive light mode design styled with premium brand tokens: clean white surfaces, soft beige borders, warm gold indicators, and charcoal typography.
*   **Mandatory Name Validation**: Prevents anonymous order confusion by enforcing name inputs before checkout.
*   **Status Tracker**: Real-time status polling lets customers watch their order state transition from *Pending* ⏳ to *Confirmed* 🎉 or *Declined* ✕.

### 2. ⚡ Real-Time Staff Operations Dashboard
*   **Zero-Delay Incoming Queue**: Built using Supabase Realtime WebSockets. Staff consoles receive incoming customer QR orders instantly with audio-visual notifications without page reloads.
*   **Action Workspaces**: Double-action workflow allowing cashiers/waiters to confirm or reject incoming QR orders.
*   **Auto-Print Kitchen Receipt**: Confirming a QR order auto-provisions a real database order, flags the table as occupied, and redirects the browser directly to the thermal kitchen receipt layout (`/staff/orders/[id]/kitchen-receipt`) to fire the print prompt.
*   **Persisted Duty Status**: Migrated RLS-restricted browser client calls to server API routes, securing cashier clock-in/out states and preserving sessions across reloads.

### 3. 🔒 Hardened Multi-Layer Security
*   **Zero-Trust DB Policies**: Hardened database Row Level Security (RLS). Direct anonymous queries to Supabase are completely blocked. Public customer screens communicate strictly via server-side Next.js API routes acting as a proxy firewall.
*   **API Rate Limiting**: Next.js proxy middleware applies an IP-based sliding window limiter on public endpoints (e.g., maximum 5 order submissions per 10 minutes and 30 reads per minute) to block DDoS and spamming scripts.
*   **Data Integrity Checkers**: The order submit route cross-checks all cart item prices and tax percentages against the database. If client-side price tampering is detected (e.g. changing $15.00 to $0.01), the order is instantly rejected.
*   **HTML Sanitization**: Strips HTML tags from customer input names to prevent Cross-Site Scripting (XSS) injections on POS dashboards.
*   **HTTP Secure Headers**: Content-Security-Policy (CSP) whitelists secure image fetches from Supabase (`*.supabase.co`) while blocking clickjacking (`X-Frame-Options: DENY`) and MIME-sniffing.

### 4. 📊 Admin Staff Performance & Shifts Portal
*   **Duty Status Indicators**: View who is "🟢 On Duty" (with precise clock-in duration) or "⚪ Off Duty" at a glance.
*   **Completed Sales & Revenue**: Tallies the total completed POS orders and revenue processed by each staff member.
*   **QR Audit Tracking**: Tracks the exact count of QR orders accepted or rejected by each employee.
*   **Shift History Drawer**: Interactive sliding layout displaying collapsible lists of recent clock-in and clock-out logs.

### 5. 🚀 Speed & UX Optimizations
*   **Themed Layout Skeletons**: Replaced basic spinners and text loaders with pulsing skeleton blocks. Route transitions and initial loads preview exact card structures instantly.
*   **Client-Side Caching**: Embedded an in-memory client cache with TTL support, making subsequent QR menu loads instant.
*   **SQL Indexes**: Database index configurations optimized for analytics queries, POS dashboards, and table QR token lookups.

---

## 🛠️ Comprehensive Tech Stack

*   **Framework**: Next.js (App Router, Client/Server Components, Middleware Proxy)
*   **Language**: TypeScript (Strict Typings)
*   **Database & Auth**: Supabase
    *   PostgreSQL
    *   Row-Level Security (RLS)
    *   Supabase Realtime (Postgres Changes via WebSockets)
    *   Pl/pgSQL Database Functions & Triggers
*   **Styling**: Vanilla CSS (custom global variable tokens) + Tailwind CSS
*   **Data Validation**: Zod Schemas
*   **Libraries**: Lucide React Icons

---

## 🚀 Setup Instructions

### 1. Run Database Migrations (Supabase SQL Editor)
Navigate to your Supabase SQL Editor and run the migration scripts located in `/supabase/migrations` in sequential order:
1.  `001_initial_schema.sql` (Creates core tables)
2.  `002_rls_policies.sql` (Applies Row-Level Security checks)
3.  `003_seed_data.sql` (Populates roles, default settings, sample categories/products)
4.  `004_functions.sql` (Postgres RPC functions for stock deduction, void transactions, table gen)
5.  `005_activity_logging.sql` (Schema for auditing security and staff actions)
6.  `006_qr_ordering.sql` (Self-ordering structure, tokens, and pending orders)
7.  `007_performance_indexes.sql` (Query performance indexing tuning)
8.  `008_harden_security.sql` (Locks down direct SELECT queries on pending tables)
9.  `009_enable_realtime_qr.sql` (Adds pending table to Supabase Realtime publication)

### 2. Environment Variables Configuration
Duplicate the environment template file:
```bash
cp .env.local.example .env.local
```
Then populate the fields in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
NEXT_PUBLIC_APP_NAME="Restaurant Management System"
```

### 3. Installation
Install the project dependencies:
```bash
npm install
```

### 4. Running the Development Server
Launch the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔒 Default Credentials

*   **Admin Access**: Sign up or sign in using standard Supabase Auth credentials. (Make sure you link a corresponding row in the `users` table with `auth_user_id` mapping).
*   **Default Seed Staff Logins**:
    *   **Cashier**: username `cashier_one`, password `password123`
    *   **Waiter**: username `waiter_one`, password `password123`
