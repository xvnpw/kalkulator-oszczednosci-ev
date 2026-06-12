// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { pit, pitJoint, margRate, depSchedule, interestSchedule, calculateEngine, pitLiniowy, pitRyczalt, calculateIndividualPit, calculateHealthContribution } from '../script.js';
// Not in the script.js re-export barrel — imported from the calc modules directly.
import { skalaBreakdown, buildAfterBrackets } from '../calc/pit.js';
import { healthContribDetail } from '../calc/health.js';
import { interestAmortSchedule } from '../calc/schedules.js';

describe('PIT Calculations (2026 Scale)', () => {
  it('should return 0 for income <= 30000', () => {
    expect(pit(0)).toBe(0);
    expect(pit(15000)).toBe(0);
    expect(pit(30000)).toBe(0);
  });

  it('should calculate 12% for income between 30000 and 120000', () => {
    // (40000 - 30000) * 0.12 = 1200
    expect(pit(40000)).toBe(1200);
    // (120000 - 30000) * 0.12 = 10800
    expect(pit(120000)).toBe(10800);
  });

  it('should calculate 32% for income above 120000', () => {
    // 10800 + (130000 - 120000) * 0.32 = 10800 + 3200 = 14000
    expect(pit(130000)).toBe(14000);
  });

  it('should calculate joint PIT correctly', () => {
    // Joint income 200000 -> 100000 each
    // pit(100000) = (100000 - 30000) * 0.12 = 8400
    // pitJoint(200000) = 8400 * 2 = 16800
    expect(pitJoint(200000)).toBe(16800);
  });

  it('should return correct marginal rate', () => {
    expect(margRate(20000)).toBe(0);
    expect(margRate(50000)).toBe(0.12);
    expect(margRate(150000)).toBe(0.32);
  });
});

describe('Depreciation Schedule', () => {
  it('should calculate annual depreciation correctly for 5 years at 20%', () => {
    const base = 100000;
    const rate = 0.20;
    const months = 60;
    const years = 5;
    const schedule = depSchedule(base, rate, months, years);
    expect(schedule).toHaveLength(5);
    expect(schedule[0]).toBe(20000);
    expect(schedule[4]).toBe(20000);
  });

  it('should handle partial years correctly', () => {
    const base = 100000;
    const rate = 0.40;
    const months = 30; // 2.5 years
    const years = 3;
    const schedule = depSchedule(base, rate, months, years);
    expect(schedule).toHaveLength(3);
    expect(schedule[0]).toBe(40000);
    expect(schedule[1]).toBe(40000);
    expect(schedule[2]).toBe(20000); // last 6 months
  });
});

describe('Interest Schedule', () => {
  it('should calculate annual interest correctly', () => {
    const principal = 100000;
    const monthlyRate = 0.01; // 1% per month
    const netInstallment = 5000;
    const months = 12;
    const schedule = interestSchedule(principal, monthlyRate, netInstallment, months);
    expect(schedule).toHaveLength(1);

    // Reference recurrence: month-by-month interest accrual on the declining balance.
    let bal = principal, refSum = 0;
    const monthInt = [];
    for (let m = 0; m < months; m++) {
      const int = bal * monthlyRate;
      monthInt.push(int);
      refSum += int;
      bal = Math.max(0, bal - (netInstallment - int));
    }
    // Month 1 interest: 100000 * 0.01 = 1000
    expect(monthInt[0]).toBeCloseTo(1000, 6);
    // Month 2 interest: (100000 - (5000 - 1000)) * 0.01 = 96000 * 0.01 = 960
    expect(monthInt[1]).toBeCloseTo(960, 6);
    // Year-1 sum equals the recurrence result exactly.
    expect(schedule[0]).toBeCloseTo(refSum, 6);
  });
});

describe('Main Engine Calculations', () => {
  it('should calculate core EV financials using the new taxpayer/spouse schema', () => {
    const inputs = {
      carType: 'new', financing: 'cash',
      pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'skala', pSource: 'dg', pIsVAT: false,
      jointFiling: true,
      sInc: 100000, sKup: 0, sDed: 0, sSource: 'etat',
      priceB: 200000, priceN: 200000,
      usedVat: 'gross_only',
      insurB: 5000, maintB: 2000, upfront: 0,
      lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
      cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
      inflation: 0.05, investReturn: 0.05,
      incCar: true, incFuel: false, incInv: false,
      kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
    };
    
    const res = calculateEngine(inputs);
    
    expect(res.calcYears).toBe(5);
    expect(res.rows).toHaveLength(5);
    expect(res.totalFinCost).toBe(200000);
    expect(res).toHaveProperty('cumRealFinCost');
    expect(res.cumRealFinCost).toBe(200000);
    
    expect(res.rows[0]).toHaveProperty('taxBaseBefore');
    expect(res.rows[0]).toHaveProperty('taxBaseAfter');
    expect(res).toHaveProperty('totalTaxBefore');
    expect(res).toHaveProperty('totalTaxAfter');
    expect(res).toHaveProperty('cumRealTaxSav');
    expect(res).toHaveProperty('cumRealFuelSav');
    expect(res).toHaveProperty('totalSav');
    expect(res).toHaveProperty('effectiveCost');
    expect(res.rows[0].taxBaseBefore).toBe(300000);
  });

  it('should apply 20% depreciation rate over 60 months for used cars when usedDepRate is 0.20', () => {
    const inputs = {
      carType: 'used', usedDepRate: '0.20', financing: 'cash',
      pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'skala', pSource: 'dg', pIsVAT: false,
      jointFiling: true,
      sInc: 100000, sKup: 0, sDed: 0, sSource: 'etat',
      priceB: 200000, priceN: 200000,
      usedVat: 'gross_only',
      insurB: 5000, maintB: 2000, upfront: 0,
      lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
      cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
      inflation: 0.05, investReturn: 0.05,
      incCar: true, incFuel: false, incInv: false,
      kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
    };
    
    const res = calculateEngine(inputs);
    
    expect(res.calcYears).toBe(5);
    expect(res.rows).toHaveLength(5);
  });

  it('should calculate PIT under podatek liniowy (19%) and health contribution (4.9%)', () => {
    expect(pitLiniowy(100000)).toBe(19000);
    
    // Health contribution under Liniowy (4.9% of income, min ~5190.48 PLN/year)
    // 100000 * 0.049 = 4900, which is below MIN_HEALTH (~5190.48)
    expect(calculateHealthContribution(100000, 100000, 'liniowy', 'dg')).toBeCloseTo(4806 * 0.09 * 12);
    // 200000 * 0.049 = 9800, which is above MIN_HEALTH
    expect(calculateHealthContribution(200000, 200000, 'liniowy', 'dg')).toBe(9800);
  });

  it('should calculate PIT and health contributions under Ryczałt ewidencjonowany', () => {
    // PIT Ryczałt 8.5% on 100000 revenue
    expect(pitRyczalt(100000, 0.085)).toBe(8500);
    
    // Health contribution brackets for Ryczałt:
    // revenue <= 60000: 9% * 60% * 9228.64 * 12 = 5980.16
    expect(calculateHealthContribution(0, 50000, 'ryczalt', 'dg')).toBeCloseTo(0.09 * 0.60 * 9228.64 * 12);
    // revenue <= 300000: 9% * 100% * 9228.64 * 12 = 9966.93
    expect(calculateHealthContribution(0, 150000, 'ryczalt', 'dg')).toBeCloseTo(0.09 * 1.00 * 9228.64 * 12);
    // revenue > 300000: 9% * 180% * 9228.64 * 12 = 17940.48
    expect(calculateHealthContribution(0, 400000, 'ryczalt', 'dg')).toBeCloseTo(0.09 * 1.80 * 9228.64 * 12);
  });

  it('should have 0% PIT and health shield under Ryczałt for car costs', () => {
    const inputs = {
      carType: 'new', financing: 'cash',
      pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'ryczalt', pSource: 'dg', pIsVAT: false,
      pValRyczaltRate: 0.085,
      jointFiling: false,
      priceB: 200000, priceN: 200000,
      usedVat: 'gross_only',
      insurB: 5000, maintB: 2000, upfront: 0,
      lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
      cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
      inflation: 0.05, investReturn: 0.05,
      incCar: true, incFuel: false, incInv: false,
      kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
    };

    const res = calculateEngine(inputs);
    expect(res.cumRealTaxSav).toBe(0);
    expect(res.cumHealthSav).toBe(0);
  });

  it('should result in a lower real TCO (effectiveCost) with credit under inflation > 0 than with 0% inflation', () => {
    const baseInputs = {
      carType: 'new', financing: 'credit',
      pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'ryczalt', pSource: 'dg', pIsVAT: false,
      pValRyczaltRate: 0.085,
      jointFiling: false,
      priceB: 200000, priceN: 200000,
      usedVat: 'gross_only',
      insurB: 5000, maintB: 2000, upfront: 0,
      lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
      cType: 'standard', cD: 50000, cIB: 5000, cM: 36, cR: 0.1, fee: 0,
      inflation: 0.0, investReturn: 0.05,
      incCar: true, incFuel: false, incInv: false,
      kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
    };
    
    const resNoInflation = calculateEngine({ ...baseInputs, inflation: 0.0 });
    const resWithInflation = calculateEngine({ ...baseInputs, inflation: 0.05 });
    
    expect(resWithInflation.effectiveCost).toBeLessThan(resNoInflation.effectiveCost);
    expect(resWithInflation.cumRealFinCost).toBeLessThan(resWithInflation.totalFinCost);
    expect(resNoInflation.cumRealFinCost).toBe(resNoInflation.totalFinCost);
  });

  it('should result in cumRealFinCost < totalFinCost for leasing under inflation > 0', () => {
    const inputs = {
      carType: 'new', financing: 'leasing',
      pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'skala', pSource: 'dg', pIsVAT: false,
      jointFiling: false,
      priceB: 200000, priceN: 200000,
      usedVat: 'gross_only',
      insurB: 5000, maintB: 2000, upfront: 0,
      lType: 'oper', lD: 20000, lB: 10000, lM: 36, lI: 3000,
      cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
      inflation: 0.05, investReturn: 0.05,
      incCar: true, incFuel: false, incInv: false,
      kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
    };
    
    const res = calculateEngine(inputs);
    expect(res.cumRealFinCost).toBeLessThan(res.totalFinCost);
  });
});

describe('calculateEngine row fields — tax/health intermediates', () => {
  function baseInputs() {
    return {
      pInc: 150000, pKup: 0, pDed: 0, pTaxForm: 'skala', pSource: 'dg',
      pIsVAT: false, pValRyczaltRate: 0.085,
      jointFiling: false, sInc: 0, sKup: 0, sDed: 0, sSource: 'etat',
      carType: 'new', financing: 'cash',
      priceB: 200000, priceN: 200000,
      usedVat: 'gross_only', usedDepRate: '0.20',
      insurB: 5000, maintB: 2000, upfront: 0,
      lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
      cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
      inflation: 0.05, investReturn: 0.05,
      incCar: true, incFuel: false, incInv: false,
      kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
    };
  }

  it('rows contain pNetY and netCostKUP', () => {
    const res = calculateEngine(baseInputs());
    const r0 = res.rows[0];
    expect(r0.pNetY).toBeDefined();
    expect(r0.netCostKUP).toBeDefined();
    expect(r0.pNetY).toBe(Math.max(0, res.pNet - r0.netCostKUP));
  });

  it('rows.lostIncKUP equals max(0, netCostKUP - pNet) for a low-income scenario', () => {
    const inputs = { ...baseInputs(), pInc: 12000 }; // very low income vs. EV deductible costs
    const res = calculateEngine(inputs);
    const r0 = res.rows[0];
    expect(r0.lostIncKUP).toBeCloseTo(Math.max(0, r0.netCostKUP - res.pNet), 2);
    expect(r0.lostIncKUP).toBeGreaterThan(0); // sanity check this scenario actually exercises the low-income path
  });

  it('afterBrackets.type is skala for skala form', () => {
    const res = calculateEngine(baseInputs());
    expect(res.rows[0].afterBrackets.type).toBe('skala');
  });

  it('afterBrackets.brackets sums to taxWith for skala', () => {
    const res = calculateEngine(baseInputs());
    const r0 = res.rows[0];
    const bracketSum = r0.afterBrackets.brackets.reduce((s, b) => s + b.amount, 0);
    expect(bracketSum).toBeCloseTo(r0.taxWith, 2);
  });

  it('afterBrackets.type is joint when jointFiling=true', () => {
    const inp = { ...baseInputs(), jointFiling: true, sInc: 80000 };
    const res = calculateEngine(inp);
    expect(res.rows[0].afterBrackets.type).toBe('joint');
    const r0 = res.rows[0];
    expect(r0.afterBrackets.halfBase).toBeCloseTo(r0.taxBaseAfter / 2, 2);
    expect(r0.afterBrackets.taxOnHalf * 2).toBeCloseTo(r0.taxWith, 2);
  });

  it('afterBrackets.type is liniowy for liniowy form', () => {
    const inp = { ...baseInputs(), pTaxForm: 'liniowy' };
    const res = calculateEngine(inp);
    expect(res.rows[0].afterBrackets.type).toBe('liniowy');
    expect(res.rows[0].afterBrackets.amount).toBeCloseTo(res.rows[0].taxWith, 2);
  });

  it('rows contain pHealthBeforeY and pHealthAfterY with correct delta', () => {
    const res = calculateEngine(baseInputs());
    const r0 = res.rows[0];
    expect(r0.pHealthBeforeY).toBeDefined();
    expect(r0.pHealthAfterY).toBeDefined();
    expect(r0.pHealthBeforeY - r0.pHealthAfterY).toBeCloseTo(r0.healthSav, 2);
  });

  it('healthDetail has base and rate for skala', () => {
    const res = calculateEngine(baseInputs());
    const hd = res.rows[0].healthDetail;
    expect(hd.base).toBeDefined();
    expect(hd.rate).toBe(0.09);
    expect(hd.tier).toBeNull();
  });

  it('healthDetail has tier for ryczalt', () => {
    const inp = { ...baseInputs(), pTaxForm: 'ryczalt', pInc: 50000, incCar: false };
    const res = calculateEngine(inp);
    expect(res.rows[0].healthDetail.tier).toBe('≤ 60 000 zł');
  });

  it('calculateEngine returns pInc', () => {
    const inp = baseInputs();
    const res = calculateEngine(inp);
    expect(res.pInc).toBe(inp.pInc);
  });
});

describe('calculateEngine row fields — VAT per year', () => {
  function vatInputs() {
    return {
      pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'liniowy', pSource: 'dg',
      pIsVAT: true, pValRyczaltRate: 0.085,
      jointFiling: false, sInc: 0, sKup: 0, sDed: 0, sSource: 'etat',
      carType: 'new', financing: 'cash',
      priceB: 246000, priceN: 200000,
      usedVat: 'gross_only', usedDepRate: '0.20',
      insurB: 6000, maintB: 2460, upfront: 0,
      lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
      cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
      inflation: 0.05, investReturn: 0.05,
      incCar: true, incFuel: false, incInv: false,
      kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
    };
  }

  it('rows contain vatRefundY', () => {
    const res = calculateEngine(vatInputs());
    expect(res.rows[0].vatRefundY).toBeDefined();
  });

  it('purchaseVATRefundY is only non-zero in year 1', () => {
    const res = calculateEngine(vatInputs());
    expect(res.rows[0].purchaseVATRefundY).toBeGreaterThan(0);
    for (let i = 1; i < res.rows.length; i++) {
      expect(res.rows[i].purchaseVATRefundY).toBe(0);
    }
  });

  it('purchaseVATRefundY in year 1 equals vatAmt * 0.5', () => {
    const res = calculateEngine(vatInputs());
    expect(res.rows[0].purchaseVATRefundY).toBeCloseTo(46000 * 0.5, 2);
  });

  it('sum of vatRefundY equals cumVATRefund', () => {
    const res = calculateEngine(vatInputs());
    const sumVAT = res.rows.reduce((s, r) => s + r.vatRefundY, 0);
    expect(sumVAT).toBeCloseTo(res.cumVATRefund, 2);
  });

  it('sum of vatRefundRealY equals cumRealVATRefund', () => {
    const res = calculateEngine(vatInputs());
    const sumRealVAT = res.rows.reduce((s, r) => s + r.vatRefundRealY, 0);
    expect(sumRealVAT).toBeCloseTo(res.cumRealVATRefund, 2);
  });

  it('leasingVATRefundY is non-zero for leasing operacyjny with VAT', () => {
    const inp = {
      ...vatInputs(),
      financing: 'leasing', lType: 'oper',
      lD: 20000, lB: 10000, lM: 36, lI: 3000
    };
    const res = calculateEngine(inp);
    const hasLeasingVAT = res.rows.some(r => r.leasingVATRefundY > 0);
    expect(hasLeasingVAT).toBe(true);
  });
});

describe('calculateEngine row fields — financing intermediates', () => {
  function creditInputs() {
    return {
      pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'liniowy', pSource: 'dg',
      pIsVAT: false, pValRyczaltRate: 0.085,
      jointFiling: false, sInc: 0, sKup: 0, sDed: 0, sSource: 'etat',
      carType: 'new', financing: 'credit',
      priceB: 200000, priceN: 200000,
      usedVat: 'gross_only', usedDepRate: '0.20',
      insurB: 5000, maintB: 2000, upfront: 0,
      lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
      cType: 'standard', cD: 40000, cIB: 5000, cM: 36, cR: 0.08, fee: 0,
      inflation: 0.05, investReturn: 0.05,
      incCar: true, incFuel: false, incInv: false,
      kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
    };
  }

  it('rows contain cashOutflowY and cashOutflowNPV', () => {
    const res = calculateEngine(creditInputs());
    expect(res.rows[0].cashOutflowY).toBeDefined();
    expect(res.rows[0].cashOutflowNPV).toBeDefined();
  });

  it('sum of cashOutflowNPV is close to cumRealFinCost (credit standard)', () => {
    const res = calculateEngine(creditInputs());
    const sumNPV = res.rows.reduce((s, r) => s + r.cashOutflowNPV, 0);
    expect(sumNPV).toBeCloseTo(res.cumRealFinCost, 1);
  });

  it('rows contain rawDepY for cash financing', () => {
    const inp = { ...creditInputs(), financing: 'cash', cD: 0 };
    const res = calculateEngine(inp);
    expect(res.rows[0].rawDepY).toBeDefined();
    expect(res.rows[0].rawDepY).toBeGreaterThan(0);
    // D1: depreciation is deductible in full (not an operating cost) → depKUP === rawDepY
    expect(res.rows[0].depKUP).toBeCloseTo(res.rows[0].rawDepY, 2); // D1: amortyzacja w pełni KUP
  });

  it('rows contain principalPaidY and interestPaidY for credit standard', () => {
    const res = calculateEngine(creditInputs());
    expect(res.rows[0].principalPaidY).toBeDefined();
    expect(res.rows[0].interestPaidY).toBeDefined();
    // D1: credit interest is deductible in full (financing cost, not an operating cost) → intKUP === interestPaidY
    expect(res.rows[0].intKUP).toBeCloseTo(res.rows[0].interestPaidY, 2); // D1: odsetki kredytu w pełni KUP
  });

  it('rows contain capitalNetY and propFactor for leasing oper', () => {
    const inp = {
      ...creditInputs(),
      financing: 'leasing', lType: 'oper',
      lD: 20000, lB: 10000, lM: 36, lI: 3000,
      cD: 0, cIB: 0
    };
    const res = calculateEngine(inp);
    expect(res.rows[0].capitalNetY).toBeDefined();
    expect(res.rows[0].propFactor).toBeDefined();
    expect(res.rows[0].propFactor).toBeGreaterThan(0);
    expect(res.rows[0].propFactor).toBeLessThanOrEqual(1);
  });

  it('calculateEngine returns cType', () => {
    const res = calculateEngine(creditInputs());
    expect(res.cType).toBe('standard');
  });
});

describe('calculateEngine row fields — investment schedule and fuel', () => {
  function invInputs() {
    return {
      pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'liniowy', pSource: 'dg',
      pIsVAT: false, pValRyczaltRate: 0.085,
      jointFiling: false, sInc: 0, sKup: 0, sDed: 0, sSource: 'etat',
      carType: 'new', financing: 'cash',
      priceB: 200000, priceN: 200000,
      usedVat: 'gross_only', usedDepRate: '0.20',
      insurB: 5000, maintB: 2000, upfront: 0,
      lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
      cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
      inflation: 0.05, investReturn: 0.08,
      incCar: true, incFuel: true, incInv: true,
      kmYear: 20000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
    };
  }

  it('rows contain fuelSavNominal equal to annualFuelSav', () => {
    const res = calculateEngine(invInputs());
    res.rows.forEach(r => {
      expect(r.fuelSavNominal).toBeCloseTo(res.annualFuelSav, 2);
    });
  });

  it('rows contain invBalanceBefore, invTrancheY, invReturnY, invBalanceAfter when incInv=true', () => {
    const res = calculateEngine(invInputs());
    const r0 = res.rows[0];
    expect(r0.invBalanceBefore).toBeDefined();
    expect(r0.invTrancheY).toBeDefined();
    expect(r0.invReturnY).toBeDefined();
    expect(r0.invBalanceAfter).toBeDefined();
  });

  it('invReturnY equals (balanceBefore + tranche) * investReturn', () => {
    const res = calculateEngine(invInputs());
    const r0 = res.rows[0];
    const expectedReturn = (r0.invBalanceBefore + r0.invTrancheY) * invInputs().investReturn;
    expect(r0.invReturnY).toBeCloseTo(expectedReturn, 2);
  });

  it('final invBalanceAfter minus sum of tranches equals invGross', () => {
    const res = calculateEngine(invInputs());
    const lastRow = res.rows[res.rows.length - 1];
    const totalTranches = res.rows.reduce((s, r) => s + r.invTrancheY, 0);
    expect(lastRow.invBalanceAfter - totalTranches).toBeCloseTo(res.invGross, 1);
  });

  it('inv fields are zero when incInv=false', () => {
    const inp = { ...invInputs(), incInv: false };
    const res = calculateEngine(inp);
    expect(res.rows[0].invBalanceBefore).toBe(0);
    expect(res.rows[0].invTrancheY).toBe(0);
    expect(res.rows[0].invReturnY).toBe(0);
    expect(res.rows[0].invBalanceAfter).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// Phase 1 safety net — pin verified-correct behavior (verification R02–R04)
// All pins assert against CURRENT code; no production change accompanies them.
// ════════════════════════════════════════════════════════════════════

describe('PIT — boundary & form pins (R02 §5)', () => {
  it('loss year returns 0', () => {
    expect(pit(-10000)).toBe(0);
  });

  it('32% branch just past the 120 000 boundary', () => {
    // 90000*0.12 + (120001-120000)*0.32 = 10800 + 0.32
    expect(pit(120001)).toBe(10800.32);
  });

  it('margRate uses the <= boundary convention (pins exact-boundary engine behavior)', () => {
    // A refactor to `<` would silently change engine savings at exact boundaries.
    expect(margRate(30000)).toBe(0);
    expect(margRate(120000)).toBe(0.12);
  });

  it('pitJoint doubles the kwota wolna (30 000 each)', () => {
    expect(pitJoint(60000)).toBe(0);
  });

  it('joint filing benefit vs individual at 240 000', () => {
    // joint: pit(120000)*2 = 10800*2 = 21600; individual: 10800 + 120000*0.32 = 49200
    expect(pitJoint(240000)).toBe(21600);
    expect(pit(240000)).toBe(49200);
  });

  it('pitLiniowy clamps non-positive bases to 0', () => {
    expect(pitLiniowy(0)).toBe(0);
    expect(pitLiniowy(-50000)).toBe(0);
  });

  it('pitRyczalt clamps non-positive revenue to 0', () => {
    expect(pitRyczalt(0, 0.085)).toBe(0);
    expect(pitRyczalt(-1000, 0.085)).toBe(0);
  });

  it('calculateIndividualPit ryczałt taxes revenue, not net', () => {
    // Would be 4250 if `net` (50000) were misused instead of revenue (200000).
    expect(calculateIndividualPit(50000, 'ryczalt', 200000, 0.085)).toBe(17000);
  });

  it('skalaBreakdown invariant: Σ amount === pit(net) and Σ band === max(net, 0)', () => {
    for (const net of [-5000, 0, 30000, 75000, 120000, 200000]) {
      const bands = skalaBreakdown(net);
      const sumAmount = bands.reduce((s, b) => s + b.amount, 0);
      const sumBand = bands.reduce((s, b) => s + b.band, 0);
      expect(sumAmount).toBeCloseTo(pit(net), 6);
      expect(sumBand).toBeCloseTo(Math.max(net, 0), 6);
    }
  });

  it('buildAfterBrackets ryczałt branch (no direct coverage elsewhere)', () => {
    const ab = buildAfterBrackets(100000, 'ryczalt', 180000, 0.085, false, 0);
    expect(ab.type).toBe('ryczalt');
    expect(ab.revenue).toBe(180000);
    expect(ab.rate).toBe(0.085);
    expect(ab.amount).toBeCloseTo(15300, 6);
  });

  it('buildAfterBrackets joint with a negative base yields all-zero brackets', () => {
    const ab = buildAfterBrackets(0, 'skala', 100000, 0.085, true, -20000);
    expect(ab.type).toBe('joint');
    expect(ab.halfBase).toBe(-10000);
    expect(ab.taxOnHalf).toBe(0);
    expect(ab.brackets.every(b => b.band === 0 && b.amount === 0)).toBe(true);
  });
});

describe('Health — branch & floor pins (R03 §5)', () => {
  const MIN_HEALTH = 4806 * 0.09 * 12; // 5190.48

  it('skala above the floor', () => {
    expect(calculateHealthContribution(100000, 100000, 'skala', 'dg')).toBe(9000);
  });

  it('skala below the floor returns the minimum', () => {
    expect(calculateHealthContribution(40000, 40000, 'skala', 'dg')).toBe(5190.48);
  });

  it('skala floor break-even', () => {
    expect(calculateHealthContribution(57672, 57672, 'skala', 'dg')).toBe(5190.48);
  });

  it('liniowy floor break-even', () => {
    expect(calculateHealthContribution(105928.16, 105928.16, 'liniowy', 'dg')).toBeCloseTo(5190.48, 2);
  });

  it('ryczałt exactly 60 000 is inclusive (tier 1)', () => {
    expect(calculateHealthContribution(0, 60000, 'ryczalt', 'dg')).toBeCloseTo(5980.16, 2);
  });

  it('ryczałt just above 60 000 jumps to tier 2', () => {
    expect(calculateHealthContribution(0, 60000.01, 'ryczalt', 'dg')).toBeCloseTo(9966.93, 2);
  });

  it('ryczałt exactly 300 000 is inclusive (tier 2)', () => {
    expect(calculateHealthContribution(0, 300000, 'ryczalt', 'dg')).toBeCloseTo(9966.93, 2);
  });

  it('ryczałt just above 300 000 jumps to tier 3', () => {
    expect(calculateHealthContribution(0, 300000.01, 'ryczalt', 'dg')).toBeCloseTo(17940.48, 2);
  });

  it('etat is 9% of net and form-independent', () => {
    for (const form of ['skala', 'liniowy', 'ryczalt']) {
      expect(calculateHealthContribution(100000, 100000, form, 'etat')).toBe(9000);
    }
  });

  it('zero income: dg skala/liniowy floor, ryczałt tier 1, etat zero', () => {
    expect(calculateHealthContribution(0, 0, 'skala', 'dg')).toBe(5190.48);
    expect(calculateHealthContribution(0, 0, 'liniowy', 'dg')).toBe(5190.48);
    expect(calculateHealthContribution(0, 0, 'ryczalt', 'dg')).toBeCloseTo(5980.16, 2);
    expect(calculateHealthContribution(0, 0, 'skala', 'etat')).toBe(0);
  });

  it('healthContribDetail floor flags and minHealth', () => {
    expect(healthContribDetail(40000, 40000, 'skala', 'dg').floor).toBe(true);
    expect(healthContribDetail(100000, 100000, 'skala', 'dg').floor).toBe(false);
    expect(healthContribDetail(100000, 100000, 'liniowy', 'dg').floor).toBe(true);
    expect(healthContribDetail(0, 0, 'skala', 'dg').minHealth).toBe(MIN_HEALTH);
  });

  it('healthContribDetail tier labels and bases (tiers 2 & 3)', () => {
    const t2 = healthContribDetail(0, 150000, 'ryczalt', 'dg');
    expect(t2.tier).toBe('≤ 300 000 zł');
    expect(t2.base).toBeCloseTo(110743.68, 2);
    const t3 = healthContribDetail(0, 400000, 'ryczalt', 'dg');
    expect(t3.tier).toBe('> 300 000 zł');
    expect(t3.base).toBeCloseTo(199338.62, 2);
  });

  it('detail ↔ contribution consistency property (locks R03 §2.6)', () => {
    const nets = [-5000, 0, 40000, 57672, 100000, 200000];
    const incs = [0, 50000, 150000, 400000];
    const forms = ['skala', 'liniowy', 'ryczalt'];
    const sources = ['dg', 'etat'];
    for (const net of nets) for (const inc of incs) for (const form of forms) for (const source of sources) {
      const d = healthContribDetail(net, inc, form, source);
      const expected = d.floor ? d.minHealth : d.base * d.rate;
      expect(expected).toBeCloseTo(calculateHealthContribution(net, inc, form, source), 6);
    }
  });
});

describe('depSchedule / interestSchedule / interestAmortSchedule pins (R04 §5)', () => {
  it('depSchedule: full 5×20% then trailing zeros', () => {
    expect(depSchedule(100000, 0.20, 60, 7)).toEqual([20000, 20000, 20000, 20000, 20000, 0, 0]);
  });

  it('depSchedule: write-off invariant — schedule sums to the base', () => {
    expect(depSchedule(225000, 0.40, 30, 3).reduce((s, d) => s + d, 0)).toBeCloseTo(225000, 6);
    expect(depSchedule(225000, 0.20, 60, 5).reduce((s, d) => s + d, 0)).toBeCloseTo(225000, 6);
  });

  it('depSchedule: partial trailing year (14 months)', () => {
    const sched = depSchedule(100000, 0.20, 14, 2);
    expect(sched[0]).toBeCloseTo(20000, 6);
    expect(sched[1]).toBeCloseTo(100000 * 0.20 * (2 / 12), 6); // 3333.33…
  });

  it('depSchedule: zero base is all zeros', () => {
    expect(depSchedule(0, 0.20, 60, 5)).toEqual([0, 0, 0, 0, 0]);
  });

  it('interestSchedule: 18 months spans 2 years; year 2 accrues only 6 months', () => {
    const sched = interestSchedule(100000, 0.01, 5000, 18);
    expect(sched).toHaveLength(2);
    // Year 2 (6 months) accrues strictly less interest than year 1 (12 months).
    expect(sched[1]).toBeLessThan(sched[0]);
  });

  it('interestSchedule: zero rate yields zero interest', () => {
    expect(interestSchedule(100000, 0, 5000, 24)).toEqual([0, 0]);
  });

  it('interestAmortSchedule: fully amortizing loan closes the balance', () => {
    const sched = interestAmortSchedule(100000, 0.01, 8884.88, 12);
    expect(sched).toHaveLength(1);
    expect(sched[0].principal).toBeCloseTo(100000, 2);
    expect(sched[0].remainingBalance).toBeCloseTo(0, 2);
    expect(sched[0].interest + sched[0].principal).toBeCloseTo(12 * 8884.88, 0);
  });

  it('interestAmortSchedule agrees with interestSchedule on amortizing inputs', () => {
    const a = interestSchedule(100000, 0.01, 5000, 12);
    const b = interestAmortSchedule(100000, 0.01, 5000, 12);
    expect(b).toHaveLength(a.length);
    a.forEach((v, y) => expect(b[y].interest).toBeCloseTo(v, 6));
  });

  it('interestAmortSchedule: final-payment clamp never overshoots the balance', () => {
    const sched = interestAmortSchedule(10000, 0.01, 5000, 12);
    const totalPrincipal = sched.reduce((s, a) => s + a.principal, 0);
    expect(totalPrincipal).toBeCloseTo(10000, 6);
    expect(sched[sched.length - 1].remainingBalance).toBe(0);
    sched.forEach(a => {
      expect(a.principal).toBeGreaterThanOrEqual(0);
      expect(a.remainingBalance).toBeGreaterThanOrEqual(0);
    });
  });

  it('interestAmortSchedule: zero principal stays at zero', () => {
    const sched = interestAmortSchedule(0, 0.01, 5000, 12);
    expect(sched[0]).toEqual({ interest: 0, principal: 0, remainingBalance: 0 });
  });

  it('interestAmortSchedule: balloon leaves a positive balance equal to the recurrence', () => {
    const sched = interestAmortSchedule(100000, 0.005, 1000, 12);
    let bal = 100000;
    for (let m = 0; m < 12; m++) {
      const int = bal * 0.005;
      const prin = Math.max(0, Math.min(1000 - int, bal));
      bal = Math.max(0, bal - prin);
    }
    expect(sched[0].remainingBalance).toBeGreaterThan(0);
    expect(sched[0].remainingBalance).toBeCloseTo(bal, 6);
  });
});

describe('Engine-level depreciation pins (R04 §5, raw fields stay D1-proof)', () => {
  function baseInputs() {
    return {
      pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'skala', pSource: 'dg',
      pIsVAT: false, pValRyczaltRate: '0.085',
      jointFiling: false, sInc: 0, sKup: 0, sDed: 0, sSource: 'etat',
      carType: 'new', financing: 'cash',
      priceB: 200000, priceN: 200000,
      usedVat: 'gross_only', usedDepRate: '0.20',
      insurB: 5000, maintB: 2000, upfront: 0,
      lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
      cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
      inflation: 0.05, investReturn: 0.05,
      incCar: true, incFuel: false, incInv: false,
      kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
    };
  }

  it('cap binds for a new VAT car above the limit', () => {
    const res = calculateEngine({ ...baseInputs(), carType: 'new', pIsVAT: true, priceN: 250000, priceB: 307500 });
    expect(res.depBase).toBe(225000);
    expect(res.rows[0].rawDepY).toBe(45000); // 225000 × 20%
  });

  it('vat_margin used car above the cap depreciates the capped base at 40%', () => {
    const res = calculateEngine({ ...baseInputs(), carType: 'used', usedDepRate: '0.40', usedVat: 'vat_margin', priceB: 300000, priceN: 300000 });
    expect(res.depBase).toBe(225000);
    expect(res.rows[0].rawDepY).toBe(90000); // 225000 × 40%
    expect(res.calcYears).toBe(3);
  });

  it('usedDepRate 0.20 spreads a used car over 5 years at 20%, not 2.5 at 40%', () => {
    const res = calculateEngine({ ...baseInputs(), carType: 'used', usedDepRate: '0.20', priceB: 200000, priceN: 200000 });
    expect(res.calcYears).toBe(5);
    expect(res.rows.map(r => r.rawDepY)).toEqual([40000, 40000, 40000, 40000, 40000]);
  });
});
