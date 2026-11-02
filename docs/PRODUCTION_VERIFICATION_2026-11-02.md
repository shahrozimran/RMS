# Production verification — 2 November 2026

Production: https://rms-navy.vercel.app

Initial audited source revision: `9e15e7a194566282d4cd83618fbadc21e6d04c3c`.

## Deployment and configuration

The initial production deployment was Ready. The four required variables are present in Vercel Production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `JWT_SECRET`. Successful staff sign-in also exercised signing with the configured JWT secret.

`TRUST_PROXY_HEADERS=true` was added as a production configuration variable and applied by redeployment `Dmc3bz6mc222q4p5THfx29VB4tUz`, which reached Ready. A live login-validation probe changed a per-client database quota bucket and left the shared fallback bucket unchanged. This verifies that the setting is active on the public production domain.

`APP_ORIGIN` was unnecessary: legitimate same-origin requests passed and foreign-origin mutation requests returned 403. No bootstrap credentials were added to Vercel or application source.

Vercel references: [forwarded request headers](https://vercel.com/docs/headers/request-headers), [environment-variable deployment requirements](https://vercel.com/docs/environment-variables/managing-environment-variables).

## Database readiness

Read-only checks verified session generation support, the POS catalog RPC and the 5MB public menu-image bucket with image MIME restrictions. The live QR projection returned menu data without exposing a table QR token.

The application points to the existing Supabase project. No schema migration was needed during this verification.

## Production checks

- Login returned 200, protected routes redirected anonymous visitors, protected APIs returned 401, and `/preview` returned 404.
- Security and private-cache headers were present.
- An unknown-account sign-in returned 401, and a foreign-origin mutation returned 403.
- Forty-two signed-in role checks passed across administrator, cashier and waiter accounts: permitted pages/APIs, restricted administration/configuration reads and writes, order ownership, secure HttpOnly cookies and post-logout token rejection.
- Newly requested accounts were provisioned directly through Supabase Auth and guarded application APIs. Generated passwords were kept out of repository files and delivered in chat.
- A labelled unpaid takeaway order was created, read, edited and voided. Current catalogue pricing matched the stored item price.

Test order: `c56c409a-5a49-4eca-bd8c-e18af6a9046c`, customer label `DEPLOYMENT VERIFICATION`. Final state: `void`; zero payments, zero recorded stock movements and zero stock transactions. The voided order remains as an audit record. Real sales and payments were not altered.

## Display correction

The final live dashboard check exposed a nullable table relation represented as an object with a null table number. The dashboard now checks the table number before rendering its table label, so takeaway/delivery orders do not show `Table null`. The relation type reflects the nullable database projection.

## Limits

No real payment was collected. Concurrent production load and payment-gateway integrations were not tested. npm configuration/install-script warnings appeared in Vercel build logs; the production build completed successfully.
