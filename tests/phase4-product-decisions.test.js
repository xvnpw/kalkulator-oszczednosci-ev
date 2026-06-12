// @vitest-environment happy-dom
// ════════════════════════════════════════════════════════════════════
// Phase 4 — product-decision items (D1b insurance regime, D2 health deduction).
// D1 (remove ×0.75 from non-operating costs) is covered by the mechanically-updated
// // D1 markers across calculations/e2e/phase2/phase3; this file pins the two findings
// that introduce genuinely new tax behavior. Numbers re-derived by hand from statute.
// ════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { calculateEngine, pitLiniowy } from '../script.js';

const MIN_HEALTH = 4806 * 0.09 * 12; // 5190.48
const AVG_WAGE = 9228.64;

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

function base(overrides = {}) {
  return {
    ...carDefaults(),
    pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'skala', pSource: 'dg', pIsVAT: false, pValRyczaltRate: 0.085,
    jointFiling: false, sInc: 0, sKup: 0, sDed: 0, sSource: 'etat',
    ...overrides
  };
}

// ── D1b — insurance value-proportion cap (art. 23 ust. 1 pkt 47) ───────────────
describe('D1b — insurance KUP capped by min(1, 150000 / car value)', () => {
  it('non-VAT, car value = cap (150 000): factor 1.0 → full premium deductible', () => {
    const res = calculateEngine(base({ pIsVAT: false, priceB: 150000, priceN: 150000, insurB: 5000 }));
    expect(res.insKUP).toBeCloseTo(5000, 6); // was 3750 under the flat 75%
  });

  it('non-VAT, car value 300 000: factor 0.5 → half the premium deductible', () => {
    const res = calculateEngine(base({ pIsVAT: false, priceB: 300000, priceN: 300000, insurB: 8000 }));
    expect(res.insKUP).toBeCloseTo(8000 * 150000 / 300000, 6); // 4000
  });

  it('non-VAT, car value 200 000: factor 0.75 — coincides with the old flat rate', () => {
    const res = calculateEngine(base({ pIsVAT: false, priceB: 200000, priceN: 200000, insurB: 5000 }));
    expect(res.insKUP).toBeCloseTo(3750, 6); // the one point where flat 75% was law-correct
  });

  it('VAT payer new car: car value = priceN + 50% VAT (same basis as oper carValueKUP)', () => {
    const res = calculateEngine(base({ pIsVAT: true, carType: 'new', priceN: 200000, priceB: 246000, insurB: 5000 }));
    // insCarValue = 200000 + 46000×0.5 = 223000 → factor 150000/223000
    expect(res.insKUP).toBeCloseTo(5000 * 150000 / 223000, 4); // ≈ 3363.23
  });

  it('guard: car value 0 → factor 1.0 (full premium), no division by zero', () => {
    const res = calculateEngine(base({ pIsVAT: false, priceB: 0, priceN: 0, insurB: 1000 }));
    expect(res.insKUP).toBeCloseTo(1000, 6);
  });
});

// ── D2 — liniowy health deduction (≤ 14 100) + ryczałt 50% health + pDed ───────
describe('D2 — liniowy health-deduction limit (14 100 zł / 2026)', () => {
  it('baseline: pInc 200 000 → health 9800 (< limit) deducted from the PIT base', () => {
    const res = calculateEngine(base({ pTaxForm: 'liniowy', pInc: 200000, pKup: 0, pDed: 0, incCar: false }));
    expect(res.pHealthBefore).toBeCloseTo(9800, 6); // 200000 × 0.049, above the 5190.48 floor
    expect(res.baseTax).toBeCloseTo(pitLiniowy(200000 - 9800), 6); // (200000 − 9800) × 0.19 = 36138 (was 38000)
    expect(res.baseTax).toBeCloseTo(36138, 6);
  });

  it('limit binds: pInc 400 000 → health 19 600 > 14 100 → deduction capped at 14 100', () => {
    const res = calculateEngine(base({ pTaxForm: 'liniowy', pInc: 400000, incCar: false }));
    expect(res.pHealthBefore).toBeCloseTo(19600, 6);
    expect(res.baseTax).toBeCloseTo(pitLiniowy(400000 - 14100), 6); // 73321
    expect(res.baseTax).toBeCloseTo(73321, 6);
  });

  it('clawback: KUP shrinks health → the PIT base shrinks less, modeled saving claws back ~19% of ΔH', () => {
    const res = calculateEngine(base({ pTaxForm: 'liniowy', pInc: 300000, incCar: true, incFuel: false }));
    const K = res.rows[0].totalKUP; // 45250, no fuel
    expect(K).toBeCloseTo(45250, 6);
    // Deductions: min(health, 14100). Baseline health 14700 → capped at 14100; after-health uncapped.
    const dedBefore = Math.min(Math.max(MIN_HEALTH, 300000 * 0.049), 14100);          // 14100
    const dedAfter  = Math.min(Math.max(MIN_HEALTH, (300000 - K) * 0.049), 14100);    // 12482.75
    const baseTax = (300000 - dedBefore) * 0.19;
    const taxWith = ((300000 - K) - dedAfter) * 0.19;
    expect(res.baseTax).toBeCloseTo(baseTax, 4);              // 54321
    expect(res.rows[0].taxSav).toBeCloseTo(baseTax - taxWith, 4); // 8290.2225, < naive K×0.19 + ΔH
    expect(res.rows[0].healthSav).toBeCloseTo(14700 - (300000 - K) * 0.049, 4); // 2217.25
    // The clawback is real: modeled benefit < the no-deduction shorthand K×0.19 + ΔH.
    const naive = K * 0.19 + res.rows[0].healthSav;
    expect(res.rows[0].taxSav + res.rows[0].healthSav).toBeLessThan(naive);
  });

  it('floor interaction: health on the floor before and after → deduction constant, taxSav = K × 19%', () => {
    const res = calculateEngine(base({ pTaxForm: 'liniowy', pInc: 80000, incCar: true, incFuel: false }));
    const K = res.rows[0].totalKUP; // 45250
    // 80000×0.049=3920 and (80000−45250)×0.049=1702.75 are both below the 5190.48 floor.
    expect(res.rows[0].pHealthBeforeY).toBeCloseTo(MIN_HEALTH, 2);
    expect(res.rows[0].pHealthAfterY).toBeCloseTo(MIN_HEALTH, 2);
    expect(res.rows[0].healthSav).toBeCloseTo(0, 6);
    // Constant deduction cancels out → pure 19% shield on the KUP, no clawback term.
    expect(res.rows[0].taxSav).toBeCloseTo(K * 0.19, 4); // 8597.5
  });
});

describe('D2 — ryczałt deducts pDed + 50% of paid health from revenue (savings stay 0)', () => {
  it('baseline: pInc 100 000, pDed 0, rate 8.5% → revenue − 50% health', () => {
    const res = calculateEngine(base({ pTaxForm: 'ryczalt', pInc: 100000, pDed: 0, pValRyczaltRate: 0.085, incCar: true }));
    const health = 0.09 * 1.00 * AVG_WAGE * 12; // tier 2 (60k–300k) = 9966.9312
    expect(res.pHealthBefore).toBeCloseTo(9966.93, 2);
    expect(res.baseTax).toBeCloseTo((100000 - 0.5 * health) * 0.085, 4); // ≈ 8076.41 (was 8500)
    expect(res.baseTax).toBeCloseTo(8076.41, 2);
    // Ryczałt never deducts car KUP and its health tier is pinned to revenue → no savings.
    expect(res.cumTaxSav).toBeCloseTo(0, 6);
    expect(res.cumHealthSav).toBe(0);
  });

  it('pDed (social contributions) now reduces the ryczałt base too (R05 §3.3 gap closed)', () => {
    const health = 0.09 * 1.00 * AVG_WAGE * 12;
    const noDed = calculateEngine(base({ pTaxForm: 'ryczalt', pInc: 100000, pDed: 0, pValRyczaltRate: 0.085, incCar: false }));
    const withDed = calculateEngine(base({ pTaxForm: 'ryczalt', pInc: 100000, pDed: 10000, pValRyczaltRate: 0.085, incCar: false }));
    expect(withDed.baseTax).toBeCloseTo((100000 - 10000 - 0.5 * health) * 0.085, 4);
    expect(noDed.baseTax - withDed.baseTax).toBeCloseTo(10000 * 0.085, 4); // pDed shrinks the base by itself × rate
  });
});

// ── Acceptance — skala is untouched by D2 (no health deduction on the scale) ────
describe('Acceptance — skala baseline unaffected by D2', () => {
  it('skala baseTax stays the plain progressive tax on pNet (no health deduction)', () => {
    const res = calculateEngine(base({ pTaxForm: 'skala', pInc: 200000, incCar: false }));
    // pit(200000) = 90000×0.12 + 80000×0.32 = 36400
    expect(res.baseTax).toBeCloseTo(36400, 6);
  });
});
