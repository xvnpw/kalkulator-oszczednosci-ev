// ── CALC MODULES ──────────────────────────────────
// Pure calculation logic lives in ./calc/*. Imported here for use by the
// DOM/render/persistence code below, and re-exported so tests importing from
// ../script.js keep hitting the same public API.
import { EV_DEP_LIMIT } from './calc/constants.js';
import { pit, pitJoint, margRate, pitLiniowy, pitRyczalt,
         calculateIndividualPit, skalaBreakdown } from './calc/pit.js';
import { calculateHealthContribution } from './calc/health.js';
import { depSchedule, interestSchedule } from './calc/schedules.js';
import { calculateEngine } from './calc/engine.js';

// Re-export the documented public calc API (see CLAUDE.md "Exported functions")
export { pit, pitJoint, margRate, pitLiniowy, pitRyczalt,
         calculateIndividualPit, calculateHealthContribution,
         depSchedule, interestSchedule, calculateEngine };

// ── STATE ─────────────────────────────────────────
let carType='new', financing='cash';
// While init() restores a persisted config and does its first calc(), a corrupt ev-config can make
// the engine throw. In that window we let the throw propagate so init()'s recovery (discard config +
// reload to HTML defaults) still runs. For every live user edit, calc() instead shows a transient,
// non-destructive inline message — see the try/catch in calc().
let bootstrapping=false;

// ── HELPERS ───────────────────────────────────────
const $=id=>document.getElementById(id);
const n=id=>parseFloat($(id)?.value)||0;
const cb=id=>$(id)?.checked||false;

// ── CONFIG PERSISTENCE ────────────────────────────
export const EV_CONFIG_KEY = 'ev-config';
export const EV_CONFIG_VERSION = 2;

const CONFIG_VALUE_IDS = [
  'p_inc','p_kup','p_ded','p_tax_form','p_ryczalt_rate',
  's_inc','s_kup','s_ded','s_source','s_tax_form',
  'price_b','price_n','used_vat','used_dep_rate','upfront','insur','maint',
  'l_type','l_down','l_down_pct','l_buy','l_buy_pct','l_months','l_inst',
  'c_type','c_down','c_inst','c_months','c_rate','c_fee',
  'km','fuel_l','fuel_p','ev_kwh','el_p',
  'cpi','inv_r',
];

const CONFIG_CHECK_IDS = ['p_vat','joint_filing','s_vat'];

function fmt(x,d=0){
  if(x===null||!isFinite(x))return '—';
  const abs=Math.abs(x);
  const s=abs.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0').replace('.',',');
  return (x<0&&parseFloat(abs.toFixed(d))!==0?'−':'')+s;
}
function zl(x,d=2){const f=fmt(x,d);return f==='—'?f:f+'\u00a0zł'}
function pct(x){return fmt(x,1)+'%'}

// ── UI CONTROLS ───────────────────────────────────
function clps(h){h.classList.toggle('open');h.nextElementSibling.classList.toggle('open')}

// WP2: used_dep_rate_row visibility depends on BOTH carType (set here) and tax form (set in
// updateVisibility()) — a shared helper avoids the two call sites fighting over style.display.
// used_vat_row stays on the pure carType==='used' rule (it gates the VAT refund even for ryczałt).
function syncUsedRows(){
  const pForm = $('p_tax_form')?.value || 'skala';
  if($('used_dep_rate_row')) $('used_dep_rate_row').style.display=(carType==='used'&&pForm!=='ryczalt')?'block':'none';
  if($('used_vat_row')) $('used_vat_row').style.display=carType==='used'?'block':'none';
}

function setCarType(t,btn){
  carType=t;
  $('car_type_pills').querySelectorAll('.rpill').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  syncUsedRows();
  syncPrices('b');calc();
}

function setFin(f,btn){
  financing=f;
  $('fin_tabs').querySelectorAll('.fin-tab').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  ['cash','leasing','credit'].forEach(x=>$('tc_'+x).classList.remove('on'));
  $('tc_'+f).classList.add('on');
  calc();
}

function setOwner(o){}

// ── PRICE SYNC ────────────────────────────────────
function syncPrices(src){
  const usedType=$('used_vat')?.value||'gross_only';
  let b=n('price_b'),net=n('price_n'),vatAmt=0;

  if(src==='b'){
    if(carType==='new'||usedType==='vat23'){net=b/1.23;vatAmt=b-net;}
    else{net=b;vatAmt=0;}
    $('price_n').value=net.toFixed(2);
  } else {
    if(carType==='new'||usedType==='vat23'){b=net*1.23;vatAmt=b-net;}
    else{b=net;vatAmt=0;}
    $('price_b').value=b.toFixed(2);
  }

  const isVAT=cb('p_vat');
  let depBase;
  if(isVAT&&(carType==='new'||usedType==='vat23')){
    depBase=Math.min(net+vatAmt*0.5,EV_DEP_LIMIT);
  } else if(usedType==='vat_margin'){
    depBase=Math.min(b,EV_DEP_LIMIT);
  } else {
    depBase=Math.min(b,EV_DEP_LIMIT);
  }

  if($('vat_amt_lv'))$('vat_amt_lv').textContent=zl(vatAmt);
  if($('dep_base_lv'))$('dep_base_lv').textContent=zl(depBase);
  const usedDepRate = $('used_dep_rate')?.value || '0.40';
  if($('dep_rate_lv'))$('dep_rate_lv').textContent=carType==='new'?'20%/rok (60 mies.)':(usedDepRate==='0.20'?'20%/rok (60 mies.)':'40%/rok (30 mies.)');

  syncLeasingLive();syncCreditLive();
}

function syncL(src){
  const base=n('price_n');
  if(src==='down_amt')$('l_down_pct').value=(n('l_down')/base*100).toFixed(1);
  else if(src==='down_pct')$('l_down').value=(base*n('l_down_pct')/100).toFixed(2);
  else if(src==='buy_amt')$('l_buy_pct').value=(n('l_buy')/base*100).toFixed(1);
  else if(src==='buy_pct')$('l_buy').value=(base*n('l_buy_pct')/100).toFixed(2);
  syncLeasingLive();calc();
}

function syncLeasingLive(){
  const d=n('l_down'),b=n('l_buy'),m=n('l_months'),i=n('l_inst');
  if($('l_total_lv'))$('l_total_lv').textContent=zl((d+i*m+b)*1.23);
  if($('l_kup_lv'))$('l_kup_lv').textContent=zl((d+i*m+b)*0.75);
}

function syncCreditLive(){
  const cType=$('c_type')?.value||'standard';
  
  if (cType === 'standard') {
    if($('c_standard_fields')) $('c_standard_fields').style.display='block';
    if($('c_fee_field')) $('c_fee_field').style.display='none';
    
    const cD=n('c_down'),cI=n('c_inst'),cM=n('c_months');
    const principal=n('price_b')-cD;
    const totalInterest=Math.max(0,cI*cM-principal);
    if($('c_principal_lv'))$('c_principal_lv').textContent=zl(principal);
    if($('c_int_lv'))$('c_int_lv').textContent=zl(totalInterest);
    if($('c_total_lv'))$('c_total_lv').textContent=zl(cD+cI*cM);
  } else {
    if($('c_standard_fields')) $('c_standard_fields').style.display='none';
    if($('c_fee_field')) $('c_fee_field').style.display='block';
    
    const priceB = n('price_b');
    const downPct = cType === '5050' ? 0.50 : 0.334;
    const cD = priceB * downPct;
    const principal = priceB - cD;
    const fee = n('c_fee');
    
    if($('c_principal_lv'))$('c_principal_lv').textContent=zl(principal);
    if($('c_int_lv'))$('c_int_lv').textContent=zl(fee);
    if($('c_total_lv'))$('c_total_lv').textContent=zl(priceB + fee);
  }
}


function calc(){
  syncPrices('b');syncLeasingLive();syncCreditLive();

  const inputs = {
    carType, financing,
    pInc: n('p_inc'), pKup: n('p_kup'), pDed: n('p_ded'),
    pTaxForm: $('p_tax_form')?.value || 'skala',
    pSource: 'dg',
    pIsVAT: cb('p_vat'),
    pValRyczaltRate: parseFloat($('p_ryczalt_rate')?.value) || 0.085,

    jointFiling: cb('joint_filing'),
    sInc: n('s_inc'), sKup: n('s_kup'), sDed: n('s_ded'),
    sSource: $('s_source')?.value || 'etat',
    sIsVAT: cb('s_vat'),

    priceB: n('price_b'), priceN: n('price_n'),
    usedVat: $('used_vat')?.value||'gross_only',
    usedDepRate: $('used_dep_rate')?.value||'0.40',
    insurB: n('insur'), maintB: n('maint'), upfront: n('upfront'),
    lType: $('l_type')?.value||'oper',
    lD: n('l_down'), lB: n('l_buy'), lM: n('l_months'), lI: n('l_inst'),
    cType: $('c_type')?.value||'standard',
    cD: n('c_down'), cIB: n('c_inst'), cM: n('c_months'), cR: n('c_rate')/100, fee: n('c_fee'),
    inflation: n('cpi')/100, investReturn: n('inv_r')/100,
    incCar: true, incFuel: true, incInv: true,
    kmYear: n('km'), fuelL: n('fuel_l'), fuelP: n('fuel_p'), evKwh: n('ev_kwh'), elP: n('el_p')
  };

  // calculateEngine THROWS on invalid input (e.g. financing period 0 from a cleared field,
  // inflation ≤ −100%). A blank number field makes n(id) return 0, which can feed an illegal
  // value straight into the engine. Catch here — inside calc() — so every trigger (inline
  // oninput/onclick handlers and the delegated input/change listeners) gets graceful, non-
  // destructive feedback instead of a silently frozen UI on stale results. We do NOT clear
  // localStorage or reload (unlike init()'s recovery path): a transient error message is shown,
  // and the next VALID input recalculates and overwrites it with normal results.
  let res;
  try {
    res = calculateEngine(inputs);

    // res.baseTax already encodes the D2 health deduction for liniowy/ryczałt, so read it directly
    // rather than recomputing (which would drop the deduction and disagree with the panel).
    const pTaxBefore = inputs.jointFiling ? res.baseTax / 2 : res.baseTax;
    const pHealthBefore = calculateHealthContribution(res.pNet, inputs.pInc, inputs.pTaxForm, inputs.pSource);

    if($('p_net_lv'))$('p_net_lv').textContent=zl(res.pNet);
    if($('p_tax_lv'))$('p_tax_lv').textContent=zl(pTaxBefore);
    if($('p_health_lv'))$('p_health_lv').textContent=zl(pHealthBefore);

    if (inputs.jointFiling) {
      const sTaxBefore = res.baseTax / 2;
      const sHealthBefore = calculateHealthContribution(res.sNet, inputs.sInc, 'skala', inputs.sSource);
      if($('s_net_lv'))$('s_net_lv').textContent=zl(res.sNet);
      if($('s_tax_lv'))$('s_tax_lv').textContent=zl(sTaxBefore);
      if($('s_health_lv'))$('s_health_lv').textContent=zl(sHealthBefore);
    } else {
      if($('s_net_lv'))$('s_net_lv').textContent='—';
      if($('s_tax_lv'))$('s_tax_lv').textContent='—';
      if($('s_health_lv'))$('s_health_lv').textContent='—';
    }

    // Set legacy globals if needed (for test compatibility)
    if($('h_net_lv'))$('h_net_lv').textContent=zl(res.pNet);
    if($('w_net_lv'))$('w_net_lv').textContent=zl(res.sNet);
    if($('h_tax_lv'))$('h_tax_lv').textContent=zl(res.baseTax/2);
    if($('w_tax_lv'))$('w_tax_lv').textContent=zl(res.baseTax/2);

    renderResults(res);
  } catch (e) {
    // During init()'s config restore, re-throw so its destructive recovery (discard the corrupt
    // ev-config + reload to HTML defaults) runs. For live edits, show a transient inline message
    // instead — overwritten on the next successful render.
    if (bootstrapping) throw e;
    if($('res_body')) $('res_body').innerHTML =
      '<div class="info warn">Sprawdź wprowadzone wartości — niektóre pola są nieprawidłowe (np. okres finansowania musi wynosić co najmniej 1 miesiąc, a inflacja nie może być niższa niż −100%).</div>';
    if($('sticky_total')){
      $('sticky_total').textContent='—';
      $('sticky_total').className='rs-val';
    }
  }

  saveConfig();
}

// ── RENDER ────────────────────────────────────────
export function renderResults(d){
  const{rows,baseTax,totalTaxBefore,totalTaxAfter,cumTaxSav,cumRealTaxSav,cumHealthSav,cumFuelSav,cumRealFuelSav,totalSav,effectiveCost,totalFinCost,cumRealFinCost,invGross,invReal,calcYears,annualFuelCost,annualElCost,annualFuelSav,incCar,incFuel,incInv,isVAT,priceB,priceN,depBase,insKUP,maKUP,maVATDed,upfKUP,cumTotalKUP,totalInsur,totalMaint,cumVATRefund,cumRealVATRefund,purchaseVATRefund,opCostVATRefund,financing,lType,cumLostIncKUP,isKupAllowed,pSource,pTaxForm,pNet,sNet,jointFiling,pInc,cType,creditUnamortized}=d;
  const finNames={cash:'Gotówka',leasing:'Leasing',credit:'Kredyt'};
  const isRyczalt = pTaxForm === 'ryczalt';

  $('sticky_total').textContent=zl(totalSav,0);
  $('sticky_total').className='rs-val'+(totalSav<0?' rs-neg':'');
  if($('sticky_period')) $('sticky_period').textContent=`dla okresu ${calcYears} lat`;

  let h='';

  // KPI
  const realPurchCost = cumRealFinCost - cumRealTaxSav - cumRealVATRefund;
  const debtInflSav = totalFinCost - cumRealFinCost;
  const taxReduxPct = totalTaxBefore>0 ? cumTaxSav/totalTaxBefore*100 : 0;

  // D2(a): for ryczałt, the "Zaoszczędzony podatek" card is relabeled to "Zwrot VAT" — cumRealTaxSav
  // is structurally 0 (no KUP shield), so the only tax-system benefit is the VAT refund (0 for a
  // non-VAT payer, shown honestly as 0 zł rather than hiding the card).
  // D1(a): the "obniżenie o X%" sub-line is dropped for ryczałt only (always 0,0% and ignores VAT).
  const taxKpi = isRyczalt
    ? `<div class="kpi kpi-g"><div class="lbl">Zwrot VAT <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" style="white-space: normal; min-width: 250px;">Ryczałt nie pomniejsza podatku o koszty auta — jedyną korzyścią podatkową jest tu odliczenie/zwrot VAT z zakupu i eksploatacji (o ile jesteś płatnikiem VAT).</span></span></div><div class="val pos">${zl(cumRealVATRefund,0)}</div><div class="sub">realnie przez ${calcYears} lat</div></div>`
    : `<div class="kpi kpi-g"><div class="lbl">Zaoszczędzony podatek <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" style="white-space: normal; min-width: 250px;">Procent, o jaki zmniejszy się Twój całkowity podatek i/lub VAT do zapłaty dzięki kosztom działalności i odliczeniu VAT z auta — o ile dotyczy Twojej formy opodatkowania.</span></span></div><div class="val pos">${zl(cumRealTaxSav,0)}</div><div class="sub">obniżenie o ${pct(taxReduxPct)}</div></div>`;

  h+=`<div class="kpi-grid">
    <div class="kpi ${realPurchCost<0?'kpi-g':'kpi-b'}"><div class="lbl">Realny koszt zakupu <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Całkowity koszt posiadania (finansowanie) pomniejszony o korzyści.</span></span></div><div class="val ${realPurchCost<0?'pos':''}">${zl(realPurchCost,0)}</div><div class="sub">TCO bez paliwa/prądu</div></div>
    ${taxKpi}
    ${incFuel?`<div class="kpi kpi-g"><div class="lbl">Oszczędność na paliwie</div><div class="val pos">${zl(cumRealFuelSav,0)}</div><div class="sub">realnie przez ${calcYears} lat</div></div>`:''}
    <div class="kpi ${effectiveCost<0?'kpi-g':'kpi-r'}"><div class="lbl">Realny koszt (TCO) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Całkowity koszt posiadania (finansowanie + eksploatacja) pomniejszony o korzyści. <a href="#def-tco" class="tt-link">Czytaj więcej →</a></span></span></div><div class="val ${effectiveCost<0?'pos':'neg'}">${zl(effectiveCost,0)}</div><div class="sub">fin − korzyści + ekspl.</div></div>
    ${incInv?`<div class="kpi kpi-pu"><div class="lbl">Inwestycja alt. (realnie) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Realny (po inflacji) zysk z alternatywnego zainwestowania kapitału przeznaczonego na auto. <a href="#def-inv" class="tt-link">Czytaj więcej →</a></span></span></div><div class="val">${zl(invReal,0)}</div><div class="sub">zysk po inflacji CPI</div></div>`:''}
    ${cumLostIncKUP>0?`<div class="kpi kpi-y"><div class="lbl">Utracone koszty (niski dochód) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Niewykorzystana kwota kosztów z powodu zbyt niskiego dochodu.</span></span></div><div class="val neg">${zl(cumLostIncKUP,0)}</div><div class="sub">nieodliczone koszty</div></div>`:''}
  </div>`;

  // FUEL
  if(incFuel){
    h+=`<div class="bk">
      <div class="bk-t">⛽ vs ⚡ Porównanie kosztów napędu (rocznie)</div>
      <div class="fuel-cmp">
        <div class="fuel-side"><div class="fi">⛽</div><div class="fl">Paliwo / rok</div><div class="fv bad">${zl(annualFuelCost,0)}</div></div>
        <div class="fuel-vs">→</div>
        <div class="fuel-side"><div class="fi">⚡</div><div class="fl">Ładowanie / rok</div><div class="fv good">${zl(annualElCost,0)}</div></div>
      </div>
      <div class="fsave"><div class="fsl">Oszczędność roczna</div><div class="fsv">${zl(annualFuelSav,0)}</div></div>
    </div>`;
  }

  // 1. REALNY KOSZT ZAKUPU
  h+=`<div class="bk">
    <div class="bk-t">🚗 Realny koszt zakupu</div>
    <table class="dt">
      <tr><td>Całkowity koszt finansowania (brutto)</td><td class="num">${zl(totalFinCost)}</td></tr>
      ${debtInflSav > 0 ? `<tr><td>− Zysk z inflacji na długu (realnie) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" style="white-space: normal; min-width: 250px;">Korzyść wynikająca ze spłaty rat w przyszłości tańszym (zdeprecjonowanym przez inflację) pieniądzem.</span></span></td><td class="num" style="color:var(--g)">−${zl(debtInflSav)}</td></tr>` : ''}
      <tr><td>Skumulowany koszt finansowania (realnie)</td><td class="num">${zl(cumRealFinCost)}</td></tr>
      ${!isRyczalt ? `<tr><td>${cumHealthSav > 0 ? '− Oszczędność podatkowa i zdrowotna' : '− Oszczędność podatkowa'} (realnie)</td><td class="num" style="color:var(--g)">−${zl(cumRealTaxSav)}</td></tr>` : ''}
      ${cumRealVATRefund > 0 ? `<tr><td>− Zwrot VAT (realnie)</td><td class="num" style="color:var(--g)">−${zl(cumRealVATRefund)}</td></tr>` : ''}
      <tr class="tot"><td><strong>Realny koszt zakupu</strong></td><td class="num" style="color:${realPurchCost<0?'var(--g)':'var(--r)'}">${zl(realPurchCost)}</td></tr>
    </table>
  </div>`;

  // 2. TCO WATERFALL
  h+=`<div class="bk">
    <div class="bk-t">💰 Całkowity koszt posiadania (TCO)</div>
    <table class="dt">
      <tr><td>Koszt finansowania (łącznie brutto)</td><td class="num">${zl(totalFinCost)}</td></tr>
      ${debtInflSav > 0 ? `<tr><td>− Zysk z inflacji na długu (realnie) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" style="white-space: normal; min-width: 250px;">Korzyść wynikająca ze spłaty rat w przyszłości tańszym (zdeprecjonowanym przez inflację) pieniądzem.</span></span></td><td class="num" style="color:var(--g)">−${zl(debtInflSav)}</td></tr>` : ''}
      <tr><td>+ Ubezpieczenie ${calcYears} lat</td><td class="num">${zl(totalInsur)}</td></tr>
      <tr><td>+ Eksploatacja ${calcYears} lat</td><td class="num">${zl(totalMaint)}</td></tr>
      ${!isRyczalt ? `<tr><td>${cumHealthSav > 0 ? '− Oszczędność podatkowa i zdrowotna' : '− Oszczędność podatkowa'} (realnie)</td><td class="num" style="color:var(--g)">−${zl(cumRealTaxSav)}</td></tr>` : ''}
      ${cumRealVATRefund > 0 ? `<tr><td>− Zwrot VAT (realnie)</td><td class="num" style="color:var(--g)">−${zl(cumRealVATRefund)}</td></tr>` : ''}
      ${incFuel?`<tr><td>− Oszczędność paliwo→prąd (realnie)</td><td class="num" style="color:var(--b)">−${zl(cumRealFuelSav)}</td></tr>`:''}
      <tr class="tot"><td><strong>Realny koszt TCO</strong></td><td class="num" style="color:${effectiveCost<0?'var(--g)':'var(--r)'}">${zl(effectiveCost)}</td></tr>
    </table>
  </div>`;

  // 3. KOSZTY / VAT BREAKDOWN
  if(incCar){
    const vatRefundRows = `
      ${financing==='leasing' && lType==='oper'
        ? `<tr><td>VAT odliczony z rat leasingowych (50%)</td><td class="num">${zl(cumVATRefund - opCostVATRefund*calcYears)}</td></tr>`
        : `<tr><td>VAT do odliczenia przy zakupie (50%)</td><td class="num">${purchaseVATRefund > 0 ? zl(purchaseVATRefund) : 'nie dotyczy (zakup bez VAT / VAT marża)'}</td></tr>`
      }
      <tr><td>VAT odliczony eksploatacja × ${calcYears}</td><td class="num">${zl(opCostVATRefund*calcYears)}</td></tr>
    `;

    if(isKupAllowed){
      h+=`<div class="bk">
        <div class="bk-t">📋 Struktura kosztów</div>
        <table class="dt">
          <tr><td>Finansowanie</td><td class="num"><span class="bdg bdg-g">${finNames[financing]}</span></td></tr>
          <tr><td>Pojazd</td><td class="num"><span class="bdg bdg-b">${carType==='new'?'Nowy':'Używany'}</span>&nbsp;<span class="bdg ${isVAT?'bdg-g':'bdg-y'}">${isVAT?'Vatowiec':'Brak odliczenia VAT'}</span></td></tr>
          ${financing==='leasing' && lType==='oper' ? '' : `<tr><td>Podstawa amortyzacji</td><td class="num">${zl(depBase)}</td></tr>`}
          <tr><td>Koszty amortyzacja/raty <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" style="white-space: normal; min-width: 250px;">Suma wygenerowanych kosztów z tytułu rat lub amortyzacji.</span></span></td><td class="num">${zl(cumTotalKUP - (insKUP+maKUP)*calcYears)}</td></tr>
          <tr><td>Koszty ubezpieczenie × ${calcYears}</td><td class="num">${zl(insKUP*calcYears)}</td></tr>
          <tr><td>Koszty eksploatacja × ${calcYears}</td><td class="num">${zl(maKUP*calcYears)}</td></tr>
          ${isVAT?vatRefundRows:''}
          <tr class="tot"><td>ŁĄCZNE KOSZTY</td><td class="num">${zl(cumTotalKUP)}</td></tr>
        </table>
      </div>`;
    } else if(isVAT){
      h+=`<div class="bk">
        <div class="bk-t">📋 Zwrot VAT</div>
        <table class="dt">
          <tr><td>Finansowanie</td><td class="num"><span class="bdg bdg-g">${finNames[financing]}</span></td></tr>
          <tr><td>Pojazd</td><td class="num"><span class="bdg bdg-b">${carType==='new'?'Nowy':'Używany'}</span>&nbsp;<span class="bdg bdg-g">Vatowiec</span></td></tr>
          ${vatRefundRows}
          <tr class="tot"><td>ŁĄCZNY ZWROT VAT</td><td class="num">${zl(cumVATRefund)}</td></tr>
        </table>
        <div class="info" style="margin-top:8px;font-size:11px">Ryczałt ewidencjonowany nie pozwala na rozliczanie kosztów uzyskania przychodu ani amortyzacji — jedyną korzyścią podatkową jest tu odliczenie/zwrot VAT.</div>
      </div>`;
    } else {
      h+=`<div class="bk">
        <div class="bk-t">📋 Koszty firmowe</div>
        <div class="info" style="font-size:11px">Ryczałt ewidencjonowany nie pozwala na rozliczanie kosztów uzyskania przychodu ani amortyzacji, a brak rejestracji jako podatnik VAT oznacza brak możliwości odliczenia VAT — ten pojazd nie generuje tu korzyści podatkowych.</div>
      </div>`;
    }
  }

  // INVESTMENT
  if(incInv){
    h+=`<div class="bk">
      <div class="bk-t">📈 Inwestycja alternatywna</div>
      <table class="dt">
        <tr><td>Suma zainwestowanych transz <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt" style="white-space: normal; min-width: 250px;">Środki są inwestowane stopniowo, w transzach odpowiadających rocznym przepływom finansowania auta (wpłata własna, raty, wykup), zamiast jednorazowej wpłaty całej kwoty na początku.</span></span></td><td class="num">${zl(totalFinCost)}</td></tr>
        <tr><td>Nominalny zysk po ${calcYears} latach</td><td class="num">${zl(invGross)}</td></tr>
        <tr><td>Realny zysk (po inflacji CPI)</td><td class="num" style="color:var(--pu)">${zl(invReal)}</td></tr>
        <tr><td>Korzyść z zakupu auta</td><td class="num" style="color:var(--g)">${zl(totalSav)}</td></tr>
        <tr class="tot"><td>Różnica (inwest. − zakup)</td><td class="num" style="color:${invReal>totalSav?'var(--y)':'var(--g)'}">${zl(invReal-totalSav)}</td></tr>
      </table>
      <div class="info" style="margin-top:8px;font-size:11px">${invReal>totalSav?'📌 Inwestycja alternatywna daje wyższy realny zwrot niż zakup auta.':'✅ Zakup auta przynosi wyższe realne korzyści niż inwestycja.'}</div>
    </div>`;
  }

  // BASELINE BLOCK — pre-EV tax breakdown shown once above year list
  if(isRyczalt){
    // #10: ryczałt taxes revenue, not income — EV costs never change the PIT base, so a
    // revenue × rate table would be noise. Replace it with a short info note, mirroring the
    // "Koszty firmowe" / "Zwrot VAT" style used in the breakdown section above.
    h += `<div class="bk" style="margin-bottom:14px">
      <div class="bk-t">🧾 Podatek od przychodu (ryczałt)</div>
      <div class="info" style="font-size:11px">Ryczałt ewidencjonowany liczy podatek od przychodu, a nie od dochodu — koszty samochodu (raty, amortyzacja, eksploatacja) nie zmieniają tej podstawy i nie obniżają podatku. Jedyną korzyścią podatkową z zakupu auta jest tu odliczenie/zwrot VAT (o ile jesteś płatnikiem VAT) oraz oszczędność na paliwie.</div>
    </div>`;
  } else {
    const baseNet = pNet + sNet;
    let baselineHTML = `<div class="bk" style="margin-bottom:14px">
      <div class="bk-t">🧾 Podatek PIT przed EV (punkt wyjścia)</div>
      <table class="dt">`;
    if(jointFiling){
      const hb = baseNet / 2;
      const bb = skalaBreakdown(hb);
      baselineHTML += `<tr><td>Wspólna podstawa ÷ 2</td><td class="num">${zl(hb)}</td></tr>`;
      bb.forEach((b,i)=>{ if(b.band>0||i>0) baselineHTML+=`<tr><td>Próg ${['I','II','III'][i]} (${Math.round(b.rate*100)}%): ${zl(b.band)}</td><td class="num">${zl(b.amount)}</td></tr>`; });
      baselineHTML += `<tr class="tot"><td>Podatek należny (×2 razem)</td><td class="num" style="color:var(--r)">${zl(baseTax)}</td></tr>`;
    } else if(pTaxForm==='skala'){
      const bb = skalaBreakdown(pNet);
      bb.forEach((b,i)=>{ if(b.band>0||i>0) baselineHTML+=`<tr><td>Próg ${['I','II','III'][i]} (${Math.round(b.rate*100)}%): ${zl(b.band)}</td><td class="num">${zl(b.amount)}</td></tr>`; });
      baselineHTML += `<tr class="tot"><td>Podatek należny</td><td class="num" style="color:var(--r)">${zl(baseTax)}</td></tr>`;
    } else if(pTaxForm==='liniowy'){
      // D2: PIT base is pNet minus the deducted health contribution (≤ limit). Show the deduction
      // line so the displayed × 19% matches baseTax.
      const linBase = d.baseLiniowyBase ?? pNet;
      const linDed = pNet - linBase;
      if(linDed>0) baselineHTML += `<tr><td>Podstawa: ${zl(pNet)} − ${zl(linDed)} (odliczona składka zdrow.)</td><td class="num">${zl(linBase)}</td></tr>`;
      baselineHTML += `<tr><td>${zl(linBase)} × 19%</td><td class="num">${zl(baseTax)}</td></tr>`;
    }
    baselineHTML += `</table></div>`;
    h += baselineHTML;
  }

  // YEAR TABLE
  if(isRyczalt && !isVAT){
    // D5: ryczałt + non-VAT payer has no per-year tax content at all (no KUP shield, no VAT
    // refund) — show a single info note instead of a list of empty accordions.
    h+=`<div>
      <div class="bk-t" style="margin-bottom:10px;font-size:12px;font-weight:700;color:var(--t2)">📅 Rozliczenie rok po roku (Krok po kroku)</div>
      <div class="info" style="font-size:11px">Ta forma opodatkowania nie generuje korzyści podatkowych z auta — jedyną oszczędnością jest tu różnica w kosztach napędu (paliwo vs prąd), pokazana powyżej.</div>
    </div>`;
  } else {
  h+=`<div>
    <div class="bk-t" style="margin-bottom:10px;font-size:12px;font-weight:700;color:var(--t2)">📅 Rozliczenie rok po roku (Krok po kroku)</div>
    <div class="sbs-wrap">
      ${rows.map(r=>`
      <details class="sbs-det">
        <summary class="sbs-sum">
          <div class="sbs-s-left"><span class="bdg bdg-b" style="margin-right:8px">Rok ${r.y}</span></div>
          ${isRyczalt
            ? `<div class="sbs-s-right">Zwrot VAT (realnie): <strong style="color:var(--g)">${zl(r.vatRefundRealY)}</strong></div>`
            : `<div class="sbs-s-right">Realna oszczędność PIT: <strong style="color:var(--g)">${zl(r.realTaxSav)}</strong></div>`}
        </summary>
        <div class="sbs-body">
          ${!isRyczalt ? `
          <div class="sbs-row"><div class="sbs-lbl">Podstawa opodatkowania (Przed EV)</div><div class="sbs-val">${zl(r.taxBaseBefore)}</div></div>
          <div class="sbs-row"><div class="sbs-lbl">Należny podatek (Przed EV)</div><div class="sbs-val" style="color:var(--r)">${zl(r.baseTax)}</div></div>
          ` : ''}
          ${incCar?(isKupAllowed?`
          <div class="sbs-div">Koszty związane z EV:</div>
          ${financing==='leasing' && lType==='oper' ? `
          <div class="sbs-row sbs-sub"><div class="sbs-lbl">${isVAT ? 'Raty leasingowe netto (+50% VAT)' : 'Raty leasingowe brutto'}</div><div class="sbs-val">${zl(r.depKUP + r.intKUP)}</div></div>
          ` : `
          <div class="sbs-row sbs-sub"><div class="sbs-lbl">Amortyzacja</div><div class="sbs-val">${zl(r.depKUP)}</div></div>
          ${r.intKUP>0?`<div class="sbs-row sbs-sub"><div class="sbs-lbl">Odsetki</div><div class="sbs-val">${zl(r.intKUP)}</div></div>`:''}
          `}
          <div class="sbs-row sbs-sub"><div class="sbs-lbl">Eksploatacja / Ubezpieczenie</div><div class="sbs-val">${zl(r.opKUP)}</div></div>
          ${r.upfY>0?`<div class="sbs-row sbs-sub"><div class="sbs-lbl">Koszty początkowe</div><div class="sbs-val">${zl(r.upfY)}</div></div>`:''}
          <div class="sbs-row sbs-tot"><div class="sbs-lbl">Łączne wygenerowane koszty</div><div class="sbs-val">${zl(r.totalKUP)}</div></div>
          ${r.lostIncKUP>0?`<div class="sbs-row sbs-sub"><div class="sbs-lbl" style="color:var(--y)">Utracone koszty (niski dochód)</div><div class="sbs-val" style="color:var(--y)">+ ${zl(r.lostIncKUP)} do bazy</div></div>`:''}
          `:`
          <div class="sbs-div">Koszty związane z EV:</div>
          <div class="sbs-row"><div class="sbs-lbl" style="color:var(--t3)">Wybrana forma opodatkowania (ryczałt ewidencjonowany) nie pozwala na rozliczanie kosztów samochodu ani amortyzacji.${isVAT ? ' Jedyną korzyścią jest tu odliczenie/zwrot VAT — patrz sekcja „Zwrot VAT”.' : ''}</div></div>
          `):''}
          ${!isRyczalt ? `
          <div class="sbs-row"><div class="sbs-lbl">Podstawa opodatkowania (Po EV)</div><div class="sbs-val">${zl(r.taxBaseAfter)}</div></div>
          <div class="sbs-row"><div class="sbs-lbl">Należny podatek (Po EV)</div><div class="sbs-val" style="color:var(--g)">${zl(r.taxWith)}</div></div>
          <div class="sbs-row sbs-tot" style="margin-top:8px;border-top:1px dashed var(--b2);padding-top:8px"><div class="sbs-lbl">Oszczędność w podatku PIT (Delta nominalna)</div><div class="sbs-val" style="color:var(--g)">${zl(r.taxSav)}</div></div>
          <div class="sbs-row sbs-sub"><div class="sbs-lbl">Oszczędność na składce zdrowotnej (Delta nominalna)</div><div class="sbs-val" style="color:var(--g)">${zl(r.healthSav)}</div></div>
          <div class="sbs-row sbs-sub"><div class="sbs-lbl">Czynnik dyskontujący (CPI) <span class="tt"><i class="tt-i">ⓘ</i><span class="tt-txt">Obliczany na koniec roku jako (1 + inflacja)^rok, aby uwzględnić skumulowaną inflację.</span></span></div><div class="sbs-val">÷ ${(r.inflF).toFixed(4).replace('.', ',')}</div></div>
          <div class="sbs-row"><div class="sbs-lbl">Realna oszczędność łączna (PIT + zdrowotna)</div><div class="sbs-val" style="color:var(--g)">${zl(r.realTaxSav)}</div></div>
          ${(()=>{
            let ps='<details class="sbs-sub-det"><summary class="sbs-sub-sum">🧮 Podatek PIT — jak wyliczono</summary><div class="sbs-sub-body">';
            if(r.afterBrackets && r.afterBrackets.type==='skala'){
              r.afterBrackets.brackets.forEach((b,bi)=>{ if(b.band>0) ps+='<div class="sbs-row sbs-sub"><div class="sbs-lbl">Próg '+['I','II','III'][bi]+' ('+Math.round(b.rate*100)+'%): '+zl(b.band)+'</div><div class="sbs-val">'+zl(b.amount)+'</div></div>'; });
            }
            if(r.afterBrackets && r.afterBrackets.type==='joint'){
              ps+='<div class="sbs-row sbs-sub"><div class="sbs-lbl">Wspólna podstawa ÷ 2</div><div class="sbs-val">'+zl(r.afterBrackets.halfBase)+'</div></div>';
              r.afterBrackets.brackets.forEach((b,bi)=>{ if(b.band>0) ps+='<div class="sbs-row sbs-sub"><div class="sbs-lbl">Próg '+['I','II','III'][bi]+' ('+Math.round(b.rate*100)+'%): '+zl(b.band)+'</div><div class="sbs-val">'+zl(b.amount)+'</div></div>'; });
              ps+='<div class="sbs-row sbs-sub"><div class="sbs-lbl">Podatek od połowy × 2</div><div class="sbs-val">'+zl(r.taxWith)+'</div></div>';
            }
            if(r.afterBrackets && r.afterBrackets.type==='liniowy'){
              // D2: base is pNetY net of the deducted health contribution (afterBrackets.base), so × 19% matches taxWith.
              ps+='<div class="sbs-row sbs-sub"><div class="sbs-lbl">'+zl(r.afterBrackets.base)+' × 19%</div><div class="sbs-val">'+zl(r.taxWith)+'</div></div>';
            }
            ps+='<div class="sbs-row sbs-tot" style="border-top:1px dashed var(--bd);padding-top:4px;margin-top:4px"><div class="sbs-lbl">Oszczędność PIT (Δ podatek)</div><div class="sbs-val" style="color:var(--g)">'+zl(r.taxSav)+'</div></div>';
            if(r.lostIncKUP>0) ps+='<div class="sbs-row sbs-sub" style="color:var(--y)"><div class="sbs-lbl">Utracone koszty (koszty EV przekraczają dochód): max(0, '+zl(r.netCostKUP)+' − '+zl(pNet)+')</div><div class="sbs-val">'+zl(r.lostIncKUP)+'</div></div>';
            ps+='<div class="sbs-row sbs-sub" style="font-size:10.5px;color:var(--t3)"><div class="sbs-lbl">Stawka krańcowa (szacunek Δ podatku/zł kosztów)</div><div class="sbs-val">'+Math.round(r.mr*100)+'%</div></div>';
            ps+='</div></details>';
            return ps;
          })()}
          ${pSource==='dg' && !isRyczalt
            ? '<details class="sbs-sub-det"><summary class="sbs-sub-sum">🏥 Składka zdrowotna</summary><div class="sbs-sub-body">'
              + (r.healthDetail && r.healthDetail.tier
                ? '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Tier ryczałtu (przychody ' + r.healthDetail.tier + ')</div><div class="sbs-val">podstawa: ' + zl(r.healthDetail.base) + ' zł/mies.</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">' + zl(r.healthDetail.base) + ' × ' + pct(r.healthDetail.rate*100) + ' × 12</div><div class="sbs-val">' + zl(r.pHealthAfterY) + '</div></div>'
                : '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Podstawa: ' + zl(r.pNetY) + ' × ' + (r.healthDetail ? pct(r.healthDetail.rate*100) : '—') + '</div><div class="sbs-val">' + zl(r.pHealthAfterY) + '</div></div>'
                  + (r.healthDetail && r.healthDetail.floor ? '<div class="sbs-row sbs-sub" style="color:var(--y)"><div class="sbs-lbl">Zastosowano minimum (' + zl(r.healthDetail.minHealth) + ')</div><div class="sbs-val">tak</div></div>' : '')
              )
              + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Składka przed EV</div><div class="sbs-val" style="color:var(--r)">' + zl(r.pHealthBeforeY) + '</div></div>'
              + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Składka po EV</div><div class="sbs-val" style="color:var(--g)">' + zl(r.pHealthAfterY) + '</div></div>'
              + '<div class="sbs-row sbs-tot" style="border-top:1px dashed var(--bd);padding-top:4px;margin-top:4px"><div class="sbs-lbl">Oszczędność na składce</div><div class="sbs-val" style="color:var(--g)">' + zl(r.healthSav) + '</div></div>'
              + '</div></details>'
            : ''}
          ` : ''}
          ${isVAT
            ? '<details class="sbs-sub-det"><summary class="sbs-sub-sum">🧾 VAT</summary><div class="sbs-sub-body">'
              + (r.purchaseVATRefundY>0 ? '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Zwrot VAT przy zakupie: (' + zl(priceB) + ' − ' + zl(priceN) + ') × 50%</div><div class="sbs-val" style="color:var(--g)">' + zl(r.purchaseVATRefundY) + '</div></div>' : '')
              + (r.leasingVATRefundY>0 ? '<div class="sbs-row sbs-sub"><div class="sbs-lbl">VAT z rat leasingowych (raty × 23% × 50%)</div><div class="sbs-val" style="color:var(--g)">' + zl(r.leasingVATRefundY) + '</div></div>' : '')
              + (r.opVATRefundY>0 ? '<div class="sbs-row sbs-sub"><div class="sbs-lbl">VAT z eksploatacji (brutto − netto) × 50%</div><div class="sbs-val" style="color:var(--g)">' + zl(r.opVATRefundY) + '</div></div>' : '')
              + '<div class="sbs-row sbs-tot" style="border-top:1px dashed var(--bd);padding-top:4px;margin-top:4px"><div class="sbs-lbl">Zwrot VAT w tym roku</div><div class="sbs-val" style="color:var(--g)">' + zl(r.vatRefundY) + '</div></div>'
              + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Wartość realna (÷ ' + r.inflF.toFixed(4).replace('.',',') + ')</div><div class="sbs-val" style="color:var(--pu)">' + zl(r.vatRefundRealY) + '</div></div>'
              + '</div></details>'
            : ''}
          <details class="sbs-sub-det">
            <summary class="sbs-sub-sum">💳 Finansowanie — przepływy i amortyzacja</summary>
            <div class="sbs-sub-body">
              <div class="sbs-row sbs-sub"><div class="sbs-lbl">Przepływ gotówkowy w tym roku</div><div class="sbs-val" style="color:var(--r)">${zl(r.cashOutflowY)}</div></div>
              <div class="sbs-row sbs-sub"><div class="sbs-lbl">Wartość bieżąca NPV (÷ (1+CPI)^${r.y-1})</div><div class="sbs-val">${zl(r.cashOutflowNPV)}</div></div>
              <div class="sbs-row sbs-sub" style="font-size:10px;color:var(--t3)"><div class="sbs-lbl" style="width:100%">Przepływy dyskontowane na początek roku; korzyści podatkowe — na koniec roku rozliczeniowego.</div></div>
              ${(financing!=='leasing'||lType!=='oper')&&r.rawDepY>0
                ? '<div class="sbs-div" style="padding:3px 0;font-size:10.5px;color:var(--t3)">Amortyzacja:</div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Odpis roczny (podstawa × stawka)</div><div class="sbs-val">' + zl(r.rawDepY) + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Amortyzacja w kosztach (100% odpisu)</div><div class="sbs-val" style="color:var(--g)">' + zl(r.depKUP) + '</div></div>'
                : ''}
              ${financing==='credit'&&cType==='standard'&&r.principalPaidY!=null
                ? '<div class="sbs-div" style="padding:3px 0;font-size:10.5px;color:var(--t3)">Spłata kredytu:</div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Spłacony kapitał</div><div class="sbs-val">' + zl(r.principalPaidY) + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Odsetki</div><div class="sbs-val">' + zl(r.interestPaidY) + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Odsetki w kosztach (100%)</div><div class="sbs-val" style="color:var(--g)">' + zl(r.intKUP) + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Saldo pozostałe</div><div class="sbs-val">' + zl(r.remainingBalance) + '</div></div>'
                : ''}
              ${financing==='leasing'&&lType==='oper'
                ? '<div class="sbs-div" style="padding:3px 0;font-size:10.5px;color:var(--t3)">Leasing operacyjny:</div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Część kapitałowa rat</div><div class="sbs-val">' + zl(r.capitalNetY) + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Część odsetkowa rat</div><div class="sbs-val">' + zl(r.interestNetY) + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Współczynnik limitu 225k (prop)</div><div class="sbs-val">' + (r.propFactor!=null?r.propFactor.toFixed(4).replace('.',','):'—') + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Czynnik VAT (vatFactor)</div><div class="sbs-val">' + (r.leasingVatFactor!=null?r.leasingVatFactor.toFixed(3).replace('.',','):'—') + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Koszty kapitał = kapitał × vatFactor × prop (100%)</div><div class="sbs-val" style="color:var(--g)">' + zl(r.depKUP) + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Koszty odsetki = odsetki × vatFactor (100%)</div><div class="sbs-val" style="color:var(--g)">' + zl(r.intKUP) + '</div></div>'
                : ''}
              ${financing==='credit'&&(cType==='5050'||cType==='3x33')&&r.tranchesY&&r.tranchesY.length>0
                ? '<div class="sbs-div" style="padding:3px 0;font-size:10.5px;color:var(--t3)">Transze w tym roku:</div>'
                  + r.tranchesY.map(t=>'<div class="sbs-row sbs-sub"><div class="sbs-lbl">'+t.label+'</div><div class="sbs-val" style="color:var(--r)">'+zl(t.amount)+'</div></div>').join('')
                : ''}
            </div>
          </details>
          ${(incFuel||incInv)
            ? '<details class="sbs-sub-det"><summary class="sbs-sub-sum">📉 Inflacja, NPV i inwestycja</summary><div class="sbs-sub-body">'
              + (incFuel
                ? '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Oszczędność na paliwie (nominalna)</div><div class="sbs-val">' + zl(r.fuelSavNominal) + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">' + zl(r.fuelSavNominal) + ' ÷ ' + r.inflF.toFixed(4).replace('.',',') + ' = realna</div><div class="sbs-val" style="color:var(--g)">' + zl(r.fuelSav) + '</div></div>'
                : '')
              + (incInv
                ? '<div class="sbs-div" style="padding:3px 0;font-size:10.5px;color:var(--t3)">Inwestycja alternatywna:</div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">Saldo na początku roku</div><div class="sbs-val">' + zl(r.invBalanceBefore) + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">+ Transza w tym roku (= przepływ finansowania)</div><div class="sbs-val" style="color:var(--r)">' + zl(r.invTrancheY) + '</div></div>'
                  + '<div class="sbs-row sbs-sub"><div class="sbs-lbl">× (1 + stopa zwrotu) = zysk z inwestycji</div><div class="sbs-val" style="color:var(--g)">' + zl(r.invReturnY) + '</div></div>'
                  + '<div class="sbs-row sbs-tot" style="border-top:1px dashed var(--bd);padding-top:4px;margin-top:4px"><div class="sbs-lbl">Saldo na końcu roku</div><div class="sbs-val" style="color:var(--pu)">' + zl(r.invBalanceAfter) + '</div></div>'
                : '')
              + '</div></details>'
            : ''}
        </div>
      </details>
      `).join('')}
    </div>
  </div>`;
  }

  if(financing==='credit'&&cType==='standard'&&creditUnamortized>1){
    h+=`<div class="info" style="margin-top:8px;font-size:11px;color:var(--r)">⚠️ Rata nie spłaca kredytu w całości — po okresie pozostaje ${zl(creditUnamortized)} niespłaconego kapitału (kredyt balonowy). Ta część nie generuje odsetek zaliczanych do kosztów w kolejnych latach.</div>`;
  }

  // A2: the default disclaimer talks about 75% operating-cost deductibility and amortization —
  // both irrelevant for ryczałt (no KUP shield). Swap to a ryczałt-tailored one-liner.
  h+= isRyczalt
    ? `<div class="info" style="margin-top:12px;font-size:11px">* Realna oszczędność dyskontowana inflacją CPI. Ryczałt ewidencjonowany nie pomniejsza podatku o koszty samochodu. VAT: 50% odliczalne (art. 86a ust. 1 uVAT). TCO = finansowanie + eksploatacja − korzyści. Kalkulacja ma charakter informacyjny i nie stanowi porady podatkowej.</div>`
    : `<div class="info" style="margin-top:12px;font-size:11px">* Realna oszczędność dyskontowana inflacją CPI. Koszty używania (eksploatacja, paliwo): <strong>75% kosztów</strong>; amortyzacja, raty leasingu i odsetki kredytu: <strong>100% kosztów</strong>. VAT: 50% odliczalne (art. 86a ust. 1 uVAT). Limit amortyzacji EV: 225 000 zł (art. 23 ust. 1 pkt 4 u.p.d.o.f.). TCO = finansowanie + eksploatacja − korzyści. Kalkulacja ma charakter informacyjny i nie stanowi porady podatkowej.</div>`;

  $('res_body').innerHTML=h;
}

// Income-block clarity copy (Polish sentence case). These are persistent helper texts, not hover tooltips.
const INC_HINT_DG_BASE =
  'ⓘ Cała sprzedaż/obrót firmy bez VAT.'
  + '<span class="x">✕ to nie jest kwota „na rękę” po podatkach</span>';
const INC_HINT_DG_TAXPAYER =
  INC_HINT_DG_BASE
  + '<span class="x">✕ to nie jest zysk po kosztach — koszty wpisz w polu „Koszty działalności”</span>';
const INC_HINT_DG_SPOUSE =
  INC_HINT_DG_BASE
  + '<span class="x">✕ to nie jest zysk po kosztach — koszty wpisz w polu KUP</span>';
const INC_HINT_DG_RYCZALT =
  '<span class="note">Ryczałt liczy podatek od przychodu — koszty działalności go nie obniżają.</span>';
const INC_HINT_ETAT =
  'ⓘ Pensja brutto z umowy (przed podatkiem i składkami).'
  + '<span class="x">✕ to nie jest kwota „na rękę” / przelew na konto</span>';
const KUP_TT_DG = 'Koszty firmowe (faktury, amortyzacja itp.) — bez VAT, jeśli go odliczasz.';
const KUP_TT_RYCZALT = 'Ryczałt nie uwzględnia kosztów działalności.';
const OPER_COST_NOTE_FULL = 'Eksploatacja: <strong>75% netto + nieodliczony VAT → koszty</strong>. Ubezpieczenie: proporcjonalnie do <strong>limitu wartości 150 tys. zł</strong>. VAT: <strong>50% odliczalne</strong> (użytek mieszany).';
const OPER_COST_NOTE_VAT_ONLY = 'VAT: <strong>50% odliczalne</strong> (użytek mieszany).';

export function updateVisibility() {
  const pForm = $('p_tax_form')?.value || 'skala';
  const sForm = $('s_tax_form')?.value || 'skala';

  // Taxpayer is always DG now — income/form/ded fields stay enabled (no etat branch).
  if ($('p_tax_form')) $('p_tax_form').disabled = false;
  if ($('p_inc')) $('p_inc').disabled = false;
  if ($('p_ded')) $('p_ded').disabled = false;

  // Income-block clarity: DG hint (+ ryczałt cost note) and the matching KUP tooltip.
  if ($('p_inc_hint')) $('p_inc_hint').innerHTML = INC_HINT_DG_TAXPAYER + (pForm === 'ryczalt' ? INC_HINT_DG_RYCZALT : '');
  if ($('p_kup_tt')) $('p_kup_tt').textContent = pForm === 'ryczalt' ? KUP_TT_RYCZALT : KUP_TT_DG;

  if ($('p_kup')) {
    $('p_kup').disabled = (pForm === 'ryczalt');
  }

  const jointAllowed = pForm === 'skala';
  
  if (!jointAllowed) {
    if ($('joint_filing')) {
      $('joint_filing').checked = false;
      $('joint_filing').disabled = true;
    }
    if ($('joint_filing_row')) $('joint_filing_row').classList.add('hidden');
  } else {
    if ($('joint_filing')) $('joint_filing').disabled = false;
    if ($('joint_filing_row')) $('joint_filing_row').classList.remove('hidden');
  }

  const isJoint = $('joint_filing')?.checked || false;
  if (isJoint) {
    if ($('spouse_section')) $('spouse_section').classList.remove('hidden');
  } else {
    if ($('spouse_section')) $('spouse_section').classList.add('hidden');
  }

  if ($('p_health_lv')) {
    const pRow = $('p_health_lv').closest('.lv-row');
    if (pRow) pRow.style.display = pForm === 'liniowy' ? '' : 'none';
  }
  if ($('s_health_lv')) {
    const sRow = $('s_health_lv').closest('.lv-row');
    if (sRow) sRow.style.display = sForm === 'liniowy' ? '' : 'none';
  }

  // Taxpayer is always DG — VAT toggle is always available.
  if ($('p_vat_container')) $('p_vat_container').classList.remove('hidden');

  // #1: "Stawka ryczałtu" is always hidden now — the engine still uses its default 0.085, but the
  // rate has no effect on any visible savings/TCO figure for ryczałt, so it's no longer surfaced.
  $('p_ryczalt_rate_container')?.classList.add('hidden');

  // Ryczałt simplification: tax base / income / KUP / deductions / dep rows are structurally either
  // zero or have no effect on visible savings for ryczałt (see plan/ryczalt-ui-simplification.md).
  // Hide them via .hidden — never remove from the DOM (e2e/ui tests read these nodes), and toggling
  // back to skala/liniowy restores everything.
  const isRyczalt = pForm === 'ryczalt';
  const hide = (el, on) => el && el.classList.toggle('hidden', on);

  hide($('p_inc')?.closest('.f'), isRyczalt);                // #2 — "Przychód firmy — bez VAT"
  hide($('p_kup')?.closest('.f2'), isRyczalt);               // #3 + #4 — "Koszty działalności" + "Odliczenia od dochodu"
  hide($('p_net_lv')?.closest('.lv-row'), isRyczalt);        // #5a — "Dochód po odliczeniach"
  hide($('p_tax_lv')?.closest('.lv-row'), isRyczalt);        // #5b — "Należny podatek (przed odliczeniem EV)"
  hide($('dep_base_lv')?.closest('.lv-row'), isRyczalt);     // #6a — "Podstawa amortyzacji"
  hide($('dep_rate_lv')?.closest('.lv-row'), isRyczalt);     // #6b — "Stawka amortyzacji"

  // WP3: leasing/credit cards — hide KUP-only fields/figures inert for ryczałt.
  hide($('l_kup_lv')?.closest('.lv-row'), isRyczalt);        // "Łączne koszty przez okres" — KUP total (d+i*m+b)*0.75
  hide($('c_rate')?.closest('.f'), isRyczalt);               // "Oprocentowanie roczne" — feeds only KUP interest schedule

  // #7 / D3(b): amortization-claim text is irrelevant for ryczałt (no KUP shield) — hide in all
  // three places it appears.
  hide($('cash_amort_info'), isRyczalt);                     // #tc_cash info box
  hide($('credit_amort_info'), isRyczalt);                   // credit-tab amortization line
  if ($('l_type_oper')) $('l_type_oper').textContent = isRyczalt
    ? 'Operacyjny'
    : 'Operacyjny — raty w całości w kosztach (kapitał + odsetki)';
  if ($('l_type_fin')) $('l_type_fin').textContent = isRyczalt
    ? 'Finansowy'
    : 'Finansowy — amortyzacja + odsetki w kosztach';

  // WP1: "Eksploatacja: 75% netto..." footnote is a KUP/insurance-cap note — both clauses are inert
  // for ryczałt. Only the VAT clause remains relevant, and only for a VAT payer.
  const isVAT = $('p_vat')?.checked || false;
  if ($('oper_cost_note')) {
    const note = $('oper_cost_note');
    if (!isRyczalt) {
      note.innerHTML = OPER_COST_NOTE_FULL;
      note.classList.remove('hidden');
    } else if (isVAT) {
      note.innerHTML = OPER_COST_NOTE_VAT_ONLY;
      note.classList.remove('hidden');
    } else {
      note.classList.add('hidden');
    }
  }

  const sSource = $('s_source')?.value || 'etat';
  if (sSource === 'dg') {
    if ($('s_vat_container')) $('s_vat_container').classList.remove('hidden');
  } else {
    if ($('s_vat_container')) $('s_vat_container').classList.add('hidden');
    if ($('s_vat')) $('s_vat').checked = false;
  }

  // Spouse keeps etat/dg — income label + hint follow s_source.
  if ($('s_inc_label')) $('s_inc_label').textContent = sSource === 'dg' ? 'Przychód firmy — bez VAT (zł)' : 'Wynagrodzenie brutto — przed podatkiem (zł)';
  if ($('s_inc_hint')) $('s_inc_hint').innerHTML = sSource === 'dg' ? INC_HINT_DG_SPOUSE : INC_HINT_ETAT;

  if ($('s_tax_form')) $('s_tax_form').value = 'skala';

  // WP2: re-sync used_dep_rate_row / used_vat_row now that pForm is known (see syncUsedRows()).
  syncUsedRows();
}

// ── INIT ──────────────────────────────────────────
export function saveConfig(){
  try {
    const values = {};
    CONFIG_VALUE_IDS.forEach(id => {
      const el = $(id);
      if (el) values[id] = el.value;
    });
    const checks = {};
    CONFIG_CHECK_IDS.forEach(id => {
      const el = $(id);
      if (el) checks[id] = el.checked;
    });
    const cfg = { version: EV_CONFIG_VERSION, carType, financing, values, checks };
    localStorage.setItem(EV_CONFIG_KEY, JSON.stringify(cfg));
  } catch {}
}

export function restoreConfig(){
  let cfg;
  try {
    const raw = localStorage.getItem(EV_CONFIG_KEY);
    if (!raw) return;
    cfg = JSON.parse(raw);
  } catch { return; }
  if (!cfg || cfg.version !== EV_CONFIG_VERSION) return;

  if (cfg.values) {
    CONFIG_VALUE_IDS.forEach(id => {
      const el = $(id);
      if (el && Object.prototype.hasOwnProperty.call(cfg.values, id)) {
        el.value = cfg.values[id];
      }
    });
  }
  if (cfg.checks) {
    CONFIG_CHECK_IDS.forEach(id => {
      const el = $(id);
      if (el && Object.prototype.hasOwnProperty.call(cfg.checks, id)) {
        el.checked = cfg.checks[id];
      }
    });
  }

  if (cfg.carType === 'new' || cfg.carType === 'used') {
    const btn = [...($('car_type_pills')?.querySelectorAll('.rpill') || [])]
      .find(b => b.getAttribute('onclick')?.includes(`setCarType('${cfg.carType}'`));
    if (btn) setCarType(cfg.carType, btn);
  }

  if (cfg.financing === 'cash' || cfg.financing === 'leasing' || cfg.financing === 'credit') {
    const btn = [...($('fin_tabs')?.querySelectorAll('.fin-tab') || [])]
      .find(b => b.getAttribute('onclick')?.includes(`setFin('${cfg.financing}'`));
    if (btn) setFin(cfg.financing, btn);
  }
}

export function resetConfig(){
  try { localStorage.removeItem(EV_CONFIG_KEY); } catch {}
  location.reload();
}

function initTheme() {
  let saved;
  try { saved = localStorage.getItem('ev-theme') || 'dark'; } catch { saved = 'dark'; }
  document.documentElement.dataset.theme = saved;
  const btn = $('theme_toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      btn.setAttribute('aria-pressed', next === 'light' ? 'true' : 'false');
      try { localStorage.setItem('ev-theme', next); } catch {}
    });
  }
  // Listener in addition to the inline onclick: happy-dom (tests) doesn't invoke
  // inline onclick attributes on .click(), only real addEventListener handlers.
  const resetBtn = $('reset_config');
  if (resetBtn) resetBtn.addEventListener('click', resetConfig);
}

function init() {
  initTheme();
  // restoreConfig()…calc() are wrapped together: restoreConfig() restores persisted values and then
  // calls calc() (via setCarType/setFin), so a corrupt config can make the engine throw here too —
  // not only in the final calc() below.
  bootstrapping = true;
  try {
    restoreConfig();
    if ($('p_inc')) {
      document.querySelectorAll('.bp-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.bp-tab').forEach(b => b.classList.remove('on'));
          document.querySelectorAll('.bp-pane').forEach(p => p.classList.remove('on'));
          btn.classList.add('on');
          document.getElementById('bp-' + btn.dataset.tab).classList.add('on');
        });
      });
      updateVisibility();
      syncPrices('b');
      calc();
    }
  } catch (e) {
    // D5/D4/F3 made the pure engine throw on illegal inputs. The form is UI-controlled, but a
    // hand-edited / corrupt ev-config (valid version, bogus enum or e.g. inflation ≤ −100%) can feed
    // those values straight into calc(). Discard the offending config and reload so the HTML defaults
    // apply, rather than leaving a half-rendered page. Guard on presence so a genuine engine bug
    // (no saved config) surfaces instead of looping reloads.
    let hadConfig = false;
    try { hadConfig = localStorage.getItem(EV_CONFIG_KEY) !== null; } catch {}
    if (hadConfig) {
      try { localStorage.removeItem(EV_CONFIG_KEY); } catch {}
      location.reload();
    } else {
      throw e;
    }
  } finally {
    // Clear the bootstrap flag so later live edits get the graceful inline message, not a re-throw.
    bootstrapping = false;
  }
}

// Event delegation on document with capture phase enabled to capture non-bubbling events in tests
document.addEventListener('change', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
    updateVisibility();
    calc();
  }
}, true);

document.addEventListener('input', (e) => {
  if (e.target && e.target.tagName === 'INPUT') {
    syncPrices('b');
    syncLeasingLive();
    syncCreditLive();
    calc();
  }
}, true);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Expose to window for HTML onclick handlers
window.clps = clps;
window.setCarType = setCarType;
window.setFin = setFin;
window.setOwner = setOwner;
window.syncPrices = syncPrices;
window.syncL = syncL;
window.calc = calc;
window.updateVisibility = updateVisibility;
window.resetConfig = resetConfig;
