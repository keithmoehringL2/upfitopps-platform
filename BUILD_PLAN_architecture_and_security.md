# Upfit Opps — Technical Architecture, Data & Security Plan

_Companion to `design_handoff_upfit_opps/prd.txt` and `README.md`. This document translates the PRD into an engineering plan: what the build entails, the data model, where the data lives, and the security controls required for a multi-tenant platform that carries confidential distributor data and manufacturer-isolated reporting._

Author context: L2 Digital, hosting on GitHub + Vercel. Target MVP, initial manufacturer Adrian Steel.

---

## 1. What this build actually is

Strip away the domain language and Upfit Opps is **a multi-tenant SaaS app with three hard problems stacked on top of ordinary CRUD:**

1. **Strict tenant isolation** — every distributor is a separate walled garden reached by its own subdomain, sharing one database and one codebase.
2. **Three different auth models in one app** — password login (managers), passwordless email device-sessions (reps), and a separate password portal (manufacturers).
3. **Aggregate-only, cohort-scoped reporting for manufacturers** — the single most sensitive requirement. Manufacturers must see numbers derived *only* from their program's VIO cohort, never company names, contacts, financials, or any activity that isn't attributable to their program — even when a VIO prospect later becomes the distributor's private customer.

Everything else (companies, queues, outcomes, opportunities, quotes, CSV import) is conventional and low-risk by comparison. The engineering effort and the security risk both concentrate in #1–#3. **Get those three right and the rest is execution.**

What the MVP explicitly does **not** build (keep scope honest): no web scraping, no VIO consolidation, no AI validation, no score calculation, no CRM/ERP/quoting integrations, no pipeline stages, no revenue/quote-value capture, no territory auto-routing. L2 prepares data offline and uploads CSVs; the app displays, assigns, queues, records, and reports.

---

## 2. Recommended stack

| Layer | Recommendation | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | PRD/handoff already assume React/Next; one codebase serves all four role surfaces; first-class on Vercel; middleware handles subdomain routing cleanly. |
| Hosting | **Vercel** | Your constraint. Wildcard domain + wildcard TLS, serverless functions, Cron, Blob storage, env-var secrets all in one place. |
| Database | **Postgres** — Neon (via Vercel Postgres) or Supabase | Relational, strongly consistent, mature. The data is deeply relational (companies ↔ owners ↔ activities ↔ history ↔ programs). Row-Level Security available as defense-in-depth. |
| ORM / query layer | **Prisma** or **Drizzle** | Typed schema, parameterized queries (SQL-injection protection by default), migrations in version control. Drizzle is lighter/faster-cold-start; Prisma is more batteries-included. Either is fine. |
| Auth | **Build it** (don't adopt a turnkey provider wholesale) | The three auth flows (esp. passwordless rep device-sessions + manager revocation) don't map cleanly onto Auth0/Clerk/Supabase-Auth defaults. Use a vetted session library (e.g. Lucia-style sessions, or iron-session for cookies) + your own token tables. See §6. |
| Email | **Resend** or **Postmark** | Transactional + branded daily rep emails and manager summaries. Postmark has strong deliverability/templating; Resend integrates smoothly with Vercel/Next. |
| File storage | **Vercel Blob** or **Supabase Storage** | Only asset is per-distributor logos — small, infrequent. |
| Background jobs | **Vercel Cron** + idempotent job handlers | Daily email send, queue pre-build, cadence/touch scheduling, report snapshots, notification retries. See §10. |
| Validation | **Zod** | Validate every API input and every CSV row against a schema at the boundary. |

**One strong recommendation:** if you want to lean on the database itself to enforce tenant isolation (belt *and* suspenders), **Supabase** is attractive because it bundles Postgres + Row-Level Security + storage. But RLS with custom passwordless sessions requires passing tenant context into the DB session (e.g. `SET LOCAL app.distributor_id`), which adds complexity. My default recommendation is **Neon Postgres + enforce isolation in the application's data-access layer** (a single audited query gateway), with RLS as an optional second layer once the app layer is solid. Pick one place to be the source of truth for authorization and make it impossible to bypass — see §7.

---

## 3. Where the data lives (hosting topology on Vercel)

```
                    *.upfitopps.com  (wildcard DNS A/CNAME → Vercel)
                    *.upfitopps.com  (wildcard TLS cert, auto-managed by Vercel)
                              │
                     ┌────────┴─────────┐
                     │  Next.js on Vercel│
                     │  middleware reads │  ← resolves subdomain slug → distributorId
                     │  Host header,     │     before any route handler runs
                     │  sets tenant ctx  │
                     └────────┬──────────┘
          ┌───────────────────┼───────────────────┬────────────────┐
          │                   │                   │                │
   ┌──────┴──────┐    ┌───────┴──────┐    ┌───────┴─────┐   ┌──────┴──────┐
   │  Postgres   │    │ Blob storage │    │ Email (Resend│   │ Vercel Cron │
   │  (Neon)     │    │ (logos)      │    │ /Postmark)   │   │ (schedulers)│
   │  all tenant │    │              │    │              │   │             │
   │  data +     │    └──────────────┘    └──────────────┘   └─────────────┘
   │  audit log  │
   └─────────────┘
```

**Domains:**
- `upfitopps.com` (apex) and `*.upfitopps.com` (wildcard) both point to the Vercel project. Add the wildcard domain in Vercel so new distributor slugs (`truckcolors.upfitopps.com`) resolve with no per-tenant DNS work. TLS is auto-provisioned for the wildcard.
- Reserve non-tenant hostnames: `www`, `app`, `admin`, `api`, `mail`, `static`, etc. Managers log in at the apex; the L2 Admin portal and Manufacturer portal should live on reserved hosts (e.g. `admin.upfitopps.com`, `portal.upfitopps.com`) so they can never collide with a distributor slug. Validate slugs against this reserved list at creation.

**Data residency:** All relational data in one Postgres instance, logically partitioned by `distributor_id` / `manufacturer_id` — not physically separate databases per tenant. This is the standard shared-schema multi-tenant pattern and the right call for MVP economics. Physical isolation is a future option if a large customer demands it.

**Backups / retention:** Choose a managed Postgres with point-in-time recovery (Neon and Supabase both offer it). The PRD flags backup/retention policy as an open decision (§13 below) — commit to one before pilot: e.g. PITR + daily logical dumps retained 30 days, plus the application-level **import rollback** mechanism (§9) which is separate from infra backups.

---

## 4. Data model

The handoff's `Company` shape and PRD §15 give the entity contract. Here is a normalized relational schema. Every table except the top-level tenant/manufacturer tables carries a tenant foreign key.

### 4.1 Core entities

**Tenancy & accounts**
- `distributor` — id, name, **slug (unique, validated)**, logo_url, primary_color, status, settings (jsonb: cadences, email schedule, leaderboard on/off, daily-target defaults), created/updated.
- `manufacturer` — id, name, status.
- `manufacturer_program` — id, manufacturer_id, name. A manufacturer's offering.
- `program_distributor` — join: program_id, distributor_id, regional_rep_user_id. **This is the attribution backbone** — it links one distributor's participation in one manufacturer program to the regional rep who may view it. A distributor can appear in multiple programs independently.

**Users & sessions**
- `user` — id, email, role (`l2_admin | manager | rep | mfr_regional | mfr_leadership`), distributor_id (nullable — null for L2/manufacturer users), manufacturer_id (nullable), password_hash (nullable — reps have none), status (`active | paused | disabled`), daily_target (rep), daily_email_enabled (rep), created/updated.
- `session` — id, user_id, token_hash, device fingerprint, expires_at, revoked_at, created_at, last_seen. Reps' persistent device sessions and managers'/manufacturers' sessions all live here, revocable individually.
- `email_verification_token` — id, user_id, token_hash, purpose (`rep_device_verify | password_reset`), expires_at, consumed_at. Short-lived, single-use.

**Companies & contacts** (all `distributor_id`-scoped)
- `company` — id, distributor_id, **external_import_id** (the stable upsert key, unique per distributor), name, legal_name, address, city, state, zip, website, phone, industry_primary, industry_sub, description, locations (jsonb), total_vehicles, truck_count, van_count, fleet_mix (jsonb), **priority_score (0–5)**, priority_explanation, **source_program_id** (immutable attribution → which VIO cohort/program this company came from, or null for distributor-sourced), state (`cold | customer | opp`), suppressed (`null | remove | dnc`), next_eligible_date, touch_interval_days, last_touch_date, owner_user_id (nullable), created/updated.
- `candidate_contact` — id, company_id, name, title, source_url, source_date. AI-suggested, informational only, never "confirmed."
- `primary_decision_maker` — id, company_id (0-or-1 active per company), name, title, phone, email, notes, confirmed_by_user_id, confirmed_at. History via `audit_log` or a `_history` table.

**Work & outcomes** (all tenant-scoped)
- `ownership_history` — id, company_id, from_user_id, to_user_id, changed_by_user_id, changed_at, reason (`manual | bulk | departure | import`).
- `queue_session` — id, rep_user_id, date, target, built_at. Stable per-rep daily queue.
- `queue_item` — id, queue_session_id, company_id, rank, pool (`priority | never_contacted | continue`), status (`open | done | skipped | exited`), result, fresh (bool). Immutable delivery record.
- `activity_event` — id, company_id, actor_user_id, outcome (`no_answer | voicemail | gatekeeper | decision_maker | wrong_number`), note, gatekeeper_name, dm_disposition (`keep | not_interested`), created_at, **client_event_id (for idempotent offline sync)**, program_id (attribution snapshot). Append-only.
- `follow_up` — id, company_id, due_date, note, created_by, created_at, satisfied_at. Explicit dates override cadence.
- `opportunity_event` — id, company_id, created_by, description, created_at.
- `quote_event` — id, company_id, created_by, created_at. Count/event only — **no amount field by design.**
- `suppression` — modeled as `company.suppressed` enum + an audit entry; DNC is durable and import-proof.

**Import & audit**
- `import_batch` — id, distributor_id, uploaded_by, filename, column_map (jsonb), row_counts (jsonb: created/updated/errors), status (`previewed | committed | rolled_back`), created_at. Enables rollback/recovery.
- `import_row_error` — id, import_batch_id, row_number, field, error_code, raw_value.
- `audit_log` — id, distributor_id (nullable), actor_user_id, action (import, login, permission change, ownership change, DM confirmation, quote change, settings change, suppression change), target_type, target_id, before (jsonb), after (jsonb), created_at. **High-impact edits must land here.**
- `notification_job` / `report_snapshot` — scheduled email + reproducible aggregated metrics with delivery/retry/failure state.

### 4.2 Relationships that matter most

- `company.distributor_id` on **every** company-related row — the primary isolation key.
- `company.source_program_id` + `activity_event.program_id` — the **manufacturer attribution chain**. Manufacturer reporting joins *only* through these. This is what keeps a distributor's private customer activity invisible to the manufacturer even after a VIO company converts. See §8.
- `company.external_import_id` (unique per distributor) — the CSV upsert key. Ambiguous matches are rejected for manual correction, never silently merged.

### 4.3 Protected-on-import fields

These are written by users in-app and must **never** be overwritten by a CSV re-import unless an explicit field-level override is checked: `owner_user_id`, confirmed `primary_decision_maker`, `activity_event`s, `opportunity_event`s, `quote_event`s, `suppressed` (especially `dnc`), and explicit `follow_up` dates. Imports may freely update: name/address/fleet/priority_score/industry/description and other L2-sourced descriptive fields.

---

## 5. Multi-tenancy & subdomain routing

- **Next.js middleware** runs on every request, reads the `Host` header, extracts the slug, looks up `distributor_id` (cache this lookup), and attaches tenant context to the request. Reserved hosts (`admin`, `portal`, apex) short-circuit to the L2/manufacturer/manager apps.
- The tenant context resolved from the host is **advisory for routing only**. Authorization (§7) must independently re-derive what the *authenticated user* is allowed to touch and confirm it matches the host's tenant. A rep's session for distributor A arriving on distributor B's subdomain must be rejected — never trust the subdomain alone to grant access.
- Slug validation at creation: lowercase alphanumeric + hyphens, length bounds, uniqueness check, **reserved-word denylist**, and a confusable/trademark sanity check is worth adding.

---

## 6. Authentication architecture (three flows, one session table)

**Flow A — Distributor Manager (password)**
- Login at apex with username/email + password. Argon2id (preferred) or bcrypt (cost ≥ 12) hashing.
- Rate-limit login attempts per IP and per account (e.g. progressive backoff / lockout). Return a generic error — never reveal whether the username exists.
- Password reset: email a single-use, 30-minute-expiry token; the confirmation screen must say "if an account exists…" (no user enumeration — the handoff copy already does this correctly).
- Session cookie: `Secure; HttpOnly; SameSite=Lax`, server-side session row, revocable.

**Flow B — Sales Rep (passwordless device session)** — the subtle one
- Reps never set a password. First access (or an expired session) requires a **short-lived, single-use email verification link**. Consuming it establishes a **persistent device session** (initially 30-day renewable).
- **Critical distinction from the PRD:** the *daily* email deep-links are **contextual navigation**, not authentication tokens. They navigate to a specific company/queue; if the device already holds a valid session, they just open the record. If not, the user is bounced through verification first. Do **not** make the daily links themselves grant access — otherwise a forwarded email = account takeover.
- Implementation: verification token (single-use, ~15 min) → on consume, mint a device session (cookie, HttpOnly/Secure/SameSite, 30-day sliding expiry) and bind it to the user. Store token *hashes*, not raw tokens.
- **Manager revocation:** manager can revoke a rep's sessions (sets `revoked_at`) and pause their daily emails. Revocation must take effect immediately — every request validates the session row server-side (no stateless-JWT-only sessions that can't be revoked).

**Flow C — Manufacturer (password portal, fully separate)**
- Own authenticated accounts, password-based. **Never inherit distributor access.** A manufacturer user has `manufacturer_id` and a permission level (`regional` scoped to assigned `program_distributor` rows, or `leadership` scoped to all of their manufacturer's programs). Host these on the reserved portal subdomain.

**All sessions:** server-side, individually revocable, `Secure/HttpOnly/SameSite`, with sensible absolute + idle timeouts. Session expiration policy is an open decision (§13) — pick concrete numbers before pilot.

---

## 7. Authorization & data-visibility enforcement (the core control)

> The PRD says it twice and the handoff bolds it: **enforce isolation in server queries and exports, not merely UI filtering.** This is the make-or-break control.

**Design principle: a single authorization gateway, impossible to bypass.**

- Every API call authorizes against the full context: **role + distributor_id + manufacturer_id + program_id + regional assignment + record source.**
- Implement a **data-access layer** that *requires* the caller's auth context and injects the tenant predicate into every query. Do not let route handlers write raw `SELECT * FROM company WHERE id = ?` — they call `companies.getById(ctx, id)` which always appends `AND distributor_id = ctx.distributorId`. Make the unsafe path hard to write (e.g. no exported raw-query helper that skips context).
- **Default-deny:** a new endpoint with no explicit scope returns nothing, not everything.
- **Row-Level Security as a second layer (optional but recommended):** Postgres RLS policies keyed on a session-local tenant variable catch any application bug that forgets the predicate. Belt and suspenders.

**Role-by-role visibility (must hold at the query layer, including exports/tooltips):**
- **Rep:** their own assigned companies in their distributor. ZIP search may surface *any* cold prospect in the ZIP (with owner shown) but **never reassigns**. Can log activity/quotes on colleague-owned records without changing ownership. Cannot manage users/settings/ownership.
- **Manager:** every company and rep **in their distributor only**.
- **Manufacturer:** **aggregates only.** No company names, contacts, notes, or rep-level data anywhere — including CSV/PDF exports and chart tooltips. Regional = assigned distributors in their region; Leadership = all regions for their manufacturer + distributor comparison.
- **L2 Admin:** all distributors + manufacturer users. (MVP: no impersonation.)

**Testing this is non-negotiable.** Write authorization tests as acceptance gates (PRD §18): a rep token cannot read another distributor; a manufacturer endpoint cannot return a company name; a revoked session fails; a subdomain mismatch is rejected.

---

## 8. Manufacturer isolation — the hardest requirement

This deserves its own treatment because it's where a quiet bug becomes a contractual/legal breach.

**The rule:** every manufacturer metric is computed **only** from (a) leads source-attributed to that manufacturer's program (`company.source_program_id`) **and** (b) outreach/outcomes attributable to that program (`activity_event.program_id`). Distributor-sourced existing customers, unrelated cold leads, private notes, quote financials, and any later/unrelated customer relationship are invisible.

**How to build it so it can't leak:**
1. **Attribution is immutable and stamped at write time.** When a company is imported under a program, `source_program_id` is set and never changes. When an activity is logged, snapshot the governing `program_id` onto the event. Reporting never infers attribution after the fact.
2. **A VIO company becoming a customer does not widen access.** Because manufacturer queries filter on `source_program_id`/`program_id` and only emit aggregates, the company's later private activity (customer touch-bases, distributor-sourced quotes, private notes) simply never matches the manufacturer's scope. State transitions don't grant retroactive visibility.
3. **Manufacturers get a separate, aggregate-only query surface.** Build dedicated reporting endpoints/views that can *only* return counts, rates, and time series — they have no code path that can return a `name`, `phone`, `email`, `note`, or `quote amount`. Physically separate these read models (e.g. a reporting service/view that selects only numeric aggregates) so a future careless `SELECT *` can't exist there.
4. **Minimum cohort sizing (recommend adding):** consider suppressing any aggregate computed over a very small cohort (e.g. < 5 companies) to prevent re-identification of a single company's activity from a "company quoted = 1 of 1" style metric. The PRD doesn't require this but it's a real re-identification risk worth a product decision.
5. **Exports go through the same scoped read model** as the UI. No "download raw" path for manufacturers.

---

## 9. CSV import pipeline

Four steps (handoff): **Upload → Map columns → Preview → Commit** (+ Done), L2 Admin only.

- **Upload:** desktop CSV, size-capped, parsed server-side (stream large files). Validate MIME/extension; never execute; store the raw file in Blob tied to the `import_batch`.
- **Map columns:** map CSV headers to the canonical field contract. **The exact column contract + upsert key is an open decision (§13) — nail it down first.** Preferred upsert key = stable distributor-scoped `external_import_id`.
- **Preview (dry run):** compute create / update / error counts without writing. Surface: missing required fields, invalid priority scores (outside 0–5), unknown owner emails, bad ZIP formatting, duplicate IDs, conflicting source/program metadata, and **ambiguous matches (rejected for explicit correction, never silently merged).**
- **Commit (transactional upsert):** within one transaction — insert new companies, update matching ones, **preserve protected fields** (§4.3) unless an explicit field-level override is set. Write `import_batch` + per-row errors + an `audit_log` entry. **DNC suppression can never be reactivated by import.**
- **Rollback/recovery:** keep enough per-row before/after state (or snapshot) to reverse a committed batch. This is an app-level control distinct from DB backups.
- **Source attribution immutability:** matching an existing customer to VIO data must not expose past customer interactions to the manufacturer (ties to §8) and must not overwrite existing immutable `source_program_id`.

---

## 10. Background jobs & email

Vercel Cron triggers idempotent HTTP job handlers. Required services (PRD §15):

| Job | Cadence | Notes |
|---|---|---|
| Queue builder | nightly / on-demand pre-rep-day | Build each active rep's stable daily `queue_session` using the 70/30 rule (see below). |
| Daily rep email | per distributor's configured day/time (local) | Branded, top-5 starters, deep links, follow-up reminders. Skip paused reps. |
| Touch-cadence scheduler | daily | Surface existing-customer reminders + explicit follow-ups due today/overdue. |
| Manager summary email | daily or weekly per settings | Team + per-rep counts/rates; reproducible from `report_snapshot`. |
| Notification delivery/retry | continuous/queued | Delivery, retry, failure handling for all emails. |
| Report aggregation | on schedule | Materialize `report_snapshot`s for fast, reproducible dashboards. |

**Queue 70/30 rule (from handoff — implement precisely):** queue size = target. `round(target × 0.3)` slots → never-contacted companies (ranked by score desc); remaining slots → highest-priority eligible companies (incl. previously contacted, now due). Combine, sort by score desc. If a pool is short, fill from the other. **Define deterministic rounding** for small targets (open decision §13). **Eligible** = owned by rep, state cold, not removed/DNC, no pending explicit follow-up, next_eligible_date ≤ today.

**Email auth note (repeat of §6):** daily links are navigation, not credentials.

---

## 11. Offline support (rep mobile)

The handoff requires a real offline queue: outcomes save to **IndexedDB** on the phone and sync on reconnect. Engineering implications:
- Outcome submission API must be **idempotent**: the client generates a `client_event_id` (UUID) per outcome; the server upserts on it so a retried sync never double-records an attempt. (This is why `activity_event.client_event_id` exists in §4.)
- Prevent double-submission server-side and in the UI ("Saving…" state, disabled buttons).
- Sync must re-run eligibility/cadence calculations server-side authoritatively — the phone's optimistic state is provisional.
- Consider a PWA/service-worker for the offline shell. Keep scope tight for MVP.

---

## 12. Security measures — consolidated checklist

**Authentication & sessions**
- [ ] Argon2id/bcrypt password hashing; per-account + per-IP login rate limiting; account lockout/backoff.
- [ ] No user enumeration on login or password reset.
- [ ] Password reset tokens: single-use, 30-min expiry, hashed at rest.
- [ ] Rep verification tokens: single-use, short expiry, hashed; device sessions 30-day sliding, server-side, revocable.
- [ ] Daily email deep-links are navigation only, never bearer credentials.
- [ ] Cookies `Secure; HttpOnly; SameSite`; absolute + idle session timeouts; manager can revoke rep sessions instantly.

**Authorization & isolation**
- [ ] Single mandatory data-access gateway injecting tenant predicate on every query; default-deny.
- [ ] Every API call authorized against role + distributor_id + manufacturer_id + program_id + regional assignment + record source.
- [ ] Subdomain tenant must match the authenticated user's tenant; mismatch rejected.
- [ ] Manufacturer read model is aggregate-only with no code path to names/contacts/financials; exports use the same scoped model.
- [ ] (Recommended) Postgres RLS as a second enforcement layer; (recommended) small-cohort suppression threshold.

**Data integrity & audit**
- [ ] `audit_log` for import, login, permission, ownership, DM confirmation, quote, settings, suppression changes (actor + timestamp + before/after).
- [ ] Protected-field preservation on import with explicit field-level override only.
- [ ] Immutable `source_program_id`/`program_id` attribution.
- [ ] DNC suppression never reactivated by import.
- [ ] Idempotent outcome writes (client_event_id).

**Platform & transport**
- [ ] Wildcard HTTPS (Vercel-managed); HSTS.
- [ ] Parameterized queries only (ORM); Zod validation at every boundary incl. each CSV row.
- [ ] Secrets in Vercel env vars (DB URL, email API keys, signing secrets); never in the repo. Separate preview/production env values.
- [ ] Security headers (CSP, X-Content-Type-Options, Referrer-Policy, frame-ancestors) — the app handles sensitive data and should not be framable.
- [ ] Least-privilege DB credentials; rotate.
- [ ] CSV upload validated (type/size), stored isolated, never interpreted as code.
- [ ] Dependency scanning (Dependabot/`npm audit`) in GitHub; branch protection + PR review on `main`.
- [ ] Rate-limit public/unauthenticated endpoints (login, verification, password reset).

**Privacy / contractual (flagged, not purely technical)**
- [ ] Confirm VIO licensing, distributor source-data rights, consent, and manufacturer reporting permissions in written agreements (PRD §17) — affects what you're even allowed to store/show.
- [ ] Retention/deletion policy + complete opt-out handling (open decisions below).

---

## 13. Open decisions to lock before building (PRD §19)

These block or reshape the schema/jobs — decide them first:

1. **Exact CSV column contract + upsert key.** Everything in import/attribution depends on this. _Highest priority._
2. **Session expiration policy** (rep device-session absolute max; manager/manufacturer idle+absolute timeouts).
3. **Manager & manufacturer auth implementation** (confirm "build it" vs. a provider — recommendation: build on a vetted session lib).
4. **Queue rounding for small targets** (deterministic rule for `round(target × 0.3)` when target is tiny).
5. **Backup & retention policy** (PITR window, dump retention, import-rollback retention).
6. **Complete opt-out / DNC + data-subject deletion handling.**
7. **Allowed manufacturer field visibility** (exact aggregate list; small-cohort suppression threshold).
8. **Design prerequisite:** verified screenshot / approved design tokens from `ptc.upfitopps.com/cost-calculator` to match the existing white-label look before high-fidelity build.

---

## 14. Suggested build phases

1. **Foundation** — Next.js + Postgres + Prisma/Drizzle on Vercel; wildcard domain + middleware subdomain routing; the data-access gateway and auth-context plumbing; `distributor`/`user`/`session`/`audit_log` tables. _Prove tenant isolation with tests before building features on top._
2. **Auth** — all three flows end-to-end, revocation, rate limiting, reset.
3. **L2 Admin + CSV import** — distributor provisioning, branding, users, the full import pipeline with preview/upsert/protected-fields/rollback. (Nothing else has data without this.)
4. **Manager** — overview, companies table, bulk assign/reassign/unassign, ownership history, settings (cadences/targets/email/leaderboard).
5. **Rep mobile** — queue (70/30), company detail, log outcome, follow-ups, ZIP finder, opportunity/quote, then offline sync + daily email.
6. **Manufacturer portal** — aggregate-only reporting (regional + leadership), built against the isolated read model. _Treat its isolation as a security feature with its own test suite._
7. **Hardening** — security headers, pen-test the isolation boundaries (cross-tenant, manufacturer leakage, revoked sessions, subdomain spoofing), load/test email + cron, finalize retention/opt-out.

---

### The one thing to get right first
Before any feature work, build and **test the isolation boundary**: the tenant-scoped data-access gateway + the three auth flows + the manufacturer aggregate-only read model. Every acceptance scenario in PRD §18 that matters for security ("cannot expose a different tenant," "inaccessible via every endpoint/export") is a test you can write on day one against that foundation. If that layer is sound, the rest of Upfit Opps is standard CRUD you can build with confidence.
