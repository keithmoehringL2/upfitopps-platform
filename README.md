# Upfit Opps — Platform

Multi-tenant market development platform for commercial vehicle distributors.
This is the application that owns `upfitopps.com` (apex + `*.upfitopps.com`
wildcard). The existing white-label calculators (`ptc.`, `messer.`) are a
separate repo/project and are untouched by this one.

> Planning docs: [`BUILD_PLAN_architecture_and_security.md`](./BUILD_PLAN_architecture_and_security.md)
> and [`REPO_AND_DOMAIN_SETUP.md`](./REPO_AND_DOMAIN_SETUP.md).
> Product source: [`design_handoff_upfit_opps/`](./design_handoff_upfit_opps/).

## Stack

- Next.js 16 (App Router) + TypeScript
- Host-based multi-tenancy via `proxy.ts`
- CSS-variable design tokens + runtime white-label accent ramp
- **Neon Postgres + Drizzle ORM**, read through a tenant-scoped data-access gateway

## Run it

```bash
npm install
npm run dev
```

Then visit:

| URL | Serves |
|---|---|
| `http://localhost:3000` | Apex — marketing one-pager + login entry |
| `http://localhost:3000/login` | Manager login (stub) |
| `http://demo.localhost:3000` | A tenant workspace (seed distributor, red brand) |
| `http://truckcolors.localhost:3000` | Another tenant (blue brand) |
| `http://admin.localhost:3000` | L2 Admin portal (stub) |
| `http://portal.localhost:3000` | Manufacturer portal (stub) |

`*.localhost` subdomains resolve to 127.0.0.1 in modern browsers, so tenant
routing works locally with no `/etc/hosts` edits.

## Database

Neon Postgres via Drizzle. The connection string lives in `.env.local` as
`DATABASE_URL` (pull it from Vercel with `vercel env pull`, or copy the pooled
string from the Vercel → Storage dashboard). It's gitignored.

```bash
npm run db:generate   # regenerate migration SQL from lib/db/schema.ts
npm run db:migrate    # apply migrations to the database in DATABASE_URL
npm run db:seed       # load dev fixtures (idempotent)
npm run db:verify     # run the tenant/manufacturer isolation checks
npm run db:reset      # DANGER: drop + recreate the public schema (dev only)
npm run db:studio     # open Drizzle Studio
```

- **Schema:** `lib/db/schema.ts` → migrations in `drizzle/`.
- **Client:** `lib/db/client.ts` — lazy Neon pool, never throws at build time.
- **Gateway:** `lib/db/gateway.ts` is the only sanctioned read path. Every
  method takes an `AuthContext` and injects the tenant predicate (default-deny);
  manufacturer roles are refused company reads outright.
- **Isolation tests:** `scripts/verify-isolation.ts` proves a rep can't read
  another tenant and a manufacturer can't read company records. Run on every
  schema or gateway change.

## How routing works

`proxy.ts` → `lib/tenancy/resolve.ts` maps the `Host` header:

- apex / `www` → marketing + login (root routes)
- reserved subdomain (`admin`, `portal`, …) → that area's app
- anything else → a distributor tenant, rewritten into `app/t/[slug]`

Reserved names (including the `ptc` / `messer` calculator slugs) live in
`lib/tenancy/reserved-slugs.ts` so tenant provisioning can never collide.

**Routing is not authorization.** The middleware only decides what to render;
every data read must independently re-check the caller via
`lib/db/gateway.ts`, which injects the tenant predicate on every query.

## Project layout

```
app/
  page.tsx            apex one-pager + login entry
  login/              manager login (stub)
  t/[slug]/           tenant workspace (brand applied at runtime)
  admin/              L2 admin portal (stub)
  portal/             manufacturer portal (stub)
lib/
  tenancy/            host resolution + reserved slugs
  brand/              white-label accent ramp
  auth/               auth context types
  db/                 tenant-scoped data gateway + in-memory seed
proxy.ts              host-based routing (Next 16 proxy convention)
```

## Not built yet (see the build plan)

Real auth (manager password / rep passwordless / manufacturer portal), CSV
import, queue builder, daily emails, the rep/manager UIs from the handoff, and
the manufacturer aggregate-only read model. The schema currently covers the
Phase 1 foundation tables; activity/queue/opportunity/quote/import tables come
with their phases.
