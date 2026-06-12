// ── DEPRECIATION SCHEDULE ─────────────────────────
// Implicit contract (R04 §3.2): the engine always passes a matched (rate, totalMonths) pair that
// fully writes the base off — `rate × totalMonths / 12 === 1` (e.g. 20%×60mo, 40%×30mo). The four
// engine-selected combinations all satisfy this, so Σ schedule === base when `years` is long enough.
// `years` shorter than the amortization horizon truncates the tail silently (by design); a `years`
// longer than the horizon pads with trailing zeros. No validation here — see the engine for the
// guarantee and tests/calculations.test.js for the per-combination invariant check.
// Simplification: the first year is a full year of depreciation — the art. 22h month-after-entry
// start (odpisy from the month following wprowadzenie do ewidencji) is not modeled.
export function depSchedule(base,rate,totalMonths,years){
  return Array.from({length:years},(_,y)=>{
    const m0=y*12,m1=Math.min((y+1)*12,totalMonths),cnt=Math.max(0,m1-m0);
    return cnt>0?base*rate*(cnt/12):0;
  });
}

// ── INTEREST SCHEDULE ─────────────────────────────
export function interestSchedule(principal,monthlyRate,netInstallment,totalMonths){
  let bal=principal,annual=[];
  for(let y=0;y<Math.ceil(totalMonths/12);y++){
    let yearInt=0;
    for(let m=0;m<12&&y*12+m<totalMonths;m++){
      const int=bal*monthlyRate;
      yearInt+=int;
      // D3: freeze the balance when the installment doesn't cover interest (negative amortization),
      // matching interestAmortSchedule — the balance never grows. For amortizing inputs
      // (netInstallment > int) Math.max is a no-op, so the two schedules agree exactly.
      bal=Math.max(0,bal-Math.max(0,netInstallment-int));
    }
    annual.push(yearInt);
  }
  return annual;
}

// D3: the engine uses this schedule. The balance freezes (never grows) when an installment doesn't
// cover the month's interest — the Math.min(…, bal) clamps principal to ≥ 0, so negative
// amortization holds the balance steady. interestSchedule above is aligned to the same semantics, so
// the two public functions agree exactly on every input (pinned in tests/phase5-robustness.test.js).
export function interestAmortSchedule(principal, monthlyRate, netInstallment, totalMonths) {
  let bal = principal;
  const years = [];
  for (let y = 0; y < Math.ceil(totalMonths / 12); y++) {
    let yearInt = 0, yearPrincipal = 0;
    for (let m = 0; m < 12 && y * 12 + m < totalMonths; m++) {
      const int = bal * monthlyRate;
      const prin = Math.max(0, Math.min(netInstallment - int, bal));
      yearInt += int;
      yearPrincipal += prin;
      bal -= prin; // prin ≤ bal by the Math.min above, so bal stays ≥ 0 — no extra clamp needed
    }
    years.push({ interest: yearInt, principal: yearPrincipal, remainingBalance: bal });
  }
  return years;
}
