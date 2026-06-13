# Income-block clarity + DG-only taxpayer — design

**Date:** 2026-06-13
**Status:** Approved (pending spec review)
**Scope:** Presentation/UI only for the taxpayer; spouse keeps etat/dg. No `calc/*` engine logic changes.

## Problem

The taxpayer income field is labelled `Przychód / Przychód brutto (zł)` (`index.html:85`).
This is ambiguous. Entrepreneurs use "netto"/"brutto" in several colloquial senses:

1. **bez VAT** — service value without VAT.
2. **po kosztach** — revenue minus costs (profit).
3. **na rękę** — after PIT, ZUS and everything (take-home).

The calculator never VAT-adjusts the income (`pInc` flows straight into
`pNet = max(0, pInc − pKup − pDed)`, `calc/engine.js:41`); the only VAT logic
(`isVAT = cb('p_vat') && p_source==='dg'`, `script.js:93`) touches **car costs**, never income.
For DG the correct entry is **net-of-VAT revenue** (przychód for PIT) — *not* netto+VAT, *not*
profit, *not* take-home. The label invites all three wrong readings, silently mis-stating the result.

## Decisions (locked with user)

1. **Taxpayer is DG-only.** Remove "etat" from the taxpayer entirely. The `Źródło przychodów`
   dropdown is deleted; the panel header becomes explicit instead.
2. **Spouse keeps etat/dg** and *also* receives the source-aware clarity treatment.
3. **Whole income block** is clarified (income + KUP + Odliczenia + VAT note), not just the label.
4. **Guidance = positive statement + explicit warn-offs**, shown as persistent helper text
   (visible, not hover-only), so the dangerous misreadings (#2 profit, #3 take-home) are called out.
5. **Engine unchanged.** `etat` support stays in `calculateHealthContribution` because the spouse
   (`sSource`) still uses it and pure-function unit tests cover it.

## Detailed design

### A. Taxpayer section — `index.html` (DG only)

- **Remove** `<select id="p_source">` and its two `<option>`s.
- Panel header → `🧑 Podatnik — działalność gospodarcza (DG)`.
- Keep `Forma opodatkowania` (`p_tax_form`: skala/liniowy/ryczalt) unchanged.
- **Income label** (now static — taxpayer is always DG): `Przychód firmy — bez VAT (zł)`.
- **Income helper** — new persistent `<div class="fhint" id="p_inc_hint">` under `#p_inc`:
  - `ⓘ Cała sprzedaż/obrót firmy bez VAT.`
  - `✕ to nie jest kwota „na rękę" po podatkach`
  - `✕ to nie jest zysk po kosztach — koszty wpisz w polu KUP`
  - Ryczałt-only extra line (toggled by `updateVisibility`):
    `Ryczałt liczy podatek od przychodu — koszty (KUP) go nie obniżają.`
- **KUP tooltip** (static DG text): `Koszty firmowe (faktury, amortyzacja itp.) — bez VAT, jeśli go odliczasz.`
  - Ryczałt: field already disabled by `updateVisibility`; tooltip → `Ryczałt nie uwzględnia kosztów (KUP).`
- **Odliczenia od dochodu tooltip** (static DG text): `Zapłacone składki ZUS społeczne i ulgi odliczane od dochodu.`
- **VAT toggle note** (DG-only, already DG-gated): `Dotyczy tylko kosztów auta (zakup, paliwo, eksploatacja). Przychód wpisuj zawsze bez VAT.`

### B. Spouse section — `index.html` (source-aware)

Keeps `s_source` (etat/dg). Income label + helper rewrite on `s_source` change via `updateVisibility`:

- **DG** → label `Przychód firmy — bez VAT (zł)`; helper = the DG warn-offs above (no ryczałt line —
  spouse forma is locked to skala).
- **Etat** → label `Wynagrodzenie brutto — przed podatkiem (zł)`; helper:
  - `ⓘ Pensja brutto z umowy (przed podatkiem i składkami).`
  - `✕ to nie jest kwota „na rękę" / przelew na konto`
- New persistent `<div class="fhint" id="s_inc_hint">` under `#s_inc`.

### C. `script.js`

- **`updateVisibility()`**:
  - Delete the taxpayer `pSource === 'etat'` branch (taxpayer is always DG → fields always enabled).
  - Simplify: KUP-disable → `pForm === 'ryczalt'`; joint-filing → `!jointAllowed`; VAT container always shown for the taxpayer.
  - Add: toggle the taxpayer ryczałt helper line on `pForm === 'ryczalt'`.
  - Add: set spouse income label + `#s_inc_hint` from `sSource` (DG vs etat variants).
- **Simplify now-dead taxpayer non-DG branches** (taxpayer `pSource` is always `'dg'`):
  - `:93` `isVAT = cb('p_vat') && $('p_source')?.value==='dg'` → `isVAT = cb('p_vat')`.
  - `:108` drop the `$('p_source')?.value==='dg' &&` term.
  - `:320` remove the `if(pSource !== 'dg')` "umowa o pracę" KUP block; keep the `else if(isKupAllowed)` path.
  - `:433` drop the `pSource !== 'dg' ? 'umowa o pracę' : 'ryczałt ewidencjonowany'` ternary → always `'ryczałt ewidencjonowany'`.
  - `:464` `pSource==='dg' ? <health detail> : ''` → always show the health detail.
  - Note: these collapses apply to the **taxpayer** `pSource`. Spouse uses `sSource` and is untouched by them.
- **Persistence**:
  - Remove `'p_source'` from `CONFIG_VALUE_IDS` (`:35`).
  - **Bump `EV_CONFIG_VERSION`** — a persisted field is removed, so mismatched old configs are discarded
    wholesale (per CLAUDE.md). One-time reset to HTML defaults for existing users; acceptable.
  - `restoreConfig` needs no special handling for the removed `p_source` (its `if (el)` guard already no-ops).

### D. CSS — `style.css`

- New `.fhint`: small, muted helper text (reuse the existing muted/`--t3`-style variable), tight line-height.
- New `.fhint .x`: the `✕` warn-off lines in a subtle warning colour (reuse an existing warn var, e.g. `--y`).
- Polish sentence case throughout (CLAUDE.md convention — no title case / ALL CAPS).

### E. Engine — `calc/*` — NO CHANGE

`calculateEngine` keeps the `pSource` param (defaults `'dg'`, `engine.js:11`). The removed taxpayer
dropdown means `$('p_source')?.value || 'dg'` (`script.js:167`) always yields `'dg'`.
`calculateHealthContribution`'s `source !== 'dg'` (etat) path stays — still used by the spouse
(`engine.js:45`, `sSource`) and by unit tests.

### F. Tests

- **Remove/replace** obsolete taxpayer-etat UI tests:
  - `e2e.test.js`: `test_f2_taxpayer_etat_fields`, `test_f4_b4_changing_source_preserves_form`
    (both assert the `p_source` element / set it to `'etat'`).
  - `ui.test.js`: the two `disables p_kup when pSource is etat` cases and the etat-transition case
    → re-point to DG/ryczałt equivalents (ryczałt is now the only KUP-disabling state).
- **Reframe** taxpayer-framed engine integration tests that set `inputs.pSource = 'etat'`
  (`test_f6_etat_health_no_car_deduction`, `test_f7_b1_taxpayer_etat_car_shield`,
  `test_t3_skala_etat_joint_dg_vat`) to **spouse-etat** scenarios — same engine path, matches the real UI.
- **Keep** pure-function etat unit tests (`calculations.test.js` health "etat" cases,
  `phase5-robustness.test.js` etat floor cases) — engine capability retained.
- **Add** UI assertions:
  - Taxpayer: no `#p_source` element exists; income label contains "bez VAT"; `#p_inc_hint` contains both `✕` warn-offs.
  - Ryczałt: `#p_inc_hint` shows the cost-note line; KUP tooltip is the ryczałt variant.
  - Spouse: income label flips between "bez VAT" (dg) and "brutto"/"przed podatkiem" (etat) on `s_source` change.

## Out of scope

- No change to PIT/health math or any `calc/*` module.
- No new persisted input fields (helper text is derived from existing `p_tax_form` / `s_source`).
- No redesign of the results/output panels beyond the dead-branch simplifications listed in C.

## Risks / trade-offs

- **Config reset:** bumping `EV_CONFIG_VERSION` resets existing saved configs once. Documented pattern; acceptable.
- **Form height:** the persistent helper adds ~3 short lines under each income field. Accepted in favour of
  visible warn-offs (vs hover-hidden), which was the explicit goal.
- **Retained etat code:** etat lives on engine-side for the spouse; the taxpayer simply can't reach it.
  Reframing the taxpayer-etat tests to spouse keeps the suite honest about what the UI can produce.

## Acceptance criteria

1. Taxpayer panel has no `Źródło przychodów` control; header reads `🧑 Podatnik — działalność gospodarcza (DG)`.
2. Taxpayer income label reads `Przychód firmy — bez VAT (zł)` with the DG helper + both warn-offs visible (no hover needed).
3. Selecting ryczałt shows the "koszty (KUP) go nie obniżają" line and disables KUP with the ryczałt tooltip.
4. Spouse income label/helper switch correctly between DG and etat variants on `s_source` change.
5. VAT toggle shows the "dotyczy tylko kosztów auta… przychód zawsze bez VAT" note.
6. `EV_CONFIG_VERSION` bumped; `'p_source'` removed from `CONFIG_VALUE_IDS`.
7. `pnpm test` green: obsolete taxpayer-etat UI tests removed/replaced, taxpayer-etat engine tests reframed to spouse, new UI assertions pass, all `calc/*` tests unchanged and passing.
