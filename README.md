# Upfit Opps — Platform

Multi-tenant market development platform for commercial vehicle distributors.
This is the application that owns `upfitopps.com` (apex + `*.upfitopps.com`
wildcard). The existing white-label calculators (`ptc.`, `messer.`) are a
separate repo/project and are untouched by this one.

> Planning docs: [`BUILD_PLAN_architecture_and_security.md`](./BUILD_PLAN_architecture_and_security.md)
> and [`REPO_AND_DOMAIN_SETUP.md`](./REPO_AND_DOMAIN_SETUP.md).
> Product source: [`design_handoff_upfit_opps/`](./design_handoff_upfit_opps/).

## Stack

- Next.js 15 (App Router) + TypeScript
- Host-based multi-tenancy via `middleware.ts`
- CSS-variable design tokens + runtime white-label accent ramp
- Postgres + a tenant-scoped data-access gateway (not yet wired — scaffold uses in-memory seed data)

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

Real auth (manager password / rep passwordless / manufacturer portal),
Postgres + migrations, CSV import, queue builder, daily emails, the rep/manager
UIs from the handoff, and the manufacturer aggregate-only read model.
