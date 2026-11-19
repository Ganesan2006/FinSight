# FinSight Product Migration Plan

## Purpose

Move FinSight from a broad feature prototype to a dependable personal finance product that a person can set up, use every day, and trust with their financial records.

This is a product and engineering migration plan based on the repository and confirmed product decisions. It does not assume that deployment configuration, data migrations, or service behavior have been verified in a live environment.

## Product direction

FinSight should help a person answer four questions with confidence:

1. **What happened to my money?** Accurate, searchable income and spending history.
2. **What must I pay and when?** A clear view of upcoming bills and money owed.
3. **Am I on track?** Budgets and goals that use the same trusted transaction data.
4. **What should I do next?** Specific, explainable suggestions tied to the user's own records.

The primary product promise should be: **FinSight gives you a clear and controllable picture of your personal finances.** Every connection, import, calculation, and suggestion should make its data source and status understandable.

## Product principles

- **Trust before automation.** No financial data import or sharing without clear opt-in, visible status, and an easy way to disconnect.
- **One source of truth.** Transactions, accounts, budgets, bills, and insights must use consistent definitions and calculations.
- **Manual entry is the permanent default.** It is the complete, supported path, not a fallback while waiting for bank aggregation. This project does not include bank aggregation or automatic bank sync.
- **Multi-currency is foundational.** Each amount keeps its currency; converted totals show the exchange-rate basis and never silently add unlike currencies.
- **Explain every number.** Let users open a total and see which records produced it and which date range was used.
- **Recoverable changes.** Imports, edits, payments, and deletions should be reviewable and recoverable where practical.
- **Useful before broad.** Perfect the core tracking, bills, and budget loop before expanding investments, subscriptions, or more integrations.

## Current repository baseline

The repository contains an Expo / React Native client, an Express API, Supabase/Postgres persistence, and a FastAPI SMS parser. Existing app areas include spending and accounts, dues, investments, goals, bills, reports, and settings.

The code also shows several gaps to resolve before calling the product ready for general use:

- Bank aggregation, its scheduled sync, API endpoints, and Finvu client have been removed. Existing account and transaction history imported in the past is preserved; the removal migration only deletes old bank-aggregator connection records.
- SMS import is an optional, explicitly triggered Android-only path. It reads up to 100 messages, regex-filters for completed transaction alerts with a monetary amount before LLM parsing, matches last-four account identifiers against the user's own account records, and commits reviewed transactions. A missing unique match can create a masked account during the reviewed commit when a four-digit suffix is available, after an explicit confirmation; messages without one require an existing account choice. iOS does not get SMS access. Manual entry and transaction CSV import/export work on both platforms. CSV import accepts pasted income, expense, and transfer rows, previews valid rows, allows corrections to valid rows, and deduplicates retries. Invalid rows still need correction in the pasted CSV before previewing again.
- Account and transaction amounts retain currencies, and cross-currency transfers require the received amount and an exchange rate. Budgets, bills, dues, goals, and investments also carry currency. Users can enter dated exchange rates to convert summaries to their reporting currency; without rates, values remain grouped by currency.
- Authentication uses custom API routes, database password hashes, and JWTs rather than Supabase Auth. New registrations require email verification, reset links expire, password resets invalidate existing JWTs, and auth endpoints have per-process rate limits. Production deployment still needs email delivery configuration and a shared abuse-control strategy for multiple API replicas.
- Subscription UI exists, but paid checkout is explicitly unavailable. Keep paid plans hidden or clearly marked as unavailable until billing and entitlement enforcement exist.
- Monthly category budgets support rollover or no rollover. Budget actuals include expenses and bill payments without linked expenses.
- Bill payment asks each time whether to create a linked expense, and recurring bill occurrences retain payment history.
- Account deletion immediately locks API access, supports cancellation during a seven-day window, then cascades the user row and owned database records. Backup retention and deletion guarantees still require deployment-level configuration.
- The app is organized around multiple screens and feature areas. Some visible functions remain unavailable, including paid checkout and live provider connections; device acceptance and a full production screen audit are still needed to find dead ends, accessibility issues, and inconsistent recovery states.
- The source tree alone does not prove that database policies, API ownership checks, deployment secrets, backups, logs, or provider credentials are configured safely in the target environment.

### Implementation snapshot

Implemented in the repository for this migration:

- Bank aggregation routes, provider client, scheduler, app entry points, and credentials have been removed; the cleanup migration deletes old connection rows while preserving ledger history.
- SMS import is triggered by the user on Android, previews parsed transactions, and requires review before commit. A unique last-four/issuer/currency/type match is selected automatically; ambiguous matches require an account choice, and a missing match can create a masked account during the reviewed commit after confirmation. Raw message bodies are not persisted.
- Currency is stored across accounts and financial records; cross-currency transfers retain both amounts and the exchange rate. Users can add effective-dated manual rates; summaries convert only when all required rates are available, and otherwise stay grouped by currency.
- Transaction create/edit/delete, bill payments, reviewed SMS commits, and CSV imports update balances with database functions. Bill payments are idempotent and retain recurring occurrences.
- Transaction history has search, type/source/account/date filters, and backend pagination. Account balances can be reconciled with an audit history. Spend totals drill down by currency, account, and transaction.
- CSV import supports editable valid rows, income, expenses, transfers, duplicate detection, row-level failures, and a recent import history. Account currency and type checks are enforced at commit time.
- Monthly budgets, optional rollover, budget threshold alerts, partial and skipped bill occurrences, explainable summary guidance, deletion scheduling, cancellation during the grace period, and transaction CSV import/export are implemented in code.

Still required before a production-ready release:

- Apply the dated migrations to the target database and verify them against a restored copy of production data.
- Complete Android and iOS device acceptance for SMS permission behavior, multi-currency flows, CSV sharing/import, and account deletion.
- Configure and monitor the purge worker and database backup retention; code-level cascades alone do not establish backup deletion guarantees.
- Add file-based CSV selection and correction for rows that currently fail initial parsing; add configurable budget alert thresholds and improve help/support coverage.
- Move auth throttling to a shared rate-limit service before running multiple API replicas; configure and monitor email delivery.
- Review deletion behavior against production backup retention, and confirm all visible provider and subscription controls accurately describe their unavailable state.
- Review all visible features for demo-only behavior, accessibility, error recovery, and security in the deployed environment.

## Scope for the first usable release

### Must work

- Account setup, sign-in, sign-out, session recovery, and account deletion/support path.
- Individual personal-finance workspaces, with Android and iOS supported.
- Multiple currencies across accounts, transactions, budgets, bills, goals, reports, and export from the first usable release.
- Create and manage cash/bank/card accounts with opening balances.
- Create, edit, delete, search, filter, and inspect income, expenses, and transfers.
- Import transactions with preview, duplicate detection, correction, and a clear completion summary.
- Set monthly spending budgets and compare actual spending to those budgets.
- Create recurring bills, see the next due date, mark a payment, and preserve payment history.
- See a useful home summary with an obvious data range and links to the underlying records.
- Export a user's data and understand how to disconnect data sources.
- Work without any connected bank or SMS permission. There is no bank aggregation feature.
- Provide a seven-day account-deletion recovery period followed by complete account-data deletion.

### Defer until the core is trusted

- Bank aggregation and automatic bank sync are removed from the project, not deferred.
- Automated SMS monitoring. Keep SMS as an explicit, on-demand Android import with user review; omit it on iOS.
- AI financial recommendations, beyond clearly labeled experiments. Start with deterministic calculations that can be explained and tested.
- Paid plans and checkout until billing, entitlement enforcement, support, and refunds are ready.
- Investment performance, tax advice, credit scoring, and financial product recommendations. These bring distinct data and accuracy requirements and should not be implied by basic tracking.

## Migration strategy

Deliver the migration behind small, reversible releases. Keep manual entry as the permanent primary workflow. Add database changes forward-only where possible, preserve exports/backups before transforming user data, and do not add automatic bank or SMS imports.

### Phase 0 — Stabilize, inventory, and protect data

**Goal:** Establish a safe baseline before changing core behavior.

**Work**

- Inventory each visible screen and action as `working`, `partial`, `demo`, or `unavailable`; connect every action to its API operation and persistence table.
- Confirmed first-release product: individual users; Android and iOS; multiple currencies from day one; permanent manual-entry workflow; optional, explicitly triggered SMS import on Android only.
- Apply the bank-connection database cleanup migration. Client, API, scheduler, provider catalogue, config, and documentation removal is complete. Preserve historical imported account/transaction rows, but remove old aggregator connection records and prevent new ones.
- Separate development, staging, and production Supabase projects and secrets. Confirm production never accepts local/demo data or development credentials.
- Take a database backup and document restoration steps. Define a migration history policy and a rollback plan for app releases.
- Design account deletion as a seven-day scheduled purge: immediately revoke sessions and block sign-in, allow the user to cancel within seven days, then delete the user and every owned row/blob/export/queued job. Ensure backups cannot restore identifiable user data beyond the same deadline.
- Decide the auth approach: migrate to Supabase Auth or harden the existing custom auth. Do not run both models ambiguously. Include email verification, password recovery, refresh/session expiry, rate limiting, and account deletion in the decision.
- Review every API read/write for ownership enforcement, including child rows such as bill payments, due payments, and investment transactions. Review all RLS policies and service-role usage.
- Add feature flags for Android SMS import, recommendations, and paid-plan UI. Do not add an account-aggregation flag or integration path.

**Exit gate**

- Every visible action has a named owner and a verified backend behavior.
- No aggregator routes, scheduled jobs, credentials, or aggregator provider options remain in the shipped project. Existing ledger history is preserved.
- A tested backup restore procedure and separate production secrets exist.
- Auth, account recovery, and data deletion have an approved implementation path.

### Phase 1 — Define the financial data contract

**Goal:** Make all product calculations depend on consistent, auditable data.

**Work**

- Define canonical transaction fields: owner, account, type, signed direction, positive amount, currency, merchant/title, category, transaction date, created date, notes, source, external reference, import batch, and review status.
- Store an ISO currency code on every account and transaction. The profile's preferred display currency is not a substitute for transaction currency.
- Define a preferred reporting currency and an exchange-rate model: rate, rate date, provider/source, and original amount/currency must be retained for converted summaries. Never rewrite the original transaction amount when exchange rates change.
- Define transfer semantics for same-currency and cross-currency transfers. Cross-currency transfers require explicit source amount, destination amount or rate, and fee handling; both sides must reconcile.
- Define transfer semantics. A transfer must affect two accounts exactly once and must not count as income or spending.
- Define pending/reviewed/posted/ignored states for imported records, plus a duplicate policy and a way to correct parser mistakes.
- Add stable source metadata such as `manual`, `sms_import`, or `csv_import`, and retain non-sensitive provenance needed to explain where a record came from. Never retain raw SMS text unless the product has a specific, consented need and a retention policy.
- Standardize date-only handling, timezone boundaries, currency precision, rounding, and month/week definitions. Avoid deriving a local calendar date through UTC conversion.
- Choose whether monetary values stay in numeric decimal columns or move to integer minor units; document conversion and rounding behavior before migrating existing records.
- Document currencies with zero or three minor digits and the rounding rule used at display and conversion boundaries.
- Add database constraints and indexes for positive amounts, valid account ownership, unique external identifiers, import idempotency, and valid state transitions.
- Make multi-step operations atomic: transfer creation, bill payment plus recurrence advancement, and goal contribution plus balance update.
- Create a versioned API contract and a safe, repeatable migration workflow. Keep compatibility until all supported clients move.

**Exit gate**

- The same test dataset produces the same account balances, monthly totals, and category totals in the API and app.
- Retried writes do not create duplicate transactions or payments.
- Transfers do not change net worth or spending totals incorrectly.
- Mixed-currency totals always show their reporting currency and the rate date/source; original amounts remain available.
- A user cannot read or mutate another user's records through any endpoint.

### Phase 2 — Make transaction tracking dependable

**Goal:** Ship one complete and low-friction money tracking loop.

**Work**

- Improve first-run setup: choose currency, create or confirm a first account, enter an opening balance, and optionally add recurring income. Explain that all values can be changed later.
- Onboarding asks for a preferred reporting currency while each account and transaction keeps its own currency. Support multiple currencies simultaneously from launch on Android and iOS.
- Make transaction creation explicit and complete: account, amount, transaction type, date, category, merchant/description, and optional note. Provide useful defaults without silently guessing.
- Add account balance reconciliation. Let a user enter the current statement balance and show the difference between recorded and expected balances.
- Add transaction list filters for date range, account, category, type, and source; support pagination and search on the backend as data grows.
- Build an import inbox. Parse/import into a preview list first; show likely duplicates and uncertain fields; allow edit, accept, or ignore; only then post accepted rows to the ledger.
- Add an import history page with source, requested date range, scanned/accepted/duplicate/ignored/failed counts, and retry behavior.
- For SMS, request Android permission only from the explicit user action; explain what is read and sent; process a bounded set; display preview; never schedule background reads.
- Keep SMS as optional Android-only import. Do not request or imply SMS access on iOS; provide the same core tracking through manual entry and CSV import on both platforms.
- Extend CSV import with file selection, editable per-row correction, support for cross-account transfers, and import history. Pasted CSV import, preview, validation, idempotency, and transaction CSV export exist on web and mobile.
- Ensure edits and deletions update account balances and all summaries consistently. Prefer deriving balances from opening balance plus ledger entries or using an atomic ledger operation; avoid independent state updates that can drift.
- Make offline and API failures clear. Do not show a saved success state until the write is confirmed; preserve a recoverable draft when a request fails.

**Exit gate**

- A new user can create an account and complete 20 transactions without help.
- A user can correct every imported transaction before it affects reports.
- Android and iOS users can record and report transactions in multiple currencies without enabling SMS or any external financial connection.
- Re-importing the same source data is idempotent.
- Exported transaction data can be opened and reconciled against the app's totals.
- No SMS or bank import occurs without explicit user action and visible confirmation/status.

### Phase 3 — Ship budgets and bills on trusted records

**Goal:** Turn the ledger into a useful plan for the current month.

**Budgets**

- Support monthly category budgets with a per-budget choice of rollover or no rollover. Make rollover rules explicit for leftover and overspent amounts, and preserve each month's finalized budget result for history.
- Provide a setup flow that proposes budgets from user-entered values or available history, labels estimates, and asks the user to confirm them.
- Show budgeted, spent, remaining, and projected amount with a selectable month and drill-down transactions.
- Define treatment of refunds, transfers, uncategorized transactions, cash withdrawals, and edited/late-arriving records.
- Support category edits and custom categories without breaking historical reports.
- Add optional alerts at configurable thresholds; make notifications opt-in and avoid alert fatigue.

**Bills**

- Separate a recurring bill definition from individual due occurrences and payments. Record due date, amount, recurrence rule, account, reminder settings, and status for each occurrence.
- Marking a bill paid should create one payment record and advance the next occurrence correctly. Every time, ask whether to also create a linked expense transaction; remember the answer only for that occurrence, and avoid counting the payment twice in budget totals.
- Support partial payments, changed amounts, skipped occurrences, one-time bills, and cancellation of future occurrences.
- Show an upcoming/overdue calendar/list with clear time zone and a reminder preview.
- Keep payment history even when a bill is edited or stopped.

**Exit gate**

- Budget totals equal the sum of their visible underlying transactions for the chosen date range.
- Bill recurrence handles month-end dates, leap years, and time zones predictably.
- Repeated taps/retries on “mark paid” cannot create duplicate payments or advance a bill twice.
- The bill-payment flow asks on every occurrence whether to create a linked expense, and either choice yields correct ledger and budget totals.
- A bill payment linked to a transaction appears once in spending and once in bill history, according to the product's documented rules.

### Phase 4 — Add financial guidance people can verify

**Goal:** Convert reliable records into understandable next steps.

**Work**

- Start with deterministic insights: spending pace vs. budget, largest category changes, upcoming bills relative to available cash, missed bill reminders, and goal contribution pace.
- Every insight must show the calculation window, relevant records, and a plain-language reason. Example: “Dining is at 82% of its ₹8,000 monthly budget with 10 days left.”
- Label incomplete coverage. If the user has only entered some accounts, say “Based on the accounts and transactions you added,” not “Your total spending.”
- Let users dismiss, snooze, or correct an insight. Corrections should update the underlying data path rather than merely hide an inaccurate message.
- Avoid prescriptive financial, investment, debt, tax, or credit advice in the initial release. Keep guidance informational and tied to user-defined budgets and dates.
- Add an “insights quality” feedback action and track helpful/not helpful without collecting message content unnecessarily.

**Exit gate**

- Each insight can be reproduced from a documented query/calculation.
- Missing or stale data is visible and suppresses misleading conclusions.
- A reviewer can understand why every insight appeared and how the user can act on it.

### Phase 5 — Product quality, accessibility, and operations

**Goal:** Make the product comfortable and supportable beyond the happy path.

**Work**

- Standardize loading, empty, offline, validation, permission-denied, timeout, retry, and success states across screens.
- Add accessible labels, screen-reader order, scalable text, adequate contrast, and touch targets. Verify Android behavior on small and large screens.
- Reduce hidden navigation and provide consistent back behavior, destructive-action confirmation, and undo where safe.
- Improve performance for long histories through API pagination, query indexes, and list virtualization.
- Add structured server logs with request IDs, error categories, and redaction. Never log passwords, tokens, bank credentials, raw SMS, or full financial payloads.
- Add product analytics only for consented, minimal events needed to understand activation and reliability. Make analytics settings clear and avoid sending transaction contents.
- Add service health checks, dependency timeouts, retry limits, alerting, backup monitoring, and an operational incident checklist.
- Build and monitor the seven-day purge worker. It must be idempotent, retry safely, cover every data store and provider, and produce a minimal non-identifying completion audit. Deletion requests and cancellations must be visible to the user.
- Write user-facing help for setup, data import, correction, export, privacy, account recovery, and contacting support.
- Remove or clearly gate demo/test paths and paid-plan controls that imply functionality that does not exist.

**Exit gate**

- Core flows are keyboard/screen-reader accessible and have no dead-end error states.
- Support can identify and diagnose a failed sync/import without accessing message bodies or passwords.
- Production errors and dependency outages are observable and recoverable.

### Phase 6 — Controlled pilot and general availability

**Goal:** Verify the product with real workflows before broad release.

**Pilot**

- Start with a small group using manual tracking, multi-currency, budgets, and bills. Keep optional Android SMS import off until its review and privacy gates pass.
- Provide an in-app feedback route and a clear way to export/delete test data.
- Verify both Android and iOS, multi-currency conversion, both budget rollover modes, and the seven-day account deletion lifecycle.
- Review failed writes, incorrect totals, duplicate reports, support questions, and onboarding drop-off weekly.
- Fix correctness and trust issues before expanding features or adding marketing claims.

**General availability gate**

- No unresolved critical/high security findings.
- Backup restoration has been completed successfully in a non-production rehearsal.
- Account registration, sign-in, recovery, sign-out, and seven-day deletion/purge flows are documented and verified.
- All first-release transactions, multi-currency calculations, both budget rollover modes, bills, and exports pass end-to-end acceptance scenarios on supported Android and iOS devices.
- Privacy notice, terms, data retention, analytics disclosure, and support contact are available in the app/store listing.
- Feature flags, rollback release, on-call owner, and incident response process are ready.

## Data migration and rollout rules

1. Snapshot production before each schema migration and verify restore ability.
2. Use additive schema changes first: add nullable columns/tables, deploy compatible API, backfill, then enforce constraints in a later release.
3. Backfill in bounded batches with counts, checksums, and resumable checkpoints.
4. Preserve IDs and user ownership. Never merge accounts or deduplicate financial records solely by fuzzy merchant/date/amount matching.
5. For possible duplicates, flag for user review; use stable provider IDs or one-way import fingerprints where available.
6. Reconcile row counts and account/category totals before and after every transformation.
7. Keep export available before and after migration. Do not delete old fields/tables until the rollback window closes.
8. Use feature flags for new calculation paths and compare results in shadow mode before switching user-visible totals.
9. Provide a clear incident path for incorrect balances: pause affected import, preserve raw audit metadata where allowed, correct ledger entries, notify affected users, and restore from backup if required.

## Quality and readiness scorecard

Track these measures during the pilot. Set numerical targets after collecting a baseline; do not invent targets from an untested prototype.

| Area | Measure |
| --- | --- |
| Activation | New users who finish setup and add a first transaction |
| Tracking reliability | Failed writes, duplicate imports, corrected imported fields, balance reconciliation differences |
| Budgets | Users who set at least one budget and return to review it |
| Bills | Upcoming bills with a due date, reminders delivered, duplicate or missed payment records |
| Guidance | Insight helpfulness, correction rate, and percentage with complete data coverage |
| Reliability | Crash-free sessions, API success/error rate, workspace sync latency, recovery after outage |
| Trust | SMS permission opt-in on Android, export/deletion completion, privacy/support complaints |
| Accessibility | Critical flow completion with screen reader and larger text |

## Suggested milestone sequence

| Milestone | Result |
| --- | --- |
| M0: Safe baseline | Feature inventory, security review, production integrations gated, restore rehearsal |
| M1: Trusted ledger | Stable data contract, atomic ledger operations, correct totals and transfers |
| M2: Tracking MVP | Setup, manual ledger, correction, CSV and explicit SMS review flow |
| M3: Planning MVP | Monthly budgets, bill occurrences/payments, clear reminders |
| M4: Guidance MVP | Explainable deterministic insights on complete/clearly scoped data |
| M5: Pilot ready | Accessibility, error handling, observability, support and privacy material |
| M6: General release | Pilot feedback resolved, operational and security gates passed |

## First execution backlog

Begin with these decisions and tasks, in order:

1. Lock the confirmed product boundary: individual users, Android+iOS, multi-currency from launch, permanent manual entry, Android-only optional SMS, no bank aggregation.
2. Audit all app screens and mark each feature as complete, partial, demo, or unavailable.
3. Apply the removal migration for old aggregator connection records; the application code has already been removed, and historical ledger entries are preserved.
4. Decide the auth/recovery model and perform an endpoint-by-endpoint ownership review.
5. Document the canonical transaction, account balance, category, budget period, and bill occurrence rules.
6. Build a representative acceptance dataset: income, expense, transfer, refund, recurring bill, partial payment, duplicate import, and month-end dates.
7. Use that dataset to validate the ledger and totals before redesigning more screens.

## Confirmed product decisions

- **User:** individual personal-finance customers.
- **Platforms:** Android and iOS.
- **Currencies:** multiple currencies supported from day one, including on accounts, transactions, budgets, bills, goals, reports, and exports.
- **Bank data:** no bank aggregation, provider bank connection, or background bank sync in this project.
- **Default tracking:** manual entry is the permanent default and must be fully usable.
- **SMS:** optional explicit import on Android only. iOS uses manual entry and CSV import/export. The app does not attempt to access iOS SMS.
- **Budgets:** users can choose rollover or no rollover per budget.
- **Bill payment:** ask each time whether to create a linked expense transaction.
- **Account deletion:** code schedules a seven-day purge and cascades owned database rows. Production backup retention, purge-worker uptime, and completion monitoring must be configured before claiming complete deletion guarantees.

The seven-day deletion deadline applies across primary databases, queued jobs, analytics stores, and operational exports. Backups must use per-user encryption keys that can be destroyed at deletion, or a retention/rotation scheme that makes the user's data unrecoverable by the seven-day deadline. Keep only a non-identifying deletion audit record where legally required.

## Remaining product decision

- Which support channel and response commitment can the product actually provide?

