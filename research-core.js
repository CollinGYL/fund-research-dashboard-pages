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
      <div class="market-facts"><div><small>纯债组合</small><strong>${d.total.toLocaleString()}<em>只</em></strong></div><div><small>${esc(d.report_date)} 披露规模 · ${sc}只</small><strong>${fmt(size/1e12)}<em>万亿元</em></strong></div><div><small>日频久期可用</small><strong>${d.available.toLocaleString()}<em>只</em></strong></div><div><small>久期至 ${esc(d.date)}</small><strong>${d.current.toLocaleString()}<em>只</em></strong></div></div>
      <div class="market-grid market-comparison-layout"><article class="subpanel"><h3>市场规模与分类结构</h3><p class="method-note">${esc(d.report_date)} · 净资产合计</p><div class="market-class-bars">${d.classes.map(c=>`<div><span>${esc(c.name)}</span><div><i style="width:${size?c.size/size*100:0}%"></i></div><b>${fmt(c.size/1e8,0)}亿元</b><small>${c.count}只 · 同期规模${c.size_count}只</small></div>`).join('')}</div><p class="method-note">${d.unavailable}只日频估计暂无可用结果 · ${d.available-d.current}只保留较早日期</p></article>
      <article class="subpanel market-comparison" data-market-comparison></article></div>
      <article class="subpanel"><div class="market-panel-head"><h3>走势对照：聚合久期、10Y 国债与10Y−1Y期限利差</h3><select data-market-range aria-label="市场走势区间"><option value="all">可得历史</option><option value="custom">自选区间</option><option value="1y">近1年</option><option value="6m">近6月</option><option value="3m">近3月</option></select></div><div data-market-trend></div></article></div>`;
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
