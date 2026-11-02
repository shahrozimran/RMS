# Restaurant workspace redesign

A shared green, slate and white design system covers navigation, typography, forms, buttons, cards, tables, status badges, loading states and mobile layouts. The signed-in admin and staff workspaces retain their authentication and API permission checks.

## Screens

- Admin overview: revenue and order metrics, popular dishes, recent orders and open tickets.
- Menu: category and availability filters, search, grid/list views, configured currency and sold-out controls.
- POS: current-order panel, tables, order types, sizes, modifiers, quantities, notes and customer details. Staff order creation and editing share this component. Administrators have `/admin/pos`.
- Guests: restaurant identity, searchable menu, customization, mobile cart shortcut and order-confirmation status. The nested HTML document was removed and zoom remains enabled.
- Tables: floor cards, status summaries and filters alongside existing editing and QR controls.
- Team: searchable accounts, role filters, avatars and existing account-management links.
- Settings: shared profile, currency, charges and supported payment-method controls, using the guarded settings API.
- Billing, reporting, activity and secondary forms inherit the shared theme. Thermal receipt print styles remain in place.

## Local review

Run `npm run dev -- --hostname 127.0.0.1 --port 3000` and open `http://127.0.0.1:3000/preview` or `/login`.

The preview is development-only and labelled with sample data. It shares the live components for the main screens; preview writes affect local screen state only. `/preview` returns 404 in production. Actual financial workflows require the migrations described in SECURITY_FIXES.md.

## Verification

- Production build and TypeScript checks.
- Existing 32 security and database regression tests.
- Production HTTP smoke checks: login 200, preview 404, unauthenticated admin POS redirects, protected order/catalog APIs 401.
- Browser checks: POS options, modifiers, quantities, table selection, totals and preview submission; menu search and availability; mobile navigation and guest checkout; sign-in roles and password visibility.
