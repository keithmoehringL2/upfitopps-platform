# Daily email setup (Resend)

The rep "Morning Prospect List" email goes out once a day via a Vercel Cron that
calls `/api/cron/daily-email`, which builds each email-enabled rep's top
prospects + due follow-ups and sends them through [Resend](https://resend.com).
Every link in the email is a single-use magic link: the first tap signs the rep
in on that device for 30 days, then drops them on the queue or the tapped
prospect.

Until `RESEND_API_KEY` is set, the job renders and logs each email instead of
sending it — so you can build and preview everything before any domain is live.

## 1. Resend account + domain

1. Create a Resend account.
2. **Add and verify a sending domain** (e.g. `mg.upfitopps.com`) — Resend gives
   you DNS records (SPF/DKIM) to add at your DNS provider. Verification is what
   lets you send to real recipients; the shared `onboarding@resend.dev` sender
   only delivers to your own account email.
3. Create an **API key** (Sending access).

## 2. Environment variables

Add these to `.env.local` (local) and to the Vercel project (Production, and
Preview if you want cron there):

| Variable | Example | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | `re_…` | From Resend. Without it, emails are logged, not sent. |
| `EMAIL_FROM_ADDRESS` | `no-reply@mg.upfitopps.com` | Must be on your verified domain. The display name is set per-distributor at send time: `"{Distributor} via Upfit Opps <…>"`. |
| `CRON_SECRET` | *(long random string)* | Vercel sends this to the cron route automatically once it's set. Required in production — without it the route refuses to run. |

Generate a secret with e.g. `openssl rand -hex 32`.

**Links are per-distributor.** The session cookie is scoped to the exact host a
rep signs in on, so every email link points at that distributor's own
subdomain — `https://<slug>.<NEXT_PUBLIC_ROOT_DOMAIN>/rep/…` in production,
`http://<slug>.localhost:3000/rep/…` in dev. This is derived from the
distributor's slug and `NEXT_PUBLIC_ROOT_DOMAIN`; there is **no** separate
base-URL variable. (In production the tenant subdomains must resolve, i.e. a
wildcard `*.<root>` domain pointed at Vercel — the same requirement the app has
to serve tenants at all.)

## 3. Schedule

`vercel.json` runs the job daily:

```json
"crons": [{ "path": "/api/cron/daily-email", "schedule": "0 13 * * *" }]
```

`0 13 * * *` is 13:00 UTC (≈ 7 AM US Central). Change the hour to suit your
reps' timezone. Vercel Cron runs in UTC; this is a single daily send for all
tenants. (Per-distributor local-time sends would need an hourly cron, which
requires a Vercel Pro plan — a later upgrade.)

## 4. Who gets an email, and when

- **Per distributor** — Manager → Settings → *Rep daily email*: the on/off
  switch, which weekdays, and how many prospects to include (3 / 5 / 10). The
  cron honours the switch and the weekday list (weekday is evaluated in UTC).
- **Per rep** — a rep's `daily_email_enabled` flag (Manager → Settings → Sales
  team). Only active reps with this on are emailed.

> The per-distributor *send time* in Settings is advisory in this single-daily
> mode — the actual time is the cron schedule above.

## 5. Testing

- **Preview the design** (dev server running, no key needed):
  `http://localhost:3000/api/dev/email-preview` — or
  `…/api/dev/email-preview?to=rep1@truckcolors.test` to pick a recipient. This
  route is disabled in production.
- **Run the job once** (ignores the send-day schedule via `force`):
  ```bash
  npm run email:test
  ```
  With no `RESEND_API_KEY` it lists recipients without sending. With a key set,
  it actually sends — while your domain is still unverified, point a rep's email
  at your own Resend account address first.

## 6. What's not included yet

- The **manager summary email** (design screen in Settings) — a separate job
  that can reuse this plumbing.
- **Per-distributor local-time** delivery (needs a frequent cron / Vercel Pro).
