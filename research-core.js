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
    if (!profile) return {label:'画像资料待补',reason:'尚无当前基金经理组合的画像资料'};
    if (profile.status==='mature_3plus') return {label:'成熟画像',reason:''};
    if (profile.status==='usable_2') return {label:'可用画像',reason:''};
    if (profile.regime_status==='regime_change') return {label:'基金经理组合暂不稳定',reason:'完整披露区间内基金经理组合发生变化，待形成连续区间'};
    if (!profile.manager_names?.length) return {label:'基金经理信息待补',reason:'当前基金经理名单尚未核实'};
    if (!profile.regime_start) return {label:'经理组合资料待补',reason:'尚未匹配当前基金经理组合的连续完整披露'};
    return {label:'披露样本待积累',reason:`当前基金经理组合有${profile.full_disclosure_count || 0}期完整披露、${profile.completed_transition_count || 0}个合格转移区间；至少2个区间后生成行为画像`};
  };
  const api = { finite, monthStart, range, weekly, uniquePeriods, quarterLag, peerWindow, shareInfo, portfolioName, representativeShare, shareSearchText, profileAvailability };
  root.FundResearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

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
    const Y=(v,i)=>T+(1-(v-scales[i][0])/(scales[i][1]-scales[i][0]))*(H-T-B);
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s=>s.label).join('与'))}" tabindex="0">`;
    for(let i=0;i<=4;i++){
      const y=T+(H-T-B)*i/4;
      svg+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#e3eaf1"/><text x="${L-8}" y="${y+4}" text-anchor="end">${fmt(scales[0][1]-(scales[0][1]-scales[0][0])*i/4)}</text>`;
      if(dual)svg+=`<text x="${W-R+8}" y="${y+4}">${fmt(scales[1][1]-(scales[1][1]-scales[1][0])*i/4)}</text>`;
    }
    svg+=`<text x="${L}" y="14">${esc(series[0].unit)}</text>${dual?`<text x="${W-R}" y="14" text-anchor="end">${esc(rightUnit||series.find(s=>s.axis===1).unit)}</text>`:''}`;
    const dateTicks=W<600?2:4;
    for(let i=0;i<=dateTicks;i++){const n=Math.round((days.length-1)*i/dateTicks),d=days[n];svg+=`<text x="${X(d)}" y="${H-9}" text-anchor="${i===0?'start':i===dateTicks?'end':'middle'}">${esc(d)}</text>`;}
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
  function render(host,d){
    const size=d.classes.reduce((a,c)=>a+c.size,0),sc=d.classes.reduce((a,c)=>a+c.size_count,0);
    host.innerHTML=`<div class="market-overview"><div class="section-heading"><div><p class="eyebrow">纯债基金</p><h2>纯债基金的市场概览</h2></div><p>${esc(d.date)} · 产品口径，A/C等份额合并</p></div>
      <div class="market-facts"><div><small>纯债组合</small><strong>${d.total.toLocaleString()}<em>只</em></strong></div><div><small>${esc(d.report_date)} 披露规模 · ${sc}只</small><strong>${fmt(size/1e12)}<em>万亿元</em></strong></div><div><small>日频久期可用</small><strong>${d.available.toLocaleString()}<em>只</em></strong></div><div><small>久期至 ${esc(d.date)}</small><strong>${d.current.toLocaleString()}<em>只</em></strong></div></div>
      <div class="market-grid market-comparison-layout"><article class="subpanel"><h3>市场规模与分类结构</h3><p class="method-note">${esc(d.report_date)} · 净资产合计</p><div class="market-class-bars">${d.classes.map(c=>`<div><span>${esc(c.name)}</span><div><i style="width:${size?c.size/size*100:0}%"></i></div><b>${fmt(c.size/1e8,0)}亿元</b><small>${c.count}只 · 同期规模${c.size_count}只</small></div>`).join('')}</div><p class="method-note">${d.unavailable}只日频估计暂无可用结果 · ${d.available-d.current}只保留较早日期</p></article>
      <article class="subpanel market-comparison" data-market-comparison></article></div>
      <article class="subpanel"><div class="market-panel-head"><h3>走势对照：聚合久期、10Y 国债与10Y−1Y期限利差</h3><select data-market-range aria-label="市场走势区间"><option value="all">2025年以来</option><option value="1y">近1年</option><option value="6m">近6月</option><option value="3m">近3月</option></select></div><p class="method-note">${esc(d.history_scope)} · 左轴久期（年），右轴收益率（%）与利差（百分点）；悬停显示利差基点值</p><div data-market-trend></div><p class="method-note">${esc(d.yields.source)} · ${esc(d.yields.points?.[0]?.[0]||'—')}—${esc(d.yields.points?.at(-1)?.[0]||'—')}</p></article></div>`;
    const curves=()=>{const key=host.querySelector('[data-market-range]').value,start=key==='all'?'2025-01-01':root.FundResearch.monthStart(d.date,{ '1y':12,'6m':6,'3m':3}[key]),inside=p=>p[0]>=start&&p[0]<=d.date;
      chart(host.querySelector('[data-market-trend]'),[{label:'聚合久期中位数',unit:'年',color:'#255e98',axis:0,points:d.aggregate.filter(inside)},{label:'10年期国债收益率',unit:'%',color:'#c58b34',axis:1,points:(d.yields.points||[]).filter(inside).map(p=>[p[0],p[2]])},{label:'10Y−1Y期限利差',unit:'bp',displayScale:100,color:'#248f89',axis:1,points:(d.yields.points||[]).filter(inside).map(p=>[p[0],Number.isFinite(p[5])?p[5]/100:null])}],{dual:true,rightUnit:'收益率% / 利差百分点'});};
    root.FundMarketComparison.mount(host.querySelector('[data-market-comparison]'));
    host.querySelector('[data-market-range]').addEventListener('change',curves);curves();
    let lastWidth=host.getBoundingClientRect().width;
    if(typeof ResizeObserver==='function')new ResizeObserver(()=>{const width=host.getBoundingClientRect().width;if(width>0&&Math.abs(width-lastWidth)>8){lastWidth=width;curves();}}).observe(host);
  }
  async function mount(host){
    if(!host||host.dataset.marketMounted||host.dataset.marketLoading)return;
    host.dataset.marketLoading='true';host.innerHTML='<p role="status">正在加载纯债市场概览…</p>';
    try{const d=await load();render(host,d);host.dataset.marketMounted='true';}
    catch(e){host.innerHTML=`<p class="method-note">${esc(e.message)}</p><button type="button" data-market-retry>重试</button>`;host.querySelector('[data-market-retry]').addEventListener('click',()=>mount(host));}
    finally{delete host.dataset.marketLoading;}
  }
  root.FundMarket={mount,chart};
})(typeof window!=='undefined'?window:globalThis);
