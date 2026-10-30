/* Colleague sections and computed bond/CB modules; our equity panels are reused. */
(function(root){
 'use strict';
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=(x,d=4)=>finite(x)?x.toFixed(d):'—';
 const pct=x=>finite(x)?(x*100).toFixed(x!==0&&Math.abs(x)<.0001?6:2)+'%':'—';
 const pp=x=>finite(x)?(x*100).toFixed(3)+' pp':'—';
 const table=(heads,rows)=>`<div class="bc-table-wrap"><table><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>'<tr>'+row.map(v=>`<td>${v}</td>`).join('')+'</tr>').join(''):`<tr><td colspan="${heads.length}">暂无可用数据。</td></tr>`}</tbody></table></div>`;
 const section=(title,body)=>`<article class="subpanel bc-complete"><h3>${esc(title)}</h3>${body}</article>`;
 const note=text=>`<p class="method-note">${esc(text)}</p>`;
 const metric=(label,value)=>`<div class="metric"><span>${esc(label)}</span><strong>${value}</strong></div>`;
 const percentFields=new Set(['BondYTM','BondCZYJL','BondZGYJL','BondPJDJYJL','BondYHBDL','BondMomentum10','BondTurnover20','EP','BP']);
 const nativePercentFields=new Set(['S_FA_YOYNETPROFIT','S_FA_YOY_OR','S_FA_ROE','S_FA_ROA']);
 const formatField=(key,x)=>percentFields.has(key)?pct(x):nativePercentFields.has(key)?(finite(x)?num(x,2)+'%':'—'):num(x,key==='S_DQ_MV'||key==='BondYE'?2:4);
 const fieldUnits={BondClose:'元/百元面值（全价）',BondCZJZ:'元/百元面值',BondZHJZ:'元/百元面值',BondEndterm:'年',BondYE:'亿元',BondDLFactor:'价格+溢价百分点',S_DQ_MV:'亿元'};
 function line(points,label){
  const valid=points.filter(x=>finite(x[1]));if(valid.length<2)return note('有效历史点不足2个，暂不绘制曲线。');
  const dates=points.map(x=>Date.parse(x[0])),lo=Math.min(...valid.map(x=>x[1])),hi=Math.max(...valid.map(x=>x[1])),t0=Math.min(...dates),t1=Math.max(...dates);let path='',drawing=false;
  for(let i=0;i<points.length;i++){const v=points[i][1];if(!finite(v)){drawing=false;continue;}const x=40+(dates[i]-t0)/(t1-t0||1)*700,y=145-(v-lo)/(hi-lo||1)*118;path+=(drawing?'L':'M')+x.toFixed(2)+','+y.toFixed(2);drawing=true;}
  return `<svg class="bc-line" viewBox="0 0 780 180" role="img" aria-label="${esc(label)}历史曲线"><title>${esc(label)}：${esc(valid[0][0])}至${esc(valid.at(-1)[0])}，缺失点不连线</title><path d="M40 20V145H740" class="bc-axis"/><text x="40" y="170">${esc(points[0][0])}</text><text x="650" y="170">${esc(points.at(-1)[0])}</text><text x="5" y="22">${num(hi,2)}</text><text x="5" y="145">${num(lo,2)}</text><path d="${path}" class="bc-series"/></svg>`;
 }
 function featurePoint(item,date){return item?.points?.find(x=>x[0]===date)||[date,null,null];}
 function fieldTable(features,date){
  return table(['指标','该期加权均值','占披露转债的有效覆盖','占资产表转债总仓的有效覆盖'],Object.entries(features||{}).map(([key,item])=>{const row=featurePoint(item,date),whole=item.points_total_cb_coverage?.find(x=>x[0]===date)?.[1];return [esc(item.label)+(fieldUnits[key]?`<small>${esc(fieldUnits[key])}</small>`:''),formatField(key,row[1]),pct(row[2]),pct(whole)];}));
 }
 function assetPanel(p){
  const rows=p.metrics.position||[];
  return section('转债仓位与四季度波动',note('仓位以基金净资产为分母。波动采用最近4个连续季度的样本标准差/平均仓位；缺失不作零。报告序列为历史披露描述，不是每日持仓估计。')+line(rows.map(x=>[x.report_date,x.convertible_weight_nav]),'转债占净资产（小数）')+`<details><summary>全部历史仓位与变异系数（${rows.length}期）</summary>${table(['报告期','股票/NAV','普通债/NAV','转债/NAV','总资产/NAV','转债仓位CV（4季度）'],rows.slice().reverse().map(x=>[esc(x.report_date),pct(x.stock_weight_nav),pct(x.ordinary_bond_weight_nav),pct(x.convertible_weight_nav),finite(x.gross_assets_to_nav)?num(x.gross_assets_to_nav,3)+'倍':'—',num(x.cb_position_cv_4q)]))}</details>`);
 }
 function reportDates(p){return [...new Set([...(p.metrics.position||[]).map(x=>x.report_date),...(p.metrics.concentration_turnover||[]).map(x=>x.report_date),...(p.advanced.clause?.rows||[]).map(x=>x.dt)])].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();}
 function distribution(title,rows){return section(title,table(['分组','占基金净资产','占已披露转债'],(rows||[]).map(x=>[esc(x.k),pct(finite(x.w)?x.w/100:null),finite(x.share)?num(x.share,1)+'%':'—'])));}
 function bondOutput(p,date,key='BondClose'){
  const m=p.metrics.concentration_turnover.find(x=>x.report_date===date),position=p.metrics.position.find(x=>x.report_date===date),c=p.advanced.clause?.rows?.find(x=>x.dt===date),q=p.advanced.quote_coverage?.find(x=>x.report_date===date),f=p.advanced.features||{};
  const cards=`<div class="research-metric-grid metric-four">${metric('披露转债只数',m?String(m.holding_count):'—')}${metric('披露转债内部HHI',num(m?.hhi_disclosed_cb))}${metric('单期权重变化合计',pp(m?.turnover_single_nav))}${metric('四期累计权重变化',pp(m?.turnover_roll4q_nav))}</div>`;
  const source=note(`报告期 ${date}。披露转债占净值 ${pct(m?.disclosed_cb_weight_nav)}；资产表全部转债 ${pct(position?.convertible_weight_nav)}；同日报价权重 ${pct(q?.same_date_quote_weight_nav)}；后向匹配旧报价权重 ${pct(q?.stale_quote_weight_nav)}${q?.max_quote_lag_days?`，最大滞后${q.max_quote_lag_days}天`:''}。转债HHI及各均值限于已披露部分，不能冒充全组合。`);
  const options=Object.entries(f).map(([k,v])=>`<option value="${esc(k)}"${k===key?' selected':''}>${esc(v.label)}</option>`).join('');
  const historical=section('转债特征历史',`<label class="bc-control">指标<select data-bc-feature>${options}</select></label>${line((f[key]?.points||[]).filter(x=>x[0]<=date).map(x=>[x[0],x[1]]),f[key]?.label||'转债特征')}`);
  const features=section('转债估值与交易特征',fieldTable(f,date)+note('未接通或供应商无值的字段显示“—”。价格采用全价；收益率和溢价率只换算一次百分比。余额、动量、换手和历史评级仍按实际覆盖保留空缺。'));
  const underlying=section('转债对应正股特征',fieldTable(p.underlying.features,date)+note('这里按转债名义市值计算加权均值。直接股票板块继续使用本项目权益方法。财务以公告日门控，历史修订版本尚未完整核验。'));
  const clauses=c?section('次新债、转股期与条款价格条件',table(['指标','该期数值'],[['次新债（上市≤180天）占净值',pct(c.w_new180/100)],['次新债（上市≤90天）占净值',pct(c.w_new90/100)],['尚未进入转股期占净值',pct(c.w_pre_convert/100)],['距强赎价格线的加权距离',finite(c.sh_dist_wavg)?num(c.sh_dist_wavg,2)+' pp':'—'],['接近强赎价格线占净值',pct(c.w_sh_near/100)],['达到强赎价格线占净值',pct(c.w_sh_over/100)],['达到下修价格线占净值',pct(c.w_xz_hit/100)],['强赎价格条件有效覆盖',pct(c.sh_cov)],['下修价格条件有效覆盖',pct(c.xz_cov)]])+note(`条款来源快照 ${c.terms_snapshot_date}，历史条款版本未核。只计算价格条件，不代表满足连续天数或发行人决定强赎/下修；转股起始日未知时保持未知。`))+distribution('券龄分布',c.age_buckets)+distribution('转股溢价率分布',c.prem_buckets)+distribution('评级分布',c.rating_buckets):note('该报告期缺少可用转债结构明细，不能推断无转债。');
  return source+cards+historical+features+underlying+clauses;
 }
 function bondPanel(p){const dates=reportDates(p);return section('可转债专题',note('权重变化为Σ绝对披露权重变化，不除2；包含价格、申赎和披露影响，不是实际交易换手。首期无比较基期，缺明细不当清仓。')+`<label class="bc-control">报告期<select data-bc-date>${dates.map(d=>`<option value="${d}">${d}</option>`).join('')}</select></label><div data-bc-output>${dates.length?bondOutput(p,dates[0]):note('尚无可用报告序列。')}</div>`);}
 const windows={'1m':'近1月','2m':'近2月','3m':'近3月','6m':'近6月',ytd:'今年以来','1y':'近1年','3y':'近3年','5y':'近5年',all:'可得历史'};
 function correlationOutput(p,key){const source=p.correlations?.schema_version==='bond_complete_correlation.v1'?p.correlations:p.correlation;const w=source?.windows?.[key];if(!w)return note('该窗口没有足够有效净值。');const grid=(title,rows)=>section(title,table(['基金','相关系数','共同有效日'],(rows||[]).map(x=>[`<a href="fund.html?code=${encodeURIComponent(x.code)}">${esc(x.name)}</a><small>${esc(x.code)}</small>`,num(x.correlation),String(x.observations)])));return note(`区间 ${w.start} 至 ${w.end}；同类池${w.pool_size}个组合，有效比较${w.n_valid_peers}个；每对至少${w.min_observations}个共同有效日。日收益裁切在±10%，缺净值不前填；相关性不代表利率久期或因果关系。`)+grid('相关性最高的同类基金',w.positive)+grid('相关性最低的同类基金',w.negative);}
 function correlationPanel(p){return section('同类基金相关性',note('一级和二级债同池，转债基金独立池；同组合的不同份额已合并，剔除自身。各基金使用实际净值截止日。')+`<label class="bc-control">区间<select data-bc-window>${Object.entries(windows).map(([k,v])=>`<option value="${k}"${k==='1y'?' selected':''}>${v}</option>`).join('')}</select></label><div data-bc-correlation>${correlationOutput(p,'1y')}</div>`);}
 function fundPanel(p){const rows=p.fund_investment||[],latest=rows.at(-1);return section('基金与ETF投资',latest?note(`资产配置报告期 ${latest.date}，基金投资占净资产 ${pct(latest.fund)}。${latest.fund===0?'该资产表明确为零，不能据此推断整个历史没有投资。':finite(latest.fund)?'资产表有基金投资，具体持有的子基金/ETF明细尚待补齐。':'资产表基金投资字段缺失，不能判断为零。'}`):note('暂无可用基金投资资产表。'))+section('基金投资历史',table(['报告期','基金投资/NAV'],rows.slice().reverse().map(x=>[esc(x.date),pct(x.fund)])))+note('本板块仅展示本基金自身投资。其他FOF持有本基金的数据属于相反方向，不混入这里。');}
 const cache=new Map();
 async function load(fund){
  const expected=root.BOND_COMPLETE_INDEX?.payloads?.[fund.code];if(!expected)throw new Error('该基金新增分析尚未登记');
  if(cache.has(fund.code))return cache.get(fund.code);
  const task=(async()=>{let p=root.BOND_COMPLETE_DATA?.[fund.code];if(p?.source_payload_sha256!==expected){if(root.BOND_COMPLETE_DATA)delete root.BOND_COMPLETE_DATA[fund.code];await loadDataScript(`https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/bond_complete/${encodeURIComponent(fund.code)}.js?v=${expected.slice(0,16)}`,'债券专题分析',()=>root.BOND_COMPLETE_DATA?.[fund.code]);p=root.BOND_COMPLETE_DATA?.[fund.code];}if(p?.schema_version!=='bond_complete_view.v1'||p?.code!==fund.code||p.source_payload_sha256!==expected)throw new Error('债券专题数据版本不匹配，请重试');return p;})().catch(e=>{cache.delete(fund.code);throw e;});cache.set(fund.code,task);return task;
 }
 function bind(host,p){
  const draw=()=>{const date=host.querySelector('[data-bc-date]')?.value,key=host.querySelector('[data-bc-feature]')?.value||'BondClose';host.querySelector('[data-bc-output]').innerHTML=bondOutput(p,date,key);host.querySelector('[data-bc-feature]')?.addEventListener('change',draw);};
  host.querySelector('[data-bc-date]')?.addEventListener('change',draw);host.querySelector('[data-bc-feature]')?.addEventListener('change',draw);
  host.querySelector('[data-bc-window]')?.addEventListener('change',e=>{host.querySelector('[data-bc-correlation]').innerHTML=correlationOutput(p,e.target.value);});
 }
 const api={load,assetPanel,bondPanel,bondOutput,correlationPanel,correlationOutput,fundPanel,reportDates,fieldTable,formatField,line,pct,bind};root.BondComplete=api;
 if(typeof module!=='undefined')module.exports=api;
 if(typeof createGenericTabLoader==='undefined'||typeof GENERIC_TABS==='undefined')return;
 for(const key of ['profilePanel','holdingsPanel']){
  const fn=root.BondEquityFusion?.[key];if(fn)root.BondEquityFusion[key]=(...args)=>fn(...args).replace(/转债穿透/g,'持债分析');
 }
 const originalLoader=createGenericTabLoader,eligible=f=>['hybrid-bond','convertible-bond'].includes(f.category)&&!!root.BOND_COMPLETE_INDEX?.payloads?.[f.code];
 const layout=[['performance','业绩表现'],['assets','资产配置'],['stocks','持股分析'],['bonds','持债分析'],['funds','持基金分析'],['correlation','相关性分析'],['attribution','业绩归因'],['documents','公告原文']];
 const oldTabs=Object.fromEntries(['hybrid-bond','convertible-bond'].map(cat=>[cat,GENERIC_TABS[cat]]));
 const requestedTab=typeof query!=='undefined'?query.get('tab'):null;
 if(typeof renderGenericFund!=='undefined'){
  const originalRender=renderGenericFund;
  renderGenericFund=function(fund,...args){
   if(oldTabs[fund.category])GENERIC_TABS[fund.category]=eligible(fund)?layout.map(x=>x.slice()):oldTabs[fund.category];
   if(eligible(fund)&&typeof query!=='undefined'){
    const aliases={profile:'stocks',industries:'stocks',holdings:'stocks',rebalancing:'stocks',convertibles:'bonds',ipo:'attribution',evaluation:'assets'};
    if(aliases[query.get('tab')])query.set('tab',aliases[query.get('tab')]);
   }
   return originalRender(fund,...args);
  };
 }
 const historical=()=>/^\d{4}-\d{2}-\d{2}$/.test(new URLSearchParams(root.OFFLINE_PAGE_SEARCH??root.location?.search??'').get('navDate')||'');
 const frozenNote=()=>note('当前查看历史净值。新增债券专题为已保存的披露/行情快照，暂不回填到历史视图；切换“最新”查看完整专题。');
 createGenericTabLoader=function(fund,detail){
  const base=originalLoader(fund,detail);if(!eligible(fund))return base;
  const done=new Set(),pending=new Map();
  async function stocks(host){
   const views=[['profile','权益画像'],['industries','行业分析'],['holdings','持股明细'],['rebalancing','持仓变化']];
   host.innerHTML=`<div class="bc-stock-nav" role="group" aria-label="持股分析视图">${views.map(([id,label],i)=>`<button type="button" data-bc-stock="${id}" aria-pressed="${i===0}">${label}</button>`).join('')}</div>${views.map(([id],i)=>`<div class="bc-stock-panel" data-panel="${id}"${i?' hidden':''}></div>`).join('')}`;
   const show=async id=>{host.querySelectorAll('[data-bc-stock]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.bcStock===id)));host.querySelectorAll('.bc-stock-panel').forEach(x=>{x.hidden=x.dataset.panel!==id;});await base(id);};
   host.querySelectorAll('[data-bc-stock]').forEach(x=>x.addEventListener('click',()=>show(x.dataset.bcStock)));await show(views.some(x=>x[0]===requestedTab)?requestedTab:'profile');
  }
  async function render(id,host){
   if(id==='stocks'){await stocks(host);return;}
   if(!['assets','bonds','funds','correlation','attribution'].includes(id)){await base(id);return;}
   if(historical()){
    if(id==='funds'){host.innerHTML=frozenNote();return;}
    await base(id);host.insertAdjacentHTML('afterbegin',frozenNote());return;
   }
   const p=await load(fund);
   if(id==='funds'){
    const current=Array.isArray(detail?.asset_history)&&detail.asset_history.length?{...p,fund_investment:detail.asset_history.map(x=>({date:x.date,fund:x.fund??null}))}:p;
    host.innerHTML=fundPanel(current);return;
   }
   if(id==='correlation'){
    host.innerHTML=correlationPanel(p)+'<details class="bc-legacy-details"><summary>既有基金与代表指数相关性（原统计口径）</summary><div data-bc-market-correlation></div></details>';
    const fold=host.querySelector('.bc-legacy-details'),output=host.querySelector('[data-bc-market-correlation]');let ready=false,busy=false;
    fold.addEventListener('toggle',async()=>{
     if(!fold.open||ready||busy)return;busy=true;output.innerHTML=note('正在加载代表指数与原口径比较…');
     try{const errors=await loadCorrelationPanelData(fund);output.innerHTML=genericCorrelationPanel(fund,errors);bindGenericCorrelation(fund);ready=!errors.correlation;}
     catch(e){output.innerHTML=note('原口径相关性暂未加载：'+e.message+'。折叠后重新展开可重试。');}
     finally{busy=false;}
    });bind(host,p);return;
   }
   await base(id);
   if(host.querySelector('[data-tab-data-retry]'))return false;
   if(id==='assets'){
    host.insertAdjacentHTML('beforeend',assetPanel(p));
    if(fund.category==='hybrid-bond'){
     host.insertAdjacentHTML('beforeend','<details class="bc-legacy-details"><summary>既有五维评价</summary><div data-panel="evaluation"></div></details>');
     const fold=host.querySelector('.bc-legacy-details');fold.addEventListener('toggle',()=>{if(fold.open)void base('evaluation');});if(requestedTab==='evaluation')fold.open=true;
    }
    return;
   }
   if(id==='bonds'){
    host.insertAdjacentHTML('afterbegin',bondPanel(p));
    host.insertAdjacentHTML('beforeend','<details class="bc-legacy-details"><summary>转债逐券、正股映射与既有历史资料</summary><div data-panel="convertibles"></div></details>');
    const fold=host.querySelector('.bc-legacy-details');fold.addEventListener('toggle',()=>{if(fold.open)void base('convertibles');});if(requestedTab==='convertibles')fold.open=true;bind(host,p);return;
   }
   if(id==='attribution'){
    host.insertAdjacentHTML('beforeend','<details class="bc-legacy-details"><summary>打新估算、回款与价差口径</summary><div data-panel="ipo"></div></details>');
    const fold=host.querySelector('.bc-legacy-details');fold.addEventListener('toggle',()=>{if(fold.open)void base('ipo');});if(requestedTab==='ipo')fold.open=true;
   }
  }
  function loader(id){
   if(done.has(id))return Promise.resolve();if(pending.has(id))return pending.get(id);
   const host=document.querySelector(`[data-panel="${id}"]`);if(!host)return Promise.resolve();
   const task=(async()=>{host.setAttribute('aria-busy','true');try{if(await render(id,host)!==false)done.add(id);}catch(error){host.innerHTML=note('该板块未能加载：'+error.message)+'<button type="button" class="button" data-bc-retry>重新加载</button>';host.querySelector('[data-bc-retry]')?.addEventListener('click',()=>{pending.delete(id);void loader(id);});}finally{host.removeAttribute('aria-busy');pending.delete(id);}})();
   pending.set(id,task);return task;
  }
  return loader;
 };
})(typeof window!=='undefined'?window:globalThis);
