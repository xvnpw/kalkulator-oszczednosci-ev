# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # Serve locally via HTTP (required — ES Modules break over file://)
pnpm test       # Run all tests with Vitest
pnpm build      # Build to dist/ via Vite
```

Run a single test file:
```bash
pnpm exec vitest run tests/calculations.test.js
```

## Architecture

This is a **vanilla JS single-page application** — no framework, no TypeScript, no bundler at runtime (Vite is only for production builds). The app is:

- `index.html` — HTML form + result containers, loads Google Fonts from CDN
- `script.js` — DOM manipulation, rendering, persistence, and bootstrap (ES Module). Imports the pure calc logic from `calc/*` and **re-exports** the public calc API so tests importing from `script.js` keep working.
- `calc/` — pure calculation modules (no DOM / no `localStorage` / no `window`), grouped by domain:
  - `constants.js` — `MIN_WAGE_2026`, `MIN_HEALTH_2026`, `AVG_WAGE_2026`, `EV_DEP_LIMIT` (the 225 000 PLN depreciation cap), `KUP_OPERATING_FACTOR` (0.75 — operating-cost mixed-use factor), `CAR_INSURANCE_LIMIT` (150 000 PLN AC value cap), `HEALTH_DEDUCT_LIMIT_LINIOWY_2026` (14 100 PLN liniowy health-deduction cap), plus the PIT-scale constants (`PIT_FREE_BASE`, `PIT_BRACKET`, `PIT_RATE_LOW`, `PIT_RATE_HIGH`, `PIT_LINIOWY_RATE`) and health-rate constants (`HEALTH_RATE_SKALA`, `HEALTH_RATE_LINIOWY`, `RYCZALT_HEALTH_T1`/`T2`, `RYCZALT_HEALTH_MULT`); single source of truth — no statutory literals live in `pit.js`/`health.js`. A "2027 update checklist" header at the top lists every yearly-changing value
  - `pit.js` — `pit`, `pitJoint`, `margRate`, `pitLiniowy`, `pitRyczalt`, `calculateIndividualPit`, `skalaBreakdown`, `buildAfterBrackets`
  - `health.js` — `calculateHealthContribution`, `healthContribDetail`
  - `schedules.js` — `depSchedule`, `interestSchedule`, `interestAmortSchedule`
  - `engine.js` — `calculateEngine` (imports from the four modules above)
- `style.css` — dark theme, CSS variables, flexbox/grid layout
- `.bottom-panel` (sibling of `.wrap`) — holds Słowniczek and Metodologia tabs via `.bp-tab`/`.bp-pane` pattern; replaced the previous inline `.glossary` inside `.cols`

**No `src/` directory** — source lives at the root, except for the pure calc modules grouped under `calc/`. `calc/*` modules form a strict downward-only DAG (`constants` → `pit`/`health`/`schedules` → `engine`) and **never** import `script.js` (no cycles, no app side effects). They are imported via native relative specifiers (`./calc/*.js`) resolved by the browser over HTTP — no runtime bundler.

### Core data flow

1. User interacts with form inputs
2. Inline handlers (`onclick`, `oninput`) call helpers like `setCarType()`, `setFin()`, `syncPrices()`
3. These eventually call `calc()`, which calls `calculateEngine(i)` with a large input object
4. `calculateEngine` returns a results object; `renderResults(d)` writes it to the DOM

### calculateEngine

The central function, defined in `calc/engine.js` and re-exported from `script.js`. Accepts a flat object with ~50 fields covering:
- Taxpayer (`p*`) and optional spouse (`s*`) income/tax-form/source fields
- Car parameters (gross/net price, type, insurance, maintenance)
- Financing model (cash / leasing operacyjny or finansowy / credit with 3 variants)
- Economic parameters (inflation, investment return rate)

Returns year-by-year rows plus cumulative tax savings, NPV-adjusted costs, and health contribution savings. Read the jsdoc-style schema comments in `calc/engine.js` before modifying this function.

- `incCar`, `incFuel`, `incInv` are always `true` from the UI layer; they remain as `calculateEngine` parameters for test flexibility

### Exported functions (used by tests)

`pit`, `pitJoint`, `margRate`, `pitLiniowy`, `pitRyczalt`, `calculateIndividualPit`, `calculateHealthContribution`, `depSchedule`, `interestSchedule`, `calculateEngine`, `updateVisibility`, `saveConfig`, `restoreConfig`, `resetConfig`, `EV_CONFIG_KEY`, `EV_CONFIG_VERSION`

Tests import these directly from `script.js`. The function signatures are the public API — keep them stable. The 10 calc functions in this list are now **defined in `calc/*` and re-exported** from `script.js` (the barrel at the top of the file); `updateVisibility`/`saveConfig`/`restoreConfig`/`resetConfig`/`EV_CONFIG_*` are still defined directly in `script.js`. When changing a calc function, edit it in its `calc/` module — do not redefine it in `script.js`.

`calculateEngine` **throws** rather than guessing on invalid input: unknown `carType`/`financing`/`lType`/`cType` enum values, `inflation ≤ −1` (and `investReturn ≤ −1` when an investment is modeled), `lM`/`cM < 1`, and joint filing on a non-skala form all raise (phase 5). Embedders must pass validated inputs — there is no silent fallback to a default branch.

### DOM helpers

```js
$(id)    // document.getElementById shorthand
n(id)    // parse float from input value
cb(id)   // checkbox checked state
fmt(x)   // Polish locale number format (space thousands, comma decimal)
zl(x)    // format as PLN currency
```

## Testing

Tests run in Vitest with `happy-dom` environment. Test files in `tests/`:

| File | Coverage |
|---|---|
| `calculations.test.js` | PIT formulas, depreciation, interest schedules (incl. `interestAmortSchedule`), health boundaries |
| `e2e.test.js` | DOM-level feature tests (F1–F7, T1–T4 real-world scenarios) |
| `npv-tco-verification.test.js` | NPV/TCO correctness across all financing models |
| `npv_robustness.test.js` | Edge cases and boundary conditions |
| `ui.test.js` | UI state and visibility toggling |
| `persistence.test.js` | `ev-config` save/restore/reset round-trips |
| `phase2-correctness.test.js` | Fin-leasing interest deduction, oper-split conservation, joint-filing marginal rate, truthful negative savings |
| `phase3-vat-consistency.test.js` | Non-deductible 50% VAT in the KUP base; upfront/fuel VAT symmetry; refund timing |
| `phase4-product-decisions.test.js` | 75% on operating costs only, insurance value-proportion cap, liniowy/ryczałt health deduction |
| `phase5-robustness.test.js` | Throw-on-unknown-enum / `inflation ≤ −1` / degenerate-financing guards, `creditUnamortized`, constants |
| `ryczalt-ui-simplification.test.js` | Ryczałt-only UI: `updateVisibility()` hides PIT/health/amortization noise (and restores it for skala/liniowy), `renderResults()` shows a VAT+fuel-only view |

## Polish Tax Domain

This app is hardcoded for Polish tax law (2026). Key rules:

**Tax forms:**
- `skala` — progressive: 0% / 12% / 32%, 9% health (no health deduction), allows joint filing
- `liniowy` — flat 19% PIT, 4.9% health, no joint filing. Paid health is **deducted from the PIT base**
  up to `HEALTH_DEDUCT_LIMIT_LINIOWY_2026` (14,100 PLN/2026, obwieszczenie MF z 12.12.2025). When car
  KUP shrinks health, the base shrinks less → the modeled shield claws back ~19% of the health drop.
- `ryczalt` — revenue-based (3%–17%), tiered health, no joint filing, no KUP shield. Taxable revenue is
  reduced by social-contribution deductions (`pDed`) **and 50% of paid health**. The health *tier* stays
  pinned to unreduced revenue, so car costs never change ryczałt savings (they remain 0). Since PIT/health/
  amortization are structurally inert for ryczałt, `updateVisibility()` hides that noise (rate selector,
  "Przychód firmy", KUP/odliczenia, dochód/podatek and amortization value rows) and `renderResults()`
  shows a VAT+fuel-only view (KPI relabeled "Zwrot VAT", baseline PIT block becomes an info note, per-year
  accordion drops the PIT/health sub-sections) — presentation only, the underlying calc is unchanged.

**EV depreciation limits:**
- Depreciation cap: 225,000 PLN
- New car: 20%/year (60 months)
- Used car: 40%/year (30 months) or 20%/year (60 months)

**Mixed-use deduction (`KUP_OPERATING_FACTOR = 0.75`):** the 75% factor (art. 23 ust. 1 pkt 46a, MF
objaśnienia 9.04.2020) applies to **operating costs only** — maintenance, fuel, operating-type initial
fees. Depreciation, lease installments (capital + interest) and credit interest/fee are deductible in
**full** (no 75% factor). VAT: a mixed-use VAT payer recovers 50% of input VAT; the non-recovered 50% is
itself KUP.

**Insurance (`CAR_INSURANCE_LIMIT = 150000`):** premiums deduct in proportion `min(1, 150000 / car value)`
(art. 23 ust. 1 pkt 47 — the 150,000 PLN cap was **not** raised to 225,000 for EVs). `insurB` is a single
field (no OC/AC split), so the AC value-cap is applied to the whole premium (conservative for OC). Car
value uses the same basis as oper-leasing `carValueKUP` (`priceN + 50% VAT` for a VAT payer, else `priceB`).

**Financing models affect deductibility differently:**
- Cash & financial leasing (`fin`): amortization (100% KUP) + interest (100% KUP)
- Operational leasing (`oper`): installments split into capital + interest, both **100% KUP**
- Credit: interest + principal deductions, interest 100% KUP (three repayment variants: `standard`, `5050`, `3x33`)

## Theming

- Theme is controlled by `data-theme` attribute on `<html>` element (`"dark"` | `"light"`)
- Preference stored in `localStorage` under key `ev-theme` (default: `"dark"`)
- CSS variables are split into two blocks: `:root, :root[data-theme="dark"]` and `:root[data-theme="light"]`
- `initTheme()` in `script.js` reads localStorage and wires up the toggle button

## Form Configuration Persistence

- The full form configuration (taxpayer/spouse income & tax settings, car/financing parameters, fuel/economic params, plus `carType`/`financing`) is persisted to `localStorage` under key `ev-config`, versioned via `EV_CONFIG_VERSION`.
- `CONFIG_VALUE_IDS` / `CONFIG_CHECK_IDS` (near `EV_CONFIG_KEY` in `script.js`) are the single source of truth for which field ids get persisted/restored.
- `saveConfig()` runs automatically at the end of `calc()` — auto-save on every change, no debounce, mirroring the `ev-theme` pattern.
- `restoreConfig()` runs in `init()` right after `initTheme()`. If `localStorage['ev-config']` is missing, malformed, or has a mismatched `version`, it's a no-op and the HTML's baked-in defaults apply.
- `resetConfig()` (wired to the `#reset_config` button next to the theme toggle) clears `localStorage['ev-config']` and reloads the page.

**When adding new form fields to `index.html`:**
- Add the new `<input>`/`<select>` `id` to `CONFIG_VALUE_IDS`, or a new checkbox `id` to `CONFIG_CHECK_IDS`, in `script.js` — otherwise the field will silently NOT be persisted/restored.
- New segmented-button-style state (like `carType`/`financing`) needs explicit handling added to `restoreConfig()`, following the existing `setCarType`/`setFin` pattern.
- If a change would make old saved configs invalid or misleading (e.g. renaming/removing a persisted field), bump `EV_CONFIG_VERSION` — mismatched-version configs are discarded wholesale rather than partially restored.

## Coding Conventions

- All tooltip text must use Polish sentence case — no title case or ALL CAPS.

## Deployment

GitHub Actions (`.github/workflows/deploy-pages.yml`) automatically deploys to GitHub Pages on push to `main`. Uses pnpm v11 and Node 20.

pnpm security hardening is active (`pnpm-workspace.yaml`): `minimumReleaseAge: 2000`, `blockExoticSubdeps: true`.

## Security

### Dependencies

- always pin dependencies to full versions and use lock files
- never use versions if released less than 2 days ago (minimumReleaseAge and similar configuration across package managers should be preferred)
- for docker - always pin dependencies to digest
- for github actions - always pin dependencies to digest
- for python - use always uv package manager
- for node/npm - use always pnpm package manager

## ALWAYS FOLLOW

- You should NOT commit any code - I will always do it myself.
- You should NOT install any packages yourself without permission - Always ask me before.