# Plan: Simplify the UI for "Ryczałt ewidencjonowany"

**Status:** Draft for review — *do not implement yet*
**Branch context:** `feature/income-block-clarity-dg-only`
**Author:** Claude (verified by 4 parallel read-only audit agents)
**Date:** 2026-06-14

---

## 1. Goal & premise

When the taxpayer picks **Forma opodatkowania = Ryczałt ewidencjonowany**, the EV purchase can
produce only two kinds of savings:

- **VAT refund** (`cumRealVATRefund`) — only if the taxpayer is a VAT payer.
- **Fuel savings** (`cumRealFuelSav`) — independent of tax form.

Everything else the calculator shows for ryczałt — PIT base, należny podatek, amortyzacja,
KUP/koszty działalności, składka zdrowotna deltas, ryczałt rate — is **noise**: it is either
structurally zero or has no effect on any number the user sees. The goal is to strip that noise so a
ryczałt user sees a clean, truthful view focused on VAT + fuel.

### 1.1 Premise verification (confirmed by code audit)

For `pTaxForm === 'ryczalt'`, traced in `calc/engine.js`:

| Fact | Where | Result |
|---|---|---|
| `isKupAllowed = pSource==='dg' && pTaxForm!=='ryczalt'` | `engine.js:258` | **false** → every car-KUP term zeroed |
| `taxSav = baseTax − taxWith` | `engine.js:59-61` vs `338-342` | **≡ 0** (same ryczałt formula before/after EV) |
| `healthSav = pHealthBefore − pHealthAfter` | `engine.js:44, 326-327`; `health.js:16-19` | **≡ 0** (ryczałt health tier keys off unchanged revenue) |
| `cumLostIncKUP` | `engine.js:309-314` | **≡ 0** (gated on `isKupAllowed`) |
| `cumRealVATRefund`, `cumRealFuelSav` | `engine.js:252-275, 399-400` | computed **independently** of `pTaxForm` |

**Do these inputs change any visible savings/TCO output for ryczałt?** (`cumRealTaxSav`,
`cumRealVATRefund`, `cumRealFuelSav`, `totalSav`, `effectiveCost`, `cumLostIncKUP`)

| Input | Effect on visible savings for ryczałt | Why |
|---|---|---|
| `p_ryczalt_rate` (`pValRyczaltRate`) | **None** | cancels in `baseTax − taxWith`; absent from VAT/fuel/TCO |
| `p_inc` (`pInc`) | **None** | moves before/after revenue & health identically → cancels |
| `p_ded` (`pDed`) | **None** | enters `baseRyczaltRevenue` and `ryczaltRevenueAfter` identically → cancels |
| `p_kup` (`pKup`) | **None** | only feeds the `net` arg, which the ryczałt health/PIT path ignores |

> Note: these inputs still affect the *displayed* PIT figures (`baseTax`, "Należny podatek"), which
> is exactly why hiding those displays is safe — the underlying savings math is untouched.

---

## 2. Guiding design decisions

These come straight out of the test/persistence blast-radius audit and should be treated as
hard constraints:

1. **Hide, do not remove.** Keep every DOM node (`p_ryczalt_rate`, `p_inc`, `p_kup`, `p_ded`,
   `p_net_lv`, `p_tax_lv`, `dep_base_lv`, `dep_rate_lv`) in the DOM and hide via the existing
   `.hidden { display:none !important }` class (`style.css:244`).
   - `tests/e2e.test.js:151` (`test_f2_ryczalt_rates_presence`) asserts `p_ryczalt_rate` exists with
     all 6 options → survives a CSS hide, **breaks on DOM removal**.
   - `tests/ui.test.js` reads `p_kup`/`p_inc`/`p_inc_hint`/`p_kup_tt` → must stay in DOM.
   - `init()` uses `if ($('p_inc'))` as a bootstrap guard (`script.js:721`) → node must exist.
2. **Keep the engine `pValRyczaltRate` plumbing untouched.** `pitRyczalt` is documented public API
   (`script.js:13-15`, CLAUDE.md) with ~25 dependent tests; the engine still needs a rate to compute
   `baseTax` (e.g. `test_t3_ryczalt_dg_vat_individual` asserts `baseTax > 0`). The hidden selector
   keeps its default `0.085`, which silently flows to the engine and is simply never displayed.
   **This is a UI-only change. No file under `calc/` is modified.**
3. **Do not bump `EV_CONFIG_VERSION`.** Keep `p_ryczalt_rate`, `p_inc`, `p_ded` in `CONFIG_VALUE_IDS`
   so a user who toggles back to ryczałt keeps their values. `saveConfig`/`restoreConfig` already
   guard missing elements, and `persistence.test.js:21` hardcodes `version: 2`.
4. **Centralize ryczałt visibility.** All form-field show/hide should live in `updateVisibility()`
   (the existing authority), not scattered. Move the dep-row treatment out of `syncPrices()`.
5. **No new statutory literals, no calc changes** — purely presentation. Polish sentence case for all
   copy (per CLAUDE.md convention).

---

## 3. Change list (mapped to the 11 requested items)

Files touched: **`index.html`**, **`script.js`** (and possibly trivially `style.css`). No `calc/*`.

Two layers:
- **Layer A — form inputs:** `updateVisibility()` in `script.js` (+ minor `index.html` ids).
- **Layer B — results:** `renderResults()` in `script.js`.

### Layer A — form inputs (`updateVisibility()`)

Add a single `const isRyczalt = pForm === 'ryczalt';` and drive all of the following from it. Use
`closest('.f' | '.f2' | '.lv-row')` traversal (already an established pattern — see the health-row
toggle at `script.js:599-602`) or add stable ids where cleaner.

| # | Item | Element(s) | Current state | Change |
|---|---|---|---|---|
| 1 | **Remove "Stawka ryczałtu"** | `p_ryczalt_rate_container` (`index.html:66`) | Currently *shown* only for ryczałt (`script.js:611-615`) | Invert: **always hidden**. Keep node + default `0.085`. (Engine still computes `baseTax`, but it's no longer displayed anywhere for ryczałt.) |
| 2 | **Hide "Przychód firmy — bez VAT"** | `p_inc` + `p_inc_hint` (`index.html:78-79`) | No special handling | Hide `p_inc`'s `.f` wrapper for ryczałt. (Skip setting the ryczałt hint at `script.js:572` since the field is hidden.) |
| 3 | **Hide "Koszty działalności"** | `p_kup` + `p_kup_tt` (`index.html:81`) | Disabled for ryczałt (`script.js:575-577`) | Hide it. Lives in the same `.f2` as `p_ded` (#4) → hide the whole `.f2` (`index.html:80-83`). Keep the `disabled` line for safety. |
| 4 | **Hide "Odliczenia od dochodu"** | `p_ded` (`index.html:82`) | No special handling | Hidden together with #3 (same `.f2`). |
| 5 | **Hide "Dochód po odliczeniach" + "Należny podatek (przed EV)"** | `p_net_lv` row (`index.html:84`), `p_tax_lv` row (`index.html:85`) | No special handling; always written (`script.js:205-206`) | Hide both `.lv-row`s for ryczałt. (Składka zdrowotna row `p_health_lv` is already hidden for non-liniowy — no change.) |
| 6 | **Hide "Podstawa amortyzacji" + "Stawka amortyzacji"** | `dep_base_lv` row, `dep_rate_lv` row (`index.html:175-176`) | *Muted* (opacity .4) for ryczałt via `lv-row-muted` in `syncPrices` (`script.js:108-110`) | Change muting → **hiding**. Recommend moving this decision into `updateVisibility()` (toggle `.hidden`) and deleting the `lv-row-muted` block in `syncPrices`. `syncPrices` may keep writing `textContent` to the hidden rows (harmless). The `.lv-row-muted` CSS class then becomes unused (optional removal). |
| 7 | **Hide cash-tab amortization info box** | `#tc_cash > .info` (`index.html:197`) | Static HTML, no JS reference | Give it an id (e.g. `cash_amort_info`) and hide for ryczałt. Also consider the credit-tab amortization line (`index.html:247`, *"Wartość netto → amortyzacja (limit 225 tys.)"*) and the leasing `l_type` option text (`index.html:204`) — see Open Decision D3. |

> **Note on dep rows + `setCarType`:** `setCarType` calls `syncPrices`, which still runs for ryczałt.
> Hidden dep rows just get written-then-not-shown — fine. Visibility depends only on tax form, so
> `updateVisibility()` (fired on the `p_tax_form` change event and in `init`) is the correct owner.

**Suggested shape (illustrative, not final code):**

```js
// inside updateVisibility(), after `const pForm = ...`
const isRyczalt = pForm === 'ryczalt';
const hide = (el, on) => el && el.classList.toggle('hidden', on);

hide($('p_ryczalt_rate_container'), true);                 // #1 — always hidden now
hide($('p_inc')?.closest('.f'), isRyczalt);                // #2
hide($('p_kup')?.closest('.f2'), isRyczalt);               // #3 + #4 (shared .f2)
hide($('p_net_lv')?.closest('.lv-row'), isRyczalt);        // #5a
hide($('p_tax_lv')?.closest('.lv-row'), isRyczalt);        // #5b
hide($('dep_base_lv')?.closest('.lv-row'), isRyczalt);     // #6a
hide($('dep_rate_lv')?.closest('.lv-row'), isRyczalt);     // #6b
hide($('cash_amort_info'), isRyczalt);                     // #7 (needs id in HTML)
```

### Layer B — results (`renderResults()`)

| # | Item | Location | Change |
|---|---|---|---|
| 8 | **"Zaoszczędzony podatek" should include VAT for ryczałt** | KPI at `script.js:262` | For ryczałt, set value = `cumRealVATRefund` (since `cumRealTaxSav` is 0, this is the only tax-system benefit). Recommend relabeling the card to **"Zwrot VAT"** for ryczałt so it's truthful. For ryczałt + non-VAT it shows `0 zł` (honest) — see Open Decision D2. |
| 9 | **Remove "obniżenie o 0,0%"** | KPI sub-text `obniżenie o ${pct(taxReduxPct)}` at `script.js:262`; `taxReduxPct` at `script.js:258` | Drop the sub-line for ryczałt (it's always `0,0%` and excludes VAT). Replace with a small honest sub (e.g. `realnie przez ${calcYears} lat`) or nothing. See Open Decision D1 re: removing it for *all* forms. |
| 10 | **"Podatek PIT przed EV (punkt wyjścia)" → info note** | Baseline block `script.js:369-399`, ryczałt branch `391-396` | For ryczałt, replace the `revenue × rate = baseTax` table with an **info note** mirroring the "Koszty firmowe"/"Zwrot VAT" style (`script.js:343, 348`): explain ryczałt taxes revenue, EV costs don't lower the PIT, and the only tax benefit is VAT (if VAT payer). Keep the skala/liniowy/joint branches unchanged. |
| 11 | **"Rozliczenie rok po roku (Krok po kroku)" → VAT-only for ryczałt** | Per-year `<details>` template `script.js:405-531` | For ryczałt, hide all the PIT/health reconciliation noise and keep only the VAT view. See breakdown below. |

**Per-year (#11) breakdown — for ryczałt, hide these (all render 0):**
- Summary line "Realna oszczędność PIT" (`:409`) → relabel to "Zwrot VAT (realnie): {vatRefundRealY}" (or hide if non-VAT).
- "Podstawa opodatkowania (Przed EV)" (`:412`), "Należny podatek (Przed EV)" (`:413`).
- "Podstawa opodatkowania (Po EV)" (`:430`), "Należny podatek (Po EV)" (`:431`).
- "Oszczędność w podatku PIT (Δ nominalna)" (`:432`) = 0, "Oszczędność na składce zdrowotnej" (`:433`) = 0.
- "Czynnik dyskontujący (CPI)" (`:434`), "Realna oszczędność łączna (PIT + zdrowotna)" (`:435`) = 0.
- `<details> 🧮 Podatek PIT — jak wyliczono` (`:436-458`).
- `<details> 🏥 Składka zdrowotna` (`:459-471`) — gated on `pSource==='dg'` which is always true for ryczałt; add `&& isKupAllowed` (or `&& pTaxForm!=='ryczalt'`) so it disappears.

**Keep (these are the meaningful per-year content):**
- `<details> 🧾 VAT` (`:472-480`) — the only EV tax benefit; already gated on `isVAT`.
- The short ryczałt explanatory line (`:426-429`) — keep (it explains why there's no KUP shield).
- **Decision D4:** `<details> 💳 Finansowanie — przepływy i amortyzacja` (`:481-513`) and
  `<details> 📉 Inflacja, NPV i inwestycja` (`:514-528`) underpin the TCO/fuel KPIs the user keeps —
  recommend keeping them, but a strict reading of "only VAT should be visible" would hide them too.

**Edge case:** ryczałt + **non-VAT payer** → there is *no* per-year tax content at all. Recommend
hiding the entire "Rozliczenie rok po roku" section (or showing a single note "Ta forma
opodatkowania nie generuje korzyści podatkowych z auta") rather than rendering empty accordions.

---

## 4. Additional recommended cleanups (in-scope, not explicitly listed)

These remove residual ryczałt noise consistent with the stated goal — flagged so you can opt in/out:

- **A1.** In the "🚗 Realny koszt zakupu" (`script.js:289`) and "💰 TCO" (`script.js:303`) tables, the
  "− Oszczędność podatkowa (realnie)" row shows **−0 zł** for ryczałt. Hide that row for ryczałt;
  keep the "− Zwrot VAT (realnie)" row.
- **A2.** Footer disclaimer (`script.js:539`) talks about 75% KUP / amortization — irrelevant to
  ryczałt. Optionally swap to a ryczałt-tailored one-liner.
- **A3.** The `.lv-row-muted` CSS class (`style.css:170-171`) becomes unused after #6 — optional removal.

---

## 5. Open decisions (need your call before implementation)

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Scope of removing "obniżenie o X%" (#9) | (a) ryczałt only; (b) all forms | Your bullet is under the ryczałt section but the rationale ("not useful, adds complication") is general. Recommend **(a) ryczałt-only** to stay in scope; can do (b) if you confirm. |
| **D2** | Ryczałt "Zaoszczędzony podatek" KPI (#8) | (a) relabel to "Zwrot VAT", value `cumRealVATRefund`; (b) keep label, value `cumRealVATRefund`; for non-VAT: show `0 zł` or hide the card | Recommend **(a)** + show `0 zł` for non-VAT (honest, layout-stable). |
| **D3** | How far to take "hide amortization info" (#7) | (a) only `#tc_cash` info box; (b) also credit-tab line `247` + leasing option text `204` | Recommend **(b)** for consistency, since they make the same (irrelevant-to-ryczałt) amortization claim. |
| **D4** | Per-year "only VAT" strictness (#11) | (a) keep Finansowanie + Inflacja/NPV/fuel details, hide only PIT/health; (b) strictly VAT-only | Recommend **(a)** — fuel & cash-flow underpin KPIs you're keeping. (b) matches the literal wording. |
| **D5** | Ryczałt + non-VAT per-year section | (a) hide whole "Rozliczenie rok po roku"; (b) single info note | Recommend **(b)** (less jarring than a vanishing section). |

---

## 6. Test & persistence impact

**Safe (no test coverage / covered path is skala):**
- All Layer B render changes (#8–#11) — no test asserts the ryczałt KPI text, baseline ryczałt
  string, or per-year ryczałt rows. The string `"obniżenie"` appears in **no** test.
- Hiding `p_net_lv`, `p_tax_lv`, `dep_base_lv`, `dep_rate_lv`, cash-tab info — **no** test references.
- The baseline-block test (`e2e.test.js:1098-1103`, asserts "Podatek PIT przed EV" + "Próg") runs on
  **skala** → untouched as long as we only branch the ryczałt path.
- Persistence — no test touches `p_ryczalt_rate`/`p_ded`; `saveConfig`/`restoreConfig` tolerate
  missing/hidden elements. No `EV_CONFIG_VERSION` bump.

**Would break only if you violate the §2 constraints:**
- Removing `p_ryczalt_rate` from the DOM → breaks `e2e.test.js:151` (`test_f2_ryczalt_rates_presence`).
- Removing `p_kup`/`p_inc`/`p_inc_hint`/`p_kup_tt` nodes → breaks `tests/ui.test.js:37-77, 100-106, 146-153`.
- Touching `calc/*` ryczałt plumbing (`pitRyczalt`, `pValRyczaltRate`, ryczałt branches) → breaks
  ~25 tests across `calculations`, `e2e`, `phase4`, `phase5`, `npv-tco-verification`.

**Watch (might break depending on implementation):**
- `tests/ui.test.js:244-268` ("KUP confined to spouse") scans `body.innerHTML` for the substring
  `"KUP"` after rendering ryczałt. Ensure the new ryczałt copy/per-year rewrite introduces **no
  "KUP" text** outside `#spouse_section`.

**New tests to add (recommended, since the render side is currently untested):**
- ryczałt + VAT: KPI shows VAT value, no "obniżenie" sub, baseline is an info note, per-year shows
  only VAT details.
- ryczałt + non-VAT: tax KPI is `0`/hidden, per-year section hidden or info note.
- `updateVisibility()` for ryczałt hides `p_inc`/`p_kup`/`p_ded` wrappers and the two value rows +
  two dep rows (assert `.hidden` / `display:none`), and that switching back to skala restores them.

---

## 7. Implementation sequencing (when approved)

1. **HTML:** add ids/wrappers needed for clean toggling (`cash_amort_info`; confirm `p_inc`'s `.f`
   and the `p_kup`/`p_ded` `.f2` are individually targetable — else add ids).
2. **`updateVisibility()`:** add `isRyczalt` block (Layer A, items #1–#7). Remove the `lv-row-muted`
   dep-row logic from `syncPrices()` (move to hidden-toggle in `updateVisibility`).
3. **`renderResults()`:** ryczałt branches for KPI (#8/#9), baseline note (#10), per-year VAT-only
   (#11), plus cleanups A1/A2 if approved.
4. **Tests:** add the ryczałt render/visibility tests above; run full suite
   (`pnpm test`; per memory, trust exit code / use `--reporter=json` in WSL).
5. **Manual verify (`pnpm dev`):** switch to ryczałt with VAT on/off, across cash/leasing/credit,
   confirm a clean VAT+fuel-focused view and no `0`-noise; confirm skala/liniowy unchanged.

## 8. Out of scope / explicitly NOT changing

- No changes to `calc/*` (engine, pit, health, schedules, constants).
- No change to the savings/TCO math — ryczałt numbers are already correct; this is presentation only.
- No `EV_CONFIG_VERSION` bump; no removal of DOM nodes or `CONFIG_VALUE_IDS` entries.
- Skala / liniowy / joint-filing views remain byte-for-byte unchanged.
