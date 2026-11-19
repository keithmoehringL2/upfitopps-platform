# Repo & Domain Setup — separating the calculator from the new platform

_Decided 2026-11-19. Companion to `BUILD_PLAN_architecture_and_security.md`._

## Confirmed current state (Vercel)

- `upfitopps.com` is **registered at Vercel** (registrar + nameservers = Vercel), expires Jun 17 2027. Vercel controls DNS directly.
- The bare apex **`upfitopps.com` serves nothing today** ("This page doesn't exist"). The root is free.
- Exactly **two projects exist**, both white-label deploys of the Time Leak / cost-calculator from the `distributor-apps` repo:
  - `ptc.upfitopps.com` → project `ptc-upfitopps`
  - `messer.upfitopps.com` → project `messer-upfitopps`
- GitHub repo: `github.com/keithmoehringL2/distributor-apps` (Next.js 14). Exposed token found and **revoked + scrubbed** ✅.

## Decision

- **New platform** gets its own repo + its own Vercel project and owns `upfitopps.com` **apex + wildcard `*.upfitopps.com`**.
- **Calculators stay exactly where they are** on `ptc.` / `messer.` subdomains. They do not move and nothing about them changes.
- This works because **Vercel routes an exact subdomain to its assigned project before falling back to the wildcard.** `ptc.`/`messer.` keep hitting their projects; every other subdomain (new distributor tenants) falls through to the platform's wildcard.

## Setup checklist

### 1. New GitHub repo for the platform
- [ ] Create `github.com/keithmoehringL2/upfitopps-platform` (or similar). This is the home of the multi-tenant Next.js app from the build plan. The local `managed-prospect-program/` folder becomes this repo.
- [ ] Leave `distributor-apps` as-is — it stays the calculator's repo.

### 2. New Vercel project for the platform
- [ ] Create a new Vercel project linked to the new platform repo (`main` branch, auto-deploy).
- [ ] Project → Settings → Domains, add **both**:
  - `upfitopps.com` (apex)
  - `*.upfitopps.com` (wildcard)
- [ ] Vercel configures DNS automatically (it's the registrar) and auto-provisions the wildcard TLS cert.
- [ ] Attach domains **after** a first deploy exists (even a skeleton), so the apex goes from 404 → working, never to a broken deploy.

### 3. Leave the calculators alone
- [ ] `ptc-upfitopps` and `messer-upfitopps` projects: no changes. Confirm after the wildcard is added that `ptc.upfitopps.com` and `messer.upfitopps.com` still load (they will — exact match wins).

### 4. Platform app config (build-time)
- [ ] Reserved-slug denylist so tenant provisioning can never collide with an existing or infra subdomain: `ptc`, `messer`, `www`, `app`, `admin`, `api`, `mail`, `static`, `portal`, `assets`. Add future client calculator slugs here too.
- [ ] Middleware resolves subdomain → distributor tenant (per build plan §5).

### 5. Optional cleanup on `distributor-apps` (cosmetic, low priority)
- [ ] `package.json` `name` is currently `upfitopps` and the README is broad ("distributor-apps / white-label tools"). Consider renaming to something calculator-specific (e.g. `distributor-tools`) to avoid confusion with the new platform repo. Purely cosmetic — the app works as-is.
- [ ] Set up clean git auth before next push (`git config --global credential.helper osxkeychain`, then a new fine-grained token).

## Result

- `upfitopps.com` and `truckcolors.upfitopps.com`, `anyslug.upfitopps.com`, … → **new platform**.
- `ptc.upfitopps.com`, `messer.upfitopps.com` → **calculators**, untouched and still live.
- Two separate repos, two separate security surfaces, no shared deploy lifecycle.
