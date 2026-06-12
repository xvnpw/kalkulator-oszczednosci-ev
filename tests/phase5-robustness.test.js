// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  calculateEngine,
  calculateIndividualPit,
  calculateHealthContribution,
  interestSchedule,
} from '../script.js';
// Not in the script.js re-export barrel — imported from the calc modules directly.
import { buildAfterBrackets } from '../calc/pit.js';
import { healthContribDetail } from '../calc/health.js';
import { interestAmortSchedule } from '../calc/schedules.js';
import {
  AVG_WAGE_2026, HEALTH_RATE_SKALA, RYCZALT_HEALTH_MULT,
  PIT_FREE_BASE, PIT_BRACKET, PIT_RATE_LOW, PIT_RATE_HIGH, PIT_LINIOWY_RATE,
} from '../calc/constants.js';

function base(overrides = {}) {
  return {
    carType: 'new', financing: 'cash',
    pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'skala', pSource: 'dg', pIsVAT: false,
    pValRyczaltRate: 0.085,
    jointFiling: false, sInc: 0, sKup: 0, sDed: 0, sSource: 'etat',
    priceB: 200000, priceN: 200000,
    usedVat: 'gross_only', usedDepRate: '0.40',
    insurB: 5000, maintB: 2000, upfront: 0,
    lType: 'oper', lD: 20000, lB: 10000, lM: 36, lI: 3000,
    cType: 'standard', cD: 50000, cIB: 5000, cM: 36, cR: 0.1, fee: 0,
    inflation: 0.05, investReturn: 0.05,
    incCar: true, incFuel: false, incInv: false,
    kmYear: 15000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5,
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════
// §2 — D5: unknown enums throw (replaces the phase-1 fallback pins)
// ════════════════════════════════════════════════════════════════════
describe('D5 — unknown enums throw instead of silently falling back', () => {
  it('calculateIndividualPit throws on an unknown form (R02 case 9, was: return 0)', () => {
    expect(() => calculateIndividualPit(100000, 'flat', 100000, 0.085)).toThrow(/nieznana forma/);
  });

  it('buildAfterBrackets throws on an unknown form (R02 case 12, was: return null)', () => {
    expect(() => buildAfterBrackets(100000, 'flat', 100000, 0.085, false, 0)).toThrow(/nieznana forma/);
  });

  it('calculateHealthContribution (dg) throws on an unknown form (R03 case 13, was: return 0)', () => {
    expect(() => calculateHealthContribution(100000, 100000, 'flat', 'dg')).toThrow(/nieznana forma/);
  });

  it('healthContribDetail (dg) throws on an unknown form (was: base 0 / rate 0)', () => {
    expect(() => healthContribDetail(100000, 100000, 'flat', 'dg')).toThrow(/nieznana forma/);
  });

  it('engine throws on a carType typo (was: silent used branch)', () => {
    expect(() => calculateEngine(base({ carType: 'New' }))).toThrow(/carType/);
  });

  it('engine throws on an unknown financing (was: silent credit else)', () => {
    expect(() => calculateEngine(base({ financing: 'lease' }))).toThrow(/financing/);
  });

  it('engine throws on an unknown lType when leasing', () => {
    expect(() => calculateEngine(base({ financing: 'leasing', lType: 'operacyjny' }))).toThrow(/lType/);
  });

  it('engine throws on an unknown cType when credit', () => {
    expect(() => calculateEngine(base({ financing: 'credit', cType: 'baloon' }))).toThrow(/cType/);
  });

  it('engine throws on joint filing with a non-skala form (art. 6 ust. 8)', () => {
    expect(() => calculateEngine(base({ jointFiling: true, pTaxForm: 'liniowy', sInc: 80000 }))).toThrow(/skali/);
    expect(() => calculateEngine(base({ jointFiling: true, pTaxForm: 'ryczalt', sInc: 80000 }))).toThrow(/skali/);
  });

  it('valid enum combinations still compute (smoke)', () => {
    expect(() => calculateEngine(base())).not.toThrow();
    expect(() => calculateEngine(base({ financing: 'leasing', lType: 'fin' }))).not.toThrow();
    expect(() => calculateEngine(base({ financing: 'leasing', lType: 'oper' }))).not.toThrow();
    expect(() => calculateEngine(base({ financing: 'credit', cType: 'standard' }))).not.toThrow();
    expect(() => calculateEngine(base({ financing: 'credit', cType: '5050' }))).not.toThrow();
    expect(() => calculateEngine(base({ financing: 'credit', cType: '3x33' }))).not.toThrow();
    expect(() => calculateEngine(base({ carType: 'used', usedDepRate: '0.20' }))).not.toThrow();
  });
});

describe('D5/R03 — etat health floors a negative wage base at 0', () => {
  it('negative net under etat yields 0, not a negative contribution', () => {
    expect(calculateHealthContribution(-10000, 0, 'skala', 'etat')).toBe(0);
  });

  it('positive net under etat is unchanged (9%)', () => {
    expect(calculateHealthContribution(100000, 100000, 'skala', 'etat')).toBe(9000);
  });
});

// ════════════════════════════════════════════════════════════════════
// §3 — F3: degenerate financing inputs throw; creditUnamortized surfaced
// ════════════════════════════════════════════════════════════════════
describe('F3 — degenerate financing inputs throw (RangeError)', () => {
  it('leasing with lM=0 throws (was: balloon/capital silently vanished)', () => {
    expect(() => calculateEngine(base({ financing: 'leasing', lType: 'oper', lM: 0, lD: 50000, lB: 50000 })))
      .toThrow(RangeError);
  });

  it('credit standard with cM=0 throws', () => {
    expect(() => calculateEngine(base({ financing: 'credit', cType: 'standard', cM: 0 })))
      .toThrow(RangeError);
  });

  it('leasing with lM≥1 and credit with cM≥1 are accepted', () => {
    expect(() => calculateEngine(base({ financing: 'leasing', lType: 'oper', lM: 1 }))).not.toThrow();
    expect(() => calculateEngine(base({ financing: 'credit', cType: 'standard', cM: 1 }))).not.toThrow();
  });
});

describe('R06 — creditUnamortized surfaces a balloon principal', () => {
  it('is ~0 for a fully amortizing standard credit', () => {
    const res = calculateEngine(base({
      financing: 'credit', cType: 'standard', cD: 0, cIB: 6000, cM: 48, cR: 0.08, priceB: 200000, priceN: 200000,
    }));
    expect(res.creditUnamortized).toBeLessThan(1);
  });

  it('is > 0 when the installment is too low to amortize (balloon remains)', () => {
    const res = calculateEngine(base({
      financing: 'credit', cType: 'standard', cD: 0, cIB: 1000, cM: 12, cR: 0.10, priceB: 200000, priceN: 200000,
    }));
    expect(res.creditUnamortized).toBeGreaterThan(1);
  });

  it('is 0 for non-credit-standard financing', () => {
    expect(calculateEngine(base({ financing: 'cash' })).creditUnamortized).toBe(0);
    expect(calculateEngine(base({ financing: 'leasing', lType: 'oper' })).creditUnamortized).toBe(0);
    expect(calculateEngine(base({ financing: 'credit', cType: '5050' })).creditUnamortized).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// §4 — D3: interestSchedule unified on frozen-balance semantics
// ════════════════════════════════════════════════════════════════════
describe('D3 — interestSchedule and interestAmortSchedule agree on negative amortization', () => {
  it('interestSchedule freezes the balance: year-1 interest 12000 (was 12 341.25)', () => {
    const sched = interestSchedule(100000, 0.01, 500, 12);
    expect(sched).toHaveLength(1);
    expect(sched[0]).toBeCloseTo(12000, 6); // 12 × (100000 × 0.01), balance never grows
  });

  it('interestAmortSchedule on the same inputs: interest 12000, principal 0, balance frozen at 100000', () => {
    const a = interestAmortSchedule(100000, 0.01, 500, 12);
    expect(a[0].interest).toBeCloseTo(12000, 6);
    expect(a[0].principal).toBe(0);
    expect(a[0].remainingBalance).toBeCloseTo(100000, 6);
  });

  it('agreement property: the two interest series match on negative-amortization inputs', () => {
    const cases = [
      [100000, 0.01, 500, 12],
      [50000, 0.02, 100, 24],
      [200000, 0.015, 0, 18], // installment 0 → pure negative amortization
    ];
    for (const [p, r, inst, m] of cases) {
      const s = interestSchedule(p, r, inst, m);
      const am = interestAmortSchedule(p, r, inst, m);
      expect(s).toHaveLength(am.length);
      s.forEach((v, y) => expect(am[y].interest).toBeCloseTo(v, 6));
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// §7 — depSchedule implicit contract: engine-selected pairs write off fully
// ════════════════════════════════════════════════════════════════════
describe('depSchedule contract — engine (rate, months) pairs satisfy rate×months/12 === 1', () => {
  const combos = [
    { carType: 'new', usedDepRate: '0.40' }, // new ignores usedDepRate → 20%/60mo
    { carType: 'new', usedDepRate: '0.20' },
    { carType: 'used', usedDepRate: '0.40' }, // 40%/30mo
    { carType: 'used', usedDepRate: '0.20' }, // 20%/60mo
  ];

  combos.forEach(({ carType, usedDepRate }) => {
    it(`${carType} / usedDepRate ${usedDepRate}: Σ rawDepY === depBase (uncapped)`, () => {
      const res = calculateEngine(base({
        carType, usedDepRate, financing: 'cash', pIsVAT: false,
        priceB: 200000, priceN: 200000, usedVat: 'gross_only',
      }));
      const sumDep = res.rows.reduce((s, r) => s + r.rawDepY, 0);
      expect(res.depBase).toBe(200000); // below the 225 000 cap
      expect(sumDep).toBeCloseTo(res.depBase, 4);
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// §6 — statutory constants consolidated into calc/constants.js
// ════════════════════════════════════════════════════════════════════
describe('constants — consolidated statutory values are correct', () => {
  it('ryczałt health tiers equal 0.09 × mult × AVG_WAGE_2026 × 12', () => {
    const tier = (m) => HEALTH_RATE_SKALA * m * AVG_WAGE_2026 * 12;
    expect(tier(RYCZALT_HEALTH_MULT[0])).toBeCloseTo(5980.16, 2);
    expect(tier(RYCZALT_HEALTH_MULT[1])).toBeCloseTo(9966.93, 2);
    expect(tier(RYCZALT_HEALTH_MULT[2])).toBeCloseTo(17940.48, 2);
  });

  it('PIT scale constants match the 2026 skala', () => {
    expect(PIT_FREE_BASE).toBe(30000);
    expect(PIT_BRACKET).toBe(120000);
    expect(PIT_RATE_LOW).toBe(0.12);
    expect(PIT_RATE_HIGH).toBe(0.32);
    expect(PIT_LINIOWY_RATE).toBe(0.19);
  });
});
