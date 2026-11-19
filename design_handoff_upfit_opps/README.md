# Handoff: Upfit Opps (white-label B2B outreach platform)

## Overview
Upfit Opps helps distributor sales reps cold-call commercial fleet owners. Leads are scored by priority (0–5), reps log call outcomes, record decision-makers and flag opportunities. Managers run their team, and manufacturers see aggregated program results. L2 Digital admins onboard distributors and import lead data.

There are four roles, and each has its own prototype:

| Role | File | Surface |
|---|---|---|
| Sales Rep | `Upfit Opps Rep Mobile.dc.html` | Mobile web (402×874 reference frame) |
| Distributor Manager | `Upfit Opps Manager.dc.html` | Desktop web |
| Manufacturer (regional + leadership) | `Upfit Opps Manufacturer.dc.html` | Desktop web |
| L2 Digital Admin | `Upfit Opps Admin.dc.html` | Desktop web |

The source requirements are in `prd.txt`. Where the prototypes and the PRD disagree, the prototype shows the decision we made later. The "Assumptions and questions" list in the Rep prototype's side panel is still open.

## About the design files
The files in this bundle are **design references built in HTML**. They are prototypes that show the intended look and behavior. They are not production code to copy. Rebuild these designs in the target codebase using its existing framework, patterns and libraries. If no codebase exists yet, pick a suitable stack. A responsive React or Next.js app with one shared component library across all four roles is the natural fit.

Each `.dc.html` file opens directly in a browser and is self-contained. Markup sits at the top of the file and a `class Component` holds the logic and seed data at the bottom. The seed data in `seed()` and `initState()` is the best reference for the data shapes.

## Fidelity
**High fidelity.** Colors, type, spacing, copy and interactions are final for MVP. Recreate them closely. Two exceptions:
- The demo chrome (top "Prototype · Phase N" bar, "Jump to" buttons, side notes, Reset) is for reviewers only. Do not build it.
- Seed data is fictional.

## White-labeling (applies to every role)
- Each distributor has a **name**, **logo**, **primary color** and **subdomain** (`<slug>.upfitopps.com`). These are set in Admin › New distributor › Branding.
- **Platform default primary is `#c8102e` (red).**
- The accent ramp is derived at runtime from the one primary color (see `applyBrand()` in each file):
  - 100 = mix(primary 9%, white) · 200 = 18% · 300 = 34% · 400 = 62%
  - 500 = primary
  - 600 = mix(primary 86%, black) · 700 = 72% · 800 = 56% · 900 = 40%
  - Use `color-mix(in oklch, …)` or an equivalent OKLCH computation server-side.
- Text in the accent color uses the 700 step to keep 4.5:1 contrast on white. The 500 step is for fills, icons and large type only.
- App backgrounds are `#ffffff` (overriding the design system's `#f3f2f2`).

## Data visibility rules (must be enforced server-side)
- **Rep:** sees own assigned companies. ZIP search shows any cold prospect in the ZIP, along with its owner, and never changes ownership.
- **Manager:** sees every company and rep in their distributor.
- **Manufacturer:** sees aggregates only. **No company names, contacts or rep-level data** anywhere, including exports and tooltips. Regional users see their region. Leadership users see all regions plus a distributor comparison.
- **L2 Admin:** sees all distributors and manufacturer users. Admins can impersonate nothing in MVP.

---

## Screens

### Sales Rep (mobile)
Reference frame is 402×874 (iPhone 15/16). The layout is a single column with 20px side padding. Every tap target is at least 44px tall. Primary actions are at least 56px tall.

**01 Daily email** (sent 7:00 AM local)
- Subject: `Your {target} prospects for {Weekday}`. Sender: `{Distributor} via Upfit Opps`.
- Body (white card, 4px radius, shadow-sm) contains:
  - Distributor name in the accent color, 20/600.
  - "Morning Prospect List" (26/600), then the goal sentence.
  - The top 5 queue companies: rank, linked name (deep-links to Company Detail), city · vehicle count, score.
  - The **Open My Queue** button (52px, primary).
  - **Follow Up Reminders** list, then an UpfitOpps.com link.
- The first tap from the email verifies the device. Toast: "Device verified · you stay signed in for 30 days".

**02 Rep Queue**
- **Sticky header:** distributor name (18/600, accent) and an avatar. Below them, a 5-item icon nav: Prospects, Follow-ups, ZIP, Contacts, Leaders. Each item is 24px duotone icon + 11px label, at least 50px tall. Prospects, Follow-ups, ZIP and Leaders scroll to their section. Contacts opens a screen.
- **Progress:** attempts / target (56px / 22px), "N to go" or "Goal reached", and a segmented bar with one 14px segment per target call. Then **Start** (56px) opens the first open prospect.
- **Cold Prospects:** ranked rows showing rank, name, city · industry, score (18/600) and a caret. Finished rows show an icon and drop to 50% opacity. Skipped rows show an icon at full opacity.
  - When every prospect is worked or the goal is met, show **Continue Prospecting**, which adds the next 5 eligible prospects.
- **Follow Up Reminders:** explicit follow-ups due today or overdue, plus customer touch-base reminders. These do not count toward the goal.
  - Each row shows name, meta, a "Last: …" tag and an italic note.
  - Empty state: "Nothing due today."
  - An **Upcoming** sub-list shows future follow-ups by date.
- **Find by ZIP:** numeric input, 5-digit max. Results show the owner and last activity.
  - Helper copy: "Shows cold prospects in exactly this ZIP, by priority. Searching never changes ownership."
- **Team Leaderboard:** only when the manager enables it. Today / Week to date / Month tabs. Columns are Calls, Goal %, DMs, Opps, Opp/DM, with a legend below.

**02b My Contacts**
- Filters: City, ZIP, Industry, Type (All / Cold prospect / Past customer), Priority (Any / 4.0+ / 3.0–3.9 / Under 3), and "Clear filters".
- Table columns: Company, ZIP, Priority. Header shows the "N of M" count.
- Empty state: "No contacts match these filters."

**03 Company Detail**
- **Header:** back button ("Queue" or "Contacts"), "N of M today", company name (27/600), score (30/600, "PRIORITY / 5"), industry, address, fleet totals (vehicles / trucks / vans), fleet mix, and state + owner tags.
- **Actions:** **Call {phone}** (56px primary, `tel:`; tapping Call does not count as an attempt), plus Directions and Website (44px secondary).
- **Stats:** Attempts, Last, Next. **Activity** shows the latest item, with "Show more (N)" to expand.
- **Existing customer** panel (accent-100 fill): Already Contacted resets the touch timer. Snooze 7 days.
- **Log Outcome:** 2-column grid of 72px tiles: No Answer, Left Voicemail, Spoke to Gatekeeper, Spoke to Decision-Maker, Wrong Number. Tap again to deselect.
  - Gatekeeper adds an optional "Who did you speak with?" field.
  - Decision-Maker adds a choice between "Keep following up" and "Not interested now" (60 days). If no primary DM exists, it also shows candidate chips, where picking one confirms them, plus "Someone else".
  - Gatekeeper and DM also show a Note field.
  - **Follow-up** chips: Tomorrow / 1 Week / 2 Weeks, plus a custom date input (min = tomorrow). A chosen date overrides the cadence.
- **Remove from outreach** switch. It offers two choices:
  - Remove: a manager can restore it.
  - Do not contact: permanent, and CSV imports can't reactivate it.
- **Decision-Maker:** editable Name, Title, Phone, Email and Notes.
  - Each record is tagged "Confirmed primary" or "New · not yet confirmed".
  - Suggested candidates come from LinkedIn or the company website and are marked as not verified.
  - Confirming a DM saves immediately and is audited.
- **Opportunity** switch (optional description field) and **Quote sent** switch. Quote sent records a count only, with no amounts.
- **Bottom bar** (accent fill):
  - Queue context: Skip on the left, **Next** on the right. Skip records nothing.
  - Other contexts: Back on the left, **Save** on the right.
  - Next and Save are disabled until there is something to save, and show "Saving…" while saving. Buttons are at least 48px tall.

**Toasts:** neutral-900 fill, 14px text, check icon in accent-300. They sit 96px from the bottom on Detail and 40px elsewhere, and auto-dismiss after 3.2s.

**Offline state** (`offline` prop in the prototype): a neutral-900 strip under the status bar reads "Offline · outcomes save on this phone and sync when you reconnect". Saves are queued locally and the save toast adds "will sync when online". Build a real local queue (IndexedDB) that syncs on reconnect.

### Distributor Manager (desktop)
- **04 Login:** username/email + password. Inline errors: "Enter your username or email." / "Enter your password." Enter submits.
  - Forgot password: email entry with validation ("Enter a valid email address.") leads to a confirmation that reads "If an account exists for … a reset link is on its way. It expires in 30 minutes."
- **05 Overview:**
  - Period selector.
  - Lead breakdown bar.
  - Team performance chart, switchable by metric.
  - Cold prospect count.
- **Companies:**
  - Sortable, filterable table with an "Unassigned" quick filter.
  - Row selection and "Select all N" for bulk actions: Assign to rep, Unassign.
  - Empty state: "No companies match these filters."
- **Company detail:** same fields as the rep view, plus owner history, owner change, Restore for removed companies, and quote entry.
- **06 Settings**, in five sections. A sticky "Unsaved changes" / "All changes saved" status with Discard and Save changes.
  - Sales team: add rep, daily target per rep, daily email toggle. **Reassign all companies From → To** applies immediately and is logged.
  - Outreach cadence: days per outcome. "None" means no automatic follow-up.
  - Rep daily email.
  - Manager summary.
  - Leaderboard on/off.
- **Summary email:** preview of the manager's report email.

**Default cadences:** No Answer 3 days · Voicemail 5 · Gatekeeper 7 · Decision-Maker 14 · Not interested now 60 · Wrong Number none.

### Manufacturer (desktop)
- **Sign-in:** email + password.
- **08 Overview**, in two variants:
  - Regional: one region.
  - Leadership: all regions, with a region filter.
  - Both show aggregated totals (attempts, DMs reached, opportunities, quotes), 12-week trend charts and a distributor performance table.
- **Distributor drill-in:** aggregated metrics for one distributor. No company or rep identifiers.

### L2 Digital Admin (desktop)
- **07 Distributors:** searchable list with account count and status.
- **New distributor wizard**, 5 steps:
  1. **Account**: name, slug with live availability check.
  2. **Branding**: logo upload, primary color, live preview.
  3. **Users**: managers and reps.
  4. **Program**: manufacturer program and region.
  5. **Review**: confirm and create.
- **Distributor account:** branding, users, audit log, import history.
- **Import companies**, 4 steps: Upload → Map columns → Preview → Done.
  - Column mapping with required fields.
  - Row-level errors.
  - Protected fields that an import never overwrites unless an override is checked: owner, confirmed decision-maker, Do Not Contact.
- **Manufacturers:** add a manufacturer and manage its users.

---

## Core business rules
- **Queue build:** queue size = target. round(target × 0.3) slots go to never-contacted companies. The remaining slots go to the highest-priority eligible companies. The combined queue is then sorted by score, descending. If there aren't enough companies, the gap is filled from the remaining eligible ones.
- **Eligible:** owned by the rep, state is cold, not removed or DNC, no explicit follow-up pending, and next-eligible date ≤ today.
- **Saving an outcome:**
  - Appends an activity record.
  - Increments attempts only for cold companies.
  - Sets next-eligible = today + cadence. If an explicit follow-up date is set, that date is used instead.
  - Wrong Number with no date never becomes eligible again until the data is corrected.
- **Opportunity identified** removes the company from the cold queue. Reporting counts unique companies.
- **Quotes:** counts only. Report unique companies with ≥1 quote separately from the total quote count.
- **Every change is audited** with actor and timestamp: outcomes, DM changes, ownership, removals.

## State (reference: Rep `initState()`)
```
cs: { [companyId]: Company }
queue: [{ id, status: 'open'|'done'|'skipped'|'exited', result, fresh }]
screen: 'email'|'queue'|'contacts'|'detail'
cur, ctx: 'queue'|'contacts'|'zip'|'other'
attempts: number
draft: { o, ni, fu, note, gk, opp, oppDesc, pick, rm, quote }
f: { city, zip, ind, type, pri }
```
`Company` = { id, name, address, city, zip, phone, website, industry, subIndustry, trucks, vans, fleetMix, score, ownerId, source, state: 'cold'|'customer'|'opp', followUpDay, followUpNote, candidates[], primaryDM, activities[], quoteCount, suppressed: null|'remove'|'dnc', nextEligible, touchInterval, lastTouch }.

## Design tokens
The design system is Broadsheet. Its token sheet is included at `_ds/.../styles.css`.
- **Type:** Source Serif 4 for everything (headings 600). No sans-serif. Italic is the true italic.
- **Sizes used:**
  - Mobile: 10/11/12/13/14/15/16/17/18/21/22/26/27/30/56.
  - Desktop H1 at the system default, with 34px on login screens.
- **Small labels:** 10–11px uppercase with .06–.1em tracking.
- **Colors:**
  - Text `#201e1d`.
  - Neutrals: 100 `#f8f4f4` · 200 `#eae7e7` · 300 `#d7d3d3` · 600 `#7d7979` · 700 `#605d5d` · 800 `#444141` · 900 `#2d2b2b`.
  - Surface `#eae9e9`. Divider is the text color at 16%.
  - Accent: distributor primary (default `#c8102e`), with the ramp above.
  - Accent-2 is magenta `#d6006c` (700 `#aa0b56`). Use it sparingly: opportunity tags, destructive text.
- **Spacing:** 5 / 10 / 15 / 20 / 30 / 40.
- **Radius:** 1 / 2 / 4px. Switches and avatars are fully round.
- **Shadows:**
  - sm `0 1px 2px #2d2b2b24`
  - md `0 3px 10px #2d2b2b29`
  - lg `0 12px 32px #2d2b2b38`
- **Focus:** 2px accent outline, 2px offset. Disabled is 45% opacity.
- **Switch:** 50×30 track (accent when on, neutral-300 when off), 24px white knob, 0.2s transition.
- **Layout:** no boxes or dividers between page sections. Hierarchy comes from type and whitespace. Cards are reserved for discrete items.

## Assets
- Icons: Phosphor, **duotone** weight (`@phosphor-icons/web@2.1.1`).
- Distributor logos are uploaded per tenant. There are no other image assets.

## Files
- `Upfit Opps Rep Mobile.dc.html`, `Upfit Opps Manager.dc.html`, `Upfit Opps Manufacturer.dc.html`, `Upfit Opps Admin.dc.html`: the prototypes.
- `support.js`, `ios-frame.jsx`: prototype runtime and phone frame (reference only).
- `_ds/broadsheet-…/styles.css`, `_ds_bundle.js`: design-system tokens and components.
- `prd.txt`: product requirements.
