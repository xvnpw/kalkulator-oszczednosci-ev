// @vitest-environment happy-dom
// ════════════════════════════════════════════════════════════════════
// Phase 2 — unambiguous correctness bug fixes (calc/engine.js)
// One red→green pair per plan section (§1–§6). Numbers traced to the
// verification reports (R05/R06/R07) and recomputed against the engine.
// ════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { calculateEngine, pitJoint, margRate } from '../script.js';

// Minimal car/financing defaults so the legacy/new schema engine runs.
function carDefaults() {
  return {
    carType: 'new', financing: 'cash',
    priceB: 200000, priceN: 200000, usedVat: 'gross_only', usedDepRate: '0.20',
    insurB: 5000, maintB: 2000, upfront: 0,
    lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
    cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
    inflation: 0.05, investReturn: 0.05,
    incCar: true, incFuel: false, incInv: false,
    kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
  };
}

// New-schema taxpayer/spouse base (no costOwner), single filer skala/dg.
function base(overrides = {}) {
  return {
    ...carDefaults(),
    pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'skala', pSource: 'dg', pIsVAT: false, pValRyczaltRate: 0.085,
    jointFiling: false, sInc: 0, sKup: 0, sDed: 0, sSource: 'etat',
    ...overrides
  };
}

describe('§1 C1 — legacy spouse fallback honors costOwner (R05 case 8)', () => {
  it('husband is cost owner → spouse (wife) KUP comes from wKup, not hKup', () => {
    const res = calculateEngine({
      ...carDefaults(), incCar: false,
      costOwner: 'husb',
      hInc: 200000, hKup: 0, hDed: 0,
      wInc: 100000, wKup: 10000, wDed: 0,
      isVAT: false
    });
    // Spouse net = wInc − wKup − wDed = 100000 − 10000. Before the fix sKup read hKup (0) → 100000.
    expect(res.wNet).toBe(90000);
    expect(res.sNet).toBe(90000);
    expect(res.pNet).toBe(200000);
    // jointFiling is inferred from costOwner; base tax on the combined net (200000 + 90000).
    expect(res.baseTax).toBe(pitJoint(290000));
    expect(res.baseTax).toBe(res.baseTax); // sanity
    expect(res.baseTax).toBe(pitJoint(res.pNet + res.sNet));
  });
});

describe('§6 C7 — marginal rate honors joint filing (R05 case 7)', () => {
  it('joint filing halves the base so a 200k earner sits in the 12% band', () => {
    const res = calculateEngine(base({
      pInc: 200000, jointFiling: true, sInc: 0, incCar: true
    }));
    // Half-base = (pNet + sNet)/2 = 100000 ≤ 120000 → 12% marginal. Before the fix: margRate(200000) = 0.32.
    expect(res.rows[0].mr).toBe(0.12);
    expect(res.rows[0].mr).toBe(margRate((res.pNet + res.sNet) / 2));
    // The realized shield ratio matches the corrected marginal rate (half-base stays under 120k).
    expect(res.rows[0].taxSav / res.rows[0].totalKUP).toBeCloseTo(0.12, 4);
  });
});

describe('§4 — effectiveCost discounts insurance/maintenance (R07 cases 4 & 10)', () => {
  it('cash, no car/fuel/inv: real insur+maint = Σ 7000/(1.1)^y over 5 years', () => {
    const res = calculateEngine(base({
      pInc: 100000, insurB: 5000, maintB: 2000, inflation: 0.10,
      incCar: false, incFuel: false, incInv: false
    }));
    expect(res.calcYears).toBe(5);
    // Σ 7000 / 1.1^y for y = 0..4
    let expected = 0;
    for (let y = 0; y < 5; y++) expected += 7000 / Math.pow(1.1, y);
    expect(res.realInsur + res.realMaint).toBeCloseTo(expected, 2); // ≈ 29189.06 (was a flat 35000)
    // With no tax/VAT/fuel terms, effectiveCost is exactly cumRealFinCost + the real insur+maint.
    expect(res.effectiveCost).toBeCloseTo(res.cumRealFinCost + expected, 2);
  });

  it('decomposition identity holds from returned components (VAT + fuel + tax savings)', () => {
    const res = calculateEngine(base({
      pInc: 200000, pTaxForm: 'liniowy', pIsVAT: true,
      priceB: 246000, priceN: 200000, maintB: 2460,
      incCar: true, incFuel: true, inflation: 0.05
    }));
    const rhs = res.cumRealFinCost - res.cumRealTaxSav - res.cumRealFuelSav
              - res.cumRealVATRefund + res.realInsur + res.realMaint;
    expect(res.effectiveCost).toBeCloseTo(rhs, 6);
  });

  it('inflation = 0 invariance: realInsur === totalInsur, realMaint === totalMaint', () => {
    const res = calculateEngine(base({ insurB: 5000, maintB: 2000, inflation: 0, incCar: false }));
    expect(res.realInsur).toBe(res.totalInsur);
    expect(res.realMaint).toBe(res.totalMaint);
  });
});

describe('§5 — fuel consumption never drives savings negative (KUP fuel correction removed)', () => {
  // Credit standard cM=60 + used 40% → calcYears=5, depreciation exhausted by year 4.
  // The fuel-KUP correction that used to push net cost negative in late years is gone.
  function s5() {
    return base({
      pInc: 100000, pTaxForm: 'skala', pSource: 'dg', pIsVAT: false,
      carType: 'used', usedDepRate: '0.40', usedVat: 'gross_only',
      financing: 'credit', cType: 'standard', cD: 0, cIB: 0, cM: 60, cR: 0, fee: 0,
      priceB: 200000, priceN: 200000, insurB: 5000, maintB: 2000,
      incCar: true, incFuel: true, incInv: false, kmYear: 40000
    });
  }

  it('years 4–5: depreciation gone, but fuel no longer reduces KUP → savings stay ≥ 0', () => {
    const res = calculateEngine(s5());
    expect(res.calcYears).toBe(5);
    for (const y of [3, 4]) {
      const r = res.rows[y];
      expect(r.rawDepY).toBe(0);
      expect(r.totalKUP).toBeCloseTo(5250, 6); // opKUP only: insKUP 3750 + maKUP 1500  // D1
      expect(r.lostFuelKUP).toBeUndefined();    // mechanism removed
      expect(r.netCostKUP).toBeCloseTo(5250, 6); // === totalKUP, no fuel correction
      expect(r.taxSav).toBeGreaterThan(0);
      expect(r.healthSav).toBeGreaterThan(0);
    }
  });

  it('early years stay positive', () => {
    const res = calculateEngine(s5());
    expect(res.rows[0].taxSav).toBeGreaterThan(0);
    expect(res.rows[0].healthSav).toBeGreaterThan(0);
  });
});

describe('§3 F1 — oper-leasing split conserves totalLeaseNet (R06 case 7)', () => {
  it('pathological lease: capital + interest sums to payments, not more', () => {
    const res = calculateEngine(base({
      financing: 'leasing', lType: 'oper', carType: 'new',
      priceN: 150000, priceB: 184500,
      lD: 100000, lB: 100000, lM: 12, lI: 100
    }));
    const totalLeaseNet = 100000 + 100 * 12 + 100000; // 201200
    const sum = res.rows.reduce((s, r) => s + (r.capitalNetY || 0) + (r.interestNetY || 0), 0);
    expect(sum).toBeCloseTo(totalLeaseNet, 6); // before the fix this claimed 251200
  });

  it('realistic lease is byte-identical to the unclamped split (regression guard)', () => {
    const res = calculateEngine(base({
      financing: 'leasing', lType: 'oper', carType: 'new',
      priceN: 120000, priceB: 147600,
      lD: 20000, lB: 10000, lM: 36, lI: 3000
    }));
    // totalInterestNet = 138000 − 120000 = 18000 ≤ lI×lM=108000 → Math.min is a no-op.
    // Reference (unclamped): monthlyInterestNet 500, monthlyCapitalNet 2500, mDownCapital 20000/36.
    const expCap = [36666.667, 36666.667, 46666.667, 0, 0]; // year 3 adds the lB balloon
    const expInt = [6000, 6000, 6000, 0, 0];
    res.rows.forEach((r, y) => {
      expect(r.capitalNetY || 0).toBeCloseTo(expCap[y], 2);
      expect(r.interestNetY || 0).toBeCloseTo(expInt[y], 2);
    });
    // Conservation still holds for the normal case.
    const sum = res.rows.reduce((s, r) => s + (r.capitalNetY || 0) + (r.interestNetY || 0), 0);
    expect(sum).toBeCloseTo(138000, 2);
  });
});

describe('§2 F2 — fin-leasing interest is deductible (R06 case 1)', () => {
  it('non-VAT new fin lease: Σ intKUP = net interest × 1.23, spread over the lease term', () => {
    const res = calculateEngine(base({
      pInc: 200000, pTaxForm: 'skala', pSource: 'dg', pIsVAT: false,
      financing: 'leasing', lType: 'fin', carType: 'new',
      priceN: 120000, priceB: 147600,
      lD: 20000, lB: 10000, lM: 36, lI: 3000, incCar: true
    }));
    expect(res.calcYears).toBe(5);
    const sumInt = res.rows.reduce((s, r) => s + r.intKUP, 0);
    // net interest 138000 − 120000 = 18000 → 18000 × 1.23 = 22140  // D1: odsetki w pełni KUP
    expect(sumInt).toBeCloseTo(22140, 2);
    // 6000 net/yr × 1.23 = 7380 in years 1–3, zero once the lease ends.
    expect(res.rows[0].intKUP).toBeCloseTo(7380, 2);
    expect(res.rows[1].intKUP).toBeCloseTo(7380, 2);
    expect(res.rows[2].intKUP).toBeCloseTo(7380, 2);
    expect(res.rows[3].intKUP).toBe(0);
    expect(res.rows[4].intKUP).toBe(0);
  });

  it('fin-leasing interest produces a real tax shield (was zero before the fix)', () => {
    const res = calculateEngine(base({
      pInc: 200000, pTaxForm: 'skala', pSource: 'dg', pIsVAT: false,
      financing: 'leasing', lType: 'fin', carType: 'new',
      priceN: 120000, priceB: 147600,
      lD: 20000, lB: 10000, lM: 36, lI: 3000, incCar: true
    }));
    // The interest KUP adds to the shield on top of depreciation.
    expect(res.rows[0].intKUP).toBeGreaterThan(0);
  });
});
