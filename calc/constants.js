// ── 2027 update checklist ─────────────────────────────────────────────────
// Everything in this file is a statutory value that changes (almost) yearly. When updating to a
// new tax year, review every export below: minimum/average wage, the health-contribution rates,
// floors and ryczałt tiers, the depreciation cap, the 150 000 zł insurance cap, and the liniowy
// health-deduction limit. The PIT scale (free amount, bracket, rates) and the ryczałt health
// multipliers change less often but are kept here so there are no statutory literals scattered
// across calc/*. Single source of truth — pit.js / health.js / engine.js import from here.
// ──────────────────────────────────────────────────────────────────────────
export const MIN_WAGE_2026 = 4806;
// Annual minimum health contribution. This is the steady-state figure for rok składkowy luty 2026–
// styczeń 2027 (min wage × 9% × 12 = 5190,48). The exact calendar-2026 minimum is ~117,58 zł lower
// (5 072,90), because Jan 2026 still belongs to the previous składkowy year (R01 §2.2). Applied
// annually, not monthly — see Metodologia "Założenia i uproszczenia".
export const MIN_HEALTH_2026 = MIN_WAGE_2026 * 0.09 * 12; // 5190.48
export const AVG_WAGE_2026 = 9228.64; // GUS Q4-2025 avg. enterprise wage (ryczałt health basis for 2026)

// EV depreciation cap (PLN)
export const EV_DEP_LIMIT = 225000;

// ── PIT — skala podatkowa (art. 27 ust. 1 ustawy o PIT) ───────────────────
export const PIT_FREE_BASE = 30000;        // kwota wolna od podatku
export const PIT_BRACKET = 120000;         // próg I/II
export const PIT_RATE_LOW = 0.12;          // stawka w I progu
export const PIT_RATE_HIGH = 0.32;         // stawka w II progu
export const PIT_LINIOWY_RATE = 0.19;      // podatek liniowy (art. 30c)

// ── Składka zdrowotna (ustawa o świadczeniach opieki zdrowotnej) ──────────
export const HEALTH_RATE_SKALA = 0.09;     // skala / etat: 9% podstawy
export const HEALTH_RATE_LINIOWY = 0.049;  // liniowy: 4,9% podstawy
export const RYCZALT_HEALTH_T1 = 60000;    // ryczałt: górna granica I progu przychodu
export const RYCZALT_HEALTH_T2 = 300000;   // ryczałt: górna granica II progu przychodu
export const RYCZALT_HEALTH_MULT = [0.60, 1.00, 1.80]; // mnożniki przeciętnego wynagrodzenia (I/II/III próg)

// 75% KUP — koszty używania samochodu osobowego, art. 23 ust. 1 pkt 46a ustawy o PIT
// (MF objaśnienia podatkowe z 9.04.2020). Applies to OPERATING costs only — maintenance,
// fuel, operating-type initial fees. Depreciation, lease installments and credit interest
// are deductible in full (no 75% factor).
export const KUP_OPERATING_FACTOR = 0.75;

// AC/GAP insurance value cap (PLN), art. 23 ust. 1 pkt 47 ustawy o PIT. The 150 000 zł cap was
// NOT raised to 225 000 for EVs — premiums deduct in proportion min(1, 150000 / car value).
export const CAR_INSURANCE_LIMIT = 150000;

// Liniowy health-contribution deduction cap (PLN/yr, 2026) — obwieszczenie MF z 12.12.2025.
// A flat-tax taxpayer deducts paid health contributions from the PIT base up to this limit.
export const HEALTH_DEDUCT_LIMIT_LINIOWY_2026 = 14100;
