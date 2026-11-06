# Responsiveness improvements — 6 November 2026

Baseline source: `fd1571a`. Measurements use the same computer, dependencies and production build command. No production business records were changed.

## Verified causes and changes

- **Cross-continent backend traffic:** Supabase's project overview reports South Asia (Mumbai), `ap-south-1`. Before this change, dynamic production responses had `x-vercel-id: bom1::iad1::…`, indicating US function execution. `vercel.json` now places functions in `bom1`, beside the database. This takes effect on the next deployment. Static assets remain distributed by Vercel's CDN.
- **Repeated authentication:** Proxy now verifies/refreshes using `getClaims()` and cached signing keys. This project advertises ES256 keys. The data access layer still calls `getUser()` and checks the current user's active status, role and permissions. Public login, development preview and QR pages skip the redundant proxy lookup. No authorization results are cached across requests.
- **POS loading waterfall:** Both administrator and staff entry pages load the catalog on the server, after the same permission guard used by the API. The hydrated page does not fetch the catalog again. Failures retain an explicit retry path. Creating an order navigates once, without an immediate duplicate router refresh.
- **Unnecessary browser work:** PDF, canvas, CSV and QR-generation libraries load when requested. Preview features load separately, including their chart. Product grids are memoized, and deferred menu filtering keeps the search input responsive while larger menus render. Currency formatter instances are reused in a bounded cache; amounts and business records are never cached.
- **Oversized images:** Public Supabase menu images use Next's resizing/compression with card-appropriate sizes. Other sources retain their existing rendering path. Image optimization does not broaden the configured host allowlist.
- **Badge payloads:** Staff navigation requests an authenticated count instead of customer names and complete order items. The actual queue retains its full payload. Existing completion-based polling still avoids overlap and hidden-tab polling.
- **Blocking external fonts:** Next serves the existing fonts with the application, preloads them and uses `display: swap`, removing the browser's Google stylesheet/font round trips. Existing protected-route loading boundaries continue to provide navigation feedback.

## Build measurements

Bytes below sum unique eager JavaScript chunks referenced by each route's client-reference manifest. They exclude framework/runtime chunks outside that manifest and separately loaded conditional features. These measure route payload changes, not complete browser transfer sizes or end-to-end latency. Decimal KB are rounded.

| Route | Before JS | After JS | Reduction | Before gzip | After gzip |
| --- | ---: | ---: | ---: | ---: | ---: |
| Admin reports | 1,105,625 B | 669,340 B | 39.5% | 330,425 B | 190,055 B |
| Admin order details | 915,025 B | 300,064 B | 67.2% | 260,710 B | 82,292 B |
| Staff receipt | 656,882 B | 41,943 B | 93.6% | 192,558 B | 14,170 B |
| Preview shell | 892,204 B | 181,220 B | 79.7% | 256,931 B | 55,178 B |
| POS | 78,696 B | 80,953 B | +2.9% | 27,071 B | 28,166 B |

The small POS increase adds the reusable product grid and server-initial-data support, removing its additional catalog API/authentication waterfall. Preview charts/features still download when their view is selected.

Formatting 10,000 currency values took 786 ms before and 36–46 ms after in Node on this computer. This is a formatter microbenchmark, not a whole-app speedup.

Read-only Supabase probes before the change: catalog 571/191/152 ms (first connection cold); dashboard 182/161/161 ms; empty pending queue 190/207/153 ms; count-only query 199/154/202 ms. The count query removes payload volume, not measured query latency on an empty queue. These timings originate from the local computer, not the Vercel function. They do not measure SQL execution time alone.

Signed-in Chrome POS reload-to-visible-heading samples on the old production deployment were 4,171/4,916/4,434 ms (median 4,434 ms). Browser automation and network time are included. For a comparable deployed check, reload the new production deployment three times in that same browser and wait for the POS heading and catalog, then compare medians. Do not compare this against a development cold compile or claim a latency guarantee from three samples.

## Reproduction and validation

```powershell
npm test
npm run build
npm run perf:measure
# With npm start running on port 3001 (or pass your deployed origin):
npm run perf:smoke
# Optional read-only DB probes; reads local secrets without printing them:
node --env-file=.env.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/measure-performance.mjs --database
```

The 58 automated checks include catalog authorization, protected count-only reads, refreshed cookie propagation, currency/locale correctness and image-source restrictions, alongside existing financial, database and agent tests. Local browser checks cover menu search, cart quantities, variant prices and deferred preview chart loading. Verify export downloads and optimized images against the deployed build as well.

No new environment variables, SQL migration, paid service or worker is required for these changes. Keep the existing agent worker deployment separate from application page loading. Database/provider cold starts, network conditions and large future data volumes still affect response time.

References: [Supabase SSR authentication methods](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Vercel function regions](https://vercel.com/docs/functions/configuring-functions/region). Installed Next 16.4.4 documentation was checked for fonts, image optimization, lazy loading and navigation.
