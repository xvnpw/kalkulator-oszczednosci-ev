# Plan: Inflation-CPI toggle (default off) + bundled alternative investment

**Status:** 📝 Planned — **not implemented**. Decisions D1–D4 resolved by user (see §1).
**Branch context:** `sim-1`
**Author:** Claude (engine-traced against `calc/engine.js`, render-traced against `script.js > renderResults`)
**Date:** 2026-06-14
**Law/scope basis:** none new — this is a **presentation + input-gating** change. No Polish-tax-law literal
changes, no `calc/*` math change.

---

## 0. Intent

Add **one** switch — *"Uwzględnij inflację CPI"* — that gates the entire inflation/real-terms +
alternative-investment apparatus. **Default: off.** When off:

- the calculation runs in **nominal terms** (no CPI discounting) and the alternative investment is **not
  computed**;
- the CPI% / return% inputs, the alt-investment KPI/blocks, the per-year inflation/NPV rows, and all
  *"realny / realnie"* wording **disappear or reword to plain nominal labels**.

When on: today's behaviour exactly (CPI discounting everywhere + alternative-investment block).

The whole change is achievable **without touching `calc/*`** — see §2.

---

## 1. Decisions (resolved with user)

| ID | Decision | Resolution |
|---|---|---|
| **D1** | One bundled toggle vs. separate inflation / investment toggles. | **One combined toggle.** Off ⇒ both CPI discounting *and* the alternative investment are disabled. (`invReal` mathematically requires inflation anyway — they can't sensibly separate.) |
| **D2** | Where the control lives (the left card is hidden by default). | **Keep the left card as a toggle row.** The card *header* stays; its body collapses to a single switch by default; the *CPI %* and *Stopa zwrotu %* inputs appear only when the switch is on. Discoverability preserved without a free-floating global control. |
| **D3** | How to handle the *"realny / realnie / NPV / dyskontowanie"* vocabulary when off. | **Reword everything to nominal.** Drop *realny/realnie* from every KPI/block/disclaimer and hide the CPI-discount & NPV year rows, so the results read as plain nominal costs. (~15 render sites — full table in §5.) |
| **D4** | Should static reference/marketing content react to the toggle? | **No — leave it static.** The header pill *"TCO + inflacja CPI"*, the glossary *"Inwestycja Alternatywna"*, and the *"Dyskontowanie inflacyjne"* / assumptions metodologia entries stay unchanged. They document a feature that is still available (via the toggle). **Out of scope** (see §9). |

---

## 2. Engine semantics — why no `calc/*` change is needed

The combined toggle maps to exactly two existing engine inputs:

| Toggle | `inflation` passed to engine | `incInv` passed to engine |
|---|---|---|
| **on**  | `n('cpi')/100` (today's value) | `true` |
| **off** | `0` | `false` |

### 2.1 `inflation: 0` collapses every "real" figure to its nominal value — cleanly

Every discount in the engine is `÷ (1 + inflation)^k`. At `inflation === 0` every factor is `1`, so:

| Real figure | At inflation 0 becomes | Consequence |
|---|---|---|
| `cumRealTaxSav` | `cumTaxSav` | nominal |
| `cumRealFuelSav` | `cumFuelSav` | nominal |
| `cumRealVATRefund` | `cumVATRefund` | nominal |
| `cumRealFinCost` | `Σ cashOutflows` `=== totalFinCost` | row becomes redundant (see §5) |
| `realInsur`/`realMaint` | `totalInsur`/`totalMaint` | nominal |
| `debtInflSav = totalFinCost − cumRealFinCost` | **0** | its rows are already `> 0`-guarded → auto-hide |
| per-year `inflF` | `1.0000` | discount rows show `÷ 1,0000` → we hide them (§5) |

**This is already an asserted engine invariant**, not a hopeful claim:
`tests/calculations.test.js:217` — `expect(resNoInflation.cumRealFinCost).toBe(resNoInflation.totalFinCost)`
and `:216` for the `<` direction under inflation. The `cashOutflows`-sum `=== totalFinCost` identity holds
for every financing branch (cash / oper / fin / credit standard / 5050 / 3x33 — traced in `engine.js`
`totalFinCost` assignments vs. the `cashOutflows[...]` writes).

### 2.2 `incInv: false` already disables the investment apparatus end-to-end

`engine.js:279` computes `invGross/invReal/invSchedule` only `if(i.incInv)`. `renderResults` already gates
the alt-investment **KPI** (`script.js:278`) and **block** (`script.js:367`) on `incInv`. So toggling
`incInv:false` (a) skips the investment math and (b) auto-hides those two render sites **with no new code**.
The `engine.js:28` guard `if (i.incInv && !(i.investReturn > -1))` is skipped when `incInv` is false, so
the (still-passed, unused) `investReturn` value is harmless.

### 2.3 The only thing the engine *can't* tell renderResults

`renderResults(d)` receives the engine result, which contains `incInv` but **no inflation flag**. It cannot
distinguish "inflation 0 because toggle off" from a user typing `cpi = 0` with the feature on — and both are
in fact nominal, so for *number correctness* it doesn't matter. But to drive the **reword-to-nominal**
(D3) we thread a small presentation flag from `calc()` — see WP4. **This is an edit to `script.js`'s
`calc()`/`renderResults`, not to `calc/*`.**

---

## 3. Hard constraints

1. **No `calc/*` change.** All edits live in `index.html` + `script.js` + a new test file. The engine keeps
   receiving validated inputs; we only change *which* values `calc()` passes and *how* `renderResults`
   labels them.
2. **Hide, don't remove.** Keep every DOM node (`cpi`, `inv_r`, the card). Hide the inputs with the
   existing `.hidden { display:none !important }` mechanism. Tests, persistence and `init()` read these
   nodes; `n('cpi')`/`n('inv_r')` must keep resolving.
3. **Render-side reword must default to "on"** when the flag is absent, so the ~20 `renderResults`-direct
   test calls (`tests/e2e.test.js` `runCalc` → `script.renderResults(res)`) keep their current output.
4. **Polish sentence case** for all new copy (CLAUDE.md convention). No title case / ALL CAPS.
5. **On-state is byte-for-byte today's UI.** Every change branches on the toggle; turning it on restores
   the present rendering exactly.
6. **Static reference content untouched** (D4): header pill, glossary, metodologia.

---

## 4. Work packages

### WP1 — `index.html`: restructure the left card into a toggle row + collapsible inputs

**Element:** `index.html:269–277` (the `📈 Inflacja & inwestycja alternatywna` card).

**Change:**
1. Keep the card + header. (Header text may stay as-is; optional cosmetic shorten to
   `Inflacja i inwestycja` — non-blocking.)
2. Add a toggle **row** at the top of `.card-body`, mirroring the existing `p_vat` `.tog-row` switch
   pattern (`index.html:89–92`):
   ```html
   <div class="tog-row">
     <span>Uwzględnij inflację CPI <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Włącza dyskontowanie przyszłych kwot inflacją CPI (wartości realne) oraz symulację inwestycji alternatywnej. Domyślnie wyłączone — kwoty pokazywane są nominalnie.</span></span></span>
     <label class="sw"><input type="checkbox" id="cpi_toggle"><span class="sw-sl"></span></label>
   </div>
   ```
   `checked` is **absent** → default **off**.
3. Wrap the existing `.f2` (the `cpi` + `inv_r` inputs) in a container with a stable id, e.g.
   `<div id="cpi_inputs"> … </div>`, so `updateVisibility()` can show/hide it as one unit.
4. **Do not** add an inline `onchange` — the delegated `change` listener (`script.js:835–840`) already
   fires `updateVisibility()` + `calc()` for any `INPUT`, exactly like `p_vat`.

**No change** to header pill (line 31) or glossary/metodologia (D4).

---

### WP2 — `script.js > calc()`: gate the engine inputs on the toggle

**Element:** `script.js:188–189`
```js
inflation: n('cpi')/100, investReturn: n('inv_r')/100,
incCar: true, incFuel: true, incInv: true,
```
**Change:**
```js
const inflOn = cb('cpi_toggle');
…
inflation: inflOn ? n('cpi')/100 : 0,
investReturn: n('inv_r')/100,          // still passed; unused by engine when incInv=false
incCar: true, incFuel: true, incInv: inflOn,
```
> Read `inflOn` once near the top of the input-object build. `cb()` already exists
> (`script.js:28`). Leave `investReturn` populated (engine ignores it when `incInv` is false; avoids a
> conditional that could feed `0` and read oddly in a future refactor).

---

### WP3 — `script.js > updateVisibility()`: show/hide the CPI inputs

**Element:** end of `updateVisibility()` (after the existing ryczałt block, ~`script.js:709`).

**Change:** add
```js
// Inflation-CPI toggle: the CPI% / return% inputs are revealed only when the feature is on.
const inflOn = $('cpi_toggle')?.checked || false;
hide($('cpi_inputs'), !inflOn);   // `hide` helper already defined in this fn (line 654)
```
`updateVisibility()` runs in `init()` and on every delegated `change` (`script.js:810,837`), so the row
appears/disappears live as the switch flips — same lifecycle as `p_vat`-driven visibility.

> The `cpi`/`inv_r` `<input>`s stay in the DOM with their persisted/default values; `n('cpi')` keeps
> resolving even while hidden (hide-don't-remove, constraint 2).

---

### WP4 — `script.js > renderResults()`: reword to nominal + hide CPI/NPV rows when off

**4a. Thread the presentation flag.** In `calc()`, just before `renderResults(res)` (`script.js:231`):
```js
res.inflationOn = cb('cpi_toggle');
renderResults(res);
```
In `renderResults`, derive once (default **true** when the field is absent → preserves the
`renderResults`-direct test calls, constraint 3):
```js
const inflationOn = d.inflationOn !== false;
```
> Mutating the result bag in `calc()` (rather than adding an engine output) keeps `calc/*` untouched and
> mirrors how the codebase already passes one large object around.

**4b. Apply the reword/hide at each site.** Full enumeration in **§5**. Two mechanical rules:
- **Reword:** when `!inflationOn`, drop `realny`/`realnie`/`(realnie)`; change `realnie przez X lat` →
  `przez X lat`; change titles `Realny koszt … → Koszt …`.
- **Hide:** when `!inflationOn`, omit the CPI-discount factor row, the NPV row + its convention note, the
  VAT "Wartość realna" row, the redundant `Skumulowany koszt finansowania (realnie)` row (equals the
  brutto row at inflation 0), and the entire `📉 Inflacja, NPV i inwestycja` sub-detail.

The alt-investment **KPI** (`:278`) and **block** (`:367`) need **no new gating** — they already key off
`incInv`, which WP2 sets false when off.

---

### WP5 — Persistence

**Element:** `CONFIG_CHECK_IDS` (`script.js:44`).
**Change:** add `'cpi_toggle'`:
```js
const CONFIG_CHECK_IDS = ['p_vat','joint_filing','s_vat','cpi_toggle'];
```
- `saveConfig()`/`restoreConfig()` pick it up automatically (they iterate `CONFIG_CHECK_IDS`).
- **Version bump? No (recommended).** `restoreConfig` only writes check ids present in `cfg.checks`
  (`hasOwnProperty` guard, `script.js:750`). Old `version: 2` configs lack `cpi_toggle` → it stays at the
  HTML default (**off**). Adding a field doesn't make old configs invalid/misleading (the one criterion
  for a bump in CLAUDE.md), so **keep `EV_CONFIG_VERSION = 2`**.
- **Known, intended consequence:** a returning user whose saved config predates this change loses the
  always-on inflation view and lands on the new **default-off** nominal view. That is precisely the product
  decision (default off). Acceptable; no migration.

---

### WP6 — Tests (new file `tests/inflation-toggle.test.js`)

Uses the real `index.html` + happy-dom (same harness as `ryczalt-ui-simplification.test.js`). Cover:

- **Input gating (calc → engine):**
  - toggle **off** ⇒ engine receives `inflation: 0`, `incInv: false`; assert `res.cumRealFinCost === res.totalFinCost`, `res.invGross === 0`, `res.invReal === 0`.
  - toggle **on** ⇒ `inflation: n('cpi')/100`, `incInv: true`; `cumRealFinCost < totalFinCost` for a financed scenario; `invGross > 0`.
- **Visibility (`updateVisibility()`):**
  - off ⇒ `#cpi_inputs` is `.hidden`; on ⇒ not `.hidden`. Round-trip both ways.
- **Render reword/hide (`renderResults` via the real `calc()` path, or by setting `d.inflationOn`):**
  - off ⇒ `res_body` innerHTML **does not** contain `realnie`, `Realny koszt`, `Czynnik dyskontujący`,
    `Wartość bieżąca NPV`, `📉 Inflacja`, `📈 Inwestycja alternatywna`, `Inwestycja alt. (realnie)`;
    **does** contain `Koszt zakupu` and `Koszt (TCO)`.
  - on ⇒ all of the above present (regression of today's output).
- **Persistence round-trip:** set `cpi_toggle` checked → `saveConfig()` → clear → `restoreConfig()` →
  checkbox restored checked; missing-key (old config) → stays unchecked.
- **Default-off boot:** fresh DOM (no localStorage) ⇒ after `init()`/`updateVisibility()`, `#cpi_inputs`
  hidden and `res_body` shows nominal labels.

Per WSL memory ([vitest-stdout-lost-wsl]): trust the Vitest **exit code**; for counts use
`pnpm exec vitest run --reporter=json --outputFile=…`.

---

## 5. Full render-site enumeration (the "other places")

`renderResults` sites, with the off-state action. Line numbers are current `script.js`.

### KPI grid
| # | Line | Element | Off-state action |
|---|---|---|---|
| 1 | 274 | KPI `Realny koszt zakupu` | reword title → **`Koszt zakupu`** |
| 2 | 277 | KPI `Realny koszt (TCO)` | reword title → **`Koszt (TCO)`** |
| 3 | 276 | Fuel KPI sub `realnie przez ${y} lat` | → **`przez ${y} lat`** |
| 4 | 270 | ryczałt VAT KPI sub `realnie przez ${y} lat` | → **`przez ${y} lat`** |
| 5 | 278 | KPI `Inwestycja alt. (realnie)` | **auto-hidden** (gated on `incInv`, false when off) — no code |

### Block "🚗 Realny koszt zakupu" (296–306)
| # | Line | Element | Off-state action |
|---|---|---|---|
| 6 | 297 | title `🚗 Realny koszt zakupu` | → **`🚗 Koszt zakupu`** |
| 7 | 300 | `Zysk z inflacji na długu (realnie)` | **auto-hidden** (`debtInflSav > 0` → 0 when off) |
| 8 | 301 | `Skumulowany koszt finansowania (realnie)` | **hide** when off (equals the brutto row → redundant) |
| 9 | 302 | `… Oszczędność podatkowa[/i zdrowotna] (realnie)` | drop `(realnie)` |
| 10 | 303 | `− Zwrot VAT (realnie)` | drop `(realnie)` |
| 11 | 304 | total `Realny koszt zakupu` | → **`Koszt zakupu`** |

### Block "💰 TCO" (309–321)
| # | Line | Element | Off-state action |
|---|---|---|---|
| 12 | 313 | `Zysk z inflacji na długu (realnie)` | **auto-hidden** (0 when off) |
| 13 | 316 | `… Oszczędność podatkowa[/i zdrowotna] (realnie)` | drop `(realnie)` |
| 14 | 317 | `− Zwrot VAT (realnie)` | drop `(realnie)` |
| 15 | 318 | `− Oszczędność paliwo→prąd (realnie)` | drop `(realnie)` |
| 16 | 319 | total `Realny koszt TCO` | → **`Koszt TCO`** |

### Block "📈 Inwestycja alternatywna" (367–379)
| # | Line | Element | Off-state action |
|---|---|---|---|
| 17 | 367 | whole block | **auto-hidden** (gated on `incInv`) — no code |

### Year-by-year ledger (417–561)
| # | Line | Element | Off-state action |
|---|---|---|---|
| 18 | 435 | summary `Realna oszczędność PIT` | → **`Oszczędność PIT`** |
| 19 | 434 | summary `Zwrot VAT (realnie)` | drop `(realnie)` |
| 20 | 463 | row `Czynnik dyskontujący (CPI) … ÷ inflF` | **hide** (`÷ 1,0000` is noise) |
| 21 | 464 | row `Realna oszczędność łączna (PIT + zdrowotna)` | → **`Oszczędność łączna (PIT + zdrowotna)`** |
| 22 | 505 | VAT detail `Wartość realna (÷ …)` | **hide** |
| 23 | 512 | finance detail `Wartość bieżąca NPV (÷ (1+CPI)^…)` | **hide** |
| 24 | 513 | finance detail discount-convention note | **hide** |
| 25 | 541–555 | sub-detail `📉 Inflacja, NPV i inwestycja` (gated `incFuel‖incInv`) | **add `inflationOn` to the gate** → hidden when off (fuel saving is already in the `⛽ vs ⚡` block) |

### Footnote
| # | Line | Element | Off-state action |
|---|---|---|---|
| 26 | 570 | ryczałt disclaimer, leading `* Realna oszczędność dyskontowana inflacją CPI.` | drop that sentence when off |
| 27 | 571 | non-ryczałt disclaimer, same leading sentence | drop that sentence when off |

> **Implementation tip:** centralise the literal swaps. Define small helpers/consts at the top of
> `renderResults`, e.g. `const realny = s => inflationOn ? 'Realny '+s : ''+cap(s)` is over-engineering;
> simpler is per-site ternaries (`inflationOn ? 'Realny koszt (TCO)' : 'Koszt (TCO)'`) since the strings
> differ. Keep them inline and obvious — the file already uses dense inline ternaries.

---

## 6. Test & persistence blast radius

**Pure-engine tests are immune.** `calculations.test.js`, `npv-tco-verification.test.js`,
`npv_robustness.test.js`, `phase*-*.test.js` call `calculateEngine(...)` directly with explicit
`inflation`/`incInv` — they never see the toggle. `incInv` appears in 13+13+6+… call sites, all passing
the value explicitly. **No change required; none break.**

**`renderResults`-direct DOM tests are immune** *iff constraint 3 holds.* `tests/e2e.test.js`'s `runCalc`
(`:1087`) calls `script.renderResults(res)` with an engine result that has **no** `inflationOn` field →
`inflationOn` defaults to **true** → today's wording. The two at-risk tests —
`shows inflation sub-section when incFuel=true` (`:1162`) and
`shows investment schedule when incInv=true` (`:1168`) — pass `inflation: 0.05` / `incInv: true` and rely
on the default-true flag, so both stay green. **Verify** this explicitly after implementing.

**`ui.test.js` / `persistence.test.js`:** confirm none assert the `cpi`/`inv_r` inputs are *visible* by
default (they previously were). If any do, update to the new default-off expectation. `persistence.test.js`
round-trips `CONFIG_CHECK_IDS`; adding `cpi_toggle` is additive — re-run to confirm. (Grep these two files
for `cpi`, `inv_r`, `cpi_inputs` before coding.)

**No `EV_CONFIG_VERSION` bump** (WP5).

---

## 7. Review notes — risks & edge cases

- **Toggle-on + user types `cpi = 0`:** labels say *realny* but numbers are nominal (real == nominal).
  This is a **pre-existing** harmless state (true today), not introduced here, and only reachable with the
  feature explicitly on. Not worth special-casing.
- **Redundant-row hide (#8):** only safe because `cumRealFinCost === totalFinCost` at inflation 0 (§2.1,
  asserted by `calculations.test.js:217`). If a future engine change broke that identity, the row would
  need to come back. Note it in the new test (`cumRealFinCost === totalFinCost` when off).
- **`debtInflSav` rows (#7, #12)** rely on the existing `> 0` guard; at inflation 0 `debtInflSav` is
  exactly 0 (not a tiny float — it's `totalFinCost − Σcashflow/1`), so the guard reliably hides them. The
  new test should assert `res_body` lacks `Zysk z inflacji na długu` when off.
- **Sticky total / `totalSav`:** at inflation 0, `totalSav = cumTaxSav + cumFuelSav + cumVATRefund`
  (nominal). The sticky header (`script.js:254`) shows it unchanged in label — correct (it never said
  "realny"). No action.
- **Header pill still reads "TCO + inflacja CPI"** while the feature is off (D4 = leave static). Mild
  marketing/UX mismatch, accepted by decision. Revisit only if it confuses users.

---

## 8. Sequencing

All edits are small and mostly in one function each; **sequential, single-agent** is the right call
(parallelism overhead > work saved, same lesson as the ryczałt rounds):

**WP1 (HTML) → WP2 (calc inputs) → WP3 (updateVisibility) → WP4 (renderResults reword/hide) → WP5
(persistence) → WP6 (tests).** After WP6: `pnpm test` green, then a manual `pnpm dev` smoke test:

1. Fresh load (clear `ev-config`) ⇒ toggle off, no CPI inputs, nominal labels, no alt-investment / NPV /
   `📉 Inflacja` anywhere; numbers match a hand nominal sum.
2. Flip on ⇒ CPI% + return% appear; results revert to today's *realny* + investment view.
3. Flip on → off → on ⇒ state and wording round-trip; reload persists the last toggle state.
4. Cross-check ryczałt + VAT and skala/liniowy in both toggle states (the reword branches must not
   collide with the existing `isRyczalt` branches).

---

## 9. Out of scope

- **No `calc/*` change**; no savings/TCO math change (off-state numbers are the engine's own nominal
  values).
- **No `EV_CONFIG_VERSION` bump**; no DOM-node removal.
- **Static reference content unchanged (D4):** header pill `TCO + inflacja CPI` (`index.html:31`),
  glossary `Inwestycja Alternatywna` (`#def-inv`), metodologia `Dyskontowanie inflacyjne` + the
  *Dyskontowanie* assumptions bullet, and `README.md`'s NPV / alternative-investment sections.
- **No second (separate) investment toggle** (D1 = one combined control).
