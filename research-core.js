/* Shared presentation semantics. No data fetches, model predictions or dependencies. */
(function (root) {
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const monthStart = (iso, months) => {
    const [y, m, d] = iso.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1 - months, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, last));
    return target.toISOString().slice(0, 10);
  };
  // Same convention as update_cached_dashboard_nav.period_metric: last point BEFORE the boundary.
  const range = (points, start, end = '9999-12-31') => {
    const rows = points.filter(p => p.date <= end);
    const index = rows.findIndex(p => p.date >= start);
    return index < 0 ? [] : rows.slice(Math.max(0, index - 1));
  };
  const weekly = rows => {
    const weeks = new Map();
    for (const row of rows) {
      const date = new Date(row.date + 'T00:00:00Z');
      date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
      weeks.set(date.toISOString().slice(0, 10), row);
    }
    return [...weeks.values()];
  };
  const uniquePeriods = rows => {
    const periods = new Map();
    for (const row of rows || []) {
      const date = row.report_date || row.d;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) continue;
      const key = `${row.report_type || ''}|${date}`;
      const previous = periods.get(key);
      if (!previous || (row.announcement_date || row.a || '') >= (previous.announcement_date || previous.a || '')) periods.set(key, row);
    }
    return [...periods.values()].sort((a, b) => (a.report_date || a.d).localeCompare(b.report_date || b.d));
  };
  // Exchange-qualified comparison keys. HKEX numeric tickers use five digits;
  // exchange suffixes are retained, so an A share never merges into its H share.
  const securityKey = value => {
    const code=String(value || '').trim().toUpperCase(),hk=code.match(/^(\d{1,5})\.HK$/);
    return hk ? `${hk[1].padStart(5,'0')}.HK` : code;
  };
  const securityAliases = value => {
    const raw=String(value || '').trim().toUpperCase(),key=securityKey(raw),hk=key.match(/^(\d{5})\.HK$/);
    return [...new Set([raw,key,...(hk?[`${String(Number(hk[1])).padStart(4,'0')}.HK`]:[])])];
  };
  const securityValue = (values,code) => securityAliases(code).map(k=>values?.[k]).find(v=>v!==undefined);
  const normalizeHoldingPeriods = rows => {
    const names=new Map();
    for(const p of rows || [])for(const h of p.holdings || [])if(h.name && securityKey(h.name)!==securityKey(h.code) && !/\.(SH|SZ|BJ|HK)$/i.test(h.name))names.set(securityKey(h.code),h.name);
    let previous=null,previousScope=null;
    return selectReportVersions(rows).map(p=>{
      const groups=new Map();
      for(const h of p.holdings || []){
        const key=securityKey(h.code),row={...h,source_code:h.source_code || h.code,code:key,name:names.get(key) || h.name};
        if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
      }
      const conflicts=[],holdings=[];
      for(const [key,sourceRows] of groups){
        const first=sourceRows[0],same=sourceRows.every(h=>['weight','quantity','position_market_value_cny','float_share_percent'].every(k=>(h[k]??null)===(first[k]??null)));
        if(!same){conflicts.push({key,source_codes:sourceRows.map(h=>h.source_code)});holdings.push(...sourceRows.map(h=>({...h,security_key:key,security_conflict:true})));}
        else holdings.push({...first,source_codes:[...new Set(sourceRows.flatMap(h=>h.source_codes || [h.source_code]))]});
      }
      const sourceState=p.source_comparison_state || {comparison_status:p.comparison_status || null,comparable:typeof p.comparable==='boolean'?p.comparable:null};
      const sourceBlocked=sourceState.comparable===false || Boolean(sourceState.comparison_status && !['comparable','available'].includes(sourceState.comparison_status));
      const validWeights=holdings.length>0 && holdings.every(h=>typeof h.weight==='number' && Number.isFinite(h.weight) && h.weight>=0);
      const explicitZero=holdings.length===0 && (p.zero_stock_verified===true || p.equity_meta?.status==='not_applicable_zero_stock' || p.equity_meta?.stock_weight_nav===0);
      const totalStatus=conflicts.length?'security_conflict':validWeights?'available':explicitZero?'confirmed_zero':holdings.length?'missing_or_invalid_weights':'unverified_empty';
      const totalWeight=conflicts.length?null:validWeights?holdings.reduce((sum,h)=>sum+h.weight,0):explicitZero?0:null;
      const usable=!conflicts.length && (validWeights || explicitZero) && !sourceBlocked;
      const scope=p.scope || p.disclosure_scope || 'same_input_series';
      const comparable=Boolean(previous && usable && previousScope===scope),current=new Map(holdings.map(h=>[securityKey(h.code),h]));
      const entered=comparable?[...current].filter(([k])=>!previous.has(k)).map(([,h])=>({code:h.code,name:h.name})):[];
      const exited=comparable?[...previous].filter(([k])=>!current.has(k)).map(([,h])=>({code:h.code,name:h.name})):[];
      const status=conflicts.length?'not_computed_security_conflict':sourceBlocked?(sourceState.comparison_status || 'not_computed_incomparable_disclosure'):!usable?'not_computed_'+totalStatus:previous && previousScope!==scope?'not_computed_scope_changed':comparable?'comparable':'not_computed_no_previous';
      const result={...p,holdings,holding_count:groups.size,total_weight:totalWeight,total_weight_status:totalStatus,holdings_usable:usable,security_conflicts:conflicts,entered,exited,source_comparison_state:{...sourceState},comparison_status:status,comparable,change_counts:{entered:comparable?entered.length:null,exited:comparable?exited.length:null}};
      previous=usable?current:null;previousScope=usable?scope:null;return result;
    });
  };
  // Same selection tuple as scripts/report_semantics.py. Keep original ledgers.
  const selectReportVersions = (rows=[],knownOn=null) => {
    const groups=new Map(),cutoff=knownOn?knownOn+'T23:59:59.999999':null;
    for(const row of rows){
      const date=row.date || row.report_date || row.d;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date || ''))continue;
      const parsed=Date.parse(date+'T00:00:00Z');if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date)continue;
      const available=row.available_at || row.announcement_date || row.a || date;
      if(knownOn && (date>knownOn || available>cutoff))continue;
      if(!groups.has(date))groups.set(date,[]);groups.get(date).push(row);
    }
    const key=row=>{const available=row.available_at || row.announcement_date || row.a || row.date || row.report_date || row.d;return [available,row.acquired_at || available,row.content_sha256 || row.selected_version || ''].join('|');};
    return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,versions])=>{
      const ordered=[...versions].sort((a,b)=>key(a).localeCompare(key(b)));
      const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
      for(let i=1;i<ordered.length;i++)if(key(ordered[i])===key(ordered[i-1])&&JSON.stringify(stable(ordered[i]))!==JSON.stringify(stable(ordered[i-1])))throw new Error('同一报告版本凭据存在冲突，待核：'+date);
      const row=ordered.at(-1);
      return {...row,report_date:date,version_count:Math.max(row.version_count || 1,versions.length),selected_version:row.content_sha256 || row.selected_version || null,version_source:row.source || row.version_source || '既有历史缓存（未附版本凭据）'};
    });
  };
  const durationInfo = fund => {
    const d=fund?.duration || {},verified=d.verified===true;
    return {value:finite(d.value)?Number(d.value):null,report_date:d.report_date || null,source:d.source || null,verified,verification:verified?'已核净资产分母 · 原报告利率敏感性':'现有披露字段 · 分母待逐只核验',comparable:verified};
  };
  const bondChangeCounts = period => {
    const comparable=period?.comparison_status==='comparable';
    return {comparable,entered:comparable?(period.holdings || []).filter(h=>h.change==='新进').length:null,added:comparable?(period.holdings || []).filter(h=>h.change==='加仓').length:null,reduced:comparable?(period.holdings || []).filter(h=>h.change==='减仓').length:null,exited:comparable?(period.exited || []).length:null};
  };
  // Transformation date is verified; each predecessor-period amount is not.
  const predecessorInfo = fund => fund?.code==='025154.OF'?{code:'970072.OF',name:'华安证券合赢添利债券型集合资产管理计划',transition_date:'2025-10-21',status:'transition_verified_amounts_pending',source_url:'https://pdf.dfcfw.com/pdf/H2_AN202608311828782846_1.pdf',source_label:'2026年中报第17–18页（6.4.1）',source_sha256:'4eb4246dda763e5fd6b86dcfe83f4c72dd41dd1e3490b9a1f4157c357d505ca2'}:null;
  const assetPhase = (fund,date) => {const p=predecessorInfo(fund);return p?(date<p.transition_date?'前身阶段 · '+p.code:'当前合同阶段 · '+fund.code):null;};
  const quarterLag = (date, reference) => {
    if (!date || !reference) return null;
    const q = s => Number(s.slice(0, 4)) * 4 + Math.floor((Number(s.slice(5, 7)) - 1) / 3);
    return Math.max(0, q(reference) - q(date));
  };
  const peerWindow = campisi => ['all', '5y', '3y', '1y', 'ytd'].map(k => campisi.windows?.[k]).find(Boolean);
  const shareInfo = fund => root.FUND_LIFECYCLE_DATA?.share_classes?.[fund?.code] || null;
  const portfolioName = fund => shareInfo(fund)?.display_name || fund?.name || fund?.code || '';
  const representativeShare = fund => {
    const label=shareInfo(fund)?.representative_class;
    return `${label ? label+'类' : '代表份额'}（${fund?.code || '—'}）`;
  };
  const shareSearchText = fund => (shareInfo(fund)?.aliases || []).map(a =>
    [a.code,a.name,a.full_name,a.share_class ? a.full_name+a.share_class : ''].join(' ')).join(' ');
  const profileAvailability = profile => {
    if (!profile) return {label:'画像资料待补',reason:'还没有当前基金经理组合的画像资料。'};
    const status=profile.reliability || profile.status;
    if (status==='mature_3plus') return {label:'画像样本较充足',reason:''};
    if (status==='usable_2') return {label:'行为画像已可用',reason:''};
    if (profile.regime_status==='regime_change') return {label:'经理组合尚未稳定',reason:'完整持仓披露期间发生了经理变更，正在积累新经理组合的连续数据。'};
    if (profile.current_manager_match===false) return {label:'经理任期资料待核实',reason:'最近完整持仓的经理名单与现任经理尚未核对一致，当前经理的行为画像待补。'};
    if (!(profile.manager_names || profile.managers)?.length) return {label:'基金经理信息待补',reason:'当前基金经理名单尚未核实。'};
    if (!profile.regime_start) return {label:'经理任期资料待补',reason:'还没有匹配到现任经理组合的连续完整持仓记录。'};
    const reports=Number.isFinite(profile.full_disclosure_count)?profile.full_disclosure_count:(profile.history || []).filter(r=>r.date>=profile.regime_start).length;
    const comparisons=profile.completed_transition_count ?? profile.completed_transitions ?? 0;
    if (comparisons>=2) return {label:'现任经理画像资料待核实',reason:'已有至少2段完整持仓比较记录，画像所需的其余数据仍待核实。'};
    return {label:'行为画像数据待积累',reason:'当前经理组合的数据还不够，暂时不能生成稳定的行为画像。',sample:`现任经理组合已有${reports}次完整持仓披露、${comparisons}段可比较的持仓变化。`,detail:'行为画像需要同一经理组合至少2段有效的完整持仓比较记录。完整持仓来自半年报和年报，季度前十大不计入完整持仓。'};
  };
  // Display-only helpers shared by list, details, comparison and side charts.
  const percentDigits = step => Math.min(12, Math.max(2, Math.ceil(-Math.log10(Math.abs(step || 1) * 100)) + 1));
  function percent(value, digits = 2, signed = false, { preserveSmall = false } = {}) {
    if (!finite(value)) return '—';
    const number = Number(value) * 100;
    if (number === 0) return '0%';
    let precision = Math.min(12, Math.max(0, digits));
    if (preserveSmall) while (precision < 12 && Number(number.toFixed(precision)) === 0) precision++;
    if (Number(number.toFixed(precision)) === 0) return preserveSmall ? `${number < 0 ? '−' : signed ? '+' : ''}<0.000000000001%` : '0%';
    return `${signed && number > 0 ? '+' : ''}${number.toFixed(precision)}%`;
  }
  function displayAxis(values, { includeZero = false, floor = null, steps = 4 } = {}) {
    const data = values.filter(finite).map(Number);
    if (!data.length) return { min: 0, max: 1, ticks: [], step: 1, digits: 2 };
    const low = Math.min(...data, ...(includeZero ? [0] : [])), high = Math.max(...data, ...(includeZero ? [0] : [])), center = (low + high) / 2;
    const span = high > low ? Math.max(high - low, Math.abs(center) * 1e-8, 1e-10) : Math.max(Math.abs(center) * 0.002, 0.0001);
    const min = floor === null ? center - span * 0.6 : Math.max(floor, center - span * 0.6);
    const max = Math.max(center + span * 0.6, min + span * 0.1);
    const rough = (max - min) / steps, power = 10 ** Math.floor(Math.log10(rough));
    const multiple = [1, 2, 2.5, 5, 10].find(value => value * power >= rough), step = multiple * power;
    const digits = Math.min(12, Math.max(2, -Math.floor(Math.log10(step)) + (multiple === 2.5 ? 1 : 0)));
    const ticks = [];
    for (let i = Math.ceil(min / step); i * step <= max + step * 1e-9; i++) ticks.push(Number((i * step).toPrecision(12)));
    return { min, max, ticks, step, digits };
  }
  const api = { percent, percentDigits, displayAxis, finite, monthStart, range, weekly, uniquePeriods, quarterLag, peerWindow, shareInfo, portfolioName, representativeShare, shareSearchText, profileAvailability, securityKey, securityAliases, securityValue, normalizeHoldingPeriods, selectReportVersions, durationInfo, bondChangeCounts, predecessorInfo, assetPhase };
  root.FundResearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* One shared freshness request for all category market panels. */
(function(root){
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let pending;
  function load(){
    if(root.FUND_MARKET_UPDATE_STATUS)return Promise.resolve(root.FUND_MARKET_UPDATE_STATUS);
    if(pending)return pending;
    pending=new Promise((resolve,reject)=>{
      const script=document.createElement('script');let done=false;
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);script.remove();error?reject(error):resolve(root.FUND_MARKET_UPDATE_STATUS);};
      const timer=setTimeout(()=>finish(new Error('市场更新时间暂未加载')),12000);
      script.src='https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/market_update_status.js';
      script.onload=()=>finish(root.FUND_MARKET_UPDATE_STATUS?.categories?null:new Error('市场更新时间暂未加载'));
      script.onerror=()=>finish(new Error('市场更新时间暂未加载'));
      document.head.append(script);
    }).catch(error=>{pending=null;throw error;});
    return pending;
  }
  function text(item){
    if(!item)return '更新时间暂未加载';
    const parts=Object.entries(item.data_dates||{}).map(([label,date])=>esc(label)+' '+esc(date||'暂无数据'));
    parts.push('生成时间 '+esc(item.generated_at?item.generated_at.slice(0,19).replace('T',' '):'未记录'));
    if(item.status==='failed')parts.push('本轮更新失败，保留上次结果');
    return parts.join(' · ');
  }
  async function mount(host,category){
    if(!host)return;
    host.textContent='正在读取更新时间…';
    try{const data=await load();if(host.isConnected)host.innerHTML=text(data.categories?.[category]);}
    catch(error){if(host.isConnected)host.textContent=error.message;}
  }
  root.FundMarketStatus={load,mount,text};
})(typeof window!=='undefined'?window:globalThis);

/* Category overview: one small cached payload, no per-fund downloads or fitting. */
(function(root){
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(x,n=2)=>Number.isFinite(x)?x.toFixed(n):'—';
  let promise;
  function load(){
    if(root.FUND_BOND_MARKET)return Promise.resolve(root.FUND_BOND_MARKET);
    if(promise)return promise;
    promise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');let done=false;
      const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);s.remove();error?reject(error):resolve(root.FUND_BOND_MARKET);};
      const timer=setTimeout(()=>finish(new Error('市场概览加载超时')),20000);
      s.src='https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/bond_market_overview.js';
      s.onload=()=>finish(Array.isArray(root.FUND_BOND_MARKET?.aggregate)?null:new Error('市场概览数据缺失'));
      s.onerror=()=>finish(new Error('市场概览加载失败'));
      document.head.append(s);
    }).catch(e=>{promise=null;throw e;});
    return promise;
  }
  function chart(host,series,{dual=false,rightUnit=null}={}){
    series=series.map((s,i)=>({...s,axis:dual?(s.axis??Math.min(i,1)):0})).filter(s=>s.points.some(p=>Number.isFinite(p[1])));
    dual=dual&&series.some(s=>s.axis===0)&&series.some(s=>s.axis===1);
    if(!dual)series=series.map(s=>({...s,axis:0}));
    const points=series.flatMap(s=>s.points).filter(p=>Number.isFinite(p[1]));
    if(!points.length){host.innerHTML='<p class="method-note">暂无可用曲线。</p>';return;}
    const W=Math.max(360,Math.min(920,Math.round(host.getBoundingClientRect().width||920))),H=235,L=54,R=dual?54:18,T=24,B=34;
    const days=[...new Set(points.map(p=>p[0]))].sort(),x0=Date.parse(days[0]),x1=Date.parse(days.at(-1));
    const X=d=>L+(Date.parse(d)-x0)/(x1-x0||1)*(W-L-R);
    const scales=(dual?[0,1]:[0]).map(axis=>{
      const v=series.filter(s=>s.axis===axis).flatMap(s=>s.points).map(p=>p[1]).filter(Number.isFinite);const a=root.ReviewCore.scale(v);return [a.min,a.max];
    });
    const tickDigits=scales.map(([min,max])=>Math.min(12,Math.max(2,Math.ceil(-Math.log10(Math.abs((max-min)/4)||1))+1)));
    const tickLabel=(value,axis)=>{const rounded=Number(value.toFixed(tickDigits[axis]));return (rounded===0?0:rounded).toFixed(tickDigits[axis]);};
    const Y=(v,i)=>T+(1-(v-scales[i][0])/(scales[i][1]-scales[i][0]))*(H-T-B);
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s=>s.label).join('与'))}" tabindex="0">`;
    for(let i=0;i<=4;i++){
      const y=T+(H-T-B)*i/4;
      svg+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#e3eaf1"/><text x="${L-8}" y="${y+4}" text-anchor="end">${tickLabel(scales[0][1]-(scales[0][1]-scales[0][0])*i/4,0)}</text>`;
      if(dual)svg+=`<text x="${W-R+8}" y="${y+4}">${tickLabel(scales[1][1]-(scales[1][1]-scales[1][0])*i/4,1)}</text>`;
    }
    svg+=`<text x="${L}" y="14">${esc(series[0].unit)}</text>${dual?`<text x="${W-R}" y="14" text-anchor="end">${esc(rightUnit||series.find(s=>s.axis===1).unit)}</text>`:''}`;
    const dateTicks=Math.min(days.length,W<600?3:5);
    const dateIndexes=[...new Set(Array.from({length:dateTicks},(_,i)=>Math.round((days.length-1)*i/Math.max(1,dateTicks-1))))];
    dateIndexes.forEach((n,i)=>{const d=days[n];svg+=`<text x="${X(d)}" y="${H-9}" text-anchor="${i===0?'start':i===dateIndexes.length-1?'end':'middle'}">${esc(d)}</text>`;});
    series.forEach((s,i)=>{let path='',last=null;s.points.forEach(([d,v])=>{
      if(!Number.isFinite(v)){last=null;return;}const gap=last&&(Date.parse(d)-Date.parse(last)>12*86400000);
      path+=`${last&&!gap?'L':'M'}${X(d).toFixed(2)},${Y(v,s.axis).toFixed(2)} `;last=d;
    });svg+=`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2"/>`;});
    svg+=`<line data-cursor y1="${T}" y2="${H-B}" stroke="#8497a9" stroke-dasharray="3 3" visibility="hidden"/></svg>`;
    host.innerHTML=`<div class="market-chart">${svg}<div class="market-tooltip" role="status"></div></div><div class="market-chart-legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.label)}${dual?' · '+esc(s.unit):''}</span>`).join('')}</div>`;
    const graphic=host.querySelector('svg'),tip=host.querySelector('.market-tooltip'),cursor=host.querySelector('[data-cursor]');
    const maps=series.map(s=>new Map(s.points.map(p=>[p[0],p])));let pos=days.length-1;
    const show=i=>{pos=Math.max(0,Math.min(days.length-1,i));const day=days[pos];cursor.setAttribute('x1',X(day));cursor.setAttribute('x2',X(day));cursor.setAttribute('visibility','visible');tip.innerHTML=`<b>${esc(day)}</b> `+series.map((s,j)=>{const p=maps[j].get(day);return `<span>${esc(s.label)} ${fmt(Number.isFinite(p?.[1])?p[1]*(s.displayScale||1):null)}${esc(s.unit)}${p?.[2]!=null?' · '+p[2]+'只':''}</span>`;}).join('');};
    graphic.addEventListener('pointermove',e=>{const r=graphic.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,time=x0+(x-L)/(W-L-R)*(x1-x0);let lo=0,hi=days.length-1;while(lo<hi){const m=(lo+hi)>>1;Date.parse(days[m])<time?lo=m+1:hi=m;}if(lo&&Math.abs(Date.parse(days[lo-1])-time)<Math.abs(Date.parse(days[lo])-time))lo--;show(lo);});
    graphic.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();show(e.key==='Home'?0:e.key==='End'?days.length-1:pos+(e.key==='ArrowLeft'?-1:1));}});
    show(pos);
  }
  function durationHistorySeries(d){
    const clean=rows=>rows.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p[0])&&Number.isFinite(p[1])&&p[0]<=d.date).sort((a,b)=>a[0].localeCompare(b[0]));
    const model=clean(d.aggregate||[]), yields=clean((d.yields?.points||[]).map(p=>[p[0],p[2]])), spreads=clean((d.yields?.points||[]).map(p=>[p[0],p[5]]));
    const first=model[0]?.[0],last=d.date;
    if(!first)return {days:[],series:[],first:null,last};
    const series=[{key:'duration',label:'聚合估计久期中位数',unit:'年',color:'#9c7642',axis:'duration',points:model},{key:'yield',label:'10Y国债收益率（反向）',unit:'%',color:'#b35342',axis:'yield',points:yields},{key:'spread',label:'10Y−1Y期限利差',unit:'bp',color:'#527fa1',axis:'spread',dash:'7 3 2 3',points:spreads},{key:'spread2',label:'10Y−2Y期限利差',unit:'bp',color:'#8a6dad',axis:'spread',dash:'6 4',points:clean((d.yields?.points||[]).map(p=>[p[0],p[3]]))}];
    const days=[...new Set(series.flatMap(s=>s.points.filter(p=>p[0]>=first).map(p=>p[0])))].sort();
    return {days,series,first,last,modelFirst:first,modelLast:model.at(-1)?.[0],yieldFirst:yields[0]?.[0],yieldLast:yields.at(-1)?.[0]};
  }
  function durationHistorySvg(data,start,end,width,visible={duration:true,yield:true,spread:true,spread2:false}){
    const W=Math.max(340,Math.min(1400,Math.round(width||900))),H=290,L=43,R=W<600?104:136,T=29,B=29,pw=W-L-R,ph=H-T-B,x0=Date.parse(start),x1=Date.parse(end);
    const rows=data.series.map(s=>({...s,points:s.points.filter(p=>p[0]>=start&&p[0]<=end)}));
    const ranges=Object.fromEntries(['duration','yield','spread'].map(axis=>{const v=rows.filter(s=>s.axis===axis&&visible[s.key]).flatMap(s=>s.points.map(p=>p[1]));let lo=v.length?Math.min(...v):null,hi=v.length?Math.max(...v):null;if(lo!==null){const pad=(hi-lo)*.08||.1;lo-=pad;hi+=pad;if(axis==='duration')lo=Math.max(0,lo);}return [axis,{lo,hi}];}));
    const X=day=>L+(Date.parse(day)-x0)/(x1-x0||1)*pw,Y=(v,axis)=>{const r=ranges[axis];return axis==='yield'?T+(v-r.lo)/(r.hi-r.lo||1)*ph:T+(1-(v-r.lo)/(r.hi-r.lo||1))*ph;};
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="聚合久期、反向10年国债收益率及10Y减1Y期限利差；左右方向键查看日期" data-market-history-chart data-range-start="${start}" data-range-end="${end}" data-yield-axis="reversed" data-spread-axis="normal"><text x="${L}" y="12" fill="#9c7642">久期（年）</text><text x="${W-R+7}" y="12" fill="#b35342">10Y（%）↓</text><text x="${W-2}" y="12" text-anchor="end" fill="#527fa1">利差（bp）↑</text>`;
    for(let i=0;i<=4;i++){
      const y=T+i/4*ph,number=(axis,reversed=false)=>{const r=ranges[axis];return r.lo===null?'—':fmt(reversed?r.lo+(r.hi-r.lo)*i/4:r.hi-(r.hi-r.lo)*i/4,axis==='spread'?0:2);};
      svg+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#e3dfd8"/><text x="${L-6}" y="${y+4}" text-anchor="end">${number('duration')}</text><text x="${W-R+8}" y="${y+4}" fill="#b35342" data-axis="yield">${number('yield',true)}</text><text x="${W-2}" y="${y+4}" text-anchor="end" fill="#527fa1" data-axis="spread">${number('spread')}</text>`;
    }
    for(const s of rows){if(!visible[s.key])continue;let path='',lastDate=null;for(const p of s.points){const split=lastDate===null||Date.parse(p[0])-Date.parse(lastDate)>12*86400000;path+=`${split?'M':'L'}${X(p[0]).toFixed(2)},${Y(p[1],s.axis).toFixed(2)} `;lastDate=p[0];}svg+=`<path data-history-series="${s.key}" d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.key==='duration'?2.3:1.8}"${s.dash?` stroke-dasharray="${s.dash}"`:''}/>`;}
    const ticks=W<600?2:4;for(let i=0;i<=ticks;i++){const day=new Date(x0+(x1-x0)*i/ticks).toISOString().slice(0,10);svg+=`<text x="${L+pw*i/ticks}" y="${H-7}" text-anchor="${i===0?'start':i===ticks?'end':'middle'}">${day}</text>`;}
    svg+=`<line data-history-cursor x1="${L}" x2="${L}" y1="${T}" y2="${H-B}" stroke="#8a99a8" stroke-dasharray="3 3" visibility="hidden"/></svg>`;
    return {svg,W,L,R,x0,x1,X,rows};
  }
  function mountDurationHistory(host,d){
    const data=durationHistorySeries(d);if(!data.days.length){host.innerHTML='<p>暂无有效日频久期。</p>';return;}
    let left=0,right=data.days.length-1,position=right;const visible={duration:true,yield:true,spread:true,spread2:false};
    const legend=data.series.map(s=>`<button type="button" data-history-toggle="${s.key}" aria-pressed="${visible[s.key]}"><i style="border-top:2px ${s.dash?'dashed':'solid'} ${s.color}"></i>${esc(s.label)}</button>`).join('');
    host.innerHTML=`<div class="market-history" data-model-first="${data.modelFirst}" data-model-last="${data.modelLast}"><div class="market-history-legend" aria-label="走势曲线开关">${legend}</div><div data-history-plot></div><div class="market-history-readout" role="status" aria-live="off"></div><div class="market-history-nav"><div class="market-history-overview" aria-hidden="true"></div><div class="market-history-sliders"><input type="range" min="0" max="${right}" value="0" data-history-start aria-label="拖动起始日期"><input type="range" min="0" max="${right}" value="${right}" data-history-end aria-label="拖动结束日期"></div></div><div class="market-history-dates"><label>开始<input type="date" data-history-date-start min="${data.first}" max="${data.last}" value="${data.first}"></label><span>—</span><label>结束<input type="date" data-history-date-end min="${data.first}" max="${data.last}" value="${data.days[right]}"></label><button type="button" data-history-reset>重置区间</button></div><p class="market-history-coverage">日频久期：${data.modelFirst}—${data.modelLast}；国债：${data.yieldFirst||'—'}—${data.yieldLast||'—'}。聚合使用当日有效基金，每个产品一票。<span data-history-spread2-coverage hidden> 10Y−2Y：${data.series.find(s=>s.key==='spread2').points[0]?.[0]||'—'}—${data.series.find(s=>s.key==='spread2').points.at(-1)?.[0]||'—'}。</span></p></div>`;
    const plot=host.querySelector('[data-history-plot]'),tip=host.querySelector('.market-history-readout'),start=host.querySelector('[data-history-start]'),end=host.querySelector('[data-history-end]'),dateStart=host.querySelector('[data-history-date-start]'),dateEnd=host.querySelector('[data-history-date-end]'),nav=host.querySelector('.market-history-sliders');
    const maps=data.series.map(s=>new Map(s.points.map(p=>[p[0],p])));
    let geometry;
    const show=index=>{position=Math.max(left,Math.min(right,index));const day=data.days[position],cursor=plot.querySelector('[data-history-cursor]');if(!cursor)return;const x=geometry.X(day);cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);cursor.setAttribute('visibility','visible');tip.innerHTML=`<b>${day}</b>`+data.series.map((s,i)=>{if(!visible[s.key])return '';const p=maps[i].get(day);return `<span><i style="background:${s.color}"></i>${esc(s.label)}：<strong>${p?fmt(p[1],s.axis==='spread'?1:2)+s.unit:'当日无值'}</strong>${s.key==='duration'&&p?.[2]!=null?` · ${p[2]}只`:''}</span>`;}).join('');};
    const draw=()=>{host.querySelector('[data-history-spread2-coverage]').hidden=!visible.spread2;geometry=durationHistorySvg(data,data.days[left],data.days[right],plot.getBoundingClientRect().width,visible);plot.innerHTML=geometry.svg;start.value=left;end.value=right;dateStart.value=data.days[left];dateEnd.value=data.days[right];nav.style.setProperty('--history-left',`${left/(data.days.length-1||1)*100}%`);nav.style.setProperty('--history-right',`${(1-right/(data.days.length-1||1))*100}%`);const svg=plot.querySelector('svg');svg.addEventListener('pointermove',e=>{const rect=svg.getBoundingClientRect(),time=geometry.x0+((e.clientX-rect.left)/rect.width*geometry.W-geometry.L)/(geometry.W-geometry.L-geometry.R)*(geometry.x1-geometry.x0);let lo=left,hi=right;while(lo<hi){const mid=(lo+hi)>>1;Date.parse(data.days[mid])<time?lo=mid+1:hi=mid;}if(lo>left&&Math.abs(Date.parse(data.days[lo-1])-time)<Math.abs(Date.parse(data.days[lo])-time))lo--;show(lo);});svg.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();show(e.key==='Home'?left:e.key==='End'?right:position+(e.key==='ArrowLeft'?-1:1));}});show(position);};
    const closest=(value,last=false)=>{let lo=0,hi=data.days.length-1;while(lo<hi){const m=(lo+hi)>>1;data.days[m]<value?lo=m+1:hi=m;}return last&&data.days[lo]>value?Math.max(0,lo-1):lo;};
    const syncSelect=()=>{const selector=host.closest('.subpanel')?.querySelector('[data-market-range]');if(selector)selector.value='custom';};
    start.addEventListener('input',()=>{left=Math.min(Number(start.value),right-1);left=Math.max(0,left);syncSelect();draw();});end.addEventListener('input',()=>{right=Math.max(Number(end.value),left+1);right=Math.min(data.days.length-1,right);syncSelect();draw();});
    dateStart.addEventListener('change',()=>{if(dateStart.value){left=Math.min(closest(dateStart.value),Math.max(0,right-1));syncSelect();draw();}});dateEnd.addEventListener('change',()=>{if(dateEnd.value){right=Math.max(closest(dateEnd.value,true),Math.min(data.days.length-1,left+1));syncSelect();draw();}});
    host.querySelector('[data-history-reset]').addEventListener('click',()=>{left=0;right=data.days.length-1;position=right;const selector=host.closest('.subpanel')?.querySelector('[data-market-range]');if(selector)selector.value='all';draw();});
    host.querySelectorAll('[data-history-toggle]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.historyToggle;visible[key]=!visible[key];button.setAttribute('aria-pressed',String(visible[key]));draw();}));
    const selector=host.closest('.subpanel')?.querySelector('[data-market-range]');selector?.addEventListener('change',()=>{if(selector.value==='custom')return;left=selector.value==='all'?0:closest(root.FundResearch.monthStart(data.last,{'1y':12,'6m':6,'3m':3}[selector.value]));right=data.days.length-1;position=right;draw();});
    const model=data.series[0].points,min=Math.min(...model.map(p=>p[1])),max=Math.max(...model.map(p=>p[1])),x0=Date.parse(data.first),x1=Date.parse(data.last);host.querySelector('.market-history-overview').innerHTML=`<svg viewBox="0 0 900 42" preserveAspectRatio="none"><path d="${model.map((p,i)=>`${i?'L':'M'}${((Date.parse(p[0])-x0)/(x1-x0||1)*900).toFixed(2)},${(38-(p[1]-min)/(max-min||1)*34).toFixed(2)}`).join(' ')}" fill="none" stroke="#b9a17c" stroke-width="1"/></svg>`;
    draw();let previousWidth=plot.getBoundingClientRect().width;if(typeof ResizeObserver==='function')new ResizeObserver(()=>{const w=plot.getBoundingClientRect().width;if(w>0&&Math.abs(w-previousWidth)>5){previousWidth=w;draw();}}).observe(plot);
  }
  function render(host,d){
    const size=d.classes.reduce((a,c)=>a+c.size,0),sc=d.classes.reduce((a,c)=>a+c.size_count,0);
    host.innerHTML=`<div class="market-overview"><div class="section-heading"><div><p class="eyebrow">纯债基金</p><h2>纯债基金的市场概览</h2></div><p>${esc(d.date)} · 产品口径，A/C等份额合并</p></div>
      <p class="method-note" data-market-status></p><div class="market-facts"><div><small>纯债组合</small><strong>${d.total.toLocaleString()}<em>只</em></strong></div><div><small>${esc(d.report_date)} 披露规模 · ${sc}只</small><strong>${fmt(size/1e12)}<em>万亿元</em></strong></div><div><small>日频久期可用</small><strong>${d.available.toLocaleString()}<em>只</em></strong></div><div><small>久期至 ${esc(d.date)}</small><strong>${d.current.toLocaleString()}<em>只</em></strong></div></div>
      <div class="market-grid market-comparison-layout"><article class="subpanel"><h3>市场规模与分类结构</h3><p class="method-note">${esc(d.report_date)} · 净资产合计</p><div class="market-class-bars">${d.classes.map(c=>`<div><span>${esc(c.name)}</span><div><i style="width:${size?c.size/size*100:0}%"></i></div><b>${fmt(c.size/1e8,0)}亿元</b><small>${c.count}只 · 同期规模${c.size_count}只</small></div>`).join('')}</div><p class="method-note">${d.unavailable}只日频估计暂无可用结果 · ${d.available-d.current}只保留较早日期</p></article>
      <article class="subpanel market-comparison" data-market-comparison></article></div>
      <article class="subpanel"><div class="market-panel-head"><h3>走势对照：聚合久期、10Y 国债与10Y−1Y期限利差</h3><select data-market-range aria-label="市场走势区间"><option value="all">可得历史</option><option value="custom">自选区间</option><option value="1y">近1年</option><option value="6m">近6月</option><option value="3m">近3月</option></select></div><div data-market-trend></div></article></div>`;
    void root.FundMarketStatus.mount(host.querySelector('[data-market-status]'),'pure-bond');
    root.FundMarketComparison.mount(host.querySelector('[data-market-comparison]'));
    mountDurationHistory(host.querySelector('[data-market-trend]'),d);
  }

  async function mount(host){
    if(!host||host.dataset.marketMounted||host.dataset.marketLoading)return;
    host.dataset.marketLoading='true';host.innerHTML='<p role="status">正在加载纯债市场概览…</p>';
    try{const d=await load();render(host,d);host.dataset.marketMounted='true';}
    catch(e){host.innerHTML=`<p class="method-note">${esc(e.message)}</p><button type="button" data-market-retry>重试</button>`;host.querySelector('[data-market-retry]').addEventListener('click',()=>mount(host));}
    finally{delete host.dataset.marketLoading;}
  }
  root.FundMarket={mount,chart,durationHistorySeries,durationHistorySvg,mountDurationHistory};
})(typeof window!=='undefined'?window:globalThis);
