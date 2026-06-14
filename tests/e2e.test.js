// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as script from '../script.js';

// Helper to construct baseline inputs for calculateEngine
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

describe('E2E Calculator Tests', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();

    // Read the HTML file and populate happy-dom
    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const htmlString = fs.readFileSync(htmlPath, 'utf-8')
      .replace(/<link[^>]*stylesheet[^>]*>/gi, '')
      .replace(/<link[^>]*preconnect[^>]*>/gi, '');
    document.documentElement.innerHTML = htmlString;
  });

  describe('Tier 1: Feature Coverage (F1 to F7)', () => {
    
    // === F1: Tax Form Selection ===
    describe('F1: Tax Form Selection', () => {
      it('test_f1_taxpayer_skala_selection', () => {
        const pTaxForm = document.getElementById('p_tax_form');
        expect(pTaxForm).not.toBeNull();
        pTaxForm.value = 'skala';
        pTaxForm.dispatchEvent(new window.Event('change'));
        const jointFiling = document.getElementById('joint_filing');
        expect(jointFiling.disabled).toBe(false);
      });

      it('test_f1_taxpayer_liniowy_selection', () => {
        const pTaxForm = document.getElementById('p_tax_form');
        expect(pTaxForm).not.toBeNull();
        pTaxForm.value = 'liniowy';
        pTaxForm.dispatchEvent(new window.Event('change'));
        const jointFiling = document.getElementById('joint_filing');
        expect(jointFiling.disabled).toBe(true);
        expect(jointFiling.checked).toBe(false);
      });

      it('test_f1_taxpayer_ryczalt_selection', () => {
        const pTaxForm = document.getElementById('p_tax_form');
        expect(pTaxForm).not.toBeNull();
        pTaxForm.value = 'ryczalt';
        pTaxForm.dispatchEvent(new window.Event('change'));
        const jointFiling = document.getElementById('joint_filing');
        expect(jointFiling.disabled).toBe(true);
        expect(jointFiling.checked).toBe(false);
      });

      it('test_f1_spouse_skala_only', () => {
        const sTaxForm = document.getElementById('s_tax_form');
        expect(sTaxForm).not.toBeNull();
        expect(sTaxForm.value).toBe('skala');
        expect(sTaxForm.disabled).toBe(true);
      });

      it('test_f1_invalid_form_throws', () => {
        // D5: an unknown tax form now throws instead of silently falling back to 0 (R08 Tier 4 #1) —
        // a typo otherwise produced plausible-but-wrong numbers with no signal.
        const inputs = getBaseInputs();
        inputs.pTaxForm = 'invalid_tax_form';
        expect(() => script.calculateEngine(inputs)).toThrow(/nieznana forma/);
      });
    });

    // === F2: Income Sources ===
    describe('F2: Income Sources', () => {
      it('test_f2_taxpayer_vat_visible_dg_only', () => {
        // Taxpayer is DG-only now — no source selector; VAT toggle is always available.
        expect(document.getElementById('p_source')).toBeNull();
        script.updateVisibility();
        const vatContainer = document.getElementById('p_vat_container');
        expect(vatContainer.classList.contains('hidden')).toBe(false);
      });

      it('test_f2_spouse_etat_fields', () => {
        const sSource = document.getElementById('s_source');
        expect(sSource).not.toBeNull();
        sSource.value = 'etat';
        sSource.dispatchEvent(new window.Event('change'));
        
        const sVatContainer = document.getElementById('s_vat_container');
        if (sVatContainer) {
          expect(sVatContainer.classList.contains('hidden')).toBe(true);
        }
      });

      it('test_f2_spouse_dg_fields', () => {
        const sSource = document.getElementById('s_source');
        expect(sSource).not.toBeNull();
        sSource.value = 'dg';
        sSource.dispatchEvent(new window.Event('change'));
        
        const sVatContainer = document.getElementById('s_vat_container');
        expect(sVatContainer).not.toBeNull();
        expect(sVatContainer.classList.contains('hidden')).toBe(false);
      });

      it('test_f2_ryczalt_rates_presence', () => {
        const ryczaltSelect = document.getElementById('p_ryczalt_rate');
        expect(ryczaltSelect).not.toBeNull();
        const options = Array.from(ryczaltSelect.options).map(o => o.value);
        expect(options).toContain('0.03');
        expect(options).toContain('0.055');
        expect(options).toContain('0.085');
        expect(options).toContain('0.12');
        expect(options).toContain('0.15');
        expect(options).toContain('0.17');
      });
    });

    // === F3: Joint Filing Toggle ===
    describe('F3: Joint Filing Toggle', () => {
      it('test_f3_toggle_initially_off', () => {
        const jointFiling = document.getElementById('joint_filing');
        expect(jointFiling).not.toBeNull();
        expect(jointFiling.checked).toBe(false);
      });

      it('test_f3_toggle_shows_spouse_section', () => {
        const jointFiling = document.getElementById('joint_filing');
        expect(jointFiling).not.toBeNull();
        jointFiling.checked = true;
        jointFiling.dispatchEvent(new window.Event('change'));
        
        const spouseSection = document.getElementById('spouse_section');
        expect(spouseSection.classList.contains('hidden')).toBe(false);
      });

      it('test_f3_toggle_hides_spouse_section', () => {
        const jointFiling = document.getElementById('joint_filing');
        expect(jointFiling).not.toBeNull();
        jointFiling.checked = false;
        jointFiling.dispatchEvent(new window.Event('change'));
        
        const spouseSection = document.getElementById('spouse_section');
        expect(spouseSection.classList.contains('hidden')).toBe(true);
      });

      it('test_f3_toggle_disabled_non_skala', () => {
        const pTaxForm = document.getElementById('p_tax_form');
        expect(pTaxForm).not.toBeNull();
        pTaxForm.value = 'liniowy';
        pTaxForm.dispatchEvent(new window.Event('change'));
        
        const jointFiling = document.getElementById('joint_filing');
        expect(jointFiling.disabled).toBe(true);
      });

      it('test_f3_toggle_row_visibility', () => {
        const pTaxForm = document.getElementById('p_tax_form');
        expect(pTaxForm).not.toBeNull();
        pTaxForm.value = 'ryczalt';
        pTaxForm.dispatchEvent(new window.Event('change'));
        
        const jointRow = document.getElementById('joint_filing_row');
        expect(jointRow.classList.contains('hidden')).toBe(true);
      });
    });

    // === F4: Validation Logic ===
    describe('F4: Validation Logic', () => {
      it('test_f4_switch_to_liniowy_unchecks_joint', () => {
        const pTaxForm = document.getElementById('p_tax_form');
        const jointFiling = document.getElementById('joint_filing');
        expect(pTaxForm).not.toBeNull();
        expect(jointFiling).not.toBeNull();
        
        jointFiling.checked = true;
        pTaxForm.value = 'liniowy';
        pTaxForm.dispatchEvent(new window.Event('change'));
        
        expect(jointFiling.checked).toBe(false);
      });

      it('test_f4_switch_to_ryczalt_unchecks_joint', () => {
        const pTaxForm = document.getElementById('p_tax_form');
        const jointFiling = document.getElementById('joint_filing');
        expect(pTaxForm).not.toBeNull();
        expect(jointFiling).not.toBeNull();
        
        jointFiling.checked = true;
        pTaxForm.value = 'ryczalt';
        pTaxForm.dispatchEvent(new window.Event('change'));
        
        expect(jointFiling.checked).toBe(false);
      });

      it('test_f4_spouse_inputs_reset_on_disable', () => {
        const inputs = getBaseInputs();
        inputs.jointFiling = false;
        inputs.sInc = 100000;
        const res = script.calculateEngine(inputs);
        expect(res.sNet).toBe(0);
      });

      it('test_f4_skala_reenables_joint_toggle', () => {
        const pTaxForm = document.getElementById('p_tax_form');
        const jointFiling = document.getElementById('joint_filing');
        expect(pTaxForm).not.toBeNull();
        expect(jointFiling).not.toBeNull();
        
        pTaxForm.value = 'liniowy';
        pTaxForm.dispatchEvent(new window.Event('change'));
        expect(jointFiling.disabled).toBe(true);
        
        pTaxForm.value = 'skala';
        pTaxForm.dispatchEvent(new window.Event('change'));
        expect(jointFiling.disabled).toBe(false);
      });

      it('test_f4_joint_filing_enforces_spouse_skala', () => {
        const sTaxForm = document.getElementById('s_tax_form');
        expect(sTaxForm).not.toBeNull();
        expect(sTaxForm.value).toBe('skala');
        expect(sTaxForm.disabled).toBe(true);
      });
    });

    // === F5: Combined PIT + Health Shields ===
    describe('F5: Combined PIT + Health Shields', () => {
      it('test_f5_skala_12_percent_shield', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 110000; // Under 120k threshold (12% tax bracket)
        inputs.pTaxForm = 'skala';
        inputs.pSource = 'dg';
        inputs.incCar = true;
        
        // Single year test to easily check the rates
        const res = script.calculateEngine(inputs);
        const row = res.rows[0];
        // Nominal combined shield: 12% PIT + 9% health = 21% of KUP
        expect(row.mr).toBe(0.12);
        // PIT Savings + Health Savings / totalKUP should reflect ~21% shield
        const totalSav = row.taxSav + row.healthSav;
        expect(totalSav / row.totalKUP).toBeCloseTo(0.21, 2);
      });

      it('test_f5_skala_32_percent_shield', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 200000; // Above 120k threshold (32% tax bracket)
        inputs.pTaxForm = 'skala';
        inputs.pSource = 'dg';
        inputs.incCar = true;
        
        const res = script.calculateEngine(inputs);
        const row = res.rows[0];
        // Nominal combined shield: 32% PIT + 9% health = 41% of KUP
        expect(row.mr).toBe(0.32);
        const totalSav = row.taxSav + row.healthSav;
        expect(totalSav / row.totalKUP).toBeCloseTo(0.41, 2);
      });

      it('test_f5_liniowy_flat_shield', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 150000;
        inputs.pTaxForm = 'liniowy';
        inputs.pSource = 'dg';
        inputs.incCar = true;
        
        const res = script.calculateEngine(inputs);
        const row = res.rows[0];
        expect(row.mr).toBe(0.19);
        // D2: liniowy now deducts paid health (≤ 14 100) from the PIT base, so the flat 23.9% shield
        // no longer holds — the health drop claws back 19% of itself, and the floor bites. Re-derived:
        //   year-1 KUP = dep 40000 + insKUP 3750 + maKUP 1500 = 45250; pNet 150000 → pNetY 104750
        //   H_before = max(5190.48, 150000×0.049 = 7350)        = 7350
        //   H_after  = max(5190.48, 104750×0.049 = 5132.75)     = 5190.48 (floored)
        //   healthSav = 7350 − 5190.48 = 2159.52
        //   baseTax  = (150000 − 7350)×0.19  = 27103.50
        //   taxWith  = (104750 − 5190.48)×0.19 = 18916.3088 → taxSav = 8187.1912
        expect(row.totalKUP).toBeCloseTo(45250, 2);
        expect(row.healthSav).toBeCloseTo(2159.52, 2);
        expect(row.taxSav).toBeCloseTo(8187.1912, 2);
        const totalSav = row.taxSav + row.healthSav;
        expect(totalSav / row.totalKUP).toBeCloseTo(0.228657, 4); // below the old 23.9% (clawback + floor)
      });

      it('test_f5_ryczalt_zero_shield', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 150000;
        inputs.pTaxForm = 'ryczalt';
        inputs.pValRyczaltRate = '0.085';
        inputs.pSource = 'dg';
        inputs.incCar = true;
        
        const res = script.calculateEngine(inputs);
        const row = res.rows[0];
        // Ryczałt is on revenue, so KUP (car costs) provides 0 PIT savings
        expect(row.taxSav).toBe(0);
        expect(row.healthSav).toBe(0);
      });

      it('test_f5_ryczalt_vat_only_shield', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 150000;
        inputs.pTaxForm = 'ryczalt';
        inputs.pSource = 'dg';
        inputs.pIsVAT = true;
        inputs.incCar = true;
        
        const res = script.calculateEngine(inputs);
        // There should be a VAT shield (50% VAT refund on maint/upfront etc.), but PIT/Health savings is 0
        expect(res.cumTaxSav).toBe(0);
        expect(res.cumHealthSav).toBe(0);
        expect(res.isVAT).toBe(true);
        expect(res.cumRealVATRefund).toBeGreaterThan(0);
      });
    });

    // === F6: Health Contribution Math ===
    describe('F6: Health Contribution Math', () => {
      it('test_f6_skala_health_standard', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 100000;
        inputs.pTaxForm = 'skala';
        inputs.pSource = 'dg';
        
        // D1: year-1 KUP = dep 40000 + opKUP 5250 = 45250 (was 35250); health base 100 000 → 9000.
        const res = script.calculateEngine(inputs);
        const r0 = res.rows[0];
        expect(r0.pHealthBeforeY).toBe(9000);
        // pHealthAfterY = max(5190.48, (100000 − 45250) × 0.09 = 4927.50) = 5190.48 (now floored)
        expect(r0.pHealthAfterY).toBeCloseTo(5190.48, 2);
        expect(r0.healthSav).toBeCloseTo(3809.52, 2);       // 9000 − 5190.48
        expect(res.cumHealthSav).toBeCloseTo(19047.6, 2);   // 5 × 3809.52
      });

      it('test_f6_skala_health_minimum_limit', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 10000; // Low income
        inputs.pTaxForm = 'skala';
        inputs.pSource = 'dg';
        
        const res = script.calculateEngine(inputs);
        const r0 = res.rows[0];
        // pInc 10 000 → health already at the 5190.48 floor before and after the car.
        expect(r0.pHealthBeforeY).toBe(5190.48);
        expect(r0.pHealthAfterY).toBe(5190.48);
        expect(r0.healthSav).toBe(0);
        expect(r0.healthDetail.floor).toBe(true);
      });

      it('test_f6_liniowy_health_standard', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 200000;
        inputs.pTaxForm = 'liniowy';
        inputs.pSource = 'dg';
        
        const res = script.calculateEngine(inputs);
        const r0 = res.rows[0];
        // D1: year-1 KUP = dep 40000 + opKUP 5250 = 45250. Liniowy health is 4.9% of net;
        // pInc 200 000 → 9800 before, (200000 − 45250) × 0.049 = 7582.75 after (above floor).
        expect(r0.pHealthBeforeY).toBe(9800);
        expect(r0.pHealthAfterY).toBeCloseTo(7582.75, 2);
        expect(r0.healthSav).toBeCloseTo(2217.25, 2);        // 9800 − 7582.75
        expect(res.cumHealthSav).toBeCloseTo(11086.25, 2);   // 5 × 2217.25
      });

      it('test_f6_liniowy_health_minimum_limit', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 10000; // Low income
        inputs.pTaxForm = 'liniowy';
        inputs.pSource = 'dg';
        
        const res = script.calculateEngine(inputs);
        const r0 = res.rows[0];
        // pInc 10 000 → liniowy health pinned at the 5190.48 floor before and after.
        expect(r0.pHealthBeforeY).toBe(5190.48);
        expect(r0.pHealthAfterY).toBe(5190.48);
        expect(r0.healthSav).toBe(0);
        expect(r0.healthDetail.floor).toBe(true);
      });

      it('test_f6_ryczalt_health_tier_1', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 50000; // Tier 1: <= 60k
        inputs.pTaxForm = 'ryczalt';
        inputs.pSource = 'dg';
        
        const res = script.calculateEngine(inputs);
        const r0 = res.rows[0];
        // Tier 1: 60% of average wage × 9% — and ryczałt gets no car-cost health shield.
        expect(r0.healthDetail.tier).toBe('≤ 60 000 zł');
        expect(r0.pHealthBeforeY).toBeCloseTo(5980.16, 2);
        expect(r0.healthSav).toBe(0);
        expect(res.cumHealthSav).toBe(0);
      });

      it('test_f6_ryczalt_health_tier_2', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 150000; // Tier 2: 60k to 300k
        inputs.pTaxForm = 'ryczalt';
        inputs.pSource = 'dg';
        
        const res = script.calculateEngine(inputs);
        const r0 = res.rows[0];
        // Tier 2: 100% of average wage × 9%.
        expect(r0.healthDetail.tier).toBe('≤ 300 000 zł');
        expect(r0.pHealthBeforeY).toBeCloseTo(9966.93, 2);
        expect(r0.healthSav).toBe(0);
        expect(res.cumHealthSav).toBe(0);
      });

      it('test_f6_ryczalt_health_tier_3', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 400000; // Tier 3: > 300k
        inputs.pTaxForm = 'ryczalt';
        inputs.pSource = 'dg';
        
        const res = script.calculateEngine(inputs);
        const r0 = res.rows[0];
        // Tier 3: 180% of average wage × 9%.
        expect(r0.healthDetail.tier).toBe('> 300 000 zł');
        expect(r0.pHealthBeforeY).toBeCloseTo(17940.48, 2);
        expect(r0.healthSav).toBe(0);
        expect(res.cumHealthSav).toBe(0);
      });

      it('test_f6_etat_health_no_car_deduction', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 100000;
        inputs.pTaxForm = 'skala';
        inputs.pSource = 'etat';
        inputs.incCar = true;
        
        const res = script.calculateEngine(inputs);
        // Etat health is 9% of salary, car costs cannot reduce this base
        expect(res.cumHealthSav).toBe(0);
      });
    });

    // === F7: Car Cost Allocation ===
    describe('F7: Car Cost Allocation', () => {
      it('test_f7_costs_assigned_to_taxpayer', () => {
        const inputs = getBaseInputs();
        inputs.pSource = 'dg';
        inputs.pTaxForm = 'skala';
        inputs.incCar = true;
        
        const res = script.calculateEngine(inputs);
        // Taxpayer net is reduced by car costs
        expect(res.rows[0].taxBaseAfter).toBeLessThan(res.rows[0].taxBaseBefore);
      });

      it('test_f7_no_spouse_car_costs', () => {
        const inputs = getBaseInputs();
        inputs.jointFiling = true;
        inputs.pSource = 'dg';
        inputs.pTaxForm = 'skala';
        inputs.sInc = 100000;
        inputs.sSource = 'etat';
        inputs.incCar = true;
        
        const res = script.calculateEngine(inputs);
        // Spouse net remains unmodified by car costs
        expect(res.sNet).toBe(100000);
      });

      it('test_f7_removal_cost_owner_selection_elements', () => {
        const scWife = document.getElementById('sc_wife');
        const scHusb = document.getElementById('sc_husb');
        expect(scWife).toBeNull();
        expect(scHusb).toBeNull();
      });

      it('test_f7_default_assignment_to_taxpayer_in_engine', () => {
        const inputs = getBaseInputs();
        expect(inputs.costOwner).toBeUndefined();
      });
    });

  });

  describe('Tier 2: Boundary & Corner Cases (F1 to F7)', () => {
    
    // === F1 Boundaries ===
    describe('F1 Boundaries', () => {
      it('test_f1_b1_undefined_tax_form', () => {
        const inputs = getBaseInputs();
        delete inputs.pTaxForm;
        const res = script.calculateEngine(inputs);
        expect(res).toBeDefined();
      });

      it('test_f1_b2_extreme_income', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 100000000; // 100M PLN
        const res = script.calculateEngine(inputs);
        expect(res.rows[0].baseTax).toBeGreaterThan(0);
      });

      it('test_f1_b3_zero_income', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 0;
        const res = script.calculateEngine(inputs);
        expect(res.rows[0].baseTax).toBe(0);
      });

      it('test_f1_b4_negative_income', () => {
        const inputs = getBaseInputs();
        inputs.pInc = -50000;
        const res = script.calculateEngine(inputs);
        expect(res.pNet).toBe(0);
      });

      it('test_f1_b5_fractional_income', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 123456.78;
        const res = script.calculateEngine(inputs);
        expect(res.pNet).toBe(123456.78);
      });
    });

    // === F2 Boundaries ===
    describe('F2 Boundaries', () => {
      it('test_f2_b1_dg_kup_exceeds_revenue', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 50000;
        inputs.pKup = 80000; // creates negative base
        const res = script.calculateEngine(inputs);
        expect(res.pNet).toBe(0);
      });

      it('test_f2_b2_etat_kup_boundary', () => {
        const inputs = getBaseInputs();
        inputs.pSource = 'etat';
        inputs.pKup = 3000;
        const res = script.calculateEngine(inputs);
        expect(res.pNet).toBe(97000);
      });

      it('test_f2_b3_vat_false_zero_deduction', () => {
        const inputs = getBaseInputs();
        inputs.pSource = 'dg';
        inputs.pIsVAT = false;
        inputs.priceB = 246000;
        inputs.priceN = 200000;
        const res = script.calculateEngine(inputs);
        // Non-VAT dep base should be gross (up to EV limit)
        expect(res.depBase).toBe(225000);
      });

      it('test_f2_b4_ryczalt_invalid_rate_fallback', () => {
        const inputs = getBaseInputs();
        inputs.pTaxForm = 'ryczalt';
        inputs.pValRyczaltRate = 'invalid_rate';
        const res = script.calculateEngine(inputs);
        expect(res).toBeDefined();
      });

      it('test_f2_b5_deductions_exceed_income', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 100000;
        inputs.pDed = 120000;
        const res = script.calculateEngine(inputs);
        expect(res.pNet).toBe(0);
      });
    });

    // === F3 Boundaries ===
    describe('F3 Boundaries', () => {
      it('test_f3_b1_joint_filing_spouse_zero_income', () => {
        const inputs = getBaseInputs();
        inputs.jointFiling = true;
        inputs.pInc = 100000;
        inputs.sInc = 0;
        const res = script.calculateEngine(inputs);
        // Combined PIT with joint allowance pooling
        expect(res.baseTax).toBe(4800);
      });

      it('test_f3_b2_joint_filing_spouse_high_income', () => {
        const inputs = getBaseInputs();
        inputs.jointFiling = true;
        inputs.pInc = 150000;
        inputs.sInc = 150000;
        const res = script.calculateEngine(inputs);
        expect(res.baseTax).toBeGreaterThan(0);
      });

      it('test_f3_b3_both_zero_income', () => {
        const inputs = getBaseInputs();
        inputs.jointFiling = true;
        inputs.pInc = 0;
        inputs.sInc = 0;
        const res = script.calculateEngine(inputs);
        expect(res.baseTax).toBe(0);
      });

      it('test_f3_b4_spouse_negative_income', () => {
        const inputs = getBaseInputs();
        inputs.jointFiling = true;
        inputs.sInc = -10000;
        const res = script.calculateEngine(inputs);
        expect(res.sNet).toBe(0);
      });

      it('test_f3_b5_spouse_excessive_deductions', () => {
        const inputs = getBaseInputs();
        inputs.jointFiling = true;
        inputs.sInc = 50000;
        inputs.sDed = 60000;
        const res = script.calculateEngine(inputs);
        expect(res.sNet).toBe(0);
      });
    });

    // === F4 Boundaries ===
    describe('F4 Boundaries', () => {
      it('test_f4_b1_programmatically_setting_spouse_form', () => {
        const sTaxForm = document.getElementById('s_tax_form');
        expect(sTaxForm).not.toBeNull();
        sTaxForm.value = 'liniowy';
        sTaxForm.dispatchEvent(new window.Event('change'));
        // UI code must force it back or block changes
        expect(sTaxForm.value).toBe('skala');
      });

      it('test_f4_b2_programmatically_setting_joint_filing_on_liniowy', () => {
        const pTaxForm = document.getElementById('p_tax_form');
        const jointFiling = document.getElementById('joint_filing');
        expect(pTaxForm).not.toBeNull();
        expect(jointFiling).not.toBeNull();
        
        pTaxForm.value = 'liniowy';
        pTaxForm.dispatchEvent(new window.Event('change'));
        jointFiling.checked = true;
        jointFiling.dispatchEvent(new window.Event('change'));
        // Checking it programmatically must be blocked or reset
        expect(jointFiling.checked).toBe(false);
      });

      it('test_f4_b3_switching_state_history', () => {
        const pTaxForm = document.getElementById('p_tax_form');
        expect(pTaxForm).not.toBeNull();
        
        pTaxForm.value = 'liniowy';
        pTaxForm.dispatchEvent(new window.Event('change'));
        pTaxForm.value = 'skala';
        pTaxForm.dispatchEvent(new window.Event('change'));
        
        const jointFiling = document.getElementById('joint_filing');
        expect(jointFiling.disabled).toBe(false);
      });

      it('test_f4_b5_joint_toggle_hidden_on_ryczalt', () => {
        const pTaxForm = document.getElementById('p_tax_form');
        expect(pTaxForm).not.toBeNull();
        
        pTaxForm.value = 'ryczalt';
        pTaxForm.dispatchEvent(new window.Event('change'));
        const jointRow = document.getElementById('joint_filing_row');
        expect(jointRow.classList.contains('hidden')).toBe(true);
      });
    });

    // === F5 Boundaries ===
    describe('F5 Boundaries', () => {
      it('test_f5_b1_skala_exactly_30k', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 30000;
        const res = script.calculateEngine(inputs);
        expect(res.rows[0].baseTax).toBe(0);
      });

      it('test_f5_b2_skala_exactly_120k', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 120000;
        const res = script.calculateEngine(inputs);
        // (120k - 30k) * 0.12 = 10800
        expect(res.rows[0].baseTax).toBe(10800);
      });

      it('test_f5_b3_wasted_deduction_low_income', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 15000; // Low income
        inputs.pTaxForm = 'skala';
        inputs.pSource = 'dg';
        inputs.incCar = true;
        
        const res = script.calculateEngine(inputs);
        // Track wasted deductions (lostIncKUP)
        expect(res.cumLostIncKUP).toBeGreaterThan(0);
      });

      it('test_f5_b4_car_value_exactly_225k', () => {
        const inputs = getBaseInputs();
        inputs.priceB = 225000;
        inputs.priceN = 225000;
        inputs.carType = 'new';
        const res = script.calculateEngine(inputs);
        expect(res.depBase).toBe(225000);
      });

      it('test_f5_b5_car_value_above_225k', () => {
        const inputs = getBaseInputs();
        inputs.priceB = 300000;
        inputs.priceN = 300000;
        inputs.carType = 'new';
        const res = script.calculateEngine(inputs);
        expect(res.depBase).toBe(225000);
      });
    });

    // === F6 Boundaries ===
    describe('F6 Boundaries', () => {
      it('test_f6_b1_ryczalt_exactly_60k', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 60000;
        inputs.pTaxForm = 'ryczalt';
        inputs.pSource = 'dg';
        const res = script.calculateEngine(inputs);
        // 60 000 is inclusive in tier 1.
        expect(res.rows[0].healthDetail.tier).toBe('≤ 60 000 zł');
        expect(res.rows[0].pHealthBeforeY).toBeCloseTo(5980.16, 2);
      });

      it('test_f6_b2_ryczalt_exactly_300k', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 300000;
        inputs.pTaxForm = 'ryczalt';
        inputs.pSource = 'dg';
        const res = script.calculateEngine(inputs);
        // 300 000 is inclusive in tier 2 (the boundary belongs to ≤ 300 000).
        expect(res.rows[0].healthDetail.tier).toBe('≤ 300 000 zł');
        expect(res.rows[0].pHealthBeforeY).toBeCloseTo(9966.93, 2);
      });

      it('test_f6_b3_liniowy_exact_min_health', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 50000; // health 4.9% = 2450. Min is ~5190.48
        inputs.pTaxForm = 'liniowy';
        inputs.pSource = 'dg';
        const res = script.calculateEngine(inputs);
        // 4.9% × 50 000 = 2450 < floor, so the contribution sits at 5190.48.
        expect(res.rows[0].pHealthBeforeY).toBe(5190.48);
        expect(res.rows[0].healthDetail.floor).toBe(true);
      });

      it('test_f6_b4_skala_exact_min_health', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 40000; // health 9% = 3600. Min is ~5190.48
        inputs.pTaxForm = 'skala';
        inputs.pSource = 'dg';
        const res = script.calculateEngine(inputs);
        // 9% × 40 000 = 3600 < floor, so the contribution sits at 5190.48.
        expect(res.rows[0].pHealthBeforeY).toBe(5190.48);
        expect(res.rows[0].healthDetail.floor).toBe(true);
      });

      it('test_f6_b5_average_wage_updates', () => {
        const inputs = getBaseInputs();
        inputs.pInc = 100000;
        inputs.pTaxForm = 'ryczalt';
        inputs.pSource = 'dg';
        const res = script.calculateEngine(inputs);
        // Ryczałt health is pinned to the AVG_WAGE_2026 tier base, not to net income.
        expect(res.rows[0].healthDetail.tier).toBe('≤ 300 000 zł');
        expect(res.rows[0].healthDetail.base).toBeCloseTo(110743.68, 2);
        expect(res.rows[0].pHealthBeforeY).toBeCloseTo(9966.93, 2);
      });
    });

    // === F7 Boundaries ===
    describe('F7 Boundaries', () => {
      it('test_f7_b1_taxpayer_etat_car_shield', () => {
        const inputs = getBaseInputs();
        inputs.pSource = 'etat';
        inputs.pTaxForm = 'skala';
        inputs.incCar = true;
        const res = script.calculateEngine(inputs);
        expect(res.cumTaxSav).toBe(0);
        expect(res.cumHealthSav).toBe(0); // etat health is fixed at 9% of salary — no car shield
      });

      it('test_f7_b2_spouse_dg_car_shield', () => {
        const inputs = getBaseInputs();
        inputs.jointFiling = true;
        inputs.pSource = 'etat';
        inputs.pTaxForm = 'skala';
        inputs.sInc = 150000;
        inputs.sSource = 'dg';
        inputs.incCar = true;
        const res = script.calculateEngine(inputs);
        // Car costs belong to taxpayer (on Etat -> no savings). Spouse's DG does not get car deductions.
        expect(res.cumTaxSav).toBe(0);
      });

      it('test_f7_b3_taxpayer_ryczalt_car_shield', () => {
        const inputs = getBaseInputs();
        inputs.pSource = 'dg';
        inputs.pTaxForm = 'ryczalt';
        inputs.pValRyczaltRate = '0.085';
        inputs.incCar = true;
        const res = script.calculateEngine(inputs);
        expect(res.cumTaxSav).toBe(0);
      });

      it('test_f7_b4_non_vat_car_vat_deduction', () => {
        const inputs = getBaseInputs();
        inputs.pSource = 'dg';
        inputs.pIsVAT = false;
        inputs.priceB = 100000;
        inputs.priceN = 100000;
        inputs.maintB = 1000;
        inputs.incCar = true;
        const res = script.calculateEngine(inputs);
        expect(res.depBase).toBe(100000);
      });

      it('test_f7_b5_vat_car_vat_deduction', () => {
        const inputs = getBaseInputs();
        inputs.pSource = 'dg';
        inputs.pIsVAT = true;
        inputs.priceB = 123000;
        inputs.priceN = 100000;
        inputs.maintB = 1000;
        inputs.incCar = true;
        const res = script.calculateEngine(inputs);
        // For VAT payer: depBase includes 50% VAT = 100k + 11.5k = 111.5k
        expect(res.depBase).toBe(111500);
      });
    });

  });

  describe('Tier 3: Cross-Feature Combinations', () => {
    it('test_t3_skala_dg_vat_joint_etat', () => {
      const inputs = getBaseInputs();
      inputs.pTaxForm = 'skala';
      inputs.pSource = 'dg';
      inputs.pIsVAT = true;
      inputs.jointFiling = true;
      inputs.sInc = 80000;
      inputs.sSource = 'etat';
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      expect(res.baseTax).toBeGreaterThan(0);
    });

    it('test_t3_skala_dg_novat_joint_dg_vat', () => {
      const inputs = getBaseInputs();
      inputs.pTaxForm = 'skala';
      inputs.pSource = 'dg';
      inputs.pIsVAT = false;
      inputs.jointFiling = true;
      inputs.sInc = 80000;
      inputs.sSource = 'dg';
      inputs.sIsVAT = true;
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      expect(res.baseTax).toBeGreaterThan(0);
    });

    it('test_t3_liniowy_dg_vat_individual', () => {
      const inputs = getBaseInputs();
      inputs.pTaxForm = 'liniowy';
      inputs.pSource = 'dg';
      inputs.pIsVAT = true;
      inputs.jointFiling = false;
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      expect(res.baseTax).toBeGreaterThan(0);
    });

    it('test_t3_ryczalt_dg_vat_individual', () => {
      const inputs = getBaseInputs();
      inputs.pTaxForm = 'ryczalt';
      inputs.pValRyczaltRate = '0.085';
      inputs.pSource = 'dg';
      inputs.pIsVAT = true;
      inputs.jointFiling = false;
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      expect(res.baseTax).toBeGreaterThan(0);
    });

    it('test_t3_skala_etat_joint_dg_vat', () => {
      const inputs = getBaseInputs();
      inputs.pTaxForm = 'skala';
      inputs.pSource = 'etat';
      inputs.jointFiling = true;
      inputs.sInc = 120000;
      inputs.sSource = 'dg';
      inputs.sIsVAT = true;
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      expect(res.baseTax).toBeGreaterThan(0);
    });

    it('test_t3_skala_dg_vat_no_joint', () => {
      const inputs = getBaseInputs();
      inputs.pTaxForm = 'skala';
      inputs.pSource = 'dg';
      inputs.pIsVAT = true;
      inputs.jointFiling = false;
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      expect(res.baseTax).toBeGreaterThan(0);
    });

    it('test_t3_liniowy_dg_novat_individual', () => {
      const inputs = getBaseInputs();
      inputs.pTaxForm = 'liniowy';
      inputs.pSource = 'dg';
      inputs.pIsVAT = false;
      inputs.jointFiling = false;
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      expect(res.baseTax).toBeGreaterThan(0);
    });
  });

  describe('Tier 4: Real-World Scenarios (TCO over time)', () => {
    it('test_t4_tco_cash_purchase_used_car_40_percent_depreciation', () => {
      const inputs = getBaseInputs();
      inputs.carType = 'used';
      inputs.usedDepRate = '0.40'; // 40% rate over 30 months (3 years calc)
      inputs.financing = 'cash';
      inputs.pSource = 'dg';
      inputs.pTaxForm = 'skala';
      inputs.pInc = 150000;
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      expect(res.calcYears).toBe(3);
      expect(res.rows).toHaveLength(3);
      expect(res.effectiveCost).toBeLessThan(res.totalFinCost);
    });

    it('test_t4_tco_leasing_operacyjny_new_car', () => {
      const inputs = getBaseInputs();
      inputs.carType = 'new';
      inputs.financing = 'leasing';
      inputs.lType = 'oper';
      inputs.lD = 20000;
      inputs.lB = 30000;
      inputs.lM = 36;
      inputs.lI = 3000;
      inputs.pSource = 'dg';
      inputs.pTaxForm = 'liniowy';
      inputs.pInc = 200000;
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      expect(res.calcYears).toBe(5);
      expect(res.rows).toHaveLength(5);
      expect(res.effectiveCost).toBeDefined();
    });

    it('test_t4_tco_credit_purchase_new_car', () => {
      const inputs = getBaseInputs();
      inputs.carType = 'new';
      inputs.financing = 'credit';
      inputs.cType = 'standard';
      inputs.cD = 40000;
      inputs.cIB = 120000;
      inputs.cM = 36;
      inputs.cR = 0.08;
      inputs.pSource = 'dg';
      inputs.pTaxForm = 'skala';
      inputs.jointFiling = true;
      inputs.sInc = 100000;
      inputs.sSource = 'etat';
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      expect(res.calcYears).toBe(5);
      expect(res.rows).toHaveLength(5);
      expect(res.effectiveCost).toBeDefined();
    });

    it('test_t4_tco_ryczalt_zero_operating_shield', () => {
      const inputs = getBaseInputs();
      inputs.carType = 'new';
      inputs.financing = 'cash';
      inputs.pSource = 'dg';
      inputs.pTaxForm = 'ryczalt';
      inputs.pValRyczaltRate = '0.085';
      inputs.pInc = 180000;
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      // Ryczałt must yield zero tax and health savings
      expect(res.cumTaxSav).toBe(0);
      expect(res.cumHealthSav).toBe(0);
    });

    it('test_t4_tco_low_income_wasted_depreciation', () => {
      const inputs = getBaseInputs();
      inputs.carType = 'new';
      inputs.financing = 'cash';
      inputs.pSource = 'dg';
      inputs.pTaxForm = 'skala';
      inputs.pInc = 12000; // Very low income
      inputs.incCar = true;
      
      const res = script.calculateEngine(inputs);
      expect(res.cumLostIncKUP).toBeGreaterThan(0);
    });
  });

  describe('Sticky header period indicator', () => {
    it('shows the engine calcYears value next to the headline total', async () => {
      const script = await import('../script.js');

      // Switch to a used car: with the default 40%/year depreciation rate
      // and cash financing, calcYears resolves to 3 (not the default 5),
      // proving the indicator reflects the dynamic value.
      const usedBtn = document.querySelector('#car_type_pills button:nth-child(2)');
      window.setCarType('used', usedBtn);

      window.calc();

      const inputs = getBaseInputs();
      inputs.carType = 'used';
      inputs.financing = 'cash';
      inputs.usedDepRate = '0.40';
      const res = script.calculateEngine(inputs);

      expect(res.calcYears).not.toBe(5);
      expect(document.getElementById('sticky_period').textContent).toContain(`${res.calcYears} lat`);
    });
  });

  describe('Step-by-step ledger rendering', () => {
    function runCalc(overrides = {}) {
      const inputs = {
        ...getBaseInputs(),
        pInc: 150000, pTaxForm: 'skala', financing: 'cash',
        priceB: 200000, incCar: true,
        ...overrides
      };
      const res = script.calculateEngine(inputs);
      script.renderResults(res);
    }

    it('shows pre-EV baseline tax block above year list', () => {
      runCalc();
      const body = document.getElementById('res_body');
      expect(body.innerHTML).toContain('Podatek PIT przed EV');
      expect(body.innerHTML).toContain('Próg');
    });

    it('shows PIT sub-section inside year 1 details', () => {
      runCalc();
      const body = document.getElementById('res_body');
      expect(body.innerHTML).toContain('🧮 Podatek PIT');
      expect(body.innerHTML).toContain('Stawka krańcowa');
    });

    it('shows joint-filing halfBase in PIT sub-section when jointFiling=true', () => {
      runCalc({ jointFiling: true, sInc: 80000 });
      const body = document.getElementById('res_body');
      expect(body.innerHTML).toContain('Wspólna podstawa ÷ 2');
    });

    it('exposes jointFiling on the result and uses the joint baseline branch when rendering', () => {
      const inputs = {
        ...getBaseInputs(),
        pInc: 150000, pTaxForm: 'skala', financing: 'cash',
        priceB: 200000, incCar: true,
        jointFiling: true, sInc: 80000
      };
      const res = script.calculateEngine(inputs);
      expect(res.jointFiling).toBe(true);

      runCalc({ jointFiling: true, sInc: 80000 });
      const body = document.getElementById('res_body');
      expect(body.innerHTML).toContain('Podatek należny (×2 razem)');
    });

    it('renders the correct combined/halved baseline bracket breakdown for joint filing', () => {
      runCalc({
        pTaxForm: 'skala', pSource: 'dg', pInc: 20000, pKup: 10000, pDed: 0,
        sInc: 500000, sKup: 0, sDed: 0, sSource: 'etat',
        jointFiling: true
      });
      const body = document.getElementById('res_body');
      expect(body.innerHTML).toContain('Próg II (12%): 90&nbsp;000,00&nbsp;zł');
      expect(body.innerHTML).toContain('10&nbsp;800,00&nbsp;zł');
    });

    it('shows health sub-section when pSource=dg', () => {
      runCalc({ pSource: 'dg' });
      expect(document.getElementById('res_body').innerHTML).toContain('🏥 Składka zdrowotna');
    });

    it('shows VAT sub-section when pIsVAT=true', () => {
      runCalc({ pIsVAT: true, priceB: 246000, priceN: 200000 });
      expect(document.getElementById('res_body').innerHTML).toContain('🧾 VAT');
      expect(document.getElementById('res_body').innerHTML).toContain('Zwrot VAT przy zakupie');
    });

    it('shows financing sub-section with cash outflow', () => {
      runCalc();
      const html = document.getElementById('res_body').innerHTML;
      expect(html).toContain('💳 Finansowanie');
      expect(html).toContain('Przepływ gotówkowy');
    });

    it('shows inflation sub-section when incFuel=true', () => {
      runCalc({ incFuel: true });
      expect(document.getElementById('res_body').innerHTML).toContain('📉 Inflacja');
      expect(document.getElementById('res_body').innerHTML).toContain('Oszczędność na paliwie');
    });

    it('shows investment schedule when incInv=true', () => {
      runCalc({ incInv: true });
      const html = document.getElementById('res_body').innerHTML;
      expect(html).toContain('Saldo na początku roku');
      expect(html).toContain('Transza w tym roku');
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// Phase 1 safety net — engine shield scenarios (verification R05 §5)
// Raw quantities are preferred; KUP-factored expectations carry a // D1 marker
// so the phase-4 statute alignment is a mechanical search-and-update.
// ════════════════════════════════════════════════════════════════════
describe('Engine KUP/PIT/health shield scenarios (R05 §5)', () => {
  it('§5.1 fuel consumption no longer adjusts KUP (non-VAT skala/dg)', () => {
    const res = script.calculateEngine({ ...getBaseInputs(), incFuel: true });
    const r0 = res.rows[0];
    expect(res.annualFuelSav).toBe(3750); // 7800 fuel − 4050 electricity
    expect(r0.lostFuelKUP).toBeUndefined(); // mechanism removed — no KUP correction for fuel
    // pNetY = pNet − totalKUP, independent of fuel savings.
    expect(r0.pNetY).toBeCloseTo(res.pNet - r0.totalKUP, 2);
    const noFuel = script.calculateEngine({ ...getBaseInputs(), incFuel: false });
    expect(r0.pNetY).toBeCloseTo(noFuel.rows[0].pNetY, 2); // incFuel does not change the tax base
  });

  it('§5.2 health floor limits healthSav (liniowy, pInc 120 000)', () => {
    const res = script.calculateEngine({ ...getBaseInputs(), pTaxForm: 'liniowy', pInc: 120000 });
    const r0 = res.rows[0];
    expect(r0.pHealthBeforeY).toBe(5880); // 120000 × 0.049
    expect(r0.pHealthAfterY).toBe(5190.48); // floored — not 4.9% × KUP
    expect(r0.healthSav).toBeCloseTo(689.52, 2);
  });

  it('§5.3 skala bracket crossing (partial 32%/12% shield)', () => {
    const res = script.calculateEngine({ ...getBaseInputs(), pInc: 140000 });
    const r0 = res.rows[0];
    expect(r0.depKUP).toBeCloseTo(40000, 2); // D1: amortyzacja w pełni KUP (statute alignment)
    expect(r0.totalKUP).toBeCloseTo(r0.depKUP + r0.opKUP, 2); // 45250 = depreciation 40000 + operating KUP 5250 (read from engine)
    expect(r0.pNetY).toBeCloseTo(res.pNet - r0.totalKUP, 2); // 94750 — crosses the 120 000 boundary
    const above = res.pNet - 120000; // 20000 taxed at 32%
    const below = 120000 - r0.pNetY; // 25250 taxed at 12%
    expect(r0.taxSav).toBeCloseTo(above * 0.32 + below * 0.12, 2); // 9430
    const ratio = r0.taxSav / r0.totalKUP;
    expect(ratio).toBeGreaterThan(0.12);
    expect(ratio).toBeLessThan(0.32); // neither pure bracket — genuinely crosses
  });

  it('§5.5 incCar:false zeros all KUP and savings', () => {
    const res = script.calculateEngine({ ...getBaseInputs(), incCar: false });
    const r0 = res.rows[0];
    expect(r0.totalKUP).toBe(0);
    expect(res.cumTaxSav).toBe(0);
    expect(res.cumHealthSav).toBe(0);
    expect(r0.taxBaseAfter).toBe(r0.taxBaseBefore);
  });

  it('§5.6 ryczałt tier immune to car costs at the 300 000 boundary', () => {
    const res = script.calculateEngine({ ...getBaseInputs(), pTaxForm: 'ryczalt', pInc: 310000, incCar: true });
    res.rows.forEach(r => expect(r.healthDetail.tier).toBe('> 300 000 zł'));
    expect(res.cumHealthSav).toBe(0);
  });

  it('§5.7 wasted deduction under joint filing (low taxpayer income)', () => {
    const res = script.calculateEngine({ ...getBaseInputs(), jointFiling: true, pInc: 12000, sInc: 150000 });
    const r0 = res.rows[0];
    expect(r0.pNetY).toBe(0); // taxpayer net fully consumed
    expect(r0.taxBaseAfter).toBe(res.sNet); // spouse income untouched (150 000)
    expect(r0.lostIncKUP).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// Phase 1 safety net — financing cashflows (verification R06 §5)
// Cashflow/placement values are gross outflows (D1-proof); only fee KUP carries // D1.
// ════════════════════════════════════════════════════════════════════
describe('Financing cashflow & placement scenarios (R06 §5)', () => {
  it('§6.1 leasing fin cashflow placement — previously no numeric assertion', () => {
    const res = script.calculateEngine({
      ...getBaseInputs(), carType: 'new', financing: 'leasing', lType: 'fin',
      priceN: 120000, priceB: 147600, lD: 20000, lM: 36, lI: 3000, lB: 10000, upfront: 0
    });
    expect(res.rows.map(r => r.cashOutflowY)).toEqual([68880, 44280, 56580, 0, 0]);
    expect(res.totalFinCost).toBe(169740); // (20000 + 3000×36 + 10000) × 1.23
  });

  it('§6.2 credit 3x33 cashflow, fee KUP and tranche labels', () => {
    const res = script.calculateEngine({
      ...getBaseInputs(), carType: 'new', financing: 'credit', cType: '3x33',
      priceB: 300000, priceN: 300000, fee: 3000, upfront: 0
    });
    expect(res.rows.map(r => r.cashOutflowY)).toEqual([103200, 99900, 99900, 0, 0]);
    expect(res.totalFinCost).toBe(303000);
    expect(res.rows[0].intKUP).toBeCloseTo(3000, 2); // D1: prowizja (koszt finansowania) w pełni KUP
    expect(res.rows[0].tranchesY).toEqual([
      { label: 'Wpłata I (33% ceny)', amount: 100200 },
      { label: 'Prowizja', amount: 3000 }
    ]);
    expect(res.rows[1].tranchesY[0]).toEqual({ label: 'Wpłata II (33% ceny)', amount: 99900 });
    expect(res.rows[2].tranchesY[0]).toEqual({ label: 'Wpłata III (33% ceny, reszta)', amount: 99900 });
  });

  it('§6.3 credit 5050 cashflow', () => {
    const res = script.calculateEngine({
      ...getBaseInputs(), carType: 'new', financing: 'credit', cType: '5050',
      priceB: 200000, priceN: 200000, fee: 2000, upfront: 0
    });
    expect(res.rows.map(r => r.cashOutflowY)).toEqual([102000, 100000, 0, 0, 0]);
  });

  it('§6.4 oper leasing lM=30 cashflow & instalment counts', () => {
    const res = script.calculateEngine({
      ...getBaseInputs(), carType: 'new', financing: 'leasing', lType: 'oper',
      lD: 10000, lI: 2000, lM: 30, lB: 20000
    });
    // year-2 (index 2): 6 × 2000 × 1.23 + 20000 × 1.23 = 39360
    expect(res.rows[2].cashOutflowY).toBeCloseTo(39360, 2);
    expect(res.rows.map(r => r.leasingInstCnt)).toEqual([12, 12, 6, 0, 0]);
  });

  it('§6.5 oper leasing VAT factors', () => {
    const res = script.calculateEngine({
      ...getBaseInputs(), carType: 'new', financing: 'leasing', lType: 'oper',
      pIsVAT: true, priceN: 300000, priceB: 369000, lD: 20000, lI: 3000, lM: 36, lB: 10000
    });
    expect(res.rows[0].propFactor).toBeCloseTo(225000 / 334500, 4); // ≈ 0.6726
    expect(res.rows[0].leasingVatFactor).toBe(1.115);
  });

  it('§6.6 credit standard cM=18 cashflow', () => {
    const res = script.calculateEngine({
      ...getBaseInputs(), carType: 'new', financing: 'credit', cType: 'standard',
      priceB: 200000, priceN: 200000, cD: 40000, cIB: 9200, cM: 18, cR: 0.1
    });
    expect(res.rows.map(r => r.cashOutflowY)).toEqual([150400, 55200, 0, 0, 0]);
  });

  it('§6.7 financing boundaries: no fee tranche; lM=84 → 7 years', () => {
    const noFee = script.calculateEngine({
      ...getBaseInputs(), carType: 'new', financing: 'credit', cType: '3x33',
      priceB: 200000, priceN: 200000, fee: 0, upfront: 0
    });
    expect(noFee.rows[0].tranchesY.some(t => t.label === 'Prowizja')).toBe(false);
    expect(noFee.rows[0].intKUP).toBe(0);
    const long = script.calculateEngine({
      ...getBaseInputs(), carType: 'new', financing: 'leasing', lType: 'oper',
      lD: 0, lI: 2000, lM: 84, lB: 0
    });
    expect(long.calcYears).toBe(7);
  });

  it('§6.8 totalFinCost per financing model', () => {
    const base = { ...getBaseInputs(), priceB: 200000, priceN: 200000, upfront: 5000 };
    expect(script.calculateEngine({ ...base, financing: 'cash' }).totalFinCost).toBe(205000); // priceB + upfront
    expect(script.calculateEngine({ ...base, financing: 'leasing', lType: 'oper', lD: 20000, lI: 3000, lM: 36, lB: 10000 }).totalFinCost)
      .toBeCloseTo((20000 + 3000 * 36 + 10000) * 1.23 + 5000, 2); // 174740
    expect(script.calculateEngine({ ...base, financing: 'credit', cType: 'standard', cD: 40000, cIB: 5000, cM: 36 }).totalFinCost)
      .toBe(40000 + 5000 * 36 + 5000); // 225000
    expect(script.calculateEngine({ ...base, financing: 'credit', cType: '5050', fee: 2000 }).totalFinCost).toBe(207000); // priceB + fee + upfront
    expect(script.calculateEngine({ ...base, financing: 'credit', cType: '3x33', fee: 2000 }).totalFinCost).toBe(207000);
  });
});
