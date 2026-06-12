// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { calculateEngine } from '../script.js';

function getBaseInputs() {
  return {
    carType: 'new',
    financing: 'credit',
    pInc: 0, pKup: 0, pDed: 0, pTaxForm: 'skala', pSource: 'dg', pIsVAT: false,
    jointFiling: false,
    priceB: 200000, priceN: 200000,
    usedVat: 'gross_only',
    insurB: 0, maintB: 0, upfront: 10000,
    lType: 'oper', lD: 20000, lB: 10000, lM: 36, lI: 3000,
    cType: 'standard', cD: 40000, cIB: 4000, cM: 36, cR: 0.1, fee: 1000,
    inflation: 0.05, investReturn: 0.05,
    incCar: true, incFuel: false, incInv: false,
    kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
  };
}

describe('Empirical NPV TCO Verification', () => {

  describe('1. Credit/Leasing produces lower TCO under positive inflation than 0% inflation (with tax shield excluded)', () => {
    it('should verify standard credit', () => {
      const inputs0 = { ...getBaseInputs(), financing: 'credit', cType: 'standard', inflation: 0.0 };
      const inputs5 = { ...getBaseInputs(), financing: 'credit', cType: 'standard', inflation: 0.05 };
      const res0 = calculateEngine(inputs0);
      const res5 = calculateEngine(inputs5);
      
      // With inflation > 0, effectiveCost should be lower
      expect(res5.effectiveCost).toBeLessThan(res0.effectiveCost);
      // cumRealFinCost should be lower than totalFinCost with inflation > 0
      expect(res5.cumRealFinCost).toBeLessThan(res5.totalFinCost);
      // cumRealFinCost should be equal to totalFinCost with inflation = 0
      expect(res0.cumRealFinCost).toBeCloseTo(res0.totalFinCost);
    });

    it('should verify credit 50/50', () => {
      const inputs0 = { ...getBaseInputs(), financing: 'credit', cType: '5050', inflation: 0.0 };
      const inputs5 = { ...getBaseInputs(), financing: 'credit', cType: '5050', inflation: 0.05 };
      const res0 = calculateEngine(inputs0);
      const res5 = calculateEngine(inputs5);
      
      expect(res5.effectiveCost).toBeLessThan(res0.effectiveCost);
      expect(res5.cumRealFinCost).toBeLessThan(res5.totalFinCost);
    });

    it('should verify credit 3x33', () => {
      const inputs0 = { ...getBaseInputs(), financing: 'credit', cType: '3x33', inflation: 0.0 };
      const inputs5 = { ...getBaseInputs(), financing: 'credit', cType: '3x33', inflation: 0.05 };
      const res0 = calculateEngine(inputs0);
      const res5 = calculateEngine(inputs5);
      
      expect(res5.effectiveCost).toBeLessThan(res0.effectiveCost);
      expect(res5.cumRealFinCost).toBeLessThan(res5.totalFinCost);
    });

    it('should verify leasing oper', () => {
      const inputs0 = { ...getBaseInputs(), financing: 'leasing', lType: 'oper', inflation: 0.0 };
      const inputs5 = { ...getBaseInputs(), financing: 'leasing', lType: 'oper', inflation: 0.05 };
      const res0 = calculateEngine(inputs0);
      const res5 = calculateEngine(inputs5);
      
      expect(res5.effectiveCost).toBeLessThan(res0.effectiveCost);
      expect(res5.cumRealFinCost).toBeLessThan(res5.totalFinCost);
    });

    it('should verify leasing fin', () => {
      const inputs0 = { ...getBaseInputs(), financing: 'leasing', lType: 'fin', inflation: 0.0 };
      const inputs5 = { ...getBaseInputs(), financing: 'leasing', lType: 'fin', inflation: 0.05 };
      const res0 = calculateEngine(inputs0);
      const res5 = calculateEngine(inputs5);
      
      expect(res5.effectiveCost).toBeLessThan(res0.effectiveCost);
      expect(res5.cumRealFinCost).toBeLessThan(res5.totalFinCost);
    });
  });

  describe('2. Cash outflows at year 0 are not discounted under any inflation rate', () => {
    it('should verify cash financing outflows are not discounted', () => {
      const baseCash = {
        ...getBaseInputs(),
        financing: 'cash',
        upfront: 10000,
      };

      const res0 = calculateEngine({ ...baseCash, inflation: 0.0 });
      const res5 = calculateEngine({ ...baseCash, inflation: 0.05 });
      const resHyper = calculateEngine({ ...baseCash, inflation: 10.0 });
      const resDefl = calculateEngine({ ...baseCash, inflation: -0.05 });

      expect(res0.cumRealFinCost).toBe(res0.totalFinCost);
      expect(res5.cumRealFinCost).toBe(res5.totalFinCost);
      expect(resHyper.cumRealFinCost).toBe(resHyper.totalFinCost);
      expect(resDefl.cumRealFinCost).toBe(resDefl.totalFinCost);
      
      expect(res0.effectiveCost).toBe(res0.totalFinCost);
      expect(res5.effectiveCost).toBe(res5.totalFinCost);
      expect(resHyper.effectiveCost).toBe(resHyper.totalFinCost);
      expect(resDefl.effectiveCost).toBe(resDefl.totalFinCost);
    });

    it('should verify downpayment/upfront component in leasing/credit is undiscounted', () => {
      const credit1Year = {
        ...getBaseInputs(),
        financing: 'credit',
        cType: 'standard',
        cM: 12,
      };

      const res0 = calculateEngine({ ...credit1Year, inflation: 0.0 });
      const res5 = calculateEngine({ ...credit1Year, inflation: 0.05 });
      const resHyper = calculateEngine({ ...credit1Year, inflation: 10.0 });

      expect(res0.cumRealFinCost).toBe(res0.totalFinCost);
      expect(res5.cumRealFinCost).toBe(res5.totalFinCost);
      expect(resHyper.cumRealFinCost).toBe(resHyper.totalFinCost);
    });
  });

  describe('3. Edge Cases and Robustness', () => {
    it('should handle zero inflation (0%) correctly without NaN or division by zero', () => {
      const inputs = { ...getBaseInputs(), inflation: 0.0 };
      const res = calculateEngine(inputs);
      expect(res.effectiveCost).not.toBeNaN();
      expect(isFinite(res.effectiveCost)).toBe(true);
      expect(res.cumRealFinCost).toBeCloseTo(res.totalFinCost);
    });

    it('should handle extremely high inflation (hyperinflation, e.g. 1e6%) safely', () => {
      const inputsHyper = { ...getBaseInputs(), inflation: 1e6 };
      const resHyper = calculateEngine(inputsHyper);
      expect(resHyper.effectiveCost).not.toBeNaN();
      expect(isFinite(resHyper.effectiveCost)).toBe(true);
      expect(resHyper.cumRealFinCost).toBeGreaterThan(0);
    });

    it('should handle negative inflation (deflation, e.g. -50%) safely', () => {
      // Deflation should increase effective TCO compared to 0% inflation (with tax shield excluded)
      const inputs0 = { ...getBaseInputs(), inflation: 0.0 };
      const inputsDefl = { ...getBaseInputs(), inflation: -0.10 };

      const res0 = calculateEngine(inputs0);
      const resDefl = calculateEngine(inputsDefl);

      expect(resDefl.effectiveCost).toBeGreaterThan(res0.effectiveCost);
      expect(resDefl.cumRealFinCost).toBeGreaterThan(res0.totalFinCost);
    });

    it('should maintain strict TCO monotonicity with inflation rate changes', () => {
      const inflations = [-0.1, -0.05, 0.0, 0.02, 0.05, 0.1, 0.5, 1.0];
      let prevRealFinCost = Infinity;

      for (const infl of inflations) {
        const res = calculateEngine({ ...getBaseInputs(), inflation: infl });
        expect(res.cumRealFinCost).toBeLessThan(prevRealFinCost);
        prevRealFinCost = res.cumRealFinCost;
      }
    });

    it('should handle zero prices and zero inputs safely', () => {
      const zeroInputs = {
        ...getBaseInputs(),
        priceB: 0,
        priceN: 0,
        insurB: 0,
        maintB: 0,
        upfront: 0,
        lD: 0,
        lB: 0,
        lI: 0,
        cD: 0,
        cIB: 0,
        fee: 0,
        kmYear: 0,
      };

      const res = calculateEngine(zeroInputs);
      expect(res.effectiveCost).toBe(0);
      expect(res.totalFinCost).toBe(0);
      expect(res.cumRealFinCost).toBe(0);
      expect(res.cumRealTaxSav).toBe(0);
    });
  });
});

describe('Row sum reconciliation (ledger integrity)', () => {
  const MODELS = [
    { label: 'cash', financing: 'cash' },
    { label: 'leasing oper', financing: 'leasing', lType: 'oper', lD: 20000, lB: 10000, lM: 36, lI: 3000 },
    { label: 'leasing fin',  financing: 'leasing', lType: 'fin',  lD: 20000, lB: 10000, lM: 36, lI: 3000 },
    { label: 'credit standard', financing: 'credit', cType: 'standard', cD: 40000, cIB: 5000, cM: 36, cR: 0.08 },
    { label: 'credit 5050',     financing: 'credit', cType: '5050' },
    { label: 'credit 3x33',     financing: 'credit', cType: '3x33' }
  ];

  function baseFor(overrides) {
    return {
      pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'liniowy', pSource: 'dg',
      pIsVAT: false, pValRyczaltRate: 0.085,
      jointFiling: false, sInc: 0, sKup: 0, sDed: 0, sSource: 'etat',
      carType: 'new',
      financing: 'credit', // D5: explicit (was relying on undefined → credit else-branch); MODELS override it
      priceB: 200000, priceN: 200000,
      usedVat: 'gross_only', usedDepRate: '0.20',
      insurB: 5000, maintB: 2000, upfront: 0,
      lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
      cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
      inflation: 0.05, investReturn: 0.08,
      incCar: true, incFuel: true, incInv: true,
      kmYear: 20000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5,
      ...overrides
    };
  }

  MODELS.forEach(({ label, ...overrides }) => {
    describe(label, () => {
      it('Σ cashOutflowNPV ≈ cumRealFinCost', () => {
        const res = calculateEngine(baseFor(overrides));
        const sumNPV = res.rows.reduce((s, r) => s + r.cashOutflowNPV, 0);
        expect(sumNPV).toBeCloseTo(res.cumRealFinCost, 0);
      });

      it('Σ fuelSav (discounted) ≈ cumRealFuelSav', () => {
        const res = calculateEngine(baseFor(overrides));
        const sumFuelReal = res.rows.reduce((s, r) => s + r.fuelSav, 0);
        expect(sumFuelReal).toBeCloseTo(res.cumRealFuelSav, 2);
      });
    });
  });

  it('Σ vatRefundY === cumVATRefund for VAT-registered + leasing oper', () => {
    const res = calculateEngine(baseFor({
      pIsVAT: true, priceB: 246000, priceN: 200000,
      financing: 'leasing', lType: 'oper',
      lD: 20000, lB: 10000, lM: 36, lI: 3000
    }));
    const sumVAT = res.rows.reduce((s, r) => s + r.vatRefundY, 0);
    expect(sumVAT).toBeCloseTo(res.cumVATRefund, 2);
  });

  it('Σ vatRefundRealY === cumRealVATRefund', () => {
    const res = calculateEngine(baseFor({
      pIsVAT: true, priceB: 246000, priceN: 200000
    }));
    const sumRealVAT = res.rows.reduce((s, r) => s + r.vatRefundRealY, 0);
    expect(sumRealVAT).toBeCloseTo(res.cumRealVATRefund, 2);
  });

  it('final invBalanceAfter − Σ tranches ≈ invGross', () => {
    const res = calculateEngine(baseFor({}));
    const lastRow = res.rows[res.rows.length - 1];
    const totalTranches = res.rows.reduce((s, r) => s + r.invTrancheY, 0);
    expect(lastRow.invBalanceAfter - totalTranches).toBeCloseTo(res.invGross, 1);
  });
});

// ════════════════════════════════════════════════════════════════════
// Phase 1 safety net — economics pins (verification R07 §5)
// ════════════════════════════════════════════════════════════════════
describe('Economics: NPV timing, fuel sign, investment (R07 §5)', () => {
  function evBase(overrides = {}) {
    return {
      pInc: 100000, pKup: 0, pDed: 0, pTaxForm: 'skala', pSource: 'dg', pIsVAT: false,
      pValRyczaltRate: '0.085', jointFiling: false,
      sInc: 0, sKup: 0, sDed: 0, sSource: 'etat',
      carType: 'new', financing: 'cash', priceB: 200000, priceN: 200000, usedVat: 'gross_only',
      insurB: 5000, maintB: 2000, upfront: 0,
      lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
      cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
      inflation: 0.05, investReturn: 0.05,
      incCar: true, incFuel: false, incInv: false,
      kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5,
      ...overrides
    };
  }

  it('§7.1 discount off-by-one: outflows at ^y, benefits at ^(y+1)', () => {
    // All outflows land in year 0 (cD = full price, 12-month term, no interest).
    const res = calculateEngine(evBase({ financing: 'credit', cType: 'standard', cM: 12, cD: 200000, cIB: 0, inflation: 0.05 }));
    const r0 = res.rows[0];
    // Outflows discount at ^y (start of year) → year-0 outflow is undiscounted.
    expect(r0.cashOutflowNPV).toBe(r0.cashOutflowY);
    // Benefits discount at ^(y+1) (end of year) — an intentional convention, not an off-by-one bug.
    expect(r0.realTaxSav).toBeCloseTo((r0.taxSav + r0.healthSav) / 1.05, 6);
  });

  it('§7.2 negative fuel savings (non-VAT) raise effective cost', () => {
    const base = evBase({ kmYear: 20000, elP: 4.0, fuelP: 6.5, incFuel: true });
    const res = calculateEngine(base);
    const noFuel = calculateEngine({ ...base, incFuel: false });
    expect(res.annualFuelSav).toBe(-4000); // EV is pricier per km at these rates
    expect(res.cumRealFuelSav).toBeLessThan(0);
    expect(res.rows[0].lostFuelKUP).toBeUndefined(); // fuel no longer affects KUP
    expect(res.effectiveCost).toBeGreaterThan(noFuel.effectiveCost);
  });

  it('§7.3 investment compounding exact values (cash, 10% return)', () => {
    const res = calculateEngine(evBase({ financing: 'cash', priceB: 100000, priceN: 100000, upfront: 0, incInv: true, investReturn: 0.10, inflation: 0.05 }));
    expect(res.rows[0].invReturnY).toBeCloseTo(10000, 6);
    expect(res.rows[1].invReturnY).toBeCloseTo(11000, 6);
    expect(res.rows[0].invBalanceAfter).toBeCloseTo(110000, 6);
    expect(res.rows[1].invBalanceAfter).toBeCloseTo(121000, 6);
    expect(res.invGross).toBeCloseTo(100000 * (Math.pow(1.1, 5) - 1), 4);
    expect(res.invReal).toBeCloseTo(res.invGross / Math.pow(1.05, 5), 4);
  });

  it('§7.4 investment invariants', () => {
    expect(calculateEngine(evBase({ financing: 'cash', incInv: true, investReturn: 0 })).invGross).toBe(0);
    const off = calculateEngine(evBase({ financing: 'cash', incInv: false }));
    expect(off.rows.every(r => r.invReturnY === 0)).toBe(true);
    expect(off.invGross).toBe(0);
    expect(off.invReal).toBe(0);
  });

  it('§7.5 oper-lease VAT recurring refund schedule (lM=18)', () => {
    const res = calculateEngine(evBase({
      financing: 'leasing', lType: 'oper', pIsVAT: true,
      priceN: 200000, priceB: 246000, lD: 20000, lI: 3000, lM: 18, lB: 10000
    }));
    const refunds = res.rows.map(r => r.leasingVATRefundY);
    expect(refunds[0]).toBeCloseTo(4140, 2); // 12 × 3000 × 0.115
    expect(refunds[1]).toBeCloseTo(3220, 2); // 6 × 3000 × 0.115 + 10000 × 0.115
    expect(refunds[2]).toBe(0);
    expect(refunds[3]).toBe(0);
    expect(refunds[4]).toBe(0);
  });

  it('§7.6 purchase-VAT eligibility matrix', () => {
    const half = 46000 * 0.5; // vatAmt × 0.5 = 23000
    const refund = (o) => calculateEngine(evBase({ pIsVAT: true, priceN: 200000, priceB: 246000, ...o })).purchaseVATRefund;
    expect(refund({ carType: 'new', usedVat: 'gross_only', financing: 'cash' })).toBeCloseTo(half, 2);
    expect(refund({ carType: 'used', usedDepRate: '0.40', usedVat: 'vat23', financing: 'cash' })).toBeCloseTo(half, 2);
    expect(refund({ carType: 'used', usedDepRate: '0.40', usedVat: 'vat_margin', financing: 'cash' })).toBe(0);
    // Operational leasing is not "amortized" → no purchase-VAT refund.
    expect(refund({ carType: 'new', usedVat: 'gross_only', financing: 'leasing', lType: 'oper', lD: 20000, lI: 3000, lM: 36, lB: 10000 })).toBe(0);
    // Non-VAT payer never gets a purchase refund.
    expect(calculateEngine(evBase({ pIsVAT: false, carType: 'new', priceN: 200000, priceB: 246000, financing: 'cash' })).purchaseVATRefund).toBe(0);
  });
});
