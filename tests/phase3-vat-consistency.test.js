// @vitest-environment happy-dom
// ════════════════════════════════════════════════════════════════════
// Phase 3 — VAT consistency for mixed-use costs (calc/engine.js)
// Every cost/benefit flow uses the same convention the purchase path uses:
// a mixed-use VAT payer recovers 50% of input VAT (art. 86a ustawy o VAT) and
// the non-recovered 50% is itself KUP (art. 23 ust. 1 pkt 43 lit. a ustawy o PIT).
// Magic factor: gross G → KUP base = G/1.23×1.115 ≈ G×0.9065; recoverable = 0.5×VAT.
// All five sections change results only when pIsVAT === true → each has a non-VAT twin.
// ════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { calculateEngine } from '../script.js';

// net + non-recoverable 50% VAT for a gross amount (the shared phase-3 convention)
const kupBase = (gross) => gross / 1.23 * 1.115;

function carDefaults() {
  return {
    carType: 'new', financing: 'cash',
    priceB: 246000, priceN: 200000, usedVat: 'gross_only', usedDepRate: '0.20',
    insurB: 5000, maintB: 2460, upfront: 0,
    lType: 'oper', lD: 0, lB: 0, lM: 36, lI: 0,
    cType: 'standard', cD: 0, cIB: 0, cM: 36, cR: 0.1, fee: 0,
    inflation: 0.05, investReturn: 0.05,
    incCar: true, incFuel: false, incInv: false,
    kmYear: 20000, fuelL: 8, fuelP: 6.5, evKwh: 18, elP: 1.5
  };
}

// VAT payer by default (this phase touches VAT payers); flip pIsVAT:false for the twin.
function base(overrides = {}) {
  return {
    ...carDefaults(),
    pInc: 200000, pKup: 0, pDed: 0, pTaxForm: 'skala', pSource: 'dg', pIsVAT: true, pValRyczaltRate: 0.085,
    jointFiling: false, sInc: 0, sKup: 0, sDed: 0, sSource: 'etat',
    ...overrides
  };
}

// ── §1 C2 — maintenance KUP base includes the non-deductible 50% VAT ──────────
describe('§1 C2 — maintenance KUP base includes non-deductible 50% VAT (R05 case 9)', () => {
  it('VAT payer: maKUP = (net + 50% VAT) × 0.75', () => {
    const res = calculateEngine(base({ pIsVAT: true, maintB: 2460, priceN: 200000, priceB: 246000 }));
    // maN = 2000, maVATDed = (2460 − 2000) × 0.5 = 230
    expect(res.maVATDed).toBeCloseTo(230, 6);
    expect(res.maKUP).toBeCloseTo(2230 * 0.75, 6); // 1672.50  // D1 (was 1500 — stripped 100% VAT)
  });

  it('non-VAT twin: maKUP = maintB × 0.75 (byte-identical guard)', () => {
    const res = calculateEngine(base({ pIsVAT: false, maintB: 2460 }));
    expect(res.maVATDed).toBe(0);
    expect(res.maKUP).toBeCloseTo(2460 * 0.75, 6); // 1845
  });
});

// ── §3 — fuel savings on the benefit side use net + non-recoverable 50% VAT ────
describe('§3 — benefit side uses annualFuelSavN (R07 §2.5/§3.2)', () => {
  it('VAT payer: fuelSavNominal === annualFuelSavN (net + 50% VAT) every year', () => {
    const res = calculateEngine(base({ pIsVAT: true, incFuel: true, kmYear: 20000 }));
    const expN = kupBase(5000); // ≈ 4532.52
    expect(res.annualFuelSavN).toBeCloseTo(expN, 4);
    res.rows.forEach((r) => {
      expect(r.fuelSavNominal).toBeCloseTo(expN, 4);
    });
    // cumFuelSav accumulates the net+50%VAT figure (not gross) for VAT payers.
    expect(res.cumFuelSav).toBeCloseTo(res.calcYears * expN, 2);
    // The gross figure is still returned for display.
    expect(res.annualFuelSav).toBeCloseTo(5000, 6);
  });

  it('non-VAT twin: annualFuelSavN === annualFuelSav; benefit side gross (byte-identical guard)', () => {
    const res = calculateEngine(base({ pIsVAT: false, incFuel: true, kmYear: 20000 }));
    expect(res.annualFuelSavN).toBe(res.annualFuelSav);
    expect(res.annualFuelSavN).toBeCloseTo(5000, 6);
    res.rows.forEach((r) => {
      expect(r.fuelSavNominal).toBeCloseTo(5000, 6);
    });
    expect(res.cumFuelSav).toBeCloseTo(res.calcYears * 5000, 6);
  });
});

// ── §4 C4 — upfront VAT stripped from KUP and refunded ────────────────────────
describe('§4 C4 — upfront VAT stripped from KUP and refunded (one-time, year 0)', () => {
  it('VAT payer, oper leasing: upfKUP = (net + 50% VAT) × 0.75; year-0 refund includes 50% VAT', () => {
    const res = calculateEngine(base({
      pIsVAT: true, upfront: 12300,
      financing: 'leasing', lType: 'oper',
      priceN: 200000, priceB: 246000,
      lD: 20000, lB: 10000, lM: 36, lI: 3000
    }));
    // upfN = 10000, upfVATDed = (12300 − 10000) × 0.5 = 1150
    expect(res.upfVATDed).toBeCloseTo(1150, 6);
    expect(res.upfKUP).toBeCloseTo(11150 * 0.75, 6); // 8362.50  // D1 (was 9225 — full gross)
    expect(res.rows[0].upfY).toBeCloseTo(11150 * 0.75, 6); // KUP lands only in year 0
    // One-time recoverable VAT shows in the year-0 ledger, nowhere else.
    expect(res.upfrontVATRefund).toBeCloseTo(1150, 6);
    expect(res.rows[0].upfrontVATRefundY).toBeCloseTo(1150, 6);
    for (let y = 1; y < res.rows.length; y++) expect(res.rows[y].upfrontVATRefundY).toBe(0);
  });

  it('VAT payer, amortized (cash): upfront enters depBase as net + 50% VAT, not gross', () => {
    const opts = { pIsVAT: true, financing: 'cash', carType: 'new', priceN: 150000, priceB: 184500 };
    const withUpf = calculateEngine(base({ ...opts, upfront: 12300 }));
    const noUpf = calculateEngine(base({ ...opts, upfront: 0 }));
    // depBase grows by upfN + upfVATDed = 11150 (not the gross 12300); cap doesn't bind here.
    expect(withUpf.depBase - noUpf.depBase).toBeCloseTo(11150, 6);
    expect(withUpf.upfKUP).toBe(0); // amortized → cost lives in depreciation, no one-off KUP
    expect(withUpf.rows[0].upfrontVATRefundY).toBeCloseTo(1150, 6); // still refunded year 0
  });

  it('non-VAT twin, oper leasing: upfKUP = upfront × 0.75; no upfront VAT refund', () => {
    const res = calculateEngine(base({
      pIsVAT: false, upfront: 12300,
      financing: 'leasing', lType: 'oper',
      lD: 20000, lB: 10000, lM: 36, lI: 3000
    }));
    expect(res.upfVATDed).toBe(0);
    expect(res.upfKUP).toBeCloseTo(12300 * 0.75, 6); // 9225
    expect(res.upfrontVATRefund).toBe(0);
    expect(res.rows[0].upfrontVATRefundY).toBe(0);
  });

  it('non-VAT twin, cash: upfront enters depBase gross (12300)', () => {
    const opts = { pIsVAT: false, financing: 'cash', priceN: 150000, priceB: 184500 };
    const withUpf = calculateEngine(base({ ...opts, upfront: 12300 }));
    const noUpf = calculateEngine(base({ ...opts, upfront: 0 }));
    expect(withUpf.depBase - noUpf.depBase).toBeCloseTo(12300, 6);
  });
});

// ── §5 R07 §2.7 — recurring VAT refund discounted at the outflow convention ────
describe('§5 R07 §2.7 — year-0 refund undiscounted; recurring refunds discount at ^y', () => {
  it('cash VAT payer: purchase refund undiscounted (y0); recurring maint VAT at ^y', () => {
    const res = calculateEngine(base({
      pIsVAT: true, inflation: 0.05, financing: 'cash',
      carType: 'new', priceN: 200000, priceB: 246000, maintB: 2460, upfront: 0
    }));
    // Year 0: purchase refund (23000) + maint VAT (230), both settle immediately → real === nominal.
    expect(res.rows[0].vatRefundY).toBeCloseTo(23000 + 230, 6);
    expect(res.rows[0].vatRefundRealY).toBeCloseTo(res.rows[0].vatRefundY, 6);
    // Year 1+: only the recurring maint VAT (230), discounted at ^y (was ^(y+1) before the fix).
    expect(res.rows[1].vatRefundY).toBeCloseTo(230, 6);
    expect(res.rows[1].vatRefundRealY).toBeCloseTo(230 / 1.05, 6);
    expect(res.rows[2].vatRefundRealY).toBeCloseTo(230 / Math.pow(1.05, 2), 6);
  });

  it('oper-leasing VAT payer: rows[0] real === nominal; rows[1] real === nominal / 1.05', () => {
    const res = calculateEngine(base({
      pIsVAT: true, inflation: 0.05,
      financing: 'leasing', lType: 'oper',
      priceN: 200000, priceB: 246000, maintB: 2460,
      lD: 20000, lB: 10000, lM: 36, lI: 3000
    }));
    expect(res.rows[0].vatRefundRealY).toBeCloseTo(res.rows[0].vatRefundY, 6);
    expect(res.rows[1].vatRefundRealY).toBeCloseTo(res.rows[1].vatRefundY / 1.05, 6);
    expect(res.rows[2].vatRefundRealY).toBeCloseTo(res.rows[2].vatRefundY / Math.pow(1.05, 2), 6);
  });

  it('identity preserved: Σ vatRefundRealY === cumRealVATRefund', () => {
    const res = calculateEngine(base({
      pIsVAT: true, inflation: 0.05, financing: 'leasing', lType: 'oper',
      priceN: 200000, priceB: 246000, maintB: 2460, lD: 20000, lB: 10000, lM: 36, lI: 3000
    }));
    const sum = res.rows.reduce((s, r) => s + r.vatRefundRealY, 0);
    expect(sum).toBeCloseTo(res.cumRealVATRefund, 6);
  });
});

// ── Acceptance — non-VAT payers see no change from any section ─────────────────
describe('Acceptance — non-VAT payers are unaffected by every section (VAT-only guard)', () => {
  const MODELS = [
    ['cash', { financing: 'cash' }],
    ['leasing-oper', { financing: 'leasing', lType: 'oper', lD: 20000, lB: 10000, lM: 36, lI: 3000 }],
    ['leasing-fin', { financing: 'leasing', lType: 'fin', lD: 20000, lB: 10000, lM: 36, lI: 3000 }],
    ['credit-standard', { financing: 'credit', cType: 'standard', cD: 40000, cIB: 4000, cM: 36 }],
    ['credit-5050', { financing: 'credit', cType: '5050', fee: 1500 }],
    ['credit-3x33', { financing: 'credit', cType: '3x33', fee: 1500 }]
  ];

  MODELS.forEach(([label, fin]) => {
    it(`${label}: the four VAT-only quantities are neutral for a non-VAT payer`, () => {
      const res = calculateEngine(base({
        pIsVAT: false, incFuel: true, maintB: 2460, upfront: 7000, kmYear: 20000, ...fin
      }));
      // New VAT-only return fields are inert.
      expect(res.upfVATDed).toBe(0);
      expect(res.upfrontVATRefund).toBe(0);
      expect(res.maVATDed).toBe(0);
      expect(res.annualFuelSavN).toBe(res.annualFuelSav);
      // The changed bases collapse to the pre-phase formulas (gross / ×0.75).
      expect(res.maKUP).toBeCloseTo(2460 * 0.75, 6);
      // upfKUP is a one-off KUP only for oper leasing (the non-amortized path); else it's in depBase.
      const operLease = res.financing === 'leasing' && res.lType === 'oper';
      expect(res.upfKUP).toBeCloseTo(operLease ? 7000 * 0.75 : 0, 6);
      // No VAT refund flows at all.
      res.rows.forEach((r) => {
        expect(r.upfrontVATRefundY).toBe(0);
        expect(r.vatRefundY).toBe(0);
        expect(r.vatRefundRealY).toBe(0);
        expect(r.fuelSavNominal).toBeCloseTo(res.annualFuelSav, 6);
      });
    });
  });
});
