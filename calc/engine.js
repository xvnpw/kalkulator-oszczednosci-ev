import { EV_DEP_LIMIT, KUP_OPERATING_FACTOR, CAR_INSURANCE_LIMIT, HEALTH_DEDUCT_LIMIT_LINIOWY_2026 } from './constants.js';
import { pitJoint, margRate, calculateIndividualPit, pitLiniowy, pitRyczalt, buildAfterBrackets } from './pit.js';
import { calculateHealthContribution, healthContribDetail } from './health.js';
import { depSchedule, interestAmortSchedule } from './schedules.js';

export function calculateEngine(i){
  // Backward compatibility fallback for old tests
  const pInc = i.pInc !== undefined ? i.pInc : (i.costOwner === 'wife' ? i.wInc : i.hInc);
  const pKup = i.pKup !== undefined ? i.pKup : (i.costOwner === 'wife' ? i.wKup : i.hKup);
  const pDed = i.pDed !== undefined ? i.pDed : (i.costOwner === 'wife' ? i.wDed : i.hDed);
  const pSource = i.pSource !== undefined ? i.pSource : 'dg';
  const pTaxForm = i.pTaxForm !== undefined ? i.pTaxForm : 'skala';
  const pIsVAT = i.pIsVAT !== undefined ? i.pIsVAT : i.isVAT;
  // Coerce the ryczałt rate once at the boundary (the UI/tests may hand it over as a string) so the
  // downstream pitRyczalt / mr arithmetic never re-parses it ad hoc.
  const pValRyczaltRate = parseFloat(i.pValRyczaltRate !== undefined ? i.pValRyczaltRate : 0.085);

  const jointFiling = i.jointFiling !== undefined ? i.jointFiling : (i.costOwner !== undefined);
  const sInc = i.sInc !== undefined ? i.sInc : (i.costOwner === 'wife' ? i.hInc : i.wInc);
  const sKup = i.sKup !== undefined ? i.sKup : (i.costOwner === 'wife' ? i.hKup : i.wKup);
  const sDed = i.sDed !== undefined ? i.sDed : (i.costOwner === 'wife' ? i.hDed : i.wDed);
  const sSource = i.sSource !== undefined ? i.sSource : 'etat';

  // D4: the (1+inflation) discounting blows up at/below −100% (division by zero, then sign flip), so
  // fail fast rather than return plausible garbage. `!(x > -1)` also rejects NaN/undefined. The
  // investment alternative compounds (1+investReturn) the same way → guard it too when modeled.
  if (!(i.inflation > -1)) throw new RangeError('inflation musi być > -100%');
  if (i.incInv && !(i.investReturn > -1)) throw new RangeError('investReturn musi być > -100%');

  // D5: reject unknown enums up front — a typo otherwise silently falls into a default branch and
  // produces plausible-but-wrong numbers with no signal (R08 Tier 4 #1).
  if (i.carType !== 'new' && i.carType !== 'used') throw new Error(`nieznany typ pojazdu (carType): ${i.carType}`);
  if (i.financing !== 'cash' && i.financing !== 'leasing' && i.financing !== 'credit') throw new Error(`nieznany sposób finansowania (financing): ${i.financing}`);
  if (i.financing === 'leasing' && i.lType !== 'oper' && i.lType !== 'fin') throw new Error(`nieznany typ leasingu (lType): ${i.lType}`);
  if (i.financing === 'credit' && i.cType !== 'standard' && i.cType !== '5050' && i.cType !== '3x33') throw new Error(`nieznany typ kredytu (cType): ${i.cType}`);
  // Joint filing is a skala-only privilege (art. 6 ust. 8) — a skala/liniowy or skala/ryczałt hybrid
  // base is illegal. One engine-level guard covers both the base-tax and the bracket-display layers
  // (R02 §3.2 + R05 §3.1), keeping buildAfterBrackets pure.
  if (jointFiling && pTaxForm !== 'skala') throw new Error('wspólne rozliczenie jest dostępne tylko dla skali podatkowej (art. 6 ust. 8)');

  const pNet = Math.max(0, pInc - pKup - pDed);
  const sNet = jointFiling ? Math.max(0, sInc - sKup - sDed) : 0;

  const pHealthBefore = calculateHealthContribution(pNet, pInc, pTaxForm, pSource);
  const sHealthBefore = jointFiling ? calculateHealthContribution(sNet, sInc, 'skala', sSource) : 0;

  // D2: liniowy deducts paid health from the PIT base (≤ 14 100 zł/2026); ryczałt deducts 50% of
  // paid health (and the social-contribution deductions pDed) from revenue. The health *basis* is
  // income WITHOUT this deduction (health is a PIT-only relief), so pHealthBefore is computed first
  // — a one-pass, non-circular change. Skala: no health deduction. baseTax therefore sits below the
  // health computation.
  let baseTax = 0;
  let baseLiniowyBase, baseRyczaltRevenue;   // post-deduction baseline bases, for the display panel
  if (jointFiling) {
    baseTax = pitJoint(pNet + sNet);
  } else if (pTaxForm === 'liniowy') {
    baseLiniowyBase = Math.max(0, pNet - Math.min(pHealthBefore, HEALTH_DEDUCT_LIMIT_LINIOWY_2026));
    baseTax = pitLiniowy(baseLiniowyBase);
  } else if (pTaxForm === 'ryczalt') {
    baseRyczaltRevenue = Math.max(0, pInc - pDed - 0.5 * pHealthBefore);
    baseTax = pitRyczalt(baseRyczaltRevenue, pValRyczaltRate);
  } else {
    baseTax = calculateIndividualPit(pNet, pTaxForm, pInc, pValRyczaltRate);
  }

  const vatAmt = i.priceB - i.priceN;
  // C4: a mixed-use VAT payer recovers 50% of input VAT on the upfront fee and the
  // non-recovered 50% is itself KUP — mirror the maintenance/purchase treatment (art. 86a
  // ustawy o VAT, art. 23 ust. 1 pkt 43 lit. a ustawy o PIT). Non-VAT: upfN=upfront, upfVATDed=0.
  const upfN = pIsVAT ? i.upfront/1.23 : i.upfront;
  const upfVATDed = pIsVAT ? (i.upfront - upfN)*0.5 : 0;

  const isAmortized = i.financing === 'cash' || i.financing === 'credit' || (i.financing === 'leasing' && i.lType === 'fin');
  const addCosts = isAmortized ? (upfN + upfVATDed) : 0;

  let depBase;
  if(pIsVAT&&(i.carType==='new'||i.usedVat==='vat23')){
    depBase=Math.min(i.priceN+vatAmt*0.5 + addCosts,EV_DEP_LIMIT);
  } else {
    // VAT-marża i nabywca bez prawa do odliczenia VAT — oba liczą podstawę od ceny brutto (art. 22g ust. 3).
    depBase=Math.min(i.priceB + addCosts,EV_DEP_LIMIT);
  }

  const depRate=i.carType==='new'?0.20:(i.usedDepRate==='0.20'?0.20:0.40);
  const depMonths=i.carType==='new'?60:(i.usedDepRate==='0.20'?60:30);

  const maN=pIsVAT?i.maintB/1.23:i.maintB;
  // C2: the non-recoverable 50% VAT on maintenance is itself KUP — include it in the base
  // (was stripping 100% of VAT). Non-VAT: maVATDed=0 → maKUP === maintB×0.75 unchanged.
  const maVATDed=pIsVAT?(i.maintB-maN)*0.5:0;
  // D1b: OC 100% + AC capped by the 150 000 zł value proportion (art. 23 ust. 1 pkt 47 — not raised
  // to 225 000 for EVs). insurB is one field (no OC/AC split) so the AC rule applies to the whole
  // premium — conservative for the OC component. Same car-value convention as oper-leasing carValueKUP.
  const insCarValue=(pIsVAT&&(i.carType==='new'||i.usedVat==='vat23'))?i.priceN+vatAmt*0.5:i.priceB;
  const insKUP=insCarValue>0 ? i.insurB*Math.min(1,CAR_INSURANCE_LIMIT/insCarValue) : i.insurB;
  const maKUP=(maN+maVATDed)*KUP_OPERATING_FACTOR;         // 75% KUP — koszty używania, art. 23 ust. 1 pkt 46a
  const upfKUP=isAmortized ? 0 : (upfN+upfVATDed)*KUP_OPERATING_FACTOR; // C4; 75% KUP — operating-type initial cost (oper leasing)

  let calcYears,kupFromDep=[],kupFromInt=[],totalFinCost=0;
  let cashOutflows=[];
  let rawDepSchedule = Array.from({length: 10}, () => 0);
  let finDetails = [];
  let creditUnamortized = 0; // R06 §3.2: balloon principal left unpaid by a standard credit (cIB too low)

  if(i.financing==='cash'){
    calcYears=(i.carType==='new' || i.usedDepRate==='0.20') ? 5 : 3;
    rawDepSchedule = depSchedule(depBase,depRate,depMonths,calcYears);
    kupFromDep=rawDepSchedule.slice();                       // D1: amortyzacja w pełni KUP (nie jest kosztem używania)
    kupFromInt=Array.from({length:calcYears},()=>0);
    totalFinCost=i.priceB+i.upfront;
    cashOutflows=Array.from({length:calcYears},()=>0);
    cashOutflows[0]=totalFinCost;
    finDetails=Array.from({length:calcYears},(_,y)=>({rawDepY:rawDepSchedule[y]||0}));

  } else if(i.financing==='leasing'){
    // F3: lM=0 makes the balloon year (leaseLengthYears−1 = −1) unreachable and silently drops lD/lB
    // from KUP and partly from cash — reject it (UI enforces min="1" on l_months too).
    if(!(i.lM >= 1)) throw new RangeError('lM musi być ≥ 1');
    calcYears=Math.max(Math.ceil(i.lM/12), (i.carType==='new' || i.usedDepRate==='0.20') ? 5 : 3);
    const leaseLengthYears = Math.ceil(i.lM/12);
    totalFinCost=(i.lD+i.lI*i.lM+i.lB)*1.23+i.upfront;
    cashOutflows=Array.from({length:calcYears},()=>0);
    cashOutflows[0]=i.lD*1.23+i.upfront;
    if(i.lType==='oper'){
      const lessorCarValue = (i.carType==='new'||i.usedVat==='vat23') ? i.priceN : i.priceB;
      const totalLeaseNet = i.lD + i.lI * i.lM + i.lB;
      const totalInterestNet = Math.max(0, totalLeaseNet - lessorCarValue);
      // F1: clamp the imputed interest *rate* (not the capital) so capital+interest always
      // conserves totalLeaseNet. When imputed monthly interest exceeds lI, the old code clamped
      // capital to 0 but still claimed full interest + lD/lB capital → claimed basis > payments.
      // For every realistic lease (totalInterestNet ≤ lI×lM) Math.min is a no-op → identical math.
      const monthlyInterestNet = i.lM > 0 ? Math.min(i.lI, totalInterestNet / i.lM) : 0;
      const monthlyCapitalNet = i.lM > 0 ? i.lI - monthlyInterestNet : 0;
      const mDownCapitalNet = i.lM > 0 ? i.lD / i.lM : 0;

      const vatAmt=i.priceB-i.priceN;
      const carValueKUP = (pIsVAT && (i.carType==='new'||i.usedVat==='vat23')) ? i.priceN + vatAmt*0.5 : i.priceB;
      const prop = carValueKUP > 0 ? Math.min(1.0, EV_DEP_LIMIT / carValueKUP) : 1.0;

      for(let y=0;y<calcYears;y++){
        const m0=y*12,m1=Math.min((y+1)*12,i.lM),cnt=Math.max(0,m1-m0);

        let capitalNet = (monthlyCapitalNet + mDownCapitalNet) * cnt;
        if(y===leaseLengthYears-1) capitalNet += i.lB;

        let interestNet = monthlyInterestNet * cnt;

        const vatFactor = !pIsVAT ? 1.23 : 1.115;
        kupFromDep.push(capitalNet * vatFactor * prop);   // D1: część kapitałowa raty w pełni KUP
        kupFromInt.push(interestNet * vatFactor);         // D1: część odsetkowa raty w pełni KUP
        cashOutflows[y]+=i.lI*cnt*1.23;
        if(y===leaseLengthYears-1) cashOutflows[y]+=i.lB*1.23;
        finDetails.push({capitalNetY:capitalNet,interestNetY:interestNet,propFactor:prop,leasingVatFactor:vatFactor,leasingInstCnt:cnt,rawDepY:0});
      }
    } else {
      rawDepSchedule = depSchedule(depBase,depRate,depMonths,calcYears);
      kupFromDep=rawDepSchedule.slice();                     // D1: amortyzacja w pełni KUP
      finDetails=Array.from({length:calcYears},(_,y)=>({rawDepY:rawDepSchedule[y]||0}));
      // F2: część odsetkowa of a financial lease IS deductible (statute + CLAUDE.md). Impute the
      // financing margin the same way the oper branch does, and gross it up with the same vatFactor
      // (1.23 non-VAT, 1.115 VAT payer) so the KUP base is internally consistent with this model —
      // totalFinCost (above) already grosses the interest part at 1.23 and VAT payers recover 50%.
      const lessorCarValue = (i.carType==='new'||i.usedVat==='vat23') ? i.priceN : i.priceB;
      const totalLeaseNet = i.lD + i.lI*i.lM + i.lB;
      const totalInterestNet = Math.max(0, totalLeaseNet - lessorCarValue);
      const monthlyInterestNet = i.lM > 0 ? totalInterestNet / i.lM : 0;
      const vatFactor = !pIsVAT ? 1.23 : 1.115;
      kupFromInt=Array.from({length:calcYears},()=>0);
      for(let y=0;y<calcYears;y++){
        const m0=y*12,m1=Math.min((y+1)*12,i.lM),cnt=Math.max(0,m1-m0);
        kupFromInt[y] = monthlyInterestNet * cnt * vatFactor; // D1: część odsetkowa leasingu finansowego w pełni KUP
        cashOutflows[y]+=i.lI*cnt*1.23;
        if(y===leaseLengthYears-1) cashOutflows[y]+=i.lB*1.23;
      }
    }

  } else { // credit
    if (i.cType === 'standard') {
      // F3: cM=0 has the same degeneracy as lM=0 — reject it (UI enforces min="1" on c_months too).
      if(!(i.cM >= 1)) throw new RangeError('cM musi być ≥ 1');
      const loanYears=Math.ceil(i.cM/12);
      calcYears=Math.max(loanYears, (i.carType==='new' || i.usedDepRate==='0.20') ? 5 : 3);
      totalFinCost=i.cD+i.cIB*i.cM+i.upfront;
      const principal=i.priceB-i.cD;
      const amortSched=interestAmortSchedule(principal,i.cR/12,i.cIB,i.cM);
      // R06 §3.2: if cIB is too low to amortize, a balloon principal remains; surface it (not an error
      // — the user may genuinely model a balloon loan). Phase 6 documents it / renderResults may hint.
      creditUnamortized=amortSched.length?amortSched[amortSched.length-1].remainingBalance:0;
      const annualInt=amortSched.map(a=>a.interest);
      const depSched=depSchedule(depBase,depRate,depMonths,calcYears);
      rawDepSchedule=depSched;
      kupFromDep=Array.from({length:calcYears},(_,y)=>(depSched[y]||0));   // D1: amortyzacja w pełni KUP
      kupFromInt=Array.from({length:calcYears},(_,y)=>(annualInt[y]||0));  // D1: odsetki kredytu w pełni KUP

      cashOutflows=Array.from({length:calcYears},()=>0);
      cashOutflows[0]=i.cD+i.upfront;
      for(let y=0;y<calcYears;y++){
        const m0=y*12,m1=Math.min((y+1)*12,i.cM),cnt=Math.max(0,m1-m0);
        cashOutflows[y]+=i.cIB*cnt;
      }
      finDetails=Array.from({length:calcYears},(_,y)=>({
        rawDepY:depSched[y]||0,
        principalPaidY:amortSched[y]?amortSched[y].principal:0,
        interestPaidY:amortSched[y]?amortSched[y].interest:0,
        remainingBalance:amortSched[y]?amortSched[y].remainingBalance:0
      }));
    } else {
      const loanYears = i.cType === '5050' ? 1 : 2;
      // Invariant: calcYears = max(loanYears∈{1,2}, 3|5) ≥ 3 always, so the year-1 and year-2 tranches
      // always have a home — the old `calcYears>1 ? … : 0` / `>2 ? 2 : …` fallbacks were unreachable.
      calcYears = Math.max(loanYears, (i.carType==='new' || i.usedDepRate==='0.20') ? 5 : 3);

      totalFinCost = i.priceB + i.fee + i.upfront;
      const depSched=depSchedule(depBase,depRate,depMonths,calcYears);
      rawDepSchedule=depSched;

      kupFromDep=Array.from({length:calcYears},(_,y)=>(depSched[y]||0)); // D1: amortyzacja w pełni KUP
      kupFromInt=Array.from({length:calcYears},()=>0);
      kupFromInt[0]+=i.fee;                                              // D1: prowizja (koszt finansowania) w pełni KUP

      cashOutflows=Array.from({length:calcYears},()=>0);
      const pD=i.priceB*(i.cType==='5050'?0.50:0.334);
      cashOutflows[0]=pD+i.fee+i.upfront;
      if(i.cType==='5050'){
        cashOutflows[1]+=i.priceB-pD;
      } else {
        const p2=i.priceB*0.333;
        const p3=i.priceB-pD-p2;
        cashOutflows[1]+=p2;
        cashOutflows[2]+=p3;
      }
      // Build tranchesY: named tranches per year
      const tranchesY=Array.from({length:calcYears},()=>[]);
      tranchesY[0].push({label:`Wpłata I (${i.cType==='5050'?'50%':'33%'} ceny)`,amount:pD});
      if(i.fee>0) tranchesY[0].push({label:'Prowizja',amount:i.fee});
      if(i.upfront>0) tranchesY[0].push({label:'Wkład własny',amount:i.upfront});
      if(i.cType==='5050'){
        const p2=i.priceB-pD;
        tranchesY[1].push({label:'Wpłata II (50% ceny)',amount:p2});
      } else {
        const p2b=i.priceB*0.333;
        const p3b=i.priceB-pD-p2b;
        tranchesY[1].push({label:'Wpłata II (33% ceny)',amount:p2b});
        tranchesY[2].push({label:'Wpłata III (33% ceny, reszta)',amount:p3b});
      }
      finDetails=Array.from({length:calcYears},(_,y)=>({rawDepY:depSched[y]||0,tranchesY:tranchesY[y]}));
    }
  }

  const annualOpKUP=insKUP+maKUP;

  const annualFuelCost=i.kmYear/100*i.fuelL*i.fuelP;
  const annualElCost=i.kmYear/100*i.evKwh*i.elP;
  const annualFuelSav=annualFuelCost-annualElCost;

  // C5: net + non-recoverable 50% VAT (was stripping 100% of VAT). G/1.23×1.115 ≈ G×0.9065.
  const annualFuelSavN = pIsVAT ? annualFuelSav/1.23 * 1.115 : annualFuelSav;
  const isKupAllowed = pSource === 'dg' && pTaxForm !== 'ryczalt';

  // VAT pre-computation (before main loop)
  const purchaseVATEligible = i.carType==='new' || i.usedVat==='vat23';
  const purchaseVATRefund = (pIsVAT && isAmortized && purchaseVATEligible) ? vatAmt*0.5 : 0;
  const upfrontVATRefund = upfVATDed; // C4: one-time recoverable VAT on the upfront fee (year 0)
  const opCostVATRefund = maVATDed;

  let operLeaseVATSchedule = Array.from({length:calcYears},()=>0);
  if(pIsVAT && i.financing==='leasing' && i.lType==='oper'){
    const leaseLengthYearsVAT = Math.ceil(i.lM/12);
    for(let yv=0;yv<calcYears;yv++){
      const m0v=yv*12,m1v=Math.min((yv+1)*12,i.lM),cntv=Math.max(0,m1v-m0v);
      let opVAT = i.lI*cntv*0.23*0.5;
      if(yv===leaseLengthYearsVAT-1) opVAT += i.lB*0.23*0.5;
      operLeaseVATSchedule[yv]=opVAT;
    }
  }

  let invGross=0,invReal=0;
  const invSchedule = Array.from({length:calcYears}, () => ({invBalanceBefore:0,invTrancheY:0,invReturnY:0,invBalanceAfter:0}));
  if(i.incInv){
    let inv=0, investedSum=0;
    for(let y=0;y<calcYears;y++){
      const invBalanceBefore = inv;
      const invTrancheY = cashOutflows[y];
      inv += invTrancheY;
      investedSum += invTrancheY;
      const invReturnY = inv * i.investReturn;
      inv *= (1 + i.investReturn);
      invSchedule[y] = { invBalanceBefore, invTrancheY, invReturnY, invBalanceAfter: inv };
    }
    invGross = inv - investedSum;
    invReal = invGross / Math.pow(1 + i.inflation, calcYears);
  }

  let rows=[],cumTaxSav=0,cumHealthSav=0,cumFuelSav=0,cumTotalKUP=0;
  let cumRealTaxSav=0, cumRealFuelSav=0;
  let totalTaxBefore=0, totalTaxAfter=0;
  let cumLostIncKUP=0;

  for(let y=0;y<calcYears;y++){
    const depKUP=(i.incCar && isKupAllowed)?(kupFromDep[y]||0):0;
    const intKUP=(i.incCar && isKupAllowed)?(kupFromInt[y]||0):0;
    const carKUP=depKUP+intKUP;
    const upfY=(i.incCar && isKupAllowed)&&y===0?upfKUP:0;
    const opKUP=(i.incCar && isKupAllowed)?annualOpKUP:0;
    const totalKUP=carKUP+opKUP+upfY;
    cumTotalKUP+=totalKUP;

    let pNetY=pNet;
    let lostIncKUP=0;
    if(i.incCar && isKupAllowed){
      // When deductions exceed the year's income the excess is treated as wasted (no 5-year loss
      // carry-forward — art. 9 ust. 3); pNetY floors at 0 and the surplus is surfaced as lostIncKUP
      // (display: „niewykorzystany KUP"). Conservative — understates savings (R05 §3.2).
      lostIncKUP = Math.max(0, totalKUP - pNet);
      pNetY=Math.max(0,pNet-totalKUP);
    }

    const taxBaseBefore = pNet + sNet;
    const taxBaseAfter = pNetY + sNet;

    // ryczałt: przychód nie jest pomniejszany o KUP (art. 12 u.z.p.d.) — celowo pInc bez korekty.
    // The health tier (ryczałt) keys off revenue; skala/liniowy health and PIT key off net income and
    // ignore the `inc` argument. Since isKupAllowed excludes ryczałt, subtracting KUP from the revenue
    // passed here was provably unobservable (R05 F-ryczałt) → pInc directly.
    // D2: health is computed BEFORE the PIT base so the (PIT-only) health deduction can shrink it.
    const pHealthAfter = calculateHealthContribution(pNetY, pInc, pTaxForm, pSource);
    const healthSav = pHealthBefore - pHealthAfter;

    let taxWith=0;
    let liniowyBaseAfter, ryczaltRevenueAfter;   // post-deduction figures for the bracket display
    if(jointFiling){
      taxWith=pitJoint(taxBaseAfter);
    } else if (pTaxForm === 'liniowy') {
      // D2: deduct paid health (≤ limit) from the PIT base. When KUP cuts health by ΔH the base
      // shrinks ΔH less than before → the modeled shield claws back ~19% of ΔH (R01 §3.1).
      liniowyBaseAfter = Math.max(0, pNetY - Math.min(pHealthAfter, HEALTH_DEDUCT_LIMIT_LINIOWY_2026));
      taxWith=pitLiniowy(liniowyBaseAfter);
    } else if (pTaxForm === 'ryczalt') {
      // D2: 50% of paid health (and pDed social contributions) reduce taxable revenue. For ryczałt
      // isKupAllowed is always false → revenue stays pInc and health is constant → taxWith===baseTax.
      ryczaltRevenueAfter = Math.max(0, pInc - pDed - 0.5 * pHealthAfter);
      taxWith=pitRyczalt(ryczaltRevenueAfter, pValRyczaltRate);
    } else {
      taxWith=calculateIndividualPit(pNetY, pTaxForm, pInc, pValRyczaltRate);
    }
    // More KUP never raises the tax base, so taxSav = baseTax − taxWith is ≥ 0; the pNetY income
    // clamp above (wasted KUP when costs exceed income) stays — it is law-correct.
    const taxSav=baseTax-taxWith;

    cumTaxSav+=taxSav;
    cumHealthSav+=healthSav;

    const mr=pTaxForm==='skala'
      ? margRate(jointFiling ? (pNet + sNet) / 2 : pNet)
      : (pTaxForm==='liniowy'?0.19:pValRyczaltRate);
    // Timing convention: tax/health/fuel benefits settle after the year → discount at ^(y+1)
    // (inflF); cash outflows and VAT refunds settle within/at the start of the year → ^y.
    const inflF=Math.pow(1+i.inflation,y+1);
    const realTaxSav=(taxSav + healthSav)/inflF;
    const fuelSav=i.incFuel?annualFuelSavN/inflF:0; // R07: benefit side uses net+50%VAT for VAT payers

    const purchaseVATRefundY = y === 0 ? purchaseVATRefund : 0;
    const upfrontVATRefundY = y === 0 ? upfrontVATRefund : 0; // C4: one-time, year 0
    const leasingVATRefundY = operLeaseVATSchedule[y];
    const opVATRefundY = pIsVAT ? opCostVATRefund : 0;
    const recurringVATY = leasingVATRefundY + opVATRefundY;
    const vatRefundY = purchaseVATRefundY + upfrontVATRefundY + recurringVATY;
    // R07 §2.7: one-time purchase/upfront refunds settle ≤60 days after filing (art. 87 ust. 2) →
    // year-0, undiscounted (^0=1); recurring op-cost VAT discounts with the outflow convention ^y
    // (not the ^(y+1) benefit convention) so year 0 stays internally consistent.
    const vatRefundRealY = purchaseVATRefundY + upfrontVATRefundY + recurringVATY / Math.pow(1 + i.inflation, y);

    const netCostKUP = (i.incCar && isKupAllowed) ? totalKUP : 0; // returned row field (display + tests)
    const afterBrackets = buildAfterBrackets(pNetY, pTaxForm, pInc, pValRyczaltRate, jointFiling, taxBaseAfter, liniowyBaseAfter, ryczaltRevenueAfter);
    const pHealthBeforeY = pHealthBefore;
    // pInc (not pInc−netCostKUP): same unobservable-KUP argument as pHealthAfter above — ryczałt tier
    // keys off revenue (isKupAllowed false → netCostKUP 0), skala/liniowy health ignores `inc`.
    const pHealthAfterY = calculateHealthContribution(pNetY, pInc, pTaxForm, pSource);
    const healthDetail = healthContribDetail(pNetY, pInc, pTaxForm, pSource);

    cumRealTaxSav+=realTaxSav;
    if(i.incFuel){
      cumFuelSav+=annualFuelSavN; // R07: benefit side uses net+50%VAT for VAT payers
      cumRealFuelSav+=fuelSav;
    }
    totalTaxBefore+=baseTax;
    totalTaxAfter+=taxWith;
    cumLostIncKUP+=lostIncKUP;

    const cashOutflowY = cashOutflows[y] || 0;
    const cashOutflowNPV = cashOutflowY / Math.pow(1 + i.inflation, y);
    const fd = finDetails[y] || {};
    const { invBalanceBefore, invTrancheY, invReturnY, invBalanceAfter } = invSchedule[y];
    const fuelSavNominal = i.incFuel ? annualFuelSavN : 0; // nominal fuel saving (net+50% VAT for VAT payers)

    rows.push({y:y+1,carKUP,depKUP,intKUP,opKUP,upfY,totalKUP,lostIncKUP,taxBaseBefore,taxBaseAfter,baseTax,taxWith,taxSav,healthSav,realTaxSav,fuelSav,mr,inflF,pNetY,netCostKUP,afterBrackets,pHealthBeforeY,pHealthAfterY,healthDetail,vatRefundY,purchaseVATRefundY,upfrontVATRefundY,leasingVATRefundY,opVATRefundY,vatRefundRealY,cashOutflowY,cashOutflowNPV,...fd,invBalanceBefore,invTrancheY,invReturnY,invBalanceAfter,fuelSavNominal});
  }

  const cumVATRefund = rows.reduce((s, r) => s + r.vatRefundY, 0);
  const cumRealVATRefund = rows.reduce((s, r) => s + r.vatRefundRealY, 0);

  const cumRealFinCost = cashOutflows.reduce((sum, val, y) => sum + val / Math.pow(1 + i.inflation, y), 0);
  const totalInsur=i.insurB*calcYears,totalMaint=i.maintB*calcYears; // nominal sums kept for display + back-compat
  // effectiveCost is a real-terms TCO, so insurance/maintenance must be discounted too.
  // They are paid during each year → discount with the outflow convention (^y), same as cashOutflows.
  // (Deliberately kept outside cashOutflows/invSchedule: they earn no opportunity-cost (investment)
  //  treatment — folding them in is a larger model redesign. R07 §3.5; noted in Metodologia.)
  let realInsur=0, realMaint=0;
  for(let y=0;y<calcYears;y++){
    const f=Math.pow(1+i.inflation,y);
    realInsur+=i.insurB/f;
    realMaint+=i.maintB/f;
  }
  const totalSav=cumRealTaxSav+(i.incFuel?cumRealFuelSav:0)+cumRealVATRefund;
  const effectiveCost=cumRealFinCost-cumRealTaxSav-(i.incFuel?cumRealFuelSav:0)-cumRealVATRefund+realInsur+realMaint;

  // For backward compatibility, return hNet / wNet mapped from pNet / sNet
  return {
    hNet: pNet, wNet: sNet,
    pNet, sNet,
    rows,baseTax,totalTaxBefore,totalTaxAfter,cumTaxSav,cumRealTaxSav,cumHealthSav,cumFuelSav,cumRealFuelSav,totalSav,effectiveCost,totalFinCost,cumRealFinCost,invGross,invReal,calcYears,
    annualFuelCost,annualElCost,annualFuelSav,annualFuelSavN,
    incCar: i.incCar, incFuel: i.incFuel, incInv: i.incInv, isVAT: pIsVAT,
    priceB: i.priceB, priceN: i.priceN, depBase,
    insKUP,maKUP,maVATDed,upfKUP,upfVATDed,cumTotalKUP,totalInsur,totalMaint,realInsur,realMaint,
    cumVATRefund,cumRealVATRefund,purchaseVATRefund,upfrontVATRefund,opCostVATRefund,
    financing: i.financing, lType: i.lType, cType: i.cType, cumLostIncKUP, creditUnamortized,
    isKupAllowed, pSource,
    pTaxForm, pInc, jointFiling,
    pHealthBefore, baseLiniowyBase, baseRyczaltRevenue   // D2: baseline health + post-deduction bases (display)
  };
}
