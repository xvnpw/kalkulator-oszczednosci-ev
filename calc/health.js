import {
  MIN_HEALTH_2026, AVG_WAGE_2026,
  HEALTH_RATE_SKALA, HEALTH_RATE_LINIOWY,
  RYCZALT_HEALTH_T1, RYCZALT_HEALTH_T2, RYCZALT_HEALTH_MULT
} from './constants.js';

export function calculateHealthContribution(net, inc, form, source) {
  if (source !== 'dg') {
    // R03 §2.1: a negative wage base (strata) can't produce a negative contribution.
    return Math.max(0, net * HEALTH_RATE_SKALA);
  }
  if (form === 'skala') {
    return Math.max(MIN_HEALTH_2026, net * HEALTH_RATE_SKALA);
  } else if (form === 'liniowy') {
    return Math.max(MIN_HEALTH_2026, net * HEALTH_RATE_LINIOWY);
  } else if (form === 'ryczalt') {
    if (inc <= RYCZALT_HEALTH_T1) return HEALTH_RATE_SKALA * RYCZALT_HEALTH_MULT[0] * AVG_WAGE_2026 * 12;
    if (inc <= RYCZALT_HEALTH_T2) return HEALTH_RATE_SKALA * RYCZALT_HEALTH_MULT[1] * AVG_WAGE_2026 * 12;
    return HEALTH_RATE_SKALA * RYCZALT_HEALTH_MULT[2] * AVG_WAGE_2026 * 12;
  }
  throw new Error(`nieznana forma opodatkowania: ${form}`);
}

// Internal: health contribution detail (base, rate, tier, floor flag) for rendering
export function healthContribDetail(netY, inc, form, source) {
  if (source !== 'dg') return { base: Math.max(0, netY), rate: HEALTH_RATE_SKALA, tier: null, floor: false, minHealth: MIN_HEALTH_2026 };
  if (form === 'skala') {
    return { base: netY, rate: HEALTH_RATE_SKALA, tier: null, floor: netY * HEALTH_RATE_SKALA < MIN_HEALTH_2026, minHealth: MIN_HEALTH_2026 };
  }
  if (form === 'liniowy') {
    return { base: netY, rate: HEALTH_RATE_LINIOWY, tier: null, floor: netY * HEALTH_RATE_LINIOWY < MIN_HEALTH_2026, minHealth: MIN_HEALTH_2026 };
  }
  if (form === 'ryczalt') {
    if (inc <= RYCZALT_HEALTH_T1) return { base: RYCZALT_HEALTH_MULT[0] * AVG_WAGE_2026 * 12, rate: HEALTH_RATE_SKALA, tier: '≤ 60 000 zł', floor: false, minHealth: MIN_HEALTH_2026 };
    if (inc <= RYCZALT_HEALTH_T2) return { base: RYCZALT_HEALTH_MULT[1] * AVG_WAGE_2026 * 12, rate: HEALTH_RATE_SKALA, tier: '≤ 300 000 zł', floor: false, minHealth: MIN_HEALTH_2026 };
    return { base: RYCZALT_HEALTH_MULT[2] * AVG_WAGE_2026 * 12, rate: HEALTH_RATE_SKALA, tier: '> 300 000 zł', floor: false, minHealth: MIN_HEALTH_2026 };
  }
  throw new Error(`nieznana forma opodatkowania: ${form}`);
}
