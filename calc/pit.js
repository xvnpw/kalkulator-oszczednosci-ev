import { PIT_FREE_BASE, PIT_BRACKET, PIT_RATE_LOW, PIT_RATE_HIGH, PIT_LINIOWY_RATE } from './constants.js';

export function pit(inc){
  // The first arm also covers a loss year (inc < 0) — anything ≤ the kwota wolna is untaxed.
  if(inc<=PIT_FREE_BASE)return 0;
  if(inc<=PIT_BRACKET)return(inc-PIT_FREE_BASE)*PIT_RATE_LOW;
  return (PIT_BRACKET-PIT_FREE_BASE)*PIT_RATE_LOW+(inc-PIT_BRACKET)*PIT_RATE_HIGH;
}
export function pitJoint(total){return pit(total/2)*2}
export function margRate(inc){
  if(inc<=PIT_FREE_BASE)return 0;
  if(inc<=PIT_BRACKET)return PIT_RATE_LOW;
  return PIT_RATE_HIGH;
}
export function pitLiniowy(inc) {
  if (inc <= 0) return 0;
  return inc * PIT_LINIOWY_RATE;
}
export function pitRyczalt(revenue, rate) {
  if (revenue <= 0) return 0;
  return revenue * rate;
}
export function calculateIndividualPit(net, form, inc, ryczaltRate) {
  if (form === 'skala') return pit(net);
  if (form === 'liniowy') return pitLiniowy(net);
  if (form === 'ryczalt') return pitRyczalt(inc, ryczaltRate);
  throw new Error(`nieznana forma opodatkowania: ${form}`);
}

// Internal: skala bracket breakdown for inline arithmetic display
export function skalaBreakdown(net) {
  const t1 = Math.min(Math.max(net, 0), PIT_FREE_BASE);
  const t2 = Math.max(0, Math.min(net, PIT_BRACKET) - PIT_FREE_BASE);
  const t3 = Math.max(0, net - PIT_BRACKET);
  return [
    { band: t1, rate: 0, amount: 0 },
    { band: t2, rate: PIT_RATE_LOW, amount: t2 * PIT_RATE_LOW },
    { band: t3, rate: PIT_RATE_HIGH, amount: t3 * PIT_RATE_HIGH }
  ];
}

// Internal: build afterBrackets object for a row.
// D2: liniowyBase / ryczaltRevenue are the post-health-deduction figures supplied by the engine, so
// the displayed base/revenue and amount match the engine's taxWith. They fall back to the raw
// pNetY / pInc when omitted — keeps this module health-free (no health logic crosses into pit.js).
export function buildAfterBrackets(pNetY, pTaxForm, pInc, pValRyczaltRate, jointFiling, taxBaseAfter, liniowyBase, ryczaltRevenue) {
  if (jointFiling) {
    const halfBase = taxBaseAfter / 2;
    const brackets = skalaBreakdown(halfBase);
    return { type: 'joint', halfBase, brackets, taxOnHalf: brackets.reduce((s, b) => s + b.amount, 0) };
  }
  if (pTaxForm === 'skala') return { type: 'skala', brackets: skalaBreakdown(pNetY) };
  if (pTaxForm === 'liniowy') {
    const base = liniowyBase !== undefined ? liniowyBase : pNetY;
    return { type: 'liniowy', base, rate: PIT_LINIOWY_RATE, amount: pitLiniowy(base) };
  }
  if (pTaxForm === 'ryczalt') {
    const revenue = ryczaltRevenue !== undefined ? ryczaltRevenue : pInc;
    return { type: 'ryczalt', revenue, rate: pValRyczaltRate, amount: pitRyczalt(revenue, pValRyczaltRate) };
  }
  throw new Error(`nieznana forma opodatkowania: ${pTaxForm}`);
}
