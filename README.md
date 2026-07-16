# Restaurant Management System (RMS)

A full-stack, role-based Restaurant Management System designed for tablet table-side order taking and desktop admin operations. Built using **Next.js 14**, **Supabase (PostgreSQL)**, and **Tailwind CSS**.

---

## 🌟 Key Features

1. **Role-Based Access Control (RBAC)**: Secure separation between Admin/Manager and Waiter/Cashier staff.
2. **Interactive Order-Taking**: Tablet-optimized order builder, custom variants, and order notes.
3. **Advanced Billing & Split Payments**: Tax summaries calculated per-product, service charges, promo codes, and multi-method split payments.
4. **Thermal Receipt Printing & PDF Download**: Prints receipts directly using browser print configurations or downloads print-ready PDFs.
5. **Real-time Live Operations**: Supabase Realtime alerts for live orders, notifications, and table sessions.
6. **Inventory Recipe Mapping**: Mapped recipes auto-deduct raw ingredients on payment, generating low-stock warnings.
7. **Detailed Sales & Tax Reports**: Dynamic date filters, KPI charts, staff performance leaderboards, and CSV/PDF export options.
8. **Lockout Security Protection**: Lockout protection for staff accounts after 5 failed login attempts.

---

## 🚀 Setup Instructions

### 1. Database Setup (Supabase)
Create a new Supabase project and run the migrations inside the `/supabase/migrations` folder in order:
1. `001_initial_schema.sql` (Creates core tables)
2. `002_rls_policies.sql` (Applies Row-Level Security checks)
3. `003_seed_data.sql` (Populates roles, default settings, sample categories/products)
4. `004_functions.sql` (Postgres RPC functions for stock deduction, void transactions, table gen)

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

## 🔒 Default Logins

*   **Admin Access**: Sign up or sign in using standard Supabase Auth credentials. (Make sure you link a corresponding row in the `users` table with `auth_user_id` mapping).
*   **Default Seed Staff Logins**:
    *   **Cashier**: username `cashier_one`, password `password123`
    *   **Waiter**: username `waiter_one`, password `password123`
