// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as script from '../script.js';

// Helper to construct baseline inputs for calculateEngine (mirrors tests/e2e.test.js)
function getBaseInputs() {
  return {
    pInc: 100000,
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
    financing: 'cash',
    priceB: 200000,
    priceN: 200000,
    usedVat: 'gross_only',
    insurB: 5000,
    maintB: 2000,
    upfront: 0,
    lType: 'oper',
    lD: 0,
    lB: 0,
    lM: 36,
    lI: 0,
    cType: 'standard',
    cD: 0,
    cIB: 0,
    cM: 36,
    cR: 0.1,
    fee: 0,
    inflation: 0.05,
    investReturn: 0.05,
    incCar: true,
    incFuel: false,
    incInv: false,
    kmYear: 15000,
    fuelL: 8,
    fuelP: 6.5,
    evKwh: 18,
    elP: 1.5
  };
}

describe('Ryczałt UI simplification', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();

    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const htmlString = fs.readFileSync(htmlPath, 'utf-8')
      .replace(/<link[^>]*stylesheet[^>]*>/gi, '')
      .replace(/<link[^>]*preconnect[^>]*>/gi, '');
    document.documentElement.innerHTML = htmlString;
  });

  describe('renderResults — ryczałt + VAT payer', () => {
    function runCalc(overrides = {}) {
      const inputs = {
        ...getBaseInputs(),
        pTaxForm: 'ryczalt', pInc: 150000, financing: 'cash',
        priceB: 246000, priceN: 200000, pIsVAT: true,
        incCar: true,
        ...overrides
      };
      const res = script.calculateEngine(inputs);
      script.renderResults(res);
      return res;
    }

    it('KPI card is relabeled "Zwrot VAT" with the VAT-refund value, and has no "obniżenie" sub-line', () => {
      const res = runCalc();
      const html = document.getElementById('res_body').innerHTML;

      expect(html).toContain('Zwrot VAT');
      expect(html).not.toContain('obniżenie');
      // The card shows cumRealVATRefund, which should be > 0 for a VAT payer with a price gap.
      expect(res.cumRealVATRefund).toBeGreaterThan(0);
    });

    it('baseline block is an info note, not the revenue × rate table', () => {
      runCalc();
      const html = document.getElementById('res_body').innerHTML;

      expect(html).toContain('Podatek od przychodu (ryczałt)');
      expect(html).not.toContain('Podatek PIT przed EV');
      expect(html).not.toContain('Próg');
    });

    it('per-year shows the VAT accordion and hides the PIT/health reconciliation rows', () => {
      runCalc();
      const html = document.getElementById('res_body').innerHTML;

      // Section is still rendered as a step-by-step ledger (not the single info note).
      expect(html).toContain('Rozliczenie rok po roku');
      expect(html).toContain('🧾 VAT');

      // PIT/health sub-accordions and reconciliation rows are gone for ryczałt.
      expect(html).not.toContain('🧮 Podatek PIT');
      expect(html).not.toContain('🏥 Składka zdrowotna');
      expect(html).not.toContain('Oszczędność w podatku PIT');
      expect(html).not.toContain('Oszczędność na składce zdrowotnej');
      expect(html).not.toContain('Podstawa opodatkowania (Przed EV)');
      expect(html).not.toContain('Podstawa opodatkowania (Po EV)');
    });

    it('keeps the Finansowanie and Inflacja/NPV accordions (D4)', () => {
      runCalc({ incFuel: true, incInv: true });
      const html = document.getElementById('res_body').innerHTML;

      expect(html).toContain('💳 Finansowanie');
      expect(html).toContain('📉 Inflacja');
    });

    it('per-year summary line is relabeled to "Zwrot VAT (realnie)"', () => {
      runCalc();
      const html = document.getElementById('res_body').innerHTML;
      expect(html).toContain('Zwrot VAT (realnie)');
      expect(html).not.toContain('Realna oszczędność PIT');
    });
  });

  describe('renderResults — ryczałt + non-VAT payer', () => {
    function runCalc(overrides = {}) {
      const inputs = {
        ...getBaseInputs(),
        pTaxForm: 'ryczalt', pInc: 150000, financing: 'cash',
        priceB: 200000, priceN: 200000, pIsVAT: false,
        incCar: true,
        ...overrides
      };
      const res = script.calculateEngine(inputs);
      script.renderResults(res);
      return res;
    }

    it('"Zwrot VAT" KPI value is 0 zł but the card is still present', () => {
      const res = runCalc();
      const html = document.getElementById('res_body').innerHTML;

      expect(res.cumRealVATRefund).toBe(0);
      expect(html).toContain('Zwrot VAT');
      // The KPI card renders 0 zł (zl(0,0) => "0 zł")
      expect(html).toMatch(/Zwrot VAT[\s\S]*?0&nbsp;zł|Zwrot VAT[\s\S]*?0 zł/);
    });

    it('per-year section is replaced by the single info note', () => {
      runCalc();
      const html = document.getElementById('res_body').innerHTML;

      expect(html).toContain('Rozliczenie rok po roku');
      expect(html).toContain('Ta forma opodatkowania nie generuje korzyści podatkowych z auta');

      // No step-by-step ledger details for the per-year section.
      expect(html).not.toContain('🧾 VAT');
      expect(html).not.toContain('sbs-det');
    });
  });

  describe('KUP confined to spouse (ryczałt invariant)', () => {
    it('"KUP" appears only inside #spouse_section after rendering ryczałt', async () => {
      await import('../script.js');

      window.calc();
      await new Promise(resolve => setTimeout(resolve, 50));

      const pTaxForm = document.getElementById('p_tax_form');
      pTaxForm.value = 'ryczalt';
      pTaxForm.dispatchEvent(new window.Event('change'));
      window.calc();
      await new Promise(resolve => setTimeout(resolve, 50));

      const bodyClone = document.body.cloneNode(true);
      bodyClone.querySelector('#spouse_section').remove();
      expect(bodyClone.innerHTML).not.toContain('KUP');
      expect(document.getElementById('spouse_section').innerHTML).toContain('KUP');
    });
  });

  describe('updateVisibility() — ryczałt form-field hiding', () => {
    function setForm(form) {
      const pTaxForm = document.getElementById('p_tax_form');
      pTaxForm.value = form;
      pTaxForm.dispatchEvent(new window.Event('change'));
    }

    it('hides p_inc .f, p_kup/p_ded .f2, the four lv-rows, and p_ryczalt_rate_container for ryczałt', async () => {
      const script = await import('../script.js');

      setForm('ryczalt');
      script.updateVisibility();

      expect(document.getElementById('p_inc').closest('.f').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('p_kup').closest('.f2').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('p_ded').closest('.f2').classList.contains('hidden')).toBe(true);

      expect(document.getElementById('p_net_lv').closest('.lv-row').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('p_tax_lv').closest('.lv-row').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('dep_base_lv').closest('.lv-row').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('dep_rate_lv').closest('.lv-row').classList.contains('hidden')).toBe(true);

      // Item #1: p_ryczalt_rate_container is always hidden.
      expect(document.getElementById('p_ryczalt_rate_container').classList.contains('hidden')).toBe(true);
    });

    it('hides cash/credit amortization info boxes for ryczałt', async () => {
      const script = await import('../script.js');

      setForm('ryczalt');
      script.updateVisibility();

      expect(document.getElementById('cash_amort_info').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('credit_amort_info').classList.contains('hidden')).toBe(true);
    });

    it('switching back to skala restores the form-field wrappers, but p_ryczalt_rate_container stays hidden', async () => {
      const script = await import('../script.js');

      setForm('ryczalt');
      script.updateVisibility();

      setForm('skala');
      script.updateVisibility();

      expect(document.getElementById('p_inc').closest('.f').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('p_kup').closest('.f2').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('p_ded').closest('.f2').classList.contains('hidden')).toBe(false);

      expect(document.getElementById('p_net_lv').closest('.lv-row').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('p_tax_lv').closest('.lv-row').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('dep_base_lv').closest('.lv-row').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('dep_rate_lv').closest('.lv-row').classList.contains('hidden')).toBe(false);

      expect(document.getElementById('cash_amort_info').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('credit_amort_info').classList.contains('hidden')).toBe(false);

      // Item #1 is always-hidden — does NOT get restored on switching back to skala.
      expect(document.getElementById('p_ryczalt_rate_container').classList.contains('hidden')).toBe(true);
    });
  });
});
