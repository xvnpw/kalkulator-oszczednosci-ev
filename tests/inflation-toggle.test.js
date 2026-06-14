// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as script from '../script.js';

// Baseline inputs for calculateEngine — mirrors tests/ryczalt-ui-simplification.test.js /
// tests/e2e.test.js. A leasing financing model is used where numeric assertions need
// cashOutflows spread across multiple years (cash purchase puts everything at year 0, where
// the (1+inflation)^0 discount factor is always 1 — that would make cumRealFinCost ===
// totalFinCost even with inflation on, which is not what we want to assert here).
function getBaseInputs() {
  return {
    pInc: 200000,
    pKup: 0,
    pDed: 0,
    pTaxForm: 'skala',
    pSource: 'dg',
    pIsVAT: false,
    pValRyczaltRate: '0.085',
    jointFiling: false,
    sInc: 0,
    sKup: 0,
    sDed: 0,
    sSource: 'etat',
    sIsVAT: false,
    sValRyczaltRate: '0.085',
    carType: 'new',
    financing: 'leasing',
    priceB: 200000,
    priceN: 200000,
    usedVat: 'gross_only',
    usedDepRate: '0.20',
    insurB: 5000,
    maintB: 2000,
    upfront: 0,
    lType: 'oper',
    lD: 20000,
    lB: 10000,
    lM: 36,
    lI: 3000,
    cType: 'standard',
    cD: 0,
    cIB: 0,
    cM: 36,
    cR: 0.1,
    fee: 0,
    investReturn: 0.05,
    incCar: true,
    incFuel: true,
    kmYear: 15000,
    fuelL: 8,
    fuelP: 6.5,
    evKwh: 18,
    elP: 1.5
  };
}

// Mirrors script.js > calc()'s gating contract (WP2):
//   const inflOn = cb('cpi_toggle');
//   inflation: inflOn ? n('cpi')/100 : 0, investReturn: n('inv_r')/100,
//   incCar: true, incFuel: true, incInv: inflOn,
function inputsForToggle(inflOn, overrides = {}) {
  return {
    ...getBaseInputs(),
    inflation: inflOn ? 0.05 : 0,
    incInv: inflOn,
    ...overrides
  };
}

function loadDom() {
  const htmlPath = path.resolve(process.cwd(), 'index.html');
  const htmlString = fs.readFileSync(htmlPath, 'utf-8')
    .replace(/<link[^>]*stylesheet[^>]*>/gi, '')
    .replace(/<link[^>]*preconnect[^>]*>/gi, '');
  document.documentElement.innerHTML = htmlString;
}

describe('Inflation-CPI toggle', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    loadDom();
  });

  describe('input gating (calc → engine)', () => {
    it('toggle off ⇒ engine receives inflation: 0, incInv: false, and the inflation apparatus collapses to nominal', () => {
      const inputs = inputsForToggle(false);
      expect(inputs.inflation).toBe(0);
      expect(inputs.incInv).toBe(false);

      const res = script.calculateEngine(inputs);

      // §2.1: every "real" figure collapses to its nominal counterpart at inflation 0.
      expect(res.cumRealFinCost).toBe(res.totalFinCost);
      // §2.2: incInv:false skips the investment math entirely.
      expect(res.invGross).toBe(0);
      expect(res.invReal).toBe(0);
    });

    it('toggle on ⇒ engine receives inflation: n(cpi)/100, incInv: true, and produces real discounting + investment figures', () => {
      const inputs = inputsForToggle(true);
      expect(inputs.inflation).toBe(0.05);
      expect(inputs.incInv).toBe(true);

      const res = script.calculateEngine(inputs);

      // Financed (leasing) scenario: cashflows spread over years ⇒ CPI discounting bites.
      expect(res.cumRealFinCost).toBeLessThan(res.totalFinCost);
      expect(res.invGross).toBeGreaterThan(0);
    });
  });

  describe('updateVisibility() — #cpi_inputs visibility', () => {
    it('toggle off (default) ⇒ #cpi_inputs is hidden', async () => {
      const script = await import('../script.js');

      // cpi_toggle is unchecked by default (no `checked` attribute in index.html).
      expect(document.getElementById('cpi_toggle').checked).toBe(false);

      script.updateVisibility();

      expect(document.getElementById('cpi_inputs').classList.contains('hidden')).toBe(true);
    });

    it('toggle on ⇒ #cpi_inputs is not hidden', async () => {
      const script = await import('../script.js');

      const toggle = document.getElementById('cpi_toggle');
      toggle.checked = true;
      toggle.dispatchEvent(new window.Event('change'));

      script.updateVisibility();

      expect(document.getElementById('cpi_inputs').classList.contains('hidden')).toBe(false);
    });

    it('round-trips off → on → off', async () => {
      const script = await import('../script.js');
      const toggle = document.getElementById('cpi_toggle');
      const cpiInputs = document.getElementById('cpi_inputs');

      script.updateVisibility();
      expect(cpiInputs.classList.contains('hidden')).toBe(true);

      toggle.checked = true;
      toggle.dispatchEvent(new window.Event('change'));
      script.updateVisibility();
      expect(cpiInputs.classList.contains('hidden')).toBe(false);

      toggle.checked = false;
      toggle.dispatchEvent(new window.Event('change'));
      script.updateVisibility();
      expect(cpiInputs.classList.contains('hidden')).toBe(true);
    });
  });

  describe('renderResults — reword/hide to nominal when off, regression when on', () => {
    function runCalc(inflationOn, overrides = {}) {
      const inputs = inputsForToggle(inflationOn, overrides);
      const res = script.calculateEngine(inputs);
      res.inflationOn = inflationOn;
      script.renderResults(res);
      return res;
    }

    it('off ⇒ res_body drops every "realny/realnie/NPV/inflacja/inwestycja" term', () => {
      runCalc(false, { incFuel: true });
      const html = document.getElementById('res_body').innerHTML;

      expect(html).not.toContain('realnie');
      expect(html).not.toContain('Realny koszt');
      expect(html).not.toContain('Czynnik dyskontujący');
      expect(html).not.toContain('Wartość bieżąca NPV');
      expect(html).not.toContain('📉 Inflacja');
      expect(html).not.toContain('📈 Inwestycja alternatywna');
      expect(html).not.toContain('Inwestycja alt. (realnie)');
      expect(html).not.toContain('Zysk z inflacji na długu');
    });

    it('off ⇒ res_body uses nominal KPI/section titles', () => {
      runCalc(false, { incFuel: true });
      const html = document.getElementById('res_body').innerHTML;

      expect(html).toContain('Koszt zakupu');
      expect(html).toContain('Koszt (TCO)');
    });

    it('off ⇒ res_body drops the leading "Realna oszczędność dyskontowana inflacją CPI." disclaimer sentence', () => {
      runCalc(false, { incFuel: true });
      const html = document.getElementById('res_body').innerHTML;

      expect(html).not.toContain('Realna oszczędność dyskontowana inflacją CPI');
    });

    it('off ⇒ res_body drops the redundant "Skumulowany koszt finansowania (realnie)" / "Wartość realna" VAT row', () => {
      runCalc(false, { incFuel: true, pIsVAT: true, priceB: 246000, priceN: 200000 });
      const html = document.getElementById('res_body').innerHTML;

      expect(html).not.toContain('Skumulowany koszt finansowania (realnie)');
      expect(html).not.toContain('Wartość realna');
    });

    it('off ⇒ year-ledger uses "Oszczędność PIT" and "Oszczędność łączna (PIT + zdrowotna)"', () => {
      runCalc(false, { incFuel: true });
      const html = document.getElementById('res_body').innerHTML;

      expect(html).toContain('Oszczędność PIT');
      expect(html).not.toContain('Realna oszczędność PIT');

      expect(html).toContain('Oszczędność łączna (PIT + zdrowotna)');
      expect(html).not.toContain('Realna oszczędność łączna');
    });

    it('off ⇒ fuel/VAT KPI subs say "przez X lat" without "realnie"', () => {
      const res = runCalc(false, { incFuel: true });
      const html = document.getElementById('res_body').innerHTML;

      expect(html).toContain(`przez ${res.calcYears} lat`);
      expect(html).not.toContain(`realnie przez ${res.calcYears} lat`);
    });

    it('on ⇒ res_body keeps today\'s "realny/realnie/NPV/inflacja/inwestycja" wording (regression)', () => {
      runCalc(true, { incFuel: true });
      const html = document.getElementById('res_body').innerHTML;

      expect(html).toContain('realnie');
      expect(html).toContain('Realny koszt');
      expect(html).toContain('Czynnik dyskontujący');
      expect(html).toContain('Wartość bieżąca NPV');
      expect(html).toContain('📉 Inflacja');
      expect(html).toContain('📈 Inwestycja alternatywna');
      expect(html).toContain('Inwestycja alt. (realnie)');
    });

    it('on ⇒ res_body keeps the "Realna oszczędność dyskontowana inflacją CPI." disclaimer sentence', () => {
      runCalc(true, { incFuel: true });
      const html = document.getElementById('res_body').innerHTML;

      expect(html).toContain('Realna oszczędność dyskontowana inflacją CPI');
    });

    it('on ⇒ res_body uses "Realny koszt zakupu" / "Realny koszt (TCO)" titles', () => {
      runCalc(true, { incFuel: true });
      const html = document.getElementById('res_body').innerHTML;

      expect(html).toContain('Realny koszt zakupu');
      expect(html).toContain('Realny koszt (TCO)');
    });

    it('absent inflationOn (renderResults called directly, e.g. e2e tests) defaults to on', () => {
      const inputs = inputsForToggle(true, { incFuel: true });
      const res = script.calculateEngine(inputs);
      // Do NOT set res.inflationOn — simulate the existing e2e.test.js call sites.
      script.renderResults(res);
      const html = document.getElementById('res_body').innerHTML;

      expect(html).toContain('Realny koszt zakupu');
      expect(html).toContain('realnie');
    });
  });

  describe('persistence round-trip', () => {
    it('cpi_toggle checked → saveConfig() → clear DOM/localStorage state → restoreConfig() ⇒ restored checked', async () => {
      const script = await import('../script.js');

      const toggle = document.getElementById('cpi_toggle');
      toggle.checked = true;
      toggle.dispatchEvent(new window.Event('change'));

      script.saveConfig();

      const saved = JSON.parse(localStorage.getItem(script.EV_CONFIG_KEY));
      expect(saved.checks.cpi_toggle).toBe(true);

      // Reset the live DOM state to unchecked, then restore from the saved config.
      toggle.checked = false;

      script.restoreConfig();

      expect(document.getElementById('cpi_toggle').checked).toBe(true);
    });

    it('missing cpi_toggle key in saved checks (old config) ⇒ stays unchecked', async () => {
      const script = await import('../script.js');

      localStorage.setItem(script.EV_CONFIG_KEY, JSON.stringify({
        version: script.EV_CONFIG_VERSION,
        carType: 'new', financing: 'cash',
        values: {},
        checks: { p_vat: false, joint_filing: false, s_vat: false }, // no cpi_toggle key
      }));

      const toggle = document.getElementById('cpi_toggle');
      toggle.checked = false;

      script.restoreConfig();

      expect(document.getElementById('cpi_toggle').checked).toBe(false);
    });
  });

  describe('default-off boot', () => {
    it('fresh DOM (no localStorage) ⇒ after init, #cpi_inputs is hidden and res_body shows nominal labels', async () => {
      // No localStorage seeding — init() runs HTML defaults (cpi_toggle unchecked).
      await import('../script.js');

      window.calc();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(document.getElementById('cpi_toggle').checked).toBe(false);
      expect(document.getElementById('cpi_inputs').classList.contains('hidden')).toBe(true);

      const html = document.getElementById('res_body').innerHTML;
      expect(html).toContain('Koszt zakupu');
      expect(html).toContain('Koszt (TCO)');
      expect(html).not.toContain('Realny koszt');
      expect(html).not.toContain('realnie');
      expect(html).not.toContain('📉 Inflacja');
      expect(html).not.toContain('📈 Inwestycja alternatywna');
    });
  });
});
