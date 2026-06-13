# Income-block clarity + DG-only taxpayer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the taxpayer income block unambiguous — taxpayer is DG-only with a clear "przychód firmy, bez VAT" label plus visible warn-offs; the spouse keeps etat/dg and gets the same source-aware clarity.

**Architecture:** Pure presentation change. `index.html` loses the taxpayer `Źródło` dropdown and gains persistent helper text; `style.css` gains a `.fhint` style; `script.js` extends `updateVisibility()` to drive the helper copy and drops the now-dead taxpayer-etat branches. **No `calc/*` engine logic changes** — `calculateHealthContribution` keeps its `etat` path because the spouse still uses it.

**Tech Stack:** Vanilla JS ES modules, Vite (build only), Vitest + happy-dom (tests), pnpm.

> **⚠️ Committing:** Per this repo's CLAUDE.md, **the user commits — never the agent.** Where a normal plan would `git commit`, this plan instead has a **✋ Checkpoint** for the user to review and commit. Do not run `git commit`/`git add`.

> **Spec:** `docs/superpowers/specs/2026-06-13-income-block-clarity-dg-only-design.md`

> **Expected red window:** Task 1 rewrites the test suite to the *target* state, so the suite is intentionally red after Task 1 and goes green as Tasks 2–5 land. Task 6 confirms all-green.

---

## File map

- `index.html` — remove taxpayer `Źródło` dropdown; static DG income label; add `#p_inc_hint`; DG tooltips for KUP/Odliczenia (`#p_kup_tt`); VAT note; spouse `#s_inc_label` + `#s_inc_hint`.
- `style.css` — add `.fhint`, `.fhint .x`, `.fhint .note`.
- `script.js` — helper-copy constants; `updateVisibility()` rewrite; `isVAT`/`isDepAllowed`/`calc` `pSource` fixes; dead render-branch cleanup (320, 433); `CONFIG_VALUE_IDS` minus `p_source`; `EV_CONFIG_VERSION` 1→2.
- `tests/ui.test.js` — KUP-gating block rewritten to form-only; new "Income-block clarity" block; config-version literal 1→2.
- `tests/e2e.test.js` — delete two obsolete taxpayer-etat DOM tests; rewrite `test_f2_taxpayer_dg_fields`.
- `tests/persistence.test.js` — config-version literals 1→2.

> **Deliberately NOT changed:** `calc/*` (engine retains etat for spouse); the engine-only etat tests that call `calculateEngine({ pSource: 'etat' })` directly (`test_f6…`, `test_f2_b2…`, `test_f7_b1…`, `test_f7_b2…`, `test_t3_skala_etat_joint_dg_vat`, `test_t3_skala_dg_vat_joint_etat`) — they still pass and assert real engine behaviour reachable via the spouse. `script.js:464`'s `${pSource==='dg' ? … : ''}` health-detail wrapper is left as harmless dead-true (editing the nested template interpolation is risk for zero behaviour change). See "Open notes" at the end.

---

### Task 1: Rewrite the test suite to the target state

**Files:**
- Test: `tests/ui.test.js`
- Test: `tests/e2e.test.js`
- Test: `tests/persistence.test.js`

- [ ] **Step 1: Replace the KUP-gating describe block in `tests/ui.test.js`**

Find the block starting `describe('KUP field gating (updateVisibility)', () => {` (around line 30) through its closing `});` (around line 104) and replace the **entire block** with:

```js
  describe('KUP field gating (updateVisibility)', () => {
    function setForm(form) {
      const pTaxForm = document.getElementById('p_tax_form');
      pTaxForm.value = form;
      pTaxForm.dispatchEvent(new window.Event('change'));
    }

    it('disables p_kup when form is ryczalt', async () => {
      const script = await import('../script.js');
      setForm('ryczalt');
      script.updateVisibility();
      expect(document.getElementById('p_kup').disabled).toBe(true);
    });

    it('enables p_kup when form is skala', async () => {
      const script = await import('../script.js');
      setForm('skala');
      script.updateVisibility();
      expect(document.getElementById('p_kup').disabled).toBe(false);
    });

    it('enables p_kup when form is liniowy', async () => {
      const script = await import('../script.js');
      setForm('liniowy');
      script.updateVisibility();
      expect(document.getElementById('p_kup').disabled).toBe(false);
    });

    it('preserves the p_kup value across disable/enable transitions', async () => {
      const script = await import('../script.js');
      const pKup = document.getElementById('p_kup');

      setForm('skala');
      script.updateVisibility();
      expect(pKup.disabled).toBe(false);
      pKup.value = '12345';
      expect(pKup.value).toBe('12345');

      setForm('ryczalt');
      script.updateVisibility();
      expect(pKup.disabled).toBe(true);
      expect(pKup.value).toBe('12345');

      setForm('liniowy');
      script.updateVisibility();
      expect(pKup.disabled).toBe(false);
      expect(pKup.value).toBe('12345');
    });
  });
```

- [ ] **Step 2: Add the "Income-block clarity" describe block in `tests/ui.test.js`**

Immediately after the block from Step 1 (before the `describe('UI Overhaul'` block), insert:

```js
  describe('Income-block clarity (DG-only taxpayer)', () => {
    it('taxpayer has no source selector', async () => {
      await import('../script.js');
      expect(document.getElementById('p_source')).toBeNull();
    });

    it('taxpayer income label states bez VAT', async () => {
      await import('../script.js');
      const incLabel = document.getElementById('p_inc').parentElement.querySelector('label');
      expect(incLabel.textContent).toContain('bez VAT');
    });

    it('taxpayer income hint warns off take-home and profit', async () => {
      const script = await import('../script.js');
      script.updateVisibility();
      const hint = document.getElementById('p_inc_hint').innerHTML;
      expect(hint).toContain('na rękę');
      expect(hint).toContain('zysk po kosztach');
    });

    it('ryczalt adds the cost-note line and switches the KUP tooltip', async () => {
      const script = await import('../script.js');
      document.getElementById('p_tax_form').value = 'ryczalt';
      script.updateVisibility();
      expect(document.getElementById('p_inc_hint').innerHTML).toContain('go nie obniżają');
      expect(document.getElementById('p_kup_tt').textContent).toContain('Ryczałt nie uwzględnia');
    });

    it('spouse income label/hint follow s_source', async () => {
      const script = await import('../script.js');
      const sSource = document.getElementById('s_source');

      sSource.value = 'etat';
      script.updateVisibility();
      expect(document.getElementById('s_inc_label').textContent).toContain('brutto');
      expect(document.getElementById('s_inc_hint').innerHTML).toContain('na rękę');

      sSource.value = 'dg';
      script.updateVisibility();
      expect(document.getElementById('s_inc_label').textContent).toContain('bez VAT');
    });
  });
```

- [ ] **Step 3: Bump the config-version literal in `tests/ui.test.js`**

In the "init resilience to a corrupt ev-config" test, change the saved-config line:

```js
        version: 1, carType: 'new', financing: 'cash',
```

to:

```js
        version: 2, carType: 'new', financing: 'cash',
```

- [ ] **Step 4: Delete obsolete taxpayer-etat DOM tests in `tests/e2e.test.js`**

Delete the entire `it('test_f2_taxpayer_etat_fields', …)` test (the one that does `document.getElementById('p_source')` then sets `'etat'`).

Delete the entire `it('test_f4_b4_changing_source_preserves_form', …)` test (also references `p_source`).

- [ ] **Step 5: Rewrite `test_f2_taxpayer_dg_fields` in `tests/e2e.test.js`**

Replace the whole `it('test_f2_taxpayer_dg_fields', …)` test with:

```js
      it('test_f2_taxpayer_vat_visible_dg_only', () => {
        // Taxpayer is DG-only now — no source selector; VAT toggle is always available.
        expect(document.getElementById('p_source')).toBeNull();
        script.updateVisibility();
        const vatContainer = document.getElementById('p_vat_container');
        expect(vatContainer.classList.contains('hidden')).toBe(false);
      });
```

- [ ] **Step 6: Bump config-version literals in `tests/persistence.test.js`**

Change the export assertion:

```js
    expect(script.EV_CONFIG_VERSION).toBe(1);
```

to:

```js
    expect(script.EV_CONFIG_VERSION).toBe(2);
```

Then change every `version: 1,` (in the restore/round-trip/reset test fixtures — there are four) to `version: 2,`. Leave `version: 999,` (the mismatch test) unchanged.

- [ ] **Step 7: Run the suite to confirm it fails for the right reasons**

Run: `pnpm test`
Expected: FAIL. The new clarity tests fail (no `#p_inc_hint`, `#s_inc_label`, `p_source` still present), and persistence/ui version tests fail (`EV_CONFIG_VERSION` is still 1). This red state defines the target; Tasks 2–5 turn it green.

- [ ] **Step 8: ✋ Checkpoint** — pause for the user to review and commit (suggested message: `test: target tests for DG-only taxpayer + income-block clarity`).

---

### Task 2: HTML — taxpayer DG-only + spouse hint scaffolding

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Make the taxpayer panel header explicit**

Replace:

```html
        <div class="clps-hdr open" onclick="clps(this)"><span>🧑 Podatnik</span><span class="arr">▼</span></div>
```

with:

```html
        <div class="clps-hdr open" onclick="clps(this)"><span>🧑 Podatnik — działalność gospodarcza (DG)</span><span class="arr">▼</span></div>
```

- [ ] **Step 2: Remove the taxpayer `Źródło przychodów` dropdown**

Delete this whole block:

```html
          <div class="f">
            <label>Źródło przychodów</label>
            <select id="p_source" onchange="updateVisibility()">
              <option value="etat">Umowa o pracę (Etat)</option>
              <option value="dg" selected>Działalność gospodarcza (DG)</option>
            </select>
          </div>
```

- [ ] **Step 3: Static DG income label + helper element for the taxpayer**

Replace:

```html
          <div class="f"><label>Przychód / Przychód brutto (zł)</label><input type="number" id="p_inc" value="200000" min="0"></div>
```

with:

```html
          <div class="f"><label>Przychód firmy — bez VAT (zł)</label><input type="number" id="p_inc" value="200000" min="0">
            <div class="fhint" id="p_inc_hint"></div></div>
```

- [ ] **Step 4: DG-specific KUP tooltip (with an id so JS can swap it for ryczałt)**

Replace:

```html
            <div class="f"><label>KUP (zł) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Koszty uzyskania przychodu (pracownicze lub firmowe).</span></span></label><input type="number" id="p_kup" value="12000" min="0"></div>
```

with:

```html
            <div class="f"><label>KUP (zł) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" id="p_kup_tt">Koszty firmowe (faktury, amortyzacja itp.) — bez VAT, jeśli go odliczasz.</span></span></label><input type="number" id="p_kup" value="12000" min="0"></div>
```

- [ ] **Step 5: DG-specific Odliczenia tooltip**

Replace:

```html
            <div class="f"><label>Odliczenia od dochodu (zł) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Suma odliczeń (np. składki na ubezpieczenia społeczne, ulgi).</span></span></label><input type="number" id="p_ded" value="0" min="0"></div>
```

with:

```html
            <div class="f"><label>Odliczenia od dochodu (zł) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Zapłacone składki ZUS społeczne i ulgi odliczane od dochodu.</span></span></label><input type="number" id="p_ded" value="0" min="0"></div>
```

- [ ] **Step 6: Add the VAT-scope note**

Replace:

```html
          <div id="p_vat_container">
            <div class="dvdr"></div>
            <div class="tog-row">
              <span>Płatnik VAT (Podatnik)</span>
              <label class="sw"><input type="checkbox" id="p_vat"><span class="sw-sl"></span></label>
            </div>
          </div>
```

with:

```html
          <div id="p_vat_container">
            <div class="dvdr"></div>
            <div class="tog-row">
              <span>Płatnik VAT (Podatnik)</span>
              <label class="sw"><input type="checkbox" id="p_vat"><span class="sw-sl"></span></label>
            </div>
            <div class="fhint">Dotyczy tylko kosztów auta (zakup, paliwo, eksploatacja). Przychód wpisuj zawsze bez VAT.</div>
          </div>
```

- [ ] **Step 7: Spouse income label id + helper element**

Replace:

```html
          <div class="f"><label>Przychód / Przychód brutto (zł)</label><input type="number" id="s_inc" value="100000" min="0"></div>
```

with:

```html
          <div class="f"><label id="s_inc_label">Przychód / Przychód brutto (zł)</label><input type="number" id="s_inc" value="100000" min="0">
            <div class="fhint" id="s_inc_hint"></div></div>
```

- [ ] **Step 8: ✋ Checkpoint** — no clean test gate yet (suite still red until Task 4 wires JS). Optionally run `pnpm test` and confirm the `p_source`-null assertions now pass. User reviews/commits (suggested: `feat: DG-only taxpayer HTML + income hint scaffolding`).

---

### Task 3: CSS — `.fhint` helper-text styles

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Add the styles after the `.warn` rule**

Find:

```css
.warn{background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.18);color:var(--y)}
```

and insert immediately after it:

```css
.fhint{font-size:11px;color:var(--t3);margin-top:5px;line-height:1.5}
.fhint .x{display:block;color:var(--y)}
.fhint .note{display:block;margin-top:3px;color:var(--t3)}
```

- [ ] **Step 2: ✋ Checkpoint** — user reviews/commits (suggested: `style: add .fhint helper-text style`).

---

### Task 4: `script.js` — helper copy + `updateVisibility()` + correctness fixes

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Add the income-block copy constants above `updateVisibility`**

Find:

```js
export function updateVisibility() {
```

and insert immediately before it:

```js
// Income-block clarity copy (Polish sentence case). These are persistent helper texts, not hover tooltips.
const INC_HINT_DG =
  'ⓘ Cała sprzedaż/obrót firmy bez VAT.'
  + '<span class="x">✕ to nie jest kwota „na rękę" po podatkach</span>'
  + '<span class="x">✕ to nie jest zysk po kosztach — koszty wpisz w polu KUP</span>';
const INC_HINT_DG_RYCZALT =
  '<span class="note">Ryczałt liczy podatek od przychodu — koszty (KUP) go nie obniżają.</span>';
const INC_HINT_ETAT =
  'ⓘ Pensja brutto z umowy (przed podatkiem i składkami).'
  + '<span class="x">✕ to nie jest kwota „na rękę" / przelew na konto</span>';
const KUP_TT_DG = 'Koszty firmowe (faktury, amortyzacja itp.) — bez VAT, jeśli go odliczasz.';
const KUP_TT_RYCZALT = 'Ryczałt nie uwzględnia kosztów (KUP).';

```

- [ ] **Step 2: Drop the taxpayer-etat branch and wire the taxpayer hint**

Replace:

```js
export function updateVisibility() {
  const pForm = $('p_tax_form')?.value || 'skala';
  const pSource = $('p_source')?.value || 'dg';
  const sForm = $('s_tax_form')?.value || 'skala';

  if (pSource === 'etat') {
    if ($('p_tax_form')) $('p_tax_form').disabled = true;
    if ($('p_inc')) $('p_inc').disabled = true;
    if ($('p_ded')) $('p_ded').disabled = true;
    if ($('joint_filing')) {
      $('joint_filing').checked = false;
      $('joint_filing').disabled = true;
    }
  } else {
    if ($('p_tax_form')) $('p_tax_form').disabled = false;
    if ($('p_inc')) $('p_inc').disabled = false;
    if ($('p_ded')) $('p_ded').disabled = false;
  }
```

with:

```js
export function updateVisibility() {
  const pForm = $('p_tax_form')?.value || 'skala';
  const sForm = $('s_tax_form')?.value || 'skala';

  // Taxpayer is always DG now — income/form/ded fields stay enabled (no etat branch).
  if ($('p_tax_form')) $('p_tax_form').disabled = false;
  if ($('p_inc')) $('p_inc').disabled = false;
  if ($('p_ded')) $('p_ded').disabled = false;

  // Income-block clarity: DG hint (+ ryczałt cost note) and the matching KUP tooltip.
  if ($('p_inc_hint')) $('p_inc_hint').innerHTML = INC_HINT_DG + (pForm === 'ryczalt' ? INC_HINT_DG_RYCZALT : '');
  if ($('p_kup_tt')) $('p_kup_tt').textContent = pForm === 'ryczalt' ? KUP_TT_RYCZALT : KUP_TT_DG;
```

- [ ] **Step 3: Simplify the KUP-disable condition**

Replace:

```js
  if ($('p_kup')) {
    $('p_kup').disabled = (pSource === 'etat') || (pSource === 'dg' && pForm === 'ryczalt');
  }
```

with:

```js
  if ($('p_kup')) {
    $('p_kup').disabled = (pForm === 'ryczalt');
  }
```

- [ ] **Step 4: Simplify the joint-filing condition**

Replace:

```js
  if (!jointAllowed || pSource === 'etat') {
```

with:

```js
  if (!jointAllowed) {
```

- [ ] **Step 5: VAT container always shown for the taxpayer**

Replace:

```js
  if (pSource === 'dg') {
    if ($('p_vat_container')) $('p_vat_container').classList.remove('hidden');
  } else {
    if ($('p_vat_container')) $('p_vat_container').classList.add('hidden');
    if ($('p_vat')) $('p_vat').checked = false;
  }

  if (pSource === 'dg' && pForm === 'ryczalt') {
    if ($('p_ryczalt_rate_container')) $('p_ryczalt_rate_container').classList.remove('hidden');
  } else {
    if ($('p_ryczalt_rate_container')) $('p_ryczalt_rate_container').classList.add('hidden');
  }
```

with:

```js
  // Taxpayer is always DG — VAT toggle is always available.
  if ($('p_vat_container')) $('p_vat_container').classList.remove('hidden');

  if (pForm === 'ryczalt') {
    if ($('p_ryczalt_rate_container')) $('p_ryczalt_rate_container').classList.remove('hidden');
  } else {
    if ($('p_ryczalt_rate_container')) $('p_ryczalt_rate_container').classList.add('hidden');
  }
```

- [ ] **Step 6: Drive the spouse income label + hint from `s_source`**

Replace:

```js
  const sSource = $('s_source')?.value || 'etat';
  if (sSource === 'dg') {
    if ($('s_vat_container')) $('s_vat_container').classList.remove('hidden');
  } else {
    if ($('s_vat_container')) $('s_vat_container').classList.add('hidden');
    if ($('s_vat')) $('s_vat').checked = false;
  }
```

with:

```js
  const sSource = $('s_source')?.value || 'etat';
  if (sSource === 'dg') {
    if ($('s_vat_container')) $('s_vat_container').classList.remove('hidden');
  } else {
    if ($('s_vat_container')) $('s_vat_container').classList.add('hidden');
    if ($('s_vat')) $('s_vat').checked = false;
  }

  // Spouse keeps etat/dg — income label + hint follow s_source.
  if ($('s_inc_label')) $('s_inc_label').textContent = sSource === 'dg' ? 'Przychód firmy — bez VAT (zł)' : 'Wynagrodzenie brutto — przed podatkiem (zł)';
  if ($('s_inc_hint')) $('s_inc_hint').innerHTML = sSource === 'dg' ? INC_HINT_DG : INC_HINT_ETAT;
```

- [ ] **Step 7: Fix the `isVAT` correctness bug (reads a now-removed element)**

Replace:

```js
  const isVAT=cb('p_vat') && $('p_source')?.value==='dg';
```

with:

```js
  const isVAT=cb('p_vat');
```

- [ ] **Step 8: Fix the `isDepAllowed` correctness bug**

Replace:

```js
  const isDepAllowed = $('p_source')?.value==='dg' && $('p_tax_form')?.value!=='ryczalt';
```

with:

```js
  const isDepAllowed = $('p_tax_form')?.value!=='ryczalt';
```

- [ ] **Step 9: Hardcode `pSource` in the `calc()` inputs object**

Replace:

```js
    pSource: $('p_source')?.value || 'dg',
```

with:

```js
    pSource: 'dg',
```

- [ ] **Step 10: Remove the dead taxpayer-etat render branch (KUP/VAT breakdown)**

Replace:

```js
    if(pSource !== 'dg'){
      h+=`<div class="bk">
        <div class="bk-t">📋 Koszty firmowe</div>
        <div class="info" style="font-size:11px">Jako osoba zatrudniona na umowie o pracę nie rozliczasz auta w ramach działalności gospodarczej — ten pojazd nie generuje korzyści podatkowych (brak KUP, amortyzacji i odliczenia VAT).</div>
      </div>`;
    } else if(isKupAllowed){
```

with:

```js
    if(isKupAllowed){
```

- [ ] **Step 11: Drop the dead "umowa o pracę" wording in the no-KUP row**

Replace:

```js
          <div class="sbs-row"><div class="sbs-lbl" style="color:var(--t3)">Wybrana forma opodatkowania (${pSource !== 'dg' ? 'umowa o pracę' : 'ryczałt ewidencjonowany'}) nie pozwala na rozliczanie kosztów samochodu w KUP ani amortyzacji.${isVAT ? ' Jedyną korzyścią jest tu odliczenie/zwrot VAT — patrz sekcja „Zwrot VAT”.' : ''}</div></div>
```

with:

```js
          <div class="sbs-row"><div class="sbs-lbl" style="color:var(--t3)">Wybrana forma opodatkowania (ryczałt ewidencjonowany) nie pozwala na rozliczanie kosztów samochodu w KUP ani amortyzacji.${isVAT ? ' Jedyną korzyścią jest tu odliczenie/zwrot VAT — patrz sekcja „Zwrot VAT”.' : ''}</div></div>
```

- [ ] **Step 12: Run the UI/e2e tests**

Run: `pnpm exec vitest run tests/ui.test.js tests/e2e.test.js`
Expected: PASS (income-clarity + KUP-gating + e2e DOM tests). If `tests/persistence.test.js` is included elsewhere it still fails on the version literal — that's fixed in Task 5.

- [ ] **Step 13: ✋ Checkpoint** — user reviews/commits (suggested: `feat: source-aware income hints; drop dead taxpayer-etat UI paths`).

---

### Task 5: `script.js` — persistence (drop `p_source`, bump version)

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Remove `p_source` from the persisted value ids**

Replace:

```js
  'p_inc','p_kup','p_ded','p_source','p_tax_form','p_ryczalt_rate',
```

with:

```js
  'p_inc','p_kup','p_ded','p_tax_form','p_ryczalt_rate',
```

- [ ] **Step 2: Bump the config version (old configs discarded wholesale)**

Replace:

```js
export const EV_CONFIG_VERSION = 1;
```

with:

```js
export const EV_CONFIG_VERSION = 2;
```

- [ ] **Step 3: Run the persistence tests**

Run: `pnpm exec vitest run tests/persistence.test.js`
Expected: PASS (version assertions now expect 2; restore fixtures use `version: 2`).

- [ ] **Step 4: ✋ Checkpoint** — user reviews/commits (suggested: `chore: drop p_source from persisted config, bump EV_CONFIG_VERSION to 2`).

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `pnpm test`
Expected: PASS — all files green, including the unchanged `calc/*` tests and the engine-only etat tests (engine etat path retained for the spouse).

- [ ] **Step 2: Manual smoke test in the browser**

Run: `pnpm dev`, open the served URL, and confirm:
- Taxpayer panel header reads `🧑 Podatnik — działalność gospodarcza (DG)`; there is **no** `Źródło przychodów` dropdown.
- Income label reads `Przychód firmy — bez VAT (zł)`; the hint below shows `Cała sprzedaż/obrót firmy bez VAT.` plus the two `✕` warn-offs (visible without hovering).
- Switch **Forma** to `Ryczałt`: the hint gains `Ryczałt liczy podatek od przychodu — koszty (KUP) go nie obniżają.`, KUP is greyed out and its tooltip reads `Ryczałt nie uwzględnia kosztów (KUP).`
- The VAT toggle shows the note `Dotyczy tylko kosztów auta … Przychód wpisuj zawsze bez VAT.`
- Enable **Wspólne rozliczenie**, then toggle the spouse `Źródło` between Etat and DG: the spouse income label flips between `Wynagrodzenie brutto — przed podatkiem (zł)` (+ "na rękę" warn-off) and `Przychód firmy — bez VAT (zł)`.
- Results still render with no console errors (existing saved config resets once due to the version bump — expected).

- [ ] **Step 3: ✋ Final checkpoint** — user reviews/commits (suggested: `feat: clarify income block (DG-only taxpayer, source-aware spouse)`).

---

## Open notes (deviations from the spec, flagged for the user)

1. **Engine-only etat tests left intact.** The spec said "reframe taxpayer-etat engine tests to spouse-etat." On reading them, those tests (`test_f6_etat_health_no_car_deduction`, `test_f7_b1_taxpayer_etat_car_shield`, `test_f2_b2_etat_kup_boundary`, the two `test_t3_*_etat_*`) call `calculateEngine({ pSource: 'etat' })` **directly** and still pass — the engine keeps etat for the spouse. Reframing them to a spouse scenario would change what they assert (`cumHealthSav`/`cumTaxSav` are taxpayer-driven; the spouse never reaches those deltas) and weaken coverage. They're kept as engine-contract tests; the etat health math is also unit-covered in `calculations.test.js`/`phase5-robustness.test.js`. **If you'd rather delete them outright, say so and it's a 2-minute follow-up.**
2. **`script.js:464` health-detail wrapper left as-is.** `${pSource==='dg' ? <detail> : ''}` is now always-true dead code but harmless; editing the nested template interpolation is risk for zero behaviour change. Left untouched on purpose.
