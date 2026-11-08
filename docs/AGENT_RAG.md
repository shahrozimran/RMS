# AI and the knowledge library

The administrator Intelligence workspace combines a rule review with a separate AI briefing. The worker claims an open order from the existing durable queue and gathers a bounded snapshot of its menu, recipes, stock, kitchen queue, shifts, table status and recent paid-order history. Document retrieval combines pgvector similarity with keyword matches. Each role receives up to two relevant excerpts.

1. Order, Inventory and Sales evaluate their sources.
2. Kitchen, Staff and Dining Floor receive the first three handoffs alongside their own facts and policy excerpts.
3. The Supervisor combines the six handoffs and cites the sources behind its suggested checks.

The worker batches the seven roles into three structured Gemini requests. It validates role identities, response size and citations before saving. The model has no database tools or business write access. The existing rules still publish when AI is paused, the allowance is exhausted, the provider fails or its output cannot be validated. Archived documents are removed from retrieval. Previous briefings retain their cited excerpts for review history.

## Open the local preview

Run `npm run dev` and open `http://127.0.0.1:3000/preview?view=intelligence`. Expand the supervisor briefing to see six specialist handoffs and their evidence. The Knowledge library tab accepts sample text and demonstrates indexing controls. This preview uses synthetic restaurant data.

Other preview views include `?view=pos`, `?view=dashboard`, `?view=menu` and `?view=customer`.

## Enable live reviews

1. Apply `supabase/migrations/015_agent_rag.sql` in Supabase after migration 014. It installs pgvector, private knowledge tables and the AI review RPCs. It starts AI reviews paused.
2. Set the server-only `OPENROUTER_API_KEY` in `.env.local` for development. For a hosted deployment, set it on the web server and the separate worker host. Use `npm run agents:verify` to test the provider with synthetic facts and no database writes. This makes real, small billable model requests.
3. Deploy the application and start `npm run agents:worker` on a managed Node.js 24 host with the existing Supabase server credentials. `npm run agents:once` processes one available job. Use the worker logs to check completions and fixed error codes.
4. Sign in as an administrator, open **Intelligence → Knowledge library** and index a UTF-8 text or Markdown policy. Choose a retrieval scope and approve sending the policy to OpenRouter. Excerpts cited by one role can appear in its downstream handoffs. Convert PDF policies to text before importing them.
5. Enable AI reviews in the library. In **Review desk**, enable order reviews and choose **Review open orders**. The worker also picks up supported order and stock changes while order reviews are enabled.

## Spending and data limits

Gemini 3.1 Flash Lite is listed at $0.25 per million input tokens and $1.50 per million output tokens. Gemini Embedding 001 is listed at $0.15 per million input tokens. An example review with 10,000 generation input tokens, 1,500 output tokens and 1,000 embedding input tokens costs about half a US cent at those rates. Actual usage varies. [Generation pricing](https://openrouter.ai/google/gemini-3.1-flash-lite) · [Embedding pricing](https://openrouter.ai/google/gemini-embedding-001)

The worker reserves up to 30 AI attempts per UTC day. Each run has a 43-second workflow timeout and three bounded generation calls. Indexing has a separate administrator rate limit. The library supports 100 active documents and up to 36,000 characters per import. Requests use provider data-collection restrictions and zero data retention routing. [OpenRouter routing controls](https://openrouter.ai/docs/guides/routing/provider-selection)

Customer names, addresses, phone fields, order notes and employee identities are absent from the AI snapshot. Imported documents are operator-approved. Remove confidential content before indexing. Sources are treated as untrusted text, and citation IDs are checked against the retrieved excerpts and facts.

Kitchen advice uses open tickets and current stock evidence. Staffing uses shifts and order counts. Floor advice uses table status and capacity. Station progress, staff skills, waitlists and actual turnover times need dedicated records for precise scheduling. The shared source map follows RMS entities and relationships in SQL. A live RDF reasoner and automatic business actions are outside this workflow.

Run `npm test`, `npm run typecheck` and `npm run build` before release. The database tests install all migrations in disposable PGlite and exercise real vector retrieval and queue persistence with simulated provider responses.

## Help desk pages and alerts

Apply `supabase/migrations/016_help_desk.sql` after 015 for questions and alerts. The Help desk sidebar opens Issues, Order checks, Past reviews, Ask a question, Alerts and Saved policies. Each overview card opens the list behind its count. Open a past review to load its saved AI briefing and citations.

Ask a question saves the question, result and cited excerpts in the asking administrator's history. It looks up matching current issues, saved policies and selected live counts. When OpenRouter is configured it also searches document embeddings and can produce a cited explanation. Source lookup works without the key. Questions have a separate rate limit of 12 per administrator per hour.

Administrators can open Alerts to message an active team member or choose **Alert a team member** on an issue. Recipients open **Alerts** from the staff header and mark the message as read. The sender can see read status in **Sent alerts**. Active administrators receive their own in-app alerts when an urgent issue is recorded or an order check exhausts retries. The header checks unread counts while the tab is visible.

## Ingredients and recipes

Apply `supabase/migrations/017_ingredient_inventory.sql` after 016, then deploy the matching application and worker. Open **Ingredients** in the admin sidebar. For each ingredient, set its stock unit, physical count and low-stock level. In **Recipes & how many we can make**, select a dish and enter what one serving uses, in each ingredient's stock unit. For example, if chicken is stocked in grams, enter 120 for a 120 g serving. The same chicken can be used in any number of recipes.

Sending a POS order to the kitchen or confirming a QR order deducts the recorded recipe amounts in one transaction. A shortage stops confirmation and leaves the QR request pending. Edits apply the difference from the confirmed quantities and use the recipe recorded for each dish on that ticket. Voids return the recorded amounts. Older open orders deduct at payment unless edited under the new flow. Confirmed orders deduct only once, even if paid later. Sizes and extras share the base recipe. Dishes without a saved recipe use no tracked stock.

The inventory screen shows the maximum number of servings each base recipe can make from current stock. These counts are for each dish separately because dishes can share ingredients. The inventory review and **Ask a question** use these live counts. Try “How many chicken pizzas can we make?” or “What is running low?” Administrators get an alert when a count crosses its low-stock level. See the latest changes under **Stock history**.

Run the development server and open `http://127.0.0.1:3000/preview?view=inventory` to try sample counts and recipes.
