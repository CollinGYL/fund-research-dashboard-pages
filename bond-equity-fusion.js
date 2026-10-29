/* Consume independently verified disclosure profiles using the main site's components. */
(function(root){
 'use strict';
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=(x,n=2)=>finite(x)?x.toFixed(n):'—';
 const percent=(x,n=2)=>finite(x)?(x*100).toFixed(n)+'%':'—';
 const weightLabel=x=>finite(x)&&x>0&&x<0.000001?'&lt;0.0001%':percent(x,finite(x)&&x>0&&x<0.0001?4:2);
 const stockQuantity=x=>finite(x)?(x>=10000?(x/10000).toFixed(2)+'万股':x.toFixed(0)+'股'):'—';
 const moneyCny=x=>finite(x)?(Math.abs(x)>=1e8?(x/1e8).toFixed(2)+'亿元':(x/1e4).toFixed(2)+'万元'):'—';
 const table=(heads,rows)=>renderTable(heads,rows,'fusion-table-wrap',12);
 const section=(title,sub,body)=>`<article class="subpanel fusion-section"><div class="subpanel-heading"><div><h3>${esc(title)}</h3><span>${esc(sub)}</span></div></div>${body}</article>`;
 const empty=text=>`<p class="empty-copy">${esc(text)}</p>`;
 const has=code=>(root.BOND_CB_FUSION_INDEX?.equity_shards||[]).includes(code);
 const cache=new Map();
 function load(fund,detail){
  if(!has(fund?.code))return Promise.resolve(null);
  const present=task=>task.then(p=>currentView(p,detail,fund.code));
  if(cache.has(fund.code))return present(cache.get(fund.code));
  const task=(async()=>{
   if(!root.BOND_EQUITY_FUSION?.[fund.code]){
    const signature=root.BOND_CB_FUSION_INDEX.asset_overrides[fund.code].source_payload_sha256.slice(0,16);
    await loadDataScript(`https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/bond_equity/${encodeURIComponent(fund.code)}.js?v=${signature}`,'权益披露画像',()=>root.BOND_EQUITY_FUSION?.[fund.code]);
   }
   const p=root.BOND_EQUITY_FUSION?.[fund.code];
   if(p?.code!==fund.code||p.schema_version!=='bond_cb_equity.v1'||!p.direct_equity||!p.allocation){if(root.BOND_EQUITY_FUSION)delete root.BOND_EQUITY_FUSION[fund.code];throw new Error('权益披露画像格式或基金代码不匹配');}
   return p;
  })().catch(error=>{cache.delete(fund.code);throw error;});cache.set(fund.code,task);return present(task);
 }
 async function currentView(p,detail,code=p?.code){
  let error=null;
  if(detail?.nav?.length&&root.WarmPerformance?.loadContext){
   try{await root.WarmPerformance.loadContext(code);}catch(e){error=e.message;}
  }
  const value=withCurrentNav(p,detail,root.WARM_PERFORMANCE_CONTEXT?.[code]);
  return error?{...value,manager_context_error:error}:value;
 }
 function withCurrentNav(p,detail,context){
  const nav=(detail?.nav||[]).filter(x=>Array.isArray(x)&&/^\d{4}-\d{2}-\d{2}$/.test(x[0])&&finite(x[1])&&x[1]>0).map(x=>({date:x[0],fund:x[1]})).sort((a,b)=>a.date.localeCompare(b.date));
  if(!nav.length)return p;
  const last=nav.at(-1).date;
  const stats=(start,end)=>{
   const points=nav.filter(x=>x.date>=start&&x.date<=end),value=performanceStats(points);
   return value?{status:'available',requested_start:start,requested_end:end,start_anchor:points[0].date,end_anchor:points.at(-1).date,observations:points.length,return:value.cumulative,max_drawdown:value.maxDrawdown}:{status:'insufficient_nav',requested_start:start,requested_end:end};
  };
  const source=context?.managers?.length?context.managers.map(m=>({name:m.name,tenure_start:m.start,tenure_end:m.end,escrow_name:m.escrow,escrow_start:m.escrow_start,escrow_end:m.escrow_end})):p.manager_history||[];
  const managers=source.map(m=>{
   const end=m.tenure_end&&m.tenure_end<last?m.tenure_end:last,lookback=days=>new Date(Date.parse(end+'T00:00:00Z')-days*86400000).toISOString().slice(0,10);
   const windows=Object.fromEntries([['1y',365],['3y',1095]].map(([key,days])=>[key,stats(m.tenure_start>lookback(days)?m.tenure_start:lookback(days),end)]));
   return {...m,status:m.tenure_start<=last&&(!m.tenure_end||m.tenure_end>=last)?'current':'historical',tenure_performance:stats(m.tenure_start,end),trailing_windows_within_tenure:windows};
  });
  return {...p,nav_end_date:last,manager_history:managers,manager_nav_source:'current_fund_detail'};
 }
 const history=p=>p?.direct_equity_history?.length?p.direct_equity_history:[p?.direct_equity].filter(Boolean);
 const selected=(p,date)=>history(p).find(s=>s.report_date===date)||p.direct_equity;
 function snapshotCaption(s){return `报告期 ${s.report_date} · 公告 ${s.announcement_date||'待核'} · 可得 ${s.available_date||'待核'}${s.cached_available_date&&s.cached_available_date!==s.available_date?' · 缓存 '+s.cached_available_date:''}`;}
 function dates(s){return `<p class="fusion-date-strip" data-equity-dates>${esc(snapshotCaption(s))}</p>`;}
 function evidence(p){
  const f=p.sources?.report_facts||{},pages=f.stock_evidence_page;
  return `<details class="equity-source"><summary>来源与披露日期</summary><p>${esc(p.fund_name)} ${esc(f.report_date)} 中期报告${pages?' · 股票资产表第'+esc(pages)+'页':''}。净值截止 ${esc(p.nav_end_date)}。</p>${table(['完整报告期','原公告日','可得日','可得依据','股票占净值'],history(p).slice().reverse().map(s=>[s.report_date,s.announcement_date||'待核',s.available_date||'待核',s.availability_basis==='verified_report'?'原报告核验':'既有缓存',percent(s.stock_weight_nav)]))}<p class="method-note">风格按A股披露权重计算加权中位数，有效覆盖达到80%才显示；港股单列。特征采用报告期截面，原始财报公告时点未核。完整持仓行权重按源精度保留，未强行归一。</p></details>`;
 }
 function allocationPanel(p){
  if(!p)return '';
  const a=p.allocation;
  return section('股、债与融资口径',`报告 ${a.report_date} · 公告 ${a.announcement_date||'待核'} · 可得 ${a.available_date||'待核'}`,
   `<div class="research-metric-grid metric-four">${metric('股票占净资产',percent(a.direct_stock_weight_nav))}${metric('股票占总资产',percent(a.direct_stock_weight_total_assets))}${metric('转债占净资产',percent(a.convertible_nominal_weight_nav))}${metric('总资产／净资产',fmt(a.gross_assets_to_nav,4)+'倍')}</div>${table(['配置或融资','占基金净资产','金额／说明'],[
    ['普通债券',percent(a.ordinary_bond_weight_nav),'全部债券扣除转债'],['现金',percent(a.cash_weight_nav),'资产'],['买入返售',percent(a.reverse_repo_asset_weight_nav),'资产，缺值保持空缺'],['卖出回购融资',percent(a.repo_financing_liability_weight_nav),'负债'],['净资产','—',moneyCny(a.net_asset_cny)],['总资产','—',moneyCny(a.total_asset_cny)]])}`);
 }
 function transactions(p){
  const t=p.within_period_stock_transactions;if(!t)return '';
  return section('报告期内股票买卖',`截至 ${t.report_date} · 公告 ${t.announcement_date||'待核'} · 原报告7.4.3`,
   `<div class="research-metric-grid metric-two">${metric('买入成本',moneyCny(t.buy_cost_cny))}${metric('卖出收入',moneyCny(t.sale_proceeds_cny))}</div><p class="method-note">金额按报告原值展示；卖出收入包含本金，盈利与打新收益另需交易成本资料。</p>`);
 }
 function styleMetrics(s){
  const names={market_cap:'A股市值中位数',pe:'正PE中位数',pb:'正PB中位数',roe:'ROE中位数',growth:'净利润增长中位数'};
  const rows=Object.entries(names).map(([k,label])=>{
   const m=s.style.fields[k]||{},unit=k==='market_cap'?'亿元':k==='pe'||k==='pb'?'倍':'%';
   const value=m.status==='available'&&finite(m.value)?fmt(m.value)+(unit==='%'?'%':unit):'—';
   const why=m.status==='available'?'加权中位数':m.status==='insufficient_coverage'?'有效覆盖不足80%':'无可用A股持仓';
   return [label,value,percent(m.valid_weight_coverage,1),why];
  });
  return section('直接股票风格',`A股覆盖全部股票 ${percent(s.style.full_equity_weight_covered_by_A,1)} · 港股估值单列`,table(['指标','数值','有效A股权重覆盖','计算口径／缺失原因'],rows));
 }
 function profileSnapshot(s){
  if(s.status==='not_applicable_zero_stock')return dates(s)+section('本报告期末无股票','原报告资产表已核验',empty('当期股票风格、行业、集中度和持有延续性不适用。历史披露及报告期内股票买卖保留在本页。'));
  if(s.status!=='available')return dates(s)+empty(finite(s.stock_weight_nav)?`本期缓存股票占净值 ${percent(s.stock_weight_nav)}，尚缺完整股票明细。`:'本期总股票仓位与完整股票明细均缺失，暂不展示股票画像。');
  const c=s.concentration,r=s.persistence;
  const reconciliation=s.coverage_status==='needs_reconciliation'?`<p class="disclosure-status" role="status"><strong>股票明细待核对</strong> · 覆盖 ${percent(s.disclosure_coverage)}，与同日资产表相差 ${fmt(Math.abs(s.rounding_gap_nav)*100,4)} 个百分点；以下指标按已有明细展示。</p>`:'';
  return dates(s)+reconciliation+`<div class="research-metric-grid metric-four">${metric('股票占基金净值',percent(s.stock_weight_nav))}${metric('披露股票权重',percent(s.disclosed_stock_weight_nav),`${s.holdings.length}只`)}${metric('A股占基金净值',percent(s.A_weight_nav))}${metric('港股占基金净值',percent(s.HK_weight_nav))}</div>`+
   section('持仓集中度','全部直接股票与净资产分母分别列示',`<div class="research-metric-grid metric-four">${metric('前十大占净值',percent(c.top10_nav?.value))}${metric('前十大占全部股票',percent(c.top10_equity_sleeve?.value))}${metric('披露股票HHI',fmt(c.hhi_disclosed_equity?.value,4))}${metric('披露股票只数',finite(c.stock_count?.value)?String(c.stock_count.value):'—')}</div><p class="method-note">披露覆盖 ${percent(s.disclosure_coverage,2)}；${s.holdings_precision?.startsWith('original')?'持仓权重按原报告市值÷基金净资产计算，含原表显示0.00%的非零持股。':'行权重按0.01个百分点精度保留。'}与资产表差 ${(Math.abs(s.rounding_gap_nav)*100).toFixed(4)} 个百分点。</p>`)+
   styleMetrics(s)+section('持有延续性',`上期完整披露 ${r.previous_report_date||'暂无'} → ${s.report_date}`,r.status==='available'?`<div class="research-metric-grid metric-four">${metric('归一权重重合',percent(r.weighted_overlap,1))}${metric('名单重合',percent(r.jaccard_by_security,1))}${metric('上期股票保留比例',percent(r.prior_security_retention,1))}${metric('本期延续股票权重',percent(r.current_weight_in_retained_names,1))}</div><p class="method-note">权重重合分别以两期已披露股票为分母；持仓变化包括价格和净资产变化。</p>`:empty('该报告期缺少可比的上期完整股票持仓。'));
 }
 function historyChart(p,key='pe'){
  const names={market_cap:'A股市值中位数（亿元）',pe:'正PE中位数（倍）',pb:'正PB中位数（倍）',roe:'ROE中位数（%）'};
  const points=history(p).map(s=>({report_date:s.report_date,value:s.style.fields[key]?.status==='available'?s.style.fields[key].value:null}));
  if(!points.some(x=>finite(x.value)))return empty('该历史指标尚无足够覆盖的有效值。');
  return renderMiniLineChart(points,[{key:'value',label:names[key],format:'number',color:'#B01625',width:2.5}],names[key]+'完整持仓历史');
 }
 function managerPanel(p){
  const cell=w=>w?.status==='available'?`${percent(w.return)}<small>回撤 ${percent(w.max_drawdown)} · ${esc(w.start_anchor)} 至 ${esc(w.end_anchor)}</small>`:'未覆盖';
  const rows=(p.manager_history||[]).map(m=>[esc(m.name)+(m.status==='current'?'<small>现任</small>':'<small>历史任职</small>'),`${esc(m.tenure_start)}<small>至 ${esc(m.tenure_end||'今')}</small>`,cell(m.tenure_performance),cell(m.trailing_windows_within_tenure?.['1y']),cell(m.trailing_windows_within_tenure?.['3y']),esc(m.escrow_name||'—')+(m.escrow_start?`<small>${esc(m.escrow_start)} 至 ${esc(m.escrow_end||'今')}</small>`:'')]);
  return (p.manager_context_error?empty('任职资料刷新失败，暂沿用已存任职记录：'+p.manager_context_error):'')+section('经理任期与任内窗口',`净值截止 ${p.nav_end_date}`,`<details><summary>查看历任经理、代管及任内1年／3年表现</summary>${table(['经理','任期','任期表现','任内近1年','任内近3年','代管记录'],rows)}<p class="method-note">共管任期可能重叠，表现属于该基金份额；窗口起点从任职日或之后首个有效净值起算。任职历史原始公告时点尚未逐条核验。</p></details>`);
 }
 function profilePanel(p){
  if(!p)return section('权益画像','直接股票披露',empty('该基金的权益画像适配尚未覆盖；行业分析和持股分析仍保留原有披露功能。'));
  const nonzero=history(p).some(s=>s.status==='available');
  return `<div class="panel-intro"><div><h2>直接股票画像</h2></div><p>按完整报告展示直接股票特征；转债对应正股见“转债穿透”。</p></div><label class="fusion-control">完整报告期<select data-equity-profile-date>${history(p).slice().reverse().map(s=>`<option value="${s.report_date}">${s.report_date}</option>`).join('')}</select></label><div data-equity-profile-output>${profileSnapshot(p.direct_equity)}</div>`+
   (nonzero?section('股票风格历史','仅比较半年报／年报完整持仓',`<label class="fusion-control">历史指标<select data-equity-history-metric><option value="pe">正PE中位数</option><option value="pb">正PB中位数</option><option value="market_cap">A股市值中位数</option><option value="roe">ROE中位数</option></select></label><div data-equity-history-output>${historyChart(p)}</div>`):'')+transactions(p)+managerPanel(p)+evidence(p);
 }
 function holdingHistory(p,original){
  const full=history(p).map(s=>{
   const old=original?.full?.find(x=>x.report_date===s.report_date);
   const oldHoldings=new Map((old?.holdings||[]).map(x=>[x.code,x]));
   const rows=s.holdings.map((h,i)=>({rank:i+1,code:h.stock_code,name:h.stock_name,weight:h.weight_nav,float_share_percent:h.free_float_ownership_fraction,quantity:h.quantity,position_market_value_cny:h.market_value_cny,source_stock_code:h.source_stock_code,weight_source:h.weight_source,classifications:h.industry,characteristics:oldHoldings.get(h.stock_code)?.characteristics||null}));
   const names=new Map(history(p).flatMap(x=>x.holdings).map(h=>[h.stock_code,h.stock_name]));
   const changes=s.disclosure_changes?.rows||[];
   return {report_date:s.report_date,announcement_date:s.announcement_date,holding_count:rows.length,total_weight:s.disclosed_stock_weight_nav,holdings:rows,weights:Object.fromEntries(Object.entries(s.industry).map(([k,v])=>[k,Object.fromEntries(v.rows.map(r=>[r.name,r.weight_nav]))])),entered:changes.filter(r=>r.change_type==='entry').map(r=>({code:r.stock_code,name:names.get(r.stock_code)||r.stock_code})),exited:changes.filter(r=>r.change_type==='exit').map(r=>({code:r.stock_code,name:names.get(r.stock_code)||r.stock_code})),equity_meta:s};
  });
  return {...original,full,quarterly:original?.quarterly||[],default_scope:'full',equity_adapted:true};
 }
 function disclosureIntro(p){
  const e=p.direct_equity;
  return dates(e)+`<p class="method-note">最新完整披露：股票占净值 ${percent(e.stock_weight_nav)}，已披露 ${e.holdings.length}只。中信分类覆盖 ${percent(e.industry.level1.classification_weight_coverage_of_disclosed_stocks,1)}；港股保留独立桶。</p>`;
 }
 function holdingsPanel(p,hh){
  return `<div class="panel-intro"><h2>直接股票披露明细</h2><p>默认完整持仓；季度前十大单独切换。转债对应正股在“转债穿透”查看。</p></div>${disclosureIntro(p)}<div id="holding-analysis-interactive" class="fusion-section">
   <div class="industry-analysis-toolbar holding-analysis-toolbar"><div class="industry-toggle-group" aria-label="持仓披露范围"><button data-holding-scope="quarterly">季度前十大</button><button class="active" data-holding-scope="full">完整持仓</button></div><div class="industry-toggle-group" aria-label="行业层级">${[['sector','板块'],['level1','中信一级'],['level2','中信二级'],['level3','中信三级']].map(([k,v])=>`<button data-holding-dimension="${k}"${k==='sector'?' class="active"':''}>${v}</button>`).join('')}</div></div>
   <article class="subpanel fusion-section"><div class="subpanel-heading"><div><h3>持股明细</h3><span id="holding-scope-note"></span></div><label class="fusion-control">报告期<select id="holding-period-select"></select></label></div><div id="holding-changes-output"></div><div id="holding-table-output"></div></article>
   <article class="subpanel fusion-section"><div class="subpanel-heading"><h3>个股连续持仓矩阵</h3><span>点击股票查看历次披露权重</span></div><div id="holding-trajectory-output"></div></article></div><p class="method-note">个股估值沿用对应报告期的已缓存字段；原始财报公告时点未核。季度未列前十与完整披露的零持仓分别处理。</p>${transactions(p)}${evidence(p)}`;
 }
 function changesSnapshot(p,s){
  const c=s.disclosure_changes,r=s.persistence;
  if(c?.status!=='available')return dates(s)+empty('该报告期没有可比的上期完整披露。');
  const names=new Map(history(p).flatMap(x=>x.holdings).map(h=>[h.stock_code,h.stock_name]));
  const kinds={retained:'继续持有',entry:'本期新增披露',exit:'本期未持有',increase:'权重上升',decrease:'权重下降',unchanged:'权重不变'};
  const rows=c.rows.slice().sort((a,b)=>Math.abs(b.change_nav)-Math.abs(a.change_nav)).map(h=>[`${esc(names.get(h.stock_code)||h.stock_code)}<small>${esc(h.stock_code)}</small>`,percent(h.previous_weight_nav),percent(h.current_weight_nav),finite(h.change_nav)?(h.change_nav>0?'+':'')+(h.change_nav*100).toFixed(2)+'个百分点':'—',esc(kinds[h.change_type]||h.change_type)]);
  return dates(s)+`<p class="method-note">${esc(c.previous_report_date)} → ${esc(s.report_date)} · 两期完整披露。差额包含交易、价格与净资产变化。</p>`+(rows.length?table(['股票','上期占净值','本期占净值','披露权重变化','状态'],rows):empty('两期完整披露均无股票持仓。'))+
   (r.status==='available'?`<div class="research-metric-grid metric-two">${metric('归一权重重合',percent(r.weighted_overlap,1))}${metric('名单重合',percent(r.jaccard_by_security,1))}</div>`:'');
 }
 function changesPanel(p){return section('披露持仓变化','仅比较相邻两次完整披露',`<label class="fusion-control">结束报告期<select data-equity-changes-date>${history(p).slice().reverse().map(s=>`<option value="${s.report_date}">${s.report_date}</option>`).join('')}</select></label><div data-equity-changes-output>${changesSnapshot(p,p.direct_equity)}</div>`)+transactions(p);}
 function cbIndustry(p,level='level1'){
  const data=p.convertibles.underlying_industry_nominal.find(x=>x.level===level);
  return data?.rows?.length?table(['对应正股行业','转债名义占基金净值'],data.rows.map(x=>[esc(x.name),percent(x.nominal_weight_nav)])):empty('暂无可用的转债正股行业映射。');
 }
 function convertibleReportPanel(p){
  const c=p.convertibles,rows=c.holdings||[],mapDates=[...new Set(rows.map(r=>r.mapping_available_date).filter(Boolean))].sort();
  return `<div class="panel-intro"><h2>报告转债与正股穿透</h2><p>转债名义持仓独立展示，直接股票分析保留在权益画像和行业分析。</p></div>${dates(c)}<div class="research-metric-grid metric-four">${metric('转债占净值',percent(c.nominal_weight_nav))}${metric('报告列示转债',rows.length+'只',`覆盖 ${percent(c.disclosure_coverage,2)}`)}${metric('正股映射覆盖全部转债',percent(c.mapping_coverage_of_total_cb,2))}${metric('Delta等价股票敞口','未覆盖')}</div>`+
   section('转股期转债明细',`完整报告 ${c.report_date} · 名义市值按基金净资产折算`,table(['转债','名义占净值','占全部转债','市值','对应正股','中信一级','映射日期／可得日','张数'],rows.map(r=>[`${esc(r.bond_name)}<small>${esc(r.bond_code)}</small>`,percent(r.nominal_weight_nav),percent(r.nominal_share_of_total_convertibles),moneyCny(r.market_value_cny),esc(r.underlying_code||'未映射'),esc(r.industry?.level1||'未映射'),`${esc(r.mapping_as_of||'未覆盖')}<small>${esc(r.mapping_available_date||'未覆盖')}</small>`,r.quantity===null?'未披露':esc(r.quantity)])))+
   `<p class="method-note">来源：原中期报告“期末持有的处于转股期的可转换债券明细”。正股映射可得日 ${esc(mapDates.join('、')||'未覆盖')}，晚于持仓报告期；按当前已知资料描述。Delta缺失，名义映射与直接股仓分别列示。</p>`+
   section('报告转债对应正股行业','名义市值映射，占基金净资产',`<label class="fusion-control">中信层级<select data-equity-cb-level>${[['level1','中信一级'],['level2','中信二级'],['level3','中信三级']].map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><div data-equity-cb-output>${cbIndustry(p)}</div>`);
 }
 function bind(host,p){
  if(!p)return;
  host.querySelector('[data-equity-profile-date]')?.addEventListener('change',e=>{host.querySelector('[data-equity-profile-output]').innerHTML=profileSnapshot(selected(p,e.target.value));});
  host.querySelector('[data-equity-history-metric]')?.addEventListener('change',e=>{host.querySelector('[data-equity-history-output]').innerHTML=historyChart(p,e.target.value);bindMiniLineCharts();});
  host.querySelector('[data-equity-changes-date]')?.addEventListener('change',e=>{host.querySelector('[data-equity-changes-output]').innerHTML=changesSnapshot(p,selected(p,e.target.value));});
  host.querySelector('[data-equity-cb-level]')?.addEventListener('change',e=>{host.querySelector('[data-equity-cb-output]').innerHTML=cbIndustry(p,e.target.value);});
 }
 root.BondEquityFusion={withCurrentNav,currentView,finite,weightLabel,stockQuantity,has,load,snapshotCaption,allocationPanel,profilePanel,profileSnapshot,styleMetrics,historyChart,managerPanel,holdingHistory,disclosureIntro,holdingsPanel,changesPanel,changesSnapshot,convertibleReportPanel,cbIndustry,bind};
 if(typeof module!=='undefined')module.exports=root.BondEquityFusion;
})(typeof window!=='undefined'?window:globalThis);
