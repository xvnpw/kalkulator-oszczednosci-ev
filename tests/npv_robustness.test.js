// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { calculateEngine } from '../script.js';

const baseInputs = {
  carType: 'new',
  financing: 'cash',
  pInc: 200000,
  pKup: 0,
  pDed: 0,
  pTaxForm: 'skala',
  pSource: 'dg',
  pIsVAT: false,
  jointFiling: false,
  priceB: 200000,
  priceN: 200000,
  usedVat: 'gross_only',
  insurB: 5000,
  maintB: 2000,
  upfront: 0,
  lType: 'oper',
  lD: 20000,
  lB: 10000,
  lM: 36,
  lI: 3000,
  cType: 'standard',
  cD: 50000,
  cIB: 5000,
  cM: 36,
  cR: 0.1,
  fee: 0,
  inflation: 0.0,
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

describe('NPV TCO calculations robustness & verification', () => {

  // Rule 1: Verify that standard credit/leasing under positive inflation rates produces a lower real TCO (effectiveCost) than under 0% inflation.
  it('should verify standard credit under positive inflation produces lower real TCO than under 0% inflation when tax savings are excluded', () => {
    const inputsCreditNoInfl = {
      ...baseInputs,
      financing: 'credit',
      cType: 'standard',
      incCar: false, // exclude car tax deductions to avoid asymmetry from discounted tax savings
      inflation: 0.0
    };
    const inputsCreditWithInfl = {
      ...inputsCreditNoInfl,
      inflation: 0.05
    };

    const resNoInfl = calculateEngine(inputsCreditNoInfl);
    const resWithInfl = calculateEngine(inputsCreditWithInfl);

    // With positive inflation, real financial cost is lower.
    expect(resWithInfl.cumRealFinCost).toBeLessThan(resNoInfl.cumRealFinCost);
    // Real TCO (effectiveCost) should also be lower under positive inflation when there are no tax savings.
    expect(resWithInfl.effectiveCost).toBeLessThan(resNoInfl.effectiveCost);
  });

  it('should document that standard credit under positive inflation can have higher TCO if tax savings are included and discounted over a longer period than outflows', () => {
    // Insurance/maintenance are zeroed to isolate the documented mechanism: tax savings
    // (depreciation) spread over 5 years while outflows are paid over 3. With insur/maint
    // included they are now real-discounted too (phase 2 §4), and for this scenario that
    // discount happens to outweigh the tax-timing penalty — which would mask the effect.
    const inputsCreditNoInfl = {
      ...baseInputs,
      financing: 'credit',
      cType: 'standard',
      incCar: true,
      pTaxForm: 'skala',
      insurB: 0, maintB: 0,
      inflation: 0.0
    };
    const inputsCreditWithInfl = {
      ...inputsCreditNoInfl,
      inflation: 0.05
    };

    const resNoInfl = calculateEngine(inputsCreditNoInfl);
    const resWithInfl = calculateEngine(inputsCreditWithInfl);

    // Financing cost is discounted, which reduces TCO:
    expect(resWithInfl.cumRealFinCost).toBeLessThan(resNoInfl.cumRealFinCost);
    // But tax savings are also discounted (meaning we get less real tax relief in years 1-5).
    // Because tax savings are spread over 5 years while outflows are paid over 3 years,
    // the loss in real tax savings outweighs the financing discount, so effectiveCost increases.
    expect(resWithInfl.effectiveCost).toBeGreaterThan(resNoInfl.effectiveCost);
  });

  it('should verify standard leasing under positive inflation produces lower real TCO than under 0% inflation', () => {
    const inputsLeaseNoInfl = {
      ...baseInputs,
      financing: 'leasing',
      lType: 'oper',
      inflation: 0.0
    };
    const inputsLeaseWithInfl = {
      ...inputsLeaseNoInfl,
      inflation: 0.05
    };

    const resNoInfl = calculateEngine(inputsLeaseNoInfl);
    const resWithInfl = calculateEngine(inputsLeaseWithInfl);

    // With positive inflation, real financial cost is lower.
    expect(resWithInfl.cumRealFinCost).toBeLessThan(resNoInfl.cumRealFinCost);
    // Real TCO is also lower under positive inflation.
    expect(resWithInfl.effectiveCost).toBeLessThan(resNoInfl.effectiveCost);
  });

  // Rule 2: Verify that cash outflows at year 0 are not discounted under any inflation rates.
  it('should verify year 0 cash outflows are not discounted under any inflation rates', () => {
    // Under cash financing, all cash outflows are at year 0.
    const inflationRates = [-0.5, -0.05, 0.0, 0.05, 0.5, 10.0, 1000.0];
    
    for (const infl of inflationRates) {
      const inputs = {
        ...baseInputs,
        financing: 'cash',
        inflation: infl,
        upfront: 5000,
        priceB: 200000
      };
      
      const res = calculateEngine(inputs);
      const expectedYear0Outflow = res.totalFinCost; // priceB + upfront = 205000
      expect(res.cumRealFinCost).toBeCloseTo(expectedYear0Outflow);
    }
  });

  // Rule 3: Test edge cases such as extremely high inflation, zero inflation, or negative inflation (deflation), and check if formulas are robust.
  it('should handle zero inflation correctly', () => {
    const inputs = {
      ...baseInputs,
      financing: 'leasing',
      inflation: 0.0
    };
    const res = calculateEngine(inputs);
    expect(res.cumRealFinCost).toBe(res.totalFinCost);
    expect(res.effectiveCost).not.toBeNaN();
    expect(isFinite(res.effectiveCost)).toBe(true);
  });

  it('should handle extremely high inflation correctly (e.g. 1000 = 100,000% inflation) without division by zero or NaN', () => {
    const inputs = {
      ...baseInputs,
      financing: 'leasing',
      inflation: 1e6
    };
    const res = calculateEngine(inputs);
    // Under massive inflation, future cash flows discount to ~0, so cumRealFinCost should equal the year 0 cash outflow.
    // Year 0 cash outflow for leasing includes downpayment (lD*1.23) + upfront + first year installments (lI*12*1.23)
    const year0Outflow = baseInputs.lD * 1.23 + baseInputs.upfront + baseInputs.lI * 12 * 1.23;
    expect(res.cumRealFinCost).toBeCloseTo(year0Outflow, 1);
    expect(res.effectiveCost).not.toBeNaN();
    expect(isFinite(res.effectiveCost)).toBe(true);
  });

  it('should handle negative inflation (deflation) correctly (e.g., -5% and -50%) without division by zero or NaN', () => {
    const deflationRates = [-0.05, -0.5];
    for (const defl of deflationRates) {
      const inputs = {
        ...baseInputs,
        financing: 'leasing',
        inflation: defl
      };
      const res = calculateEngine(inputs);
      // Under deflation, money increases in value, so real cost > nominal cost.
      expect(res.cumRealFinCost).toBeGreaterThan(res.totalFinCost);
      expect(res.effectiveCost).not.toBeNaN();
      expect(isFinite(res.effectiveCost)).toBe(true);
    }
  });

  it('D4: inflation = -1.0 (−100%) throws RangeError instead of returning NaN/garbage', () => {
    // Previously this returned NaN (division by 1+(-1)=0); the guard now fails fast.
    expect(() => calculateEngine({ ...baseInputs, financing: 'leasing', inflation: -1.0 }))
      .toThrow(RangeError);
  });

  it('D4: inflation below -100% (e.g. -1.5) also throws RangeError', () => {
    expect(() => calculateEngine({ ...baseInputs, financing: 'leasing', inflation: -1.5 }))
      .toThrow(RangeError);
  });

  it('D4: the guard fires before the investment-alternative path (incInv:true variant)', () => {
    // incInv:true reaches invReal = invGross / (1+inflation)^calcYears = .../0 — never exercised now.
    expect(() => calculateEngine({ ...baseInputs, financing: 'leasing', inflation: -1.0, incInv: true }))
      .toThrow(RangeError);
  });

  it('D4: investReturn ≤ -100% with incInv throws (same compounding failure mode)', () => {
    expect(() => calculateEngine({ ...baseInputs, financing: 'leasing', incInv: true, investReturn: -1.0 }))
      .toThrow(RangeError);
  });

  it('D4: valid deflation (-0.5) is accepted, not rejected by the guard', () => {
    const res = calculateEngine({ ...baseInputs, financing: 'leasing', inflation: -0.5 });
    expect(res.cumRealFinCost).toBeGreaterThan(res.totalFinCost);
    expect(isFinite(res.effectiveCost)).toBe(true);
  });
});
