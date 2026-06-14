# Plan: Ryczałt UI simplification — Round 2

**Status:** ✅ Implemented 2026-06-14 (WP1–WP3, decisions D1/D2/D3 = (a)/(a)/(a)). Suite green at 350
tests. Changes landed in `index.html`, `script.js` (`updateVisibility()` + `syncUsedRows()`),
`tests/ryczalt-ui-simplification.test.js`. Not committed (user commits).
**Branch context:** `ryczalt-2`
**Author:** Claude (engine-traced against `calc/engine.js`)
**Date:** 2026-06-14
**Predecessor:** `plan/ryczalt-ui-simplification.md` (Round 1 — items #1–#11, already implemented in
`updateVisibility()` + `renderResults()` + `tests/ryczalt-ui-simplification.test.js`)
**Law basis:** Polish tax law 2026 (ustawa o zryczałtowanym podatku — ryczałt; ustawa o VAT art. 86a;
ustawa o PIT art. 23 ust. 1 pkt 46a/47).

---

## 0. Why a Round 2

Round 1 stripped the **taxpayer-panel** PIT/health/amortization noise and rewrote `renderResults()`
to a VAT+fuel view for ryczałt. It did **not** touch four remaining sources of ryczałt noise, all in
the **car / financing** cards:

1. The eksploatacja footnote (`.mn`, `index.html:183`) still tells a ryczałt user about "75% → koszty"
   and the 150 000 zł insurance cap — both are **KUP concepts that are structurally inert for ryczałt**.
2. The **"Stawka amortyzacji"** selector (`used_dep_rate_row`, `index.html:166`) still shows for used
   cars under ryczałt, where amortization does nothing.
3/4. The **leasing** and **credit** cards still surface KUP-only fields/figures (`l_kup_lv`,
   `c_rate`, …) that change no number a ryczałt user can see.

This plan covers exactly those four. It is **UI-only**: no file under `calc/` changes, no calc math
changes, no `EV_CONFIG_VERSION` bump.

---

## 1. Premise — what ryczałt can and cannot "see" (engine-traced)

For `pTaxForm === 'ryczalt'`, `isKupAllowed = pSource==='dg' && pTaxForm!=='ryczalt'` is **false**
(`engine.js:258`). Consequence, traced through the year loop (`engine.js:299–397`):

| Quantity | For ryczałt | Reason |
|---|---|---|
| `depKUP`, `intKUP`, `carKUP`, `opKUP`, `upfY`, `totalKUP` | **0** | all gated on `isKupAllowed` (`:300–305`) |
| `taxSav` (`baseTax − taxWith`) | **0** | revenue/health identical before/after EV (`:341–348`) |
| `healthSav` | **0** | ryczałt health tier keys off unchanged revenue (`:326–327`) |
| `cumLostIncKUP` | **0** | gated on `isKupAllowed` (`:310–314`) |

The **only** EV-driven benefits a ryczałt user sees:

- **VAT refund** `cumRealVATRefund` — non-zero **only for a VAT payer** (`:399–400`, `:362–371`).
- **Fuel savings** `cumRealFuelSav` (`:382–385`) — independent of tax form.
- **TCO** `effectiveCost` (`:415`) = discounted `cashOutflows` + insurance + maintenance − VAT − fuel.
- **Investment alternative** `invReal` (`:290–291`) — driven purely by `cashOutflows`.

**Rule for every Round-2 hide decision:** *hide an input/figure iff its only effect is on
KUP / amortization / PIT (inert for ryczałt). Keep it if it moves `cashOutflows`, the VAT refund, the
year count `calcYears`, or fuel.*

---

## 2. Hard constraints (carry over from Round 1)

1. **Hide, do not remove.** Keep every DOM node; hide with the existing
   `.hidden { display:none !important }` class (`style.css`). Tests, persistence, and `init()` guards
   read these nodes.
2. **No `calc/*` change.** The engine keeps receiving the hidden inputs' default/persisted values
   (`c_rate` default `9.19`, `used_dep_rate` default `0.40`, ryczałt rate `0.085`). They flow in
   silently and are simply never displayed — identical pattern to Round 1's `p_ryczalt_rate`.
3. **No `EV_CONFIG_VERSION` bump.** Keep `c_rate`, `used_dep_rate` etc. in `CONFIG_VALUE_IDS`
   (`script.js:35–39`); a user toggling back to skala/liniowy keeps their values.
4. **Centralize in `updateVisibility()`.** It is the single visibility authority, runs on every
   `change` event (`script.js:802–807`, including the `p_vat` checkbox) and in `init()`
   (`script.js:777`). All Round-2 toggles belong there. The one exception requiring coordination is
   `used_dep_rate_row`, whose car-type dimension currently lives in `setCarType()` — see WP2.
5. **Polish sentence case** for all copy (CLAUDE.md convention). No title case / ALL CAPS.
6. **Skala / liniowy / joint views stay byte-for-byte unchanged** — every change branches on
   `isRyczalt` (and, for WP1, on `isVAT`), and toggling back restores the original state.

---

## 3. Work packages

Four independent *intents*, but three of them edit the **same function** (`updateVisibility()`) and the
**same file** (`index.html`). They are **not safely parallel on disk** — see §6 for sequencing.
Each WP below is self-contained (element → current state → change → rationale → tests).

---

### WP1 — Eksploatacja footnote (`.mn`) → VAT-only / hidden for ryczałt  *(user items #1 & #3)*

**Element:** `index.html:183`
```html
<div class="mn">Eksploatacja: <strong>75% netto + nieodliczony VAT → koszty</strong>.
Ubezpieczenie: proporcjonalnie do <strong>limitu wartości 150 tys. zł</strong>.
VAT: <strong>50% odliczalne</strong> (użytek mieszany).</div>
```
**Current state:** static HTML, no `id`, shown for all tax forms.

**Problem (law 2026):** "75% → koszty" (art. 23 ust. 1 pkt 46a) and the 150 000 zł insurance-cap
proportion (art. 23 ust. 1 pkt 47) are **KUP rules**. Ryczałt taxes revenue and grants **no KUP**, so
both clauses are misleading. The only clause that still applies is the VAT one — and only if the
taxpayer is a VAT payer (mixed-use 50% recovery, art. 86a ustawy o VAT).

**Change:**
1. `index.html`: give the node a stable id, e.g. `id="oper_cost_note"`. (Keep the full default text in
   the HTML — it is the skala/liniowy copy.)
2. `script.js > updateVisibility()`: drive it off `isRyczalt` **and** `isVAT` (read
   `const isVAT = $('p_vat')?.checked || false;`), following the existing `l_type_oper`/`l_type_fin`
   text-swap pattern (`script.js:657–662`):
   - **skala / liniowy:** restore the full original text, shown. Store the full string as a constant
     (e.g. `OPER_COST_NOTE_FULL`) so the swap is reversible — do **not** read it back from the DOM.
   - **ryczałt + VAT payer:** replace innerHTML with VAT-only copy, shown.
     Suggested: `VAT: <strong>50% odliczalne</strong> (użytek mieszany).`
   - **ryczałt + non-VAT:** hide the note entirely (`.hidden`) — neither KUP nor VAT applies.

**Why `isVAT`-dependent is safe:** `updateVisibility()` already runs on the `p_vat` `change` event
(`script.js:802–807`), so toggling VAT re-evaluates the note live.

**Tests (`tests/ryczalt-ui-simplification.test.js`, `updateVisibility()` describe block):**
- ryczałt + VAT → `oper_cost_note` not `.hidden`, contains "VAT: ", does **not** contain "75%" or
  "150 tys.".
- ryczałt + non-VAT → `oper_cost_note` is `.hidden`.
- skala → not `.hidden`, contains "75%" and "150 tys." (round-trip restore).

---

### WP2 — Hide "Stawka amortyzacji" selector for ryczałt  *(user item #2)*

**Element:** `index.html:166–173` — `id="used_dep_rate_row"` wrapping `select#used_dep_rate`
(`40%/rok` / `20%/rok`).

**Current state:** visibility is set **only** in `setCarType()` (`script.js:62–63`):
`used_dep_rate_row.style.display = (t==='used') ? 'block' : 'none'`. It shows for any used car,
regardless of tax form. (Note: Round 1 already hides the *display* row `dep_rate_lv` at
`index.html:176` for ryczałt — this WP is about the *input selector*, a different element.)

**Problem:** the amortization rate (40% vs 20%) is an amortization-schedule concept. Ryczałt does not
depreciate → the selector controls nothing in the KUP/PIT sense.

**⚠️ Non-inert side effect — `calcYears` (must be decided, see D1):** `used_dep_rate` is **not** purely
inert. The engine sets the modeling horizon from it:
`calcYears = (carType==='new' || usedDepRate==='0.20') ? 5 : 3` (`engine.js:106,119,182,211`). For a
**used** car, `0.40` → 3-year horizon, `0.20` → 5-year horizon. That horizon scales cumulative fuel
savings, recurring-VAT years and TCO — all of which a ryczałt user **does** see. So hiding the selector
pins the horizon to whatever default it resolves to (`$('used_dep_rate')?.value || '0.40'` →
**3 years** for a used car). This is a genuine behavior change for ryczałt + used car. Resolve **D1**
before implementing.

**Change (needs to combine two conditions — car type AND tax form):** the row must be visible iff
`carType==='used' && !isRyczalt`. Because the car-type dimension lives in `setCarType()` and the
tax-form dimension lives in `updateVisibility()`, pick one owner to avoid the two handlers fighting:
- **Recommended:** add a tiny shared helper `syncUsedRows()` that sets
  `used_dep_rate_row.style.display = (carType==='used' && pForm!=='ryczalt') ? 'block' : 'none'`
  (and leaves `used_vat_row` on the pure `carType==='used'` rule — see note below). Call it from
  **both** `setCarType()` (replacing the inline line 63) and the end of `updateVisibility()`.
- Keep using `style.display` here (not `.hidden`) to stay consistent with the existing
  `used_vat_row`/`used_dep_rate_row` mechanism and avoid `display:none !important` clashing with the
  car-type toggle.

**Keep `used_vat_row` visible for ryczałt** (do **not** lump it in): `used_vat` (`gross_only` / `vat23` /
`vat_margin`) sets `purchaseVATEligible` (`engine.js:261`), which gates the **VAT refund**
(`purchaseVATRefund = vatAmt*0.5` only when `vat23`). For a ryczałt **VAT payer** with a used car this
directly changes `cumRealVATRefund` → it must stay. Only the *amortization-rate* row is hidden.

**Tests:**
- ryczałt + used car → `used_dep_rate_row` `display==='none'`; `used_vat_row` still `'block'`.
- skala + used car → both `'block'` (round-trip).
- ryczałt + new car → `used_dep_rate_row` `'none'` (already, since car type is new).

---

### WP3 — Trim leasing & credit cards for ryczałt  *(user item #4)*

Engine-traced field-by-field applicability for ryczałt. **Verdict** column applies the §1 rule.

#### Leasing (`#tc_leasing`)

| Field | id | What it drives in the engine | Verdict (ryczałt) |
|---|---|---|---|
| Typ leasingu | `l_type` | `oper` → `operLeaseVATSchedule` (`:266–275`); `fin` → `purchaseVATRefund` via `isAmortized` (`:73,262`). **Changes the VAT refund total & timing for a VAT payer.** cashOutflows identical either way; KUP inert. | **KEEP for VAT payer** (affects VAT). Inert for non-VAT ryczałt → optional hide (**D2**). Option label text already simplified in Round 1. |
| Wpłata własna netto / % | `l_down` / `l_down_pct` | `cashOutflows[0] = lD*1.23` (`:123`) → TCO & investment alt | **KEEP** |
| Wartość wykupu netto / % | `l_buy` / `l_buy_pct` | balloon `cashOutflows += lB*1.23` (`:152`); oper VAT `lB*0.23*0.5` (`:272`) | **KEEP** |
| Okres (miesiące) | `l_months` | `calcYears` + installment count + VAT schedule (`:119–120`) | **KEEP** |
| Rata miesięczna netto | `l_inst` | `cashOutflows += lI*cnt*1.23` (`:151`) + VAT schedule (`:271`) | **KEEP** |
| Całkowity koszt leasingu brutto | `l_total_lv` | live: `(d+i*m+b)*1.23` = gross cash total (TCO) | **KEEP** |
| Łączne koszty przez okres | `l_kup_lv` | live: `(d+i*m+b)*0.75` = **KUP figure** (`script.js:123`) | **HIDE** — KUP, structurally inert; the `0.75` framing is actively misleading for ryczałt |

#### Credit (`#tc_credit`)

| Field | id | What it drives in the engine | Verdict (ryczałt) |
|---|---|---|---|
| Rodzaj kredytu | `c_type` | cashOutflow structure (`standard`/`5050`/`3x33`, `:195–246`); all variants `isAmortized` → same `purchaseVATRefund` | **KEEP** (cashflow timing) |
| Wpłata własna (std) | `c_down` | `cashOutflows[0] = cD` (`:196`) | **KEEP** |
| Rata miesięczna (std) | `c_inst` | `cashOutflows += cIB*cnt` (`:199`) | **KEEP** |
| Okres (miesiące) (std) | `c_months` | `calcYears` + cashflow (`:181–182,198`) | **KEEP** |
| **Oprocentowanie roczne (std)** | `c_rate` | feeds **only** `interestAmortSchedule` → `kupFromInt` (=0 for ryczałt) + `creditUnamortized` (a KUP-side display hint). **Absent from `cashOutflows`** (which uses the user-entered `cIB` directly) **and from every VAT term.** | **HIDE** — zero visible effect for ryczałt; pure KUP-interest input |
| Prowizja (5050/3x33) | `c_fee` | `cashOutflows[0] += fee` (`:223,236`) | **KEEP** (cashflow) |
| Kwota kredytu | `c_principal_lv` | live: `priceB − cD` | **KEEP** |
| Szacunkowe łączne odsetki / koszty | `c_int_lv` | live: std → `max(0, cIB*cM − principal)` (real interest, derived from `cIB`, **not** from `c_rate`); 5050/3x33 → `fee` | **KEEP by default** (a genuine cash cost in TCO); optional hide (**D3**) since the "odsetki" framing pairs naturally with the now-hidden rate |
| Całkowity koszt brutto | `c_total_lv` | live: total gross cost (TCO) | **KEEP** |
| amortization info line | `credit_amort_info` | "Wartość netto → amortyzacja…" | **already hidden** in Round 1 (`updateVisibility`, `:656`) — no action |

**Net Round-2 hides for WP3:** `l_kup_lv` (its `.lv-row`), `c_rate` (its `.f`). Plus the optional
D2/D3 items.

**Change (`script.js > updateVisibility()`):** extend the existing `isRyczalt` block (around
`script.js:643–662`) with:
```js
hide($('l_kup_lv')?.closest('.lv-row'), isRyczalt);   // KUP total — inert for ryczałt
hide($('c_rate')?.closest('.f'),       isRyczalt);    // loan APR — only feeds KUP interest
```
> **Layout note:** `c_rate` shares a `.f2` row with `c_months` (`index.html:236–239`). Hiding only
> `c_rate`'s `.f` leaves `c_months` alone in the two-column grid (renders at ~half width). Acceptable;
> if a cleaner look is wanted, the implementing agent may add a one-off layout tweak — out of scope to
> mandate.

**No HTML change required** for WP3 — every target already has an id (`l_kup_lv`, `c_rate`,
`c_int_lv`, `l_total_lv`, `c_total_lv`).

**Persistence:** `c_rate` stays in `CONFIG_VALUE_IDS` (`script.js:39`); hidden, still persisted/restored,
still fed to the engine at its default/persisted value. No version bump.

**Tests:**
- ryczałt → `l_kup_lv.closest('.lv-row')` is `.hidden`; `c_rate.closest('.f')` is `.hidden`;
  `l_total_lv` / `c_total_lv` rows **not** hidden.
- skala → none of the above hidden (round-trip).
- (regression) toggling to ryczałt then back to liniowy restores `c_rate` and `l_kup_lv`.

---

## 4. Open decisions (resolve before implementation)

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | What to pin the modeling horizon to when `used_dep_rate` is hidden for a ryczałt **used** car (it sets `calcYears` 3 vs 5). | (a) leave default `0.40` → **3-year** horizon (no code beyond the hide); (b) for ryczałt, force the engine input to `0.20` → **5-year** horizon for consistency with new cars; (c) leave it and accept the 3-year view. | **(a)** — minimal change, matches the current default. Only revisit if you want used-car ryczałt to model 5 years like new cars (then (b), a 1-line override in `calc()`'s input build). Flagged because it changes displayed cumulative VAT/fuel/TCO. |
| **D2** | Hide `l_type` (Typ leasingu) for **non-VAT** ryczałt (where it is fully inert)? | (a) keep always (simpler, single rule); (b) hide only when `isRyczalt && !isVAT`. | **(a)** keep — it is a legitimate financing choice; a VAT-conditional hide adds a double-conditional for little gain. Round 1 already simplified its option labels. |
| **D3** | Hide `c_int_lv` ("Szacunkowe łączne odsetki / koszty") for ryczałt? | (a) keep (it is a real cash cost in TCO, derived from `cIB`, not from the hidden rate); (b) hide (pairs with the hidden `c_rate`). | **(a)** keep — it is economically meaningful regardless of tax form. |

---

## 5. Test & persistence impact

**Clean blast radius (verified):** `grep` over `tests/` finds **no** reference to `c_rate`,
`l_kup_lv`, `c_int_lv`, `used_dep_rate`, `used_dep_rate_row`, `l_total_lv`, `c_total_lv`, the `.mn`
class, or the "Eksploatacja" string. Nothing currently asserts the visibility of any Round-2 target,
so hiding them breaks no existing test.

**Would break only if a §2 constraint is violated:**
- Removing any of these nodes from the DOM (vs `.hidden`/`display:none`) → breaks `init()` guards,
  persistence round-trips, and Round-1 ui tests.
- Editing `calc/*` ryczałt plumbing → breaks ~25 calc/e2e/phase tests.

**Persistence:** no `CONFIG_VALUE_IDS`/`CONFIG_CHECK_IDS` change, no `EV_CONFIG_VERSION` bump. Hidden
fields remain persisted and restored.

**"KUP confined to spouse" invariant** (`tests/ryczalt-ui-simplification.test.js:171–189`): the WP1
ryczałt note copy must **not** introduce the literal substring `"KUP"` outside `#spouse_section`. The
recommended VAT-only copy ("VAT: 50% odliczalne (użytek mieszany).") satisfies this.

**New tests to add** — all in `tests/ryczalt-ui-simplification.test.js` under the existing
`updateVisibility()` describe block (uses the real `index.html`), per the per-WP lists above:
WP1 (note swap/hide + VAT toggle + round-trip), WP2 (used_dep_rate hidden / used_vat kept + round-trip),
WP3 (`l_kup_lv` + `c_rate` hidden + round-trip). Per WSL memory: trust the Vitest **exit code**; for
counts use `pnpm exec vitest run --reporter=json --outputFile=…`.

---

## 6. Agent decomposition & sequencing

The three WPs touch overlapping files (`index.html` for WP1/WP2; `updateVisibility()` in `script.js`
for WP1/WP2/WP3; the same test file for all three). **They cannot run as fully independent parallel
edits without merge conflicts.** Two viable strategies:

**Strategy A — sequential (recommended; lowest risk).** One agent per WP, applied in order
**WP1 → WP2 → WP3**, each agent: edit → add its tests → `pnpm test` (green) → hand off. Conflicts
are impossible; the function grows by clearly-commented blocks.

**Strategy B — parallel with strict ownership (only if speed matters).**
- Resolve **D1/D2/D3 first** (a blocking prerequisite — they change WP2/WP3 scope).
- Assign **disjoint edit regions** so agents never touch the same lines:
  - *Agent-HTML:* WP1's `index.html` id addition only (`oper_cost_note`). Tiny, runs first.
  - *Agent-WP1:* the `isRyczalt && isVAT` note block in `updateVisibility()` + WP1 tests.
  - *Agent-WP2:* the `syncUsedRows()` helper + its two call sites + WP2 tests.
  - *Agent-WP3:* the two `hide(...)` lines appended to the existing `isRyczalt` block + WP3 tests.
  - Agents share `updateVisibility()` and the test file → use a worktree per agent and a single
    integrator merging in WP1→WP2→WP3 order, re-running `pnpm test` after each merge.
- Given the small size of all three WPs, **Strategy A is the better trade-off** — the coordination
  overhead of B exceeds the work saved.

**Final integration step (either strategy):** manual `pnpm dev` smoke test — switch to ryczałt with
VAT on/off across cash / leasing (oper + fin) / credit (standard + 5050/3x33), confirm: the
eksploatacja note is VAT-only (VAT) or gone (non-VAT); no "Stawka amortyzacji" for used cars; no
`l_kup_lv` / `c_rate`; and that skala/liniowy are visually unchanged.

---

## 7. Out of scope

- No `calc/*` changes; no savings/TCO math change (ryczałt numbers are already correct — presentation
  only).
- No `EV_CONFIG_VERSION` bump; no DOM-node removal; no `CONFIG_VALUE_IDS` edits.
- The `l_kup_lv` `0.75` factor is a pre-existing simplification (leasing KUP is really 100% on
  capital+interest, not 75%) — **not** fixed here; for ryczałt the row is simply hidden.
- Skala / liniowy / joint-filing views remain byte-for-byte unchanged.
