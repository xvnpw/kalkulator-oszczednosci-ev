# Rename "KUP" to "Koszty"/"koszty" UI-wide (taxpayer side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the jargon abbreviation "KUP" from every taxpayer-facing UI string in `index.html` and `script.js` (labels, headings, tooltips, info notes, KPI labels, glossary/methodology, and the page subtitle), plus `README.md`'s feature descriptions — replacing it with plain "koszty"/"Koszty" wording. After this change, the literal uppercase substring `KUP` appears **only** inside the spouse section (`#spouse_section`, `index.html:125`, `s_kup` field + tooltip). No `calc/*` engine code, no internal identifiers (`pKup`, `sKup`, `totalKUP`, `depKUP`, `insKUP`, `maKUP`, `opKUP`, `intKUP`, `upfKUP`, `cumTotalKUP`, `isKupAllowed`, `cumLostIncKUP`, `KUP_OPERATING_FACTOR`, `carValueKUP`, element ids like `p_kup`/`s_kup`/`l_kup_lv`/`def-kup`/`p_kup_tt`), and no `CLAUDE.md` developer documentation change — all of those continue to describe the unchanged internal API and remain accurate.

**Architecture:** Pure copy/content edits across `index.html`, `script.js` (template strings + helper-text constants from the `updateVisibility()` area), and `README.md`. Task 1–2 (taxpayer `#p_kup` field rename + income-hint copy split) were already scoped in detail and remain unchanged from the prior revision of this plan. Tasks 3–8 are the newly-added UI-wide sweep. Task 9 adds one regression-guard test ("KUP appears only in the spouse section") and runs the full suite + a manual smoke check.

**Tech Stack:** Vanilla JS (ES modules), Vitest + happy-dom for UI tests.

**Scope decisions (confirmed with user):**
- "KUP Podatnika" = the taxpayer's `#p_kup` field (Task 1), spouse's `#s_kup` stays `KUP (zł)`.
- The UI-wide sweep (Tasks 3–8) renames **every other** visible "KUP" occurrence, including the glossary/Metodologia and README — confirmed in scope.
- Per-year breakdown `(KUP)` suffixes (`Amortyzacja (KUP)`, `Odsetki (KUP)`, etc.) are **dropped entirely** (not replaced with `(koszty)`), to avoid redundancy like `Koszty początkowe (koszty)`.
- `CLAUDE.md` and all `calc/*`/internal-identifier names are **out of scope** — they describe the code's actual (unchanged) public API and remain accurate.

---

## File map

| File | Task(s) | What changes |
|---|---|---|
| `index.html:81` | 1 | `#p_kup` label `KUP (zł)` → `Koszty działalności (zł)` |
| `script.js:544-572,622` | 2 | Split `INC_HINT_DG`; reword `INC_HINT_DG_RYCZALT`/`KUP_TT_RYCZALT` (drop `(KUP)`) |
| `index.html:26,30` | 3 | Page subtitle + header pill |
| `index.html:178,183,197,203,204,220,247` | 4 | Car-cost & financing notes/options/value-rows |
| `index.html:306-308,320,337-338,359,363,366` | 5 | Słowniczek + Metodologia |
| `script.js:262,266,310,322,327-331` | 6 | KPI tooltip/label + "Struktura kosztów" block + code comment |
| `script.js:343,348,417-425,428` | 7 | Ryczałt info notes + per-year breakdown row labels + regression test |
| `README.md:25,27,32,56` | 8 | Feature description prose |
| (verification) | 9 | Full suite + manual smoke check |

**Project convention note:** Per CLAUDE.md, do **not** run `git commit` — leave each task's changes staged/uncommitted for the user to review and commit themselves. The "Commit" step in each task below is replaced with a "stop and let the user review" note.

---

### Task 1: Rename the `#p_kup` label in `index.html`

**Files:**
- Modify: `index.html:81`
- Test: `tests/ui.test.js`

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('Income-block clarity (DG-only taxpayer)', ...)` block in `tests/ui.test.js`, right before its closing `});` (currently line 121, after the `'spouse income label/hint follow s_source'` test):

```js
    it('taxpayer KUP field is labelled Koszty działalności', async () => {
      await import('../script.js');
      const kupLabel = document.getElementById('p_kup').parentElement.querySelector('label');
      expect(kupLabel.textContent).toContain('Koszty działalności');
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/ui.test.js -t "taxpayer KUP field is labelled"`

Expected: FAIL — `kupLabel.textContent` is `"KUP (zł) ..."`, doesn't contain `"Koszty działalności"`.

(Note: in this WSL setup, Vitest's pass/fail summary line can be swallowed on stdout — trust the process exit code. A failing `expect` still prints the assertion diff.)

- [ ] **Step 3: Edit `index.html:81`**

Current line 81:

```html
            <div class="f"><label>KUP (zł) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" id="p_kup_tt">Koszty firmowe (faktury, amortyzacja itp.) — bez VAT, jeśli go odliczasz.</span></span></label><input type="number" id="p_kup" value="12000" min="0"></div>
```

New line 81:

```html
            <div class="f"><label>Koszty działalności (zł) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" id="p_kup_tt">Koszty firmowe (faktury, amortyzacja itp.) — bez VAT, jeśli go odliczasz.</span></span></label><input type="number" id="p_kup" value="12000" min="0"></div>
```

(Only the visible label text changes — `id="p_kup"`, `id="p_kup_tt"`, and the tooltip text are unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/ui.test.js -t "taxpayer KUP field is labelled"`

Expected: PASS

- [ ] **Step 5: Stop for review**

Leave `index.html` and `tests/ui.test.js` uncommitted. Do not run `git commit` (CLAUDE.md: the user commits manually).

---

### Task 2: Update income-hint and ryczałt-tooltip copy in `script.js` to match the new field name

**Files:**
- Modify: `script.js:544-555` (constants), `script.js:567-568`, `script.js:622`
- Test: `tests/ui.test.js`

- [ ] **Step 1: Write the failing tests**

Add these three tests inside the same `describe('Income-block clarity (DG-only taxpayer)', ...)` block in `tests/ui.test.js`, after the test added in Task 1:

```js
    it('taxpayer income hint points to the renamed Koszty działalności field', async () => {
      const script = await import('../script.js');
      script.updateVisibility();
      const hint = document.getElementById('p_inc_hint').innerHTML;
      expect(hint).toContain('polu „Koszty działalności”');
    });

    it('spouse DG income hint still points to the KUP field (label unchanged)', async () => {
      const script = await import('../script.js');
      const sSource = document.getElementById('s_source');
      sSource.value = 'dg';
      script.updateVisibility();
      const hint = document.getElementById('s_inc_hint').innerHTML;
      expect(hint).toContain('zysk po kosztach');
      expect(hint).toContain('polu KUP');
      expect(hint).not.toContain('Koszty działalności');
    });

    it('ryczałt cost-note and KUP tooltip reference koszty działalności (no KUP)', async () => {
      const script = await import('../script.js');
      document.getElementById('p_tax_form').value = 'ryczalt';
      script.updateVisibility();
      expect(document.getElementById('p_inc_hint').innerHTML).toContain('koszty działalności');
      expect(document.getElementById('p_kup_tt').textContent).toContain('kosztów działalności');
      expect(document.getElementById('p_kup_tt').textContent).not.toContain('KUP');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/ui.test.js -t "Koszty działalności"`

Expected: FAIL on all three new tests:
- `p_inc_hint` still says `polu KUP`, not `polu „Koszty działalności”`.
- `p_inc_hint` (ryczałt) still says `koszty (KUP) go nie obniżają`, not `koszty działalności go nie obniżają`.
- `p_kup_tt` (ryczałt) still says `Ryczałt nie uwzględnia kosztów (KUP).` — contains `KUP`.

(The spouse-DG test should already PASS at this point — it's a regression guard for behavior that exists today; keep it green throughout.)

- [ ] **Step 3: Edit `script.js`**

Current `script.js:544-555`:

```js
// Income-block clarity copy (Polish sentence case). These are persistent helper texts, not hover tooltips.
const INC_HINT_DG =
  'ⓘ Cała sprzedaż/obrót firmy bez VAT.'
  + '<span class="x">✕ to nie jest kwota „na rękę” po podatkach</span>'
  + '<span class="x">✕ to nie jest zysk po kosztach — koszty wpisz w polu KUP</span>';
const INC_HINT_DG_RYCZALT =
  '<span class="note">Ryczałt liczy podatek od przychodu — koszty (KUP) go nie obniżają.</span>';
const INC_HINT_ETAT =
  'ⓘ Pensja brutto z umowy (przed podatkiem i składkami).'
  + '<span class="x">✕ to nie jest kwota „na rękę” / przelew na konto</span>';
const KUP_TT_DG = 'Koszty firmowe (faktury, amortyzacja itp.) — bez VAT, jeśli go odliczasz.';
const KUP_TT_RYCZALT = 'Ryczałt nie uwzględnia kosztów (KUP).';
```

Replace with:

```js
// Income-block clarity copy (Polish sentence case). These are persistent helper texts, not hover tooltips.
const INC_HINT_DG_BASE =
  'ⓘ Cała sprzedaż/obrót firmy bez VAT.'
  + '<span class="x">✕ to nie jest kwota „na rękę” po podatkach</span>';
const INC_HINT_DG_TAXPAYER =
  INC_HINT_DG_BASE
  + '<span class="x">✕ to nie jest zysk po kosztach — koszty wpisz w polu „Koszty działalności”</span>';
const INC_HINT_DG_SPOUSE =
  INC_HINT_DG_BASE
  + '<span class="x">✕ to nie jest zysk po kosztach — koszty wpisz w polu KUP</span>';
const INC_HINT_DG_RYCZALT =
  '<span class="note">Ryczałt liczy podatek od przychodu — koszty działalności go nie obniżają.</span>';
const INC_HINT_ETAT =
  'ⓘ Pensja brutto z umowy (przed podatkiem i składkami).'
  + '<span class="x">✕ to nie jest kwota „na rękę” / przelew na konto</span>';
const KUP_TT_DG = 'Koszty firmowe (faktury, amortyzacja itp.) — bez VAT, jeśli go odliczasz.';
const KUP_TT_RYCZALT = 'Ryczałt nie uwzględnia kosztów działalności.';
```

Current `script.js:567-568`:

```js
  if ($('p_inc_hint')) $('p_inc_hint').innerHTML = INC_HINT_DG + (pForm === 'ryczalt' ? INC_HINT_DG_RYCZALT : '');
  if ($('p_kup_tt')) $('p_kup_tt').textContent = pForm === 'ryczalt' ? KUP_TT_RYCZALT : KUP_TT_DG;
```

Replace with:

```js
  if ($('p_inc_hint')) $('p_inc_hint').innerHTML = INC_HINT_DG_TAXPAYER + (pForm === 'ryczalt' ? INC_HINT_DG_RYCZALT : '');
  if ($('p_kup_tt')) $('p_kup_tt').textContent = pForm === 'ryczalt' ? KUP_TT_RYCZALT : KUP_TT_DG;
```

Current `script.js:622`:

```js
  if ($('s_inc_hint')) $('s_inc_hint').innerHTML = sSource === 'dg' ? INC_HINT_DG : INC_HINT_ETAT;
```

Replace with:

```js
  if ($('s_inc_hint')) $('s_inc_hint').innerHTML = sSource === 'dg' ? INC_HINT_DG_SPOUSE : INC_HINT_ETAT;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/ui.test.js`

Expected: PASS — all tests in `tests/ui.test.js` pass, including:
- The 4 new tests from Task 1 and Task 2.
- The pre-existing `'ryczalt adds the cost-note line and switches the KUP tooltip'` test (still passes: new `INC_HINT_DG_RYCZALT` still contains `go nie obniżają`; new `KUP_TT_RYCZALT` still starts with `Ryczałt nie uwzględnia`).
- The pre-existing `'taxpayer income hint warns off take-home and profit'` test (still passes: `INC_HINT_DG_TAXPAYER` still contains `na rękę` and `zysk po kosztach`).

- [ ] **Step 5: Stop for review**

Leave `script.js` and `tests/ui.test.js` uncommitted. Do not run `git commit` (CLAUDE.md: the user commits manually).

---

### Task 3: `index.html` — page subtitle + header pill

**Files:**
- Modify: `index.html:26`, `index.html:30`

- [ ] **Step 1: Edit line 26 (page subtitle)**

Current:

```html
  <p>Ile zaoszczędzisz na podatku kupując EV do firmy? Kalkulacja PIT, KUP i leasingu dla działalności gospodarczej.</p>
```

New:

```html
  <p>Ile zaoszczędzisz na podatku kupując EV do firmy? Kalkulacja PIT, kosztów i leasingu dla działalności gospodarczej.</p>
```

- [ ] **Step 2: Edit line 30 (header pill)**

Current:

```html
    <span class="hdr-pill pill-y">Koszty używania 75% KUP</span>
```

New:

```html
    <span class="hdr-pill pill-y">Koszty używania 75%</span>
```

- [ ] **Step 3: Stop for review**

No dedicated test (static page-header prose). Verified visually in Task 9's manual smoke check. Leave `index.html` uncommitted.

---

### Task 4: `index.html` — car-cost & financing notes, options, value-rows

**Files:**
- Modify: `index.html:178,183,197,203,204,220,247`

- [ ] **Step 1: Edit line 178 (Koszty inicjalne tooltip)**

Current:

```html
      <div class="f"><label>Koszty inicjalne — prowizja, itp. (zł brutto) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Kwota brutto. Dla podatnika VAT 50% VAT jest odliczane, a nieodliczone 50% powiększa KUP: przy gotówce, kredycie i leasingu finansowym wchodzi do podstawy amortyzacji, a przy leasingu operacyjnym jest kosztem używania (75%).</span></span></label><input type="number" id="upfront" value="0" min="0"></div>
```

New (only `KUP` → `koszty`):

```html
      <div class="f"><label>Koszty inicjalne — prowizja, itp. (zł brutto) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Kwota brutto. Dla podatnika VAT 50% VAT jest odliczane, a nieodliczone 50% powiększa koszty: przy gotówce, kredycie i leasingu finansowym wchodzi do podstawy amortyzacji, a przy leasingu operacyjnym jest kosztem używania (75%).</span></span></label><input type="number" id="upfront" value="0" min="0"></div>
```

- [ ] **Step 2: Edit line 183 (`.mn` note)**

Current:

```html
      <div class="mn">Eksploatacja: <strong>75% netto + nieodliczony VAT → KUP</strong>. Ubezpieczenie: proporcjonalnie do <strong>limitu wartości 150 tys. zł</strong>. VAT: <strong>50% odliczalne</strong> (użytek mieszany).</div>
```

New:

```html
      <div class="mn">Eksploatacja: <strong>75% netto + nieodliczony VAT → koszty</strong>. Ubezpieczenie: proporcjonalnie do <strong>limitu wartości 150 tys. zł</strong>. VAT: <strong>50% odliczalne</strong> (użytek mieszany).</div>
```

- [ ] **Step 3: Edit line 197 (cash financing info)**

Current:

```html
        <div class="info"><strong>Amortyzacja liniowa:</strong><br>• Nowy: 20%/rok → 60 mies.&nbsp;&nbsp;• Używany: 40%/rok → 30 mies.<br>• Limit EV: <strong>225 000 zł</strong>&nbsp;&nbsp;• Odpis amortyzacyjny w <strong>100%</strong> w KUP</div>
```

New:

```html
        <div class="info"><strong>Amortyzacja liniowa:</strong><br>• Nowy: 20%/rok → 60 mies.&nbsp;&nbsp;• Używany: 40%/rok → 30 mies.<br>• Limit EV: <strong>225 000 zł</strong>&nbsp;&nbsp;• Odpis amortyzacyjny w <strong>100%</strong> w kosztach</div>
```

- [ ] **Step 4: Edit lines 203-204 (leasing type options)**

Current:

```html
            <option value="oper">Operacyjny — raty w całości KUP (kapitał + odsetki)</option>
            <option value="fin">Finansowy — amortyzacja + odsetki KUP</option>
```

New:

```html
            <option value="oper">Operacyjny — raty w całości w kosztach (kapitał + odsetki)</option>
            <option value="fin">Finansowy — amortyzacja + odsetki w kosztach</option>
```

- [ ] **Step 5: Edit line 220 (leasing value row)**

Current:

```html
        <div class="lv-row"><span>Łączny KUP przez okres:</span><span class="lv" id="l_kup_lv">—</span></div>
```

New (label text only — `id="l_kup_lv"` unchanged):

```html
        <div class="lv-row"><span>Łączne koszty przez okres:</span><span class="lv" id="l_kup_lv">—</span></div>
```

- [ ] **Step 6: Edit line 247 (credit info note)**

Current:

```html
        <div class="info" style="margin-top:8px">Odsetki / prowizja → KUP w <strong>100%</strong> · Wartość netto → amortyzacja (limit 225 tys.)</div>
```

New:

```html
        <div class="info" style="margin-top:8px">Odsetki / prowizja → koszty w <strong>100%</strong> · Wartość netto → amortyzacja (limit 225 tys.)</div>
```

- [ ] **Step 7: Stop for review**

No dedicated test (static car/financing-panel prose). Verified visually in Task 9's manual smoke check (leasing + credit tabs). Leave `index.html` uncommitted.

---

### Task 5: `index.html` — Słowniczek + Metodologia

**Files:**
- Modify: `index.html:306-308,320,337-338,359,363,366`

- [ ] **Step 1: Edit lines 306-308 (glossary "KUP" entry)**

Current:

```html
    <div class="gl-item" id="def-kup">
      <div class="gl-term">KUP (Koszty Uzyskania Przychodu)</div>
      <div class="gl-def">Wydatki poniesione w celu osiągnięcia przychodów. Przy "użytku mieszanym" (prywatno-służbowym) aut osobowych do KUP zaliczasz <strong>75%</strong> kosztów używania (eksploatacja, paliwo). Amortyzacja, raty leasingu (kapitał + odsetki) oraz odsetki kredytu są kosztem w <strong>100%</strong> kwoty netto (+ nieodliczony VAT), proporcjonalnie do limitu 225 tys. zł. Ubezpieczenie odlicza się proporcjonalnie do limitu wartości 150 tys. zł.</div>
    </div>
```

New (`id="def-kup"` kept — it's an internal anchor id, not displayed, not linked):

```html
    <div class="gl-item" id="def-kup">
      <div class="gl-term">Koszty uzyskania przychodu</div>
      <div class="gl-def">Wydatki poniesione w celu osiągnięcia przychodów. Przy "użytku mieszanym" (prywatno-służbowym) aut osobowych do kosztów podatkowych zaliczasz <strong>75%</strong> kosztów używania (eksploatacja, paliwo). Amortyzacja, raty leasingu (kapitał + odsetki) oraz odsetki kredytu są kosztem w <strong>100%</strong> kwoty netto (+ nieodliczony VAT), proporcjonalnie do limitu 225 tys. zł. Ubezpieczenie odlicza się proporcjonalnie do limitu wartości 150 tys. zł.</div>
    </div>
```

- [ ] **Step 2: Edit line 320 (Odliczenie VAT glossary def)**

Current:

```html
      <div class="gl-def">Przy użytku mieszanym odlicza się <strong>50% VAT</strong> (od zakupu, rat, eksploatacji). Nieodliczone 50% powiększa wartość netto i staje się kosztem uzyskania przychodu (KUP), co zmniejsza podatek dochodowy.</div>
```

New:

```html
      <div class="gl-def">Przy użytku mieszanym odlicza się <strong>50% VAT</strong> (od zakupu, rat, eksploatacji). Nieodliczone 50% powiększa wartość netto i staje się kosztem uzyskania przychodu, co zmniejsza podatek dochodowy.</div>
```

- [ ] **Step 3: Edit lines 337-338 ("Odliczalność KUP" methodology entry)**

Current:

```html
    <div class="gl-item">
      <div class="gl-term">Odliczalność KUP</div>
      <div class="gl-def">Limit <strong>75%</strong> dotyczy wyłącznie kosztów używania — eksploatacji, paliwa i opłat wstępnych o charakterze eksploatacyjnym (art. 23 ust. 1 pkt 46a, objaśnienia MF z 9.04.2020). Amortyzacja, raty leasingu (kapitał + odsetki) oraz odsetki kredytu są kosztem w <strong>100%</strong>. Ubezpieczenie: proporcjonalnie do limitu wartości 150 tys. zł. Wartość przekraczająca limit 225 tys. zł nie jest KUP.</div>
    </div>
```

New:

```html
    <div class="gl-item">
      <div class="gl-term">Odliczalność kosztów</div>
      <div class="gl-def">Limit <strong>75%</strong> dotyczy wyłącznie kosztów używania — eksploatacji, paliwa i opłat wstępnych o charakterze eksploatacyjnym (art. 23 ust. 1 pkt 46a, objaśnienia MF z 9.04.2020). Amortyzacja, raty leasingu (kapitał + odsetki) oraz odsetki kredytu są kosztem w <strong>100%</strong>. Ubezpieczenie: proporcjonalnie do limitu wartości 150 tys. zł. Wartość przekraczająca limit 225 tys. zł nie jest kosztem podatkowym.</div>
    </div>
```

- [ ] **Step 4: Edit line 359 (methodology bullet "Strata podatkowa")**

Current:

```html
          <li><strong>Strata podatkowa:</strong> nadwyżka kosztów ponad dochód przepada — brak rozliczenia straty w kolejnych 5 latach (art. 9 ust. 3). Wynik konserwatywny, pokazywany jako „niewykorzystany KUP".</li>
```

New:

```html
          <li><strong>Strata podatkowa:</strong> nadwyżka kosztów ponad dochód przepada — brak rozliczenia straty w kolejnych 5 latach (art. 9 ust. 3). Wynik konserwatywny, pokazywany jako „niewykorzystane koszty".</li>
```

- [ ] **Step 5: Edit line 363 (methodology bullet "75% KUP")**

Current:

```html
          <li><strong>75% KUP:</strong> limit 75% stosowany tylko do kosztów używania (eksploatacja, paliwo, opłaty wstępne o charakterze eksploatacyjnym). Amortyzacja, raty leasingu i odsetki kredytu są kosztem w 100% (art. 23 ust. 1 pkt 46a, objaśnienia MF z 9.04.2020).</li>
```

New:

```html
          <li><strong>75% kosztów:</strong> limit 75% stosowany tylko do kosztów używania (eksploatacja, paliwo, opłaty wstępne o charakterze eksploatacyjnym). Amortyzacja, raty leasingu i odsetki kredytu są kosztem w 100% (art. 23 ust. 1 pkt 46a, objaśnienia MF z 9.04.2020).</li>
```

- [ ] **Step 6: Edit line 366 (methodology bullet "Paliwo (podatnik VAT)")**

Current:

```html
          <li><strong>Paliwo (podatnik VAT):</strong> oszczędność paliwowa liczona netto + 50% nieodliczalnego VAT, spójnie po stronie korzyści i KUP.</li>
```

New:

```html
          <li><strong>Paliwo (podatnik VAT):</strong> oszczędność paliwowa liczona netto + 50% nieodliczalnego VAT, spójnie po stronie korzyści i kosztów.</li>
```

- [ ] **Step 7: Stop for review**

No dedicated test (static glossary prose). Verified visually in Task 9's manual smoke check (Słowniczek + Metodologia tabs). Leave `index.html` uncommitted.

---

### Task 6: `script.js` — KPI tooltip/label + "Struktura kosztów" results block + code comment

**Files:**
- Modify: `script.js:262,266,310,322,327-331`

- [ ] **Step 1: Edit line 262 (KPI "Zaoszczędzony podatek" tooltip)**

Current:

```js
    <div class="kpi kpi-g"><div class="lbl">Zaoszczędzony podatek <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" style="white-space: normal; min-width: 250px;">Procent, o jaki zmniejszy się Twój całkowity podatek i/lub VAT do zapłaty dzięki kosztom firmowym (KUP) i odliczeniu VAT z auta — o ile dotyczy Twojej formy opodatkowania.</span></span></div><div class="val pos">${zl(cumRealTaxSav,0)}</div><div class="sub">obniżenie o ${pct(taxReduxPct)}</div></div>
```

New:

```js
    <div class="kpi kpi-g"><div class="lbl">Zaoszczędzony podatek <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" style="white-space: normal; min-width: 250px;">Procent, o jaki zmniejszy się Twój całkowity podatek i/lub VAT do zapłaty dzięki kosztom działalności i odliczeniu VAT z auta — o ile dotyczy Twojej formy opodatkowania.</span></span></div><div class="val pos">${zl(cumRealTaxSav,0)}</div><div class="sub">obniżenie o ${pct(taxReduxPct)}</div></div>
```

- [ ] **Step 2: Edit line 266 (KPI "Utracony KUP")**

Current:

```js
    ${cumLostIncKUP>0?`<div class="kpi kpi-y"><div class="lbl">Utracony KUP (niski dochód) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Niewykorzystana kwota kosztów z powodu zbyt niskiego dochodu.</span></span></div><div class="val neg">${zl(cumLostIncKUP,0)}</div><div class="sub">nieodliczone koszty</div></div>`:''}
```

New (variable name `cumLostIncKUP` unchanged):

```js
    ${cumLostIncKUP>0?`<div class="kpi kpi-y"><div class="lbl">Utracone koszty (niski dochód) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Niewykorzystana kwota kosztów z powodu zbyt niskiego dochodu.</span></span></div><div class="val neg">${zl(cumLostIncKUP,0)}</div><div class="sub">nieodliczone koszty</div></div>`:''}
```

- [ ] **Step 3: Edit line 310 (code comment)**

Current:

```js
  // 3. KUP / VAT BREAKDOWN
```

New:

```js
  // 3. KOSZTY / VAT BREAKDOWN
```

- [ ] **Step 4: Edit lines 322,327-331 ("Struktura KUP" block)**

Current:

```js
        <div class="bk-t">📋 Struktura KUP</div>
        <table class="dt">
          <tr><td>Finansowanie</td><td class="num"><span class="bdg bdg-g">${finNames[financing]}</span></td></tr>
          <tr><td>Pojazd</td><td class="num"><span class="bdg bdg-b">${carType==='new'?'Nowy':'Używany'}</span>&nbsp;<span class="bdg ${isVAT?'bdg-g':'bdg-y'}">${isVAT?'Vatowiec':'Brak odliczenia VAT'}</span></td></tr>
          ${financing==='leasing' && lType==='oper' ? '' : `<tr><td>Podstawa amortyzacji</td><td class="num">${zl(depBase)}</td></tr>`}
          <tr><td>KUP amortyzacja/raty <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" style="white-space: normal; min-width: 250px;">Suma wygenerowanych KUP z tytułu rat lub amortyzacji.</span></span></td><td class="num">${zl(cumTotalKUP - (insKUP+maKUP)*calcYears)}</td></tr>
          <tr><td>KUP ubezpieczenie × ${calcYears}</td><td class="num">${zl(insKUP*calcYears)}</td></tr>
          <tr><td>KUP eksploatacja × ${calcYears}</td><td class="num">${zl(maKUP*calcYears)}</td></tr>
          ${isVAT?vatRefundRows:''}
          <tr class="tot"><td>ŁĄCZNY KUP</td><td class="num">${zl(cumTotalKUP)}</td></tr>
```

New (variable names `cumTotalKUP`, `insKUP`, `maKUP` unchanged):

```js
        <div class="bk-t">📋 Struktura kosztów</div>
        <table class="dt">
          <tr><td>Finansowanie</td><td class="num"><span class="bdg bdg-g">${finNames[financing]}</span></td></tr>
          <tr><td>Pojazd</td><td class="num"><span class="bdg bdg-b">${carType==='new'?'Nowy':'Używany'}</span>&nbsp;<span class="bdg ${isVAT?'bdg-g':'bdg-y'}">${isVAT?'Vatowiec':'Brak odliczenia VAT'}</span></td></tr>
          ${financing==='leasing' && lType==='oper' ? '' : `<tr><td>Podstawa amortyzacji</td><td class="num">${zl(depBase)}</td></tr>`}
          <tr><td>Koszty amortyzacja/raty <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" style="white-space: normal; min-width: 250px;">Suma wygenerowanych kosztów z tytułu rat lub amortyzacji.</span></span></td><td class="num">${zl(cumTotalKUP - (insKUP+maKUP)*calcYears)}</td></tr>
          <tr><td>Koszty ubezpieczenie × ${calcYears}</td><td class="num">${zl(insKUP*calcYears)}</td></tr>
          <tr><td>Koszty eksploatacja × ${calcYears}</td><td class="num">${zl(maKUP*calcYears)}</td></tr>
          ${isVAT?vatRefundRows:''}
          <tr class="tot"><td>ŁĄCZNE KOSZTY</td><td class="num">${zl(cumTotalKUP)}</td></tr>
```

- [ ] **Step 5: Stop for review**

No dedicated test in this task (covered by Task 7's regression test, which runs after all `script.js` results-panel edits land). Leave `script.js` uncommitted.

---

### Task 7: `script.js` — ryczałt info notes + per-year breakdown row labels + regression test

**Files:**
- Modify: `script.js:343,348,417-425,428`
- Test: `tests/ui.test.js`

- [ ] **Step 1: Edit line 343 (ryczałt + VAT info note)**

Current:

```js
        <div class="info" style="margin-top:8px;font-size:11px">Ryczałt ewidencjonowany nie pozwala na rozliczanie kosztów uzyskania przychodu (KUP) ani amortyzacji — jedyną korzyścią podatkową jest tu odliczenie/zwrot VAT.</div>
```

New:

```js
        <div class="info" style="margin-top:8px;font-size:11px">Ryczałt ewidencjonowany nie pozwala na rozliczanie kosztów uzyskania przychodu ani amortyzacji — jedyną korzyścią podatkową jest tu odliczenie/zwrot VAT.</div>
```

- [ ] **Step 2: Edit line 348 (ryczałt + no-VAT info note)**

Current:

```js
        <div class="info" style="font-size:11px">Ryczałt ewidencjonowany nie pozwala na rozliczanie kosztów uzyskania przychodu (KUP) ani amortyzacji, a brak rejestracji jako podatnik VAT oznacza brak możliwości odliczenia VAT — ten pojazd nie generuje tu korzyści podatkowych.</div>
```

New:

```js
        <div class="info" style="font-size:11px">Ryczałt ewidencjonowany nie pozwala na rozliczanie kosztów uzyskania przychodu ani amortyzacji, a brak rejestracji jako podatnik VAT oznacza brak możliwości odliczenia VAT — ten pojazd nie generuje tu korzyści podatkowych.</div>
```

- [ ] **Step 3: Edit lines 417-425 (per-year breakdown row labels — drop `(KUP)` suffixes)**

Current:

```js
          <div class="sbs-row sbs-sub"><div class="sbs-lbl">${isVAT ? 'Raty leasingowe netto (+50% VAT) (KUP)' : 'Raty leasingowe brutto (KUP)'}</div><div class="sbs-val">${zl(r.depKUP + r.intKUP)}</div></div>
          ` : `
          <div class="sbs-row sbs-sub"><div class="sbs-lbl">Amortyzacja (KUP)</div><div class="sbs-val">${zl(r.depKUP)}</div></div>
          ${r.intKUP>0?`<div class="sbs-row sbs-sub"><div class="sbs-lbl">Odsetki (KUP)</div><div class="sbs-val">${zl(r.intKUP)}</div></div>`:''}
          `}
          <div class="sbs-row sbs-sub"><div class="sbs-lbl">Eksploatacja / Ubezpieczenie (KUP)</div><div class="sbs-val">${zl(r.opKUP)}</div></div>
          ${r.upfY>0?`<div class="sbs-row sbs-sub"><div class="sbs-lbl">Koszty początkowe (KUP)</div><div class="sbs-val">${zl(r.upfY)}</div></div>`:''}
          <div class="sbs-row sbs-tot"><div class="sbs-lbl">Łączny wygenerowany KUP</div><div class="sbs-val">${zl(r.totalKUP)}</div></div>
          ${r.lostIncKUP>0?`<div class="sbs-row sbs-sub"><div class="sbs-lbl" style="color:var(--y)">Utracony KUP (niski dochód)</div><div class="sbs-val" style="color:var(--y)">+ ${zl(r.lostIncKUP)} do bazy</div></div>`:''}
```

New (all `r.*KUP`/`r.totalKUP`/`r.lostIncKUP` field accesses unchanged — only the displayed label strings change):

```js
          <div class="sbs-row sbs-sub"><div class="sbs-lbl">${isVAT ? 'Raty leasingowe netto (+50% VAT)' : 'Raty leasingowe brutto'}</div><div class="sbs-val">${zl(r.depKUP + r.intKUP)}</div></div>
          ` : `
          <div class="sbs-row sbs-sub"><div class="sbs-lbl">Amortyzacja</div><div class="sbs-val">${zl(r.depKUP)}</div></div>
          ${r.intKUP>0?`<div class="sbs-row sbs-sub"><div class="sbs-lbl">Odsetki</div><div class="sbs-val">${zl(r.intKUP)}</div></div>`:''}
          `}
          <div class="sbs-row sbs-sub"><div class="sbs-lbl">Eksploatacja / Ubezpieczenie</div><div class="sbs-val">${zl(r.opKUP)}</div></div>
          ${r.upfY>0?`<div class="sbs-row sbs-sub"><div class="sbs-lbl">Koszty początkowe</div><div class="sbs-val">${zl(r.upfY)}</div></div>`:''}
          <div class="sbs-row sbs-tot"><div class="sbs-lbl">Łączne wygenerowane koszty</div><div class="sbs-val">${zl(r.totalKUP)}</div></div>
          ${r.lostIncKUP>0?`<div class="sbs-row sbs-sub"><div class="sbs-lbl" style="color:var(--y)">Utracone koszty (niski dochód)</div><div class="sbs-val" style="color:var(--y)">+ ${zl(r.lostIncKUP)} do bazy</div></div>`:''}
```

- [ ] **Step 4: Edit line 428 (ryczałt per-year note)**

Current:

```js
          <div class="sbs-row"><div class="sbs-lbl" style="color:var(--t3)">Wybrana forma opodatkowania (ryczałt ewidencjonowany) nie pozwala na rozliczanie kosztów samochodu w KUP ani amortyzacji.${isVAT ? ' Jedyną korzyścią jest tu odliczenie/zwrot VAT — patrz sekcja „Zwrot VAT”.' : ''}</div></div>
```

New:

```js
          <div class="sbs-row"><div class="sbs-lbl" style="color:var(--t3)">Wybrana forma opodatkowania (ryczałt ewidencjonowany) nie pozwala na rozliczanie kosztów samochodu ani amortyzacji.${isVAT ? ' Jedyną korzyścią jest tu odliczenie/zwrot VAT — patrz sekcja „Zwrot VAT”.' : ''}</div></div>
```

- [ ] **Step 5: Write the regression-guard test**

Add a new top-level `describe` block at the end of `tests/ui.test.js` (after the existing top-level `describe('UI and DOM rendering', ...)` block's closing `});`):

```js
describe('KUP terminology confined to spouse field', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    const path = await import('path');
    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const htmlString = fs.readFileSync(htmlPath, 'utf-8')
      .replace(/<link[^>]*stylesheet[^>]*>/gi, '')
      .replace(/<link[^>]*preconnect[^>]*>/gi, '');
    document.documentElement.innerHTML = htmlString;
  });

  it('KUP appears only inside the spouse section (skala + ryczałt)', async () => {
    await import('../script.js');

    // Default state: skala + cash → covers the KPI tooltip, "Struktura kosztów"
    // block, and the per-year cost breakdown.
    window.calc();
    await new Promise(resolve => setTimeout(resolve, 50));
    let bodyClone = document.body.cloneNode(true);
    bodyClone.querySelector('#spouse_section').remove();
    expect(bodyClone.innerHTML).not.toContain('KUP');

    // Switch to ryczałt → covers the ryczałt info notes, the per-year
    // ryczałt note, and the KUP_TT_RYCZALT tooltip.
    const pTaxForm = document.getElementById('p_tax_form');
    pTaxForm.value = 'ryczalt';
    pTaxForm.dispatchEvent(new window.Event('change'));
    window.calc();
    await new Promise(resolve => setTimeout(resolve, 50));
    bodyClone = document.body.cloneNode(true);
    bodyClone.querySelector('#spouse_section').remove();
    expect(bodyClone.innerHTML).not.toContain('KUP');

    // The spouse's own KUP field is untouched.
    expect(document.getElementById('spouse_section').innerHTML).toContain('KUP');
  });
});
```

- [ ] **Step 6: Run the new test and the full `ui.test.js` suite**

Run: `pnpm exec vitest run tests/ui.test.js`

Expected: PASS — the new `describe('KUP terminology confined to spouse field', ...)` test passes, and all pre-existing `ui.test.js` tests still pass.

- [ ] **Step 7: Stop for review**

Leave `script.js` and `tests/ui.test.js` uncommitted. Do not run `git commit` (CLAUDE.md: the user commits manually).

---

### Task 8: `README.md` — feature description prose

**Files:**
- Modify: `README.md:25,27,32,56`

- [ ] **Step 1: Edit line 25**

Current:

```markdown
    - Odliczenia kosztów użytku mieszanego (75% KUP, 50% VAT). Uwzględnia czynniki VAT w obliczeniach KUP leasingu na podstawie statusu płatnika VAT.
```

New:

```markdown
    - Odliczenia kosztów użytku mieszanego (75% kosztów, 50% VAT). Uwzględnia czynniki VAT w obliczeniach kosztów leasingu na podstawie statusu płatnika VAT.
```

- [ ] **Step 2: Edit line 27**

Current:

```markdown
- **Śledzenie strat w działalności:** Monitoruje „zmarnowane" odliczenia podatkowe (utracony KUP), gdy dochód jest niewystarczający, aby w pełni wykorzystać tarcze podatkowe związane z EV.
```

New:

```markdown
- **Śledzenie strat w działalności:** Monitoruje „zmarnowane" odliczenia podatkowe (utracone koszty), gdy dochód jest niewystarczający, aby w pełni wykorzystać tarcze podatkowe związane z EV.
```

- [ ] **Step 3: Edit line 32**

Current:

```markdown
- **System edukacyjny:** Interaktywne podpowiedzi wyjaśniające złożone pojęcia podatkowe (KUP, TCO, VAT itp.) oraz dedykowana sekcja Słowniczka.
```

New:

```markdown
- **System edukacyjny:** Interaktywne podpowiedzi wyjaśniające złożone pojęcia podatkowe (koszty uzyskania przychodu, TCO, VAT itp.) oraz dedykowana sekcja Słowniczka.
```

- [ ] **Step 4: Edit line 56**

Current:

```markdown
  - Zapewnia **0% tarczy KUP** dla wydatków na samochód (kosztów nie można odliczyć od przychodu).
```

New:

```markdown
  - Zapewnia **0% tarczy kosztowej** dla wydatków na samochód (kosztów nie można odliczyć od przychodu).
```

- [ ] **Step 5: Stop for review**

No test (documentation only). Leave `README.md` uncommitted.

---

### Task 9: Full test suite + manual smoke check

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`

Expected: exit code 0, no failing tests (trust the exit code over stdout in this WSL setup per project convention).

- [ ] **Step 2: Manual smoke check**

Run: `pnpm dev`, open the app, and confirm:

- **Header:** subtitle reads "...Kalkulacja PIT, kosztów i leasingu..."; the yellow pill reads "Koszty używania 75%".
- **Podatnik panel:** second field in the income row reads "Koszty działalności (zł)" with the same ⓘ tooltip as before. With Ryczałt selected, the income hint shows "...koszty działalności go nie obniżają." and the "Koszty działalności" field's tooltip reads "Ryczałt nie uwzględnia kosztów działalności." (no "KUP" anywhere), and the field is disabled.
- **Car params card:** the eksploatacja/ubezpieczenie note reads "...→ koszty"; the cash-financing info box reads "...w kosztach"; leasing type options read "...w całości w kosztach..." / "...odsetki w kosztach"; the leasing value row reads "Łączne koszty przez okres:"; the credit info note reads "Odsetki / prowizja → koszty w 100%...".
- **Results panel (default skala/cash):** section heading reads "📋 Struktura kosztów"; row labels read "Koszty amortyzacja/raty", "Koszty ubezpieczenie × N", "Koszty eksploatacja × N"; total row reads "ŁĄCZNE KOSZTY"; the "Zaoszczędzony podatek" tooltip reads "...dzięki kosztom działalności i odliczeniu VAT...". Per-year breakdown rows read "Amortyzacja", "Eksploatacja / Ubezpieczenie", "Łączne wygenerowane koszty" (no "(KUP)" suffixes).
- **Leasing operacyjny scenario:** select leasing operacyjny financing — per-year row reads "Raty leasingowe netto (+50% VAT)" or "Raty leasingowe brutto" (no "(KUP)").
- **Credit scenario:** select credit financing with a non-zero rate — per-year row reads "Odsetki" (no "(KUP)").
- **Upfront costs scenario:** set "Koszty inicjalne" > 0 — per-year row reads "Koszty początkowe" (no "(KUP)").
- **Low-income scenario:** lower "Przychód firmy" enough to trigger the lost-deduction case — KPI and per-year rows read "Utracone koszty (niski dochód)" (no "KUP").
- **Ryczałt + VAT scenario:** Ryczałt + "Płatnik VAT" toggled on — the "📋 Zwrot VAT" block's note reads "...kosztów uzyskania przychodu ani amortyzacji — jedyną korzyścią..." (no "(KUP)").
- **Słowniczek/Metodologia tabs:** glossary entry reads "Koszty uzyskania przychodu" (was "KUP (Koszty Uzyskania Przychodu)"); methodology entry reads "Odliczalność kosztów"; bullets read "...niewykorzystane koszty.", "75% kosztów:...", "...korzyści i kosztów." — none contain "KUP".
- **Spouse section:** toggle "Wspólne rozliczenie z małżonkiem" — spouse's `KUP (zł)` field label and tooltip are unchanged; switching spouse "Źródło przychodów" to DG shows the income hint still saying "...koszty wpisz w polu KUP".

- [ ] **Step 3: Stop for review**

No commit — present the diff to the user for review per CLAUDE.md.

---

## Self-review

1. **Spec coverage:**
   - Taxpayer `#p_kup` label rename (Task 1) ✓
   - Taxpayer/spouse hint split + ryczałt tooltip reworded, dropping `(KUP)` (Task 2) ✓
   - Page subtitle + header pill (Task 3) ✓
   - Car-cost/financing notes, options, value rows (Task 4) ✓
   - Glossary + Metodologia (Task 5) ✓
   - KPI tooltip/label + "Struktura kosztów" block + code comment (Task 6) ✓
   - Ryczałt notes + per-year breakdown `(KUP)` suffixes dropped + "Łączne wygenerowane koszty"/"Utracone koszty" (Task 7) ✓
   - README feature prose (Task 8) ✓
   - Regression guard ("KUP only in spouse section") + full suite + manual check (Task 7 step 5, Task 9) ✓
   - "KUP should only be in spouse's field" is directly encoded as the Task 7 regression test's assertion.
2. **Placeholder scan:** No TBDs; every step has exact file/line/code (before → after). ✓
3. **Type/identifier consistency:** All `*KUP`-suffixed engine field names (`cumTotalKUP`, `insKUP`, `maKUP`, `cumLostIncKUP`, `depKUP`, `intKUP`, `opKUP`, `upfKUP`, `totalKUP`, `lostIncKUP`, `isKupAllowed`) and element ids (`p_kup`, `s_kup`, `l_kup_lv`, `def-kup`, `p_kup_tt`, `KUP_TT_DG`/`KUP_TT_RYCZALT`/`INC_HINT_DG_*` constant *names*) are referenced consistently and **never renamed** — only the human-readable strings they produce/sit next to change. `INC_HINT_DG_TAXPAYER`/`INC_HINT_DG_SPOUSE`/`INC_HINT_DG_BASE` (introduced in Task 2) are used consistently at their two call sites and not referenced elsewhere. ✓
