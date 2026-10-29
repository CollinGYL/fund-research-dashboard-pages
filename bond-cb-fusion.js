/* Native research components adapted from the colleague bond / convertible modules. */
(function(root){
 'use strict';
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=(x,n=2)=>finite(x)?x.toFixed(n):'—';
 const pct=(x,n=2)=>finite(x)?(x*100).toFixed(n)+'%':'—';
 const pp=(x,n=2)=>finite(x)?x.toFixed(n)+'%':'—';
 const table=(headers,rows)=>renderTable(headers,rows,'fusion-table-wrap',12);
 const section=(title,subtitle,body)=>`<article class="subpanel fusion-section"><div class="subpanel-heading"><div><h3>${esc(title)}</h3><span>${esc(subtitle)}</span></div></div>${body}</article>`;
 const empty=text=>`<p class="empty-copy">${esc(text)}</p>`;
 const cache=new Map();
 function adaptFund(fund,knownOn=root.BOND_CB_FUSION_INDEX?.as_of){
  const points=(root.BOND_CB_FUSION_INDEX?.duration_overrides?.[fund.code]||[]).filter(p=>p.announcement_date<=knownOn);
  const asset=root.BOND_CB_FUSION_INDEX?.asset_overrides?.[fund.code];
  const updateAsset=asset&&asset.announcement_date<=knownOn&&asset.report_date>=(fund.asset?.report_date||'');
  if(!points.length&&!updateAsset)return fund;
  const latest=points.at(-1);
  return {...fund,...(latest?{duration:{...fund.duration,...latest,basis:'利率敏感性／基金净资产',verified:true}}:{}),...(updateAsset?{asset:{...fund.asset,...asset,verified_allocation:true}}:{})};
 }
 function adaptDetail(detail){
  if(!detail?.fund)return detail;
  const fund=adaptFund(detail.fund);if(fund===detail.fund)return detail;
  const audited=root.BOND_CB_FUSION_INDEX.duration_overrides[fund.code]||[];
  const history=(detail.duration_history||[]).map(x=>{const a=audited.find(p=>p.report_date===x.date&&p.announcement_date<=root.BOND_CB_FUSION_INDEX.as_of);return a?{...x,duration:a.value,source:'audited_nav_sensitivity'}:x;});
  for(const a of audited)if(a.announcement_date<=root.BOND_CB_FUSION_INDEX.as_of&&!history.some(x=>x.date===a.report_date))history.push({date:a.report_date,duration:a.value,source:'audited_nav_sensitivity'});
  const asset_history=(detail.asset_history||[]).map(x=>fund.asset.verified_allocation&&x.date===fund.asset.report_date?{...x,stock:fund.asset.stock_weight,bond:fund.asset.bond_weight,convertible_bond:fund.asset.convertible_bond_weight,leverage:fund.asset.leverage}:x);
  return {...detail,fund,asset_history,duration_history:history.sort((a,b)=>a.date.localeCompare(b.date))};
 }
 function assets(fund){
  const a=fund.asset||{},ordinary=finite(a.bond_weight)&&finite(a.convertible_bond_weight)?a.bond_weight-a.convertible_bond_weight:null;
  return {stock:a.stock_weight,convertible:a.convertible_bond_weight,ordinary,cash:a.cash_weight,leverage:a.leverage,date:a.report_date};
 }
 function weighted(rows,key){
  const valid=rows.filter(r=>finite(r.weight)&&r.weight>0&&finite(r[key]));const w=valid.reduce((s,r)=>s+r.weight,0);
  return {value:w?valid.reduce((s,r)=>s+r.weight*r[key],0)/w:null,weight:w,count:valid.length};
 }
 function bridge(period){
  const keys=['actual_return','market','allocation','selection','residual'];
  return keys.every(k=>finite(period?.[k]))?period.actual_return-period.market-period.allocation-period.selection-period.residual:null;
 }
 function isEligible(fund){return ['hybrid-bond','convertible-bond'].includes(fund.category);}
 async function load(fund){
  if(cache.has(fund.code))return cache.get(fund.code);
  const promise=(async()=>{
   if(root.BOND_CB_FUSION_INDEX.shards.includes(fund.code)){
    if(!root.BOND_CB_FUSION?.[fund.code])await loadDataScript(`https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/bond_fusion/${encodeURIComponent(fund.code)}.js`,'债券与转债分析',()=>root.BOND_CB_FUSION?.[fund.code]);
    return root.BOND_CB_FUSION[fund.code];
   }
   await Promise.all(['bond_holdings.js','bond_characteristics.js','convertible_characteristics.js'].map(loadDashboardAsset));
   const h=root.FUND_BOND_HOLDINGS?.funds?.[fund.code];
   return {code:fund.code,as_of:root.BOND_CB_FUSION_INDEX.as_of,holdings:h,
    convertibles:root.FUND_CONVERTIBLE_CHARACTERISTICS?.funds?.[fund.code]||[],
    bond_features:Object.fromEntries((h?.top_holdings||[]).map(r=>[r.code,root.FUND_BOND_CHARACTERISTICS?.bonds?.[r.code]||{}])),
    archive:null,gaps:root.BOND_CB_FUSION_INDEX.gaps,duration_verified:[]};
  })().catch(error=>{cache.delete(fund.code);throw error;});cache.set(fund.code,promise);return promise;
 }
 function riskPanel(fund,detail,d){
  const a=assets(fund),h=d.holdings,cb=d.convertibles||[];
  const rows=[['直接股票',pct(a.stock),'不含转债正股映射'],['可转债',pct(a.convertible),'已包含在债券仓位内'],['普通债券',pct(a.ordinary),'债券合计扣除转债'],['现金',pct(a.cash),'占基金净资产'],['杠杆',finite(a.leverage)?num(a.leverage,4)+'倍':'—','基金总资产／净资产']];
  const duration=fund.duration||{};
  const basis=duration.verified?'已核净资产分母 · 原报告利率敏感性':'现有披露字段 · 分母待逐只核验';
  const durationBody=`<p class="fusion-duration"><strong>${num(duration.value,5)} 年</strong><span>${esc(duration.report_date||'无可用报告期')} · ${esc(basis)}</span></p>${duration.source_url?`<a href="${esc(duration.source_url)}" target="_blank" rel="noopener noreferrer">原报告敏感性表</a>`:''}<p class="method-note">${duration.verified?'利率情景损益÷基金净资产÷利率冲击。':'保留现有来源字段及其报告期，分母待核。'}剩余期限与Delta分别展示。</p>`;
  const securities=(h?.top_holdings||[]).map(r=>{const b=d.bond_features?.[r.code]||{};return [esc(r.name),esc(r.code),pct(r.weight),esc(b.bond_rating||b.issuer_rating||'未覆盖'),num(b.remaining_years)+' 年',num(b.modified_duration)+' 年',esc(b.as_of||'未覆盖')];});
  return `<div class="fusion-date-strip"><span>净值 ${esc(fund.performance?.latest_date)}</span><span>配置汇总 ${esc(a.date)}</span><span>逐券持仓 ${esc(h?.report_date||'未覆盖')}</span><span>转债特征 ${esc(cb[0]?.as_of||'未覆盖')}</span></div><div class="research-grid two-column-grid">${section('股票、转债与普通债',a.date||'无配置报告期',table(['资产','占净值／倍数','口径'],rows))}${section('利率敏感性折算',duration.report_date||'无可用报告期',durationBody)}</div>${section('普通债与转债逐券信息',`披露 ${h?.report_date||'未覆盖'} · 特征使用各自行日期`,securities.length?table(['债券','代码','占净值','评级','剩余期限','修正久期','特征日期'],securities):empty('未取得逐券持仓，保留上方配置汇总。'))}`;
 }
 function currentConvertible(fund,d){
  const rows=d.convertibles||[],a=assets(fund),h=d.holdings;
  const specs=[['conversion_premium_ratio','转股溢价率','%'],['bond_premium_ratio','纯债溢价率','%'],['underlying_pe_ttm','正股PE(TTM)','倍'],['underlying_pb_mrq','正股PB(MRQ)','倍'],['underlying_volatility_12m','正股12月波动率','%']];
  const metrics=specs.map(([k,label,unit])=>{const x=weighted(rows,k);return [label,num(x.value)+(x.value===null?'':unit),pct(x.weight),x.count];});
  const dataRows=rows.map(r=>[`${esc(r.name)}<small>${esc(r.code)}</small>`,pct(r.weight),`${esc(r.underlying_name||'未映射')}<small>${esc(r.underlying_code||'')}</small>`,num(r.conversion_price),pp(r.conversion_premium_ratio),pp(r.bond_premium_ratio),num(r.underlying_pe_ttm),num(r.underlying_pb_mrq),esc(r.as_of||'未覆盖')]);
  return `<div class="fusion-date-strip"><span>配置 ${esc(a.date)}：直接股 ${pct(a.stock)}，转债 ${pct(a.convertible)}</span><span>逐券持仓 ${esc(h?.report_date||'未覆盖')}</span><span>特征 ${esc(rows[0]?.as_of||'未覆盖')}</span></div>${section('转债与对应正股','转债名义权重与直接股票分列',dataRows.length?table(['转债','转债占净值','对应正股','转股价','转股溢价率','纯债溢价率','正股PE','正股PB','特征日期'],dataRows):empty(`配置报告转债仓位为${pct(a.convertible)}；该基金尚无可用逐券转债特征。`))}${section('转债与正股估值','按有效字段所覆盖的转债净值权重加权',table(['指标','加权值','有效权重占净值','有效只数'],metrics))}<p class="method-note">正股映射沿用转债名义权重，不加到直接股票仓位。当前未取得逐券Delta，股票等价敞口保留缺值。持仓与特征日期不同，表格用于当前资料核对。</p>`;
 }
 function archiveControls(d){
  const cb=d.archive?.cb;if(!cb)return empty('此基金暂无转债历史明细；最新已披露资料见上方。');
  const items=[...Object.entries(cb.features||{}).map(([k,v])=>['cb:'+k,v.label]),...Object.entries(cb.stock_factors||{}).map(([k,v])=>['stock:'+k,v.label])];
  return `<div class="fusion-date-strip">历史持仓／特征至 ${esc(d.archive.source_holding_date)} · 对应净值截止 ${esc(d.archive.source_as_of)}</div><label class="fusion-control">历史指标<select data-fusion-feature>${items.map(([k,label])=>`<option value="${esc(k)}">${esc(label)}</option>`).join('')}</select></label><div data-fusion-feature-output>${featureBody(d,items[0]?.[0])}</div>`;
 }
 function featureBody(d,key){
  const [group,name]=String(key||'').split(':'),source=(group==='stock'?d.archive?.cb.stock_factors:d.archive?.cb.features)?.[name];
  if(!source)return empty('该历史指标未覆盖。');
  const points=source.points||[];
  const sourcePercent=name.startsWith('S_FA_');
  const chartPoints=points.map(([date,value,coverage])=>({date,report_date:date,value:sourcePercent&&finite(value)?value/100:value,coverage}));
  const percentKeys=new Set(['BondYTM','BondCZYJL','BondZGYJL','BondPJDJYJL','BondYHBDL','BondMomentum10','BondTurnover20','EP','BP']);
  const percent=percentKeys.has(name),format=percent||sourcePercent?'percent':'number';
  const unit={BondClose:'元',BondCZJZ:'元',BondZHJZ:'元',BondYE:'亿元',BondEndterm:'年',S_DQ_MV:'亿元'}[name]||'';
  return `${name==='BondTurnover20'?'<p class="method-note">成交额单位待核，此项保留为换手代理。</p>':''}${renderMiniLineChart(chartPoints,[{key:'value',label:source.label+(unit?'（'+unit+'）':''),color:'#B01625',width:2.6,format}],source.label+'历史')}<details><summary>历史数值与覆盖</summary>${table(['报告期',esc(source.label)+(unit?'（'+unit+'）':''),'覆盖权重'],points.slice().reverse().map(([date,value,coverage])=>[esc(date),percent?pct(value):sourcePercent?pp(value):num(value,4),pct(coverage)]))}</details>`;
 }
 function industryArchive(d,level='l1',date){
  const periods=d.archive?.cb.industry?.[level]||[];
  const last=periods.find(p=>p.dt===date)||periods.at(-1);if(!last)return empty('没有可用的转债正股行业历史。');
  return `<p class="method-note">${esc(last.dt)} · 转债正股名义映射 · 原包覆盖标志 ${last.full===true?'完整':'未核完整'}。此处只列转债，与“行业分析”中的直接股票分别查看。</p>${table(['正股行业／板块','转债名义占净值'],last.rows.map(r=>[esc(r.name),pp(r.wt)]))}`;
 }
 function positionArchive(d){
  const cb=d.archive?.cb;if(!cb)return '';
  const rows=cb.position?.alloc||[],hhi=new Map(cb.concentration?.hhi||[]),single=new Map(cb.concentration?.turnover_single||[]),rolling=new Map(cb.concentration?.turnover_roll4q||[]);
  const history=rows.map(x=>[x.dt,pp(x.stk),pp(x.cb),pp(x.pure_bond),num(hhi.get(x.dt),4),pp(single.get(x.dt)),pp(rolling.get(x.dt))]);
  const mkt=cb.mkt_prem||[];
  return section('转债仓位、集中度与换手',`历史截至 ${rows.at(-1)?.dt||'未覆盖'}`,`<details><summary>逐期名义权重、HHI与换手代理</summary>${table(['报告期','直接股占净值','转债占净值','普通债占净值','HHI','单期换手代理','滚动4期'],history.slice().reverse())}</details>`)+
   (mkt.length?section('转债市场溢价','转债市场历史 · '+mkt[0][0]+' 至 '+mkt.at(-1)[0],renderMiniLineChart(mkt.map(([date,value,n])=>({date,report_date:date,value,n})),[{key:'value',label:'市场转股溢价率',color:'#B98B4F',format:'percent'}],'转债市场转股溢价率')+`<p class="method-note">最后一期 ${mkt.at(-1)[2]}只有效转债；市场日频序列与本基金季度持仓特征分别保留。</p>`):'');
 }
 function clauseBody(d){
  const records=d.archive?.cb.clause?.rows||[],last=records.at(-1);
  if(!last)return empty('该基金暂无条款画像明细；需要逐券条款版本、上市日及连续日行情。');
  return `<p class="method-note">${esc(last.dt)} · 共${last.n}只转债 · 覆盖 ${pct(last.sh_cov)}。价格条件观察采用原包定义；发行人强赎决定需对应公告。</p>${table(['观察项','值','口径'],[
   ['加权上市时间',num(last.age_wavg,0)+'天','有效样本转债权重加权'],['上市180天内',pp(last.w_new180),'占基金净值'],['距强赎价格线较近',pp(last.w_sh_near),'距触发线≤10个百分点的名义权重'],['超过强赎价格线',pp(last.w_sh_over),'仅价格条件，未核连续日计数'],['达到下修价格条件',pp(last.w_xz_hit),'仅价格条件，未核发行人选择']])}${table(['评级','占净值','占已覆盖转债'],(last.rating_buckets||[]).map(x=>[esc(x.k),pp(x.w),pp(x.share)]))}<details><summary>逐期条款与评级观察</summary>${table(['报告期','只数','次新占净值','强赎价格线以上','下修价格条件','覆盖'],records.slice().reverse().map(x=>[x.dt,x.n,pp(x.w_new180),pp(x.w_sh_over),pp(x.w_xz_hit),pct(x.sh_cov)]))}</details>`;
 }
 function convertiblePanel(fund,d){
  if(!isEligible(fund))return empty('此基金不在当前一级、二级债基或转债分类中。');
  const archive=d.archive;
  return currentConvertible(fund,d)+section('转债与正股历史特征','指标按各自实际日期展示',archiveControls(d))+
   (archive?section('转债正股行业',`历史报告 ${archive.source_holding_date}`,`<label class="fusion-control">行业层级<select data-fusion-industry>${[['sector','板块'],['l1','中信一级'],['l2','中信二级'],['l3','中信三级']].map(([key,label])=>`<option value="${key}"${key==='l1'?' selected':''}>${label}</option>`).join('')}</select></label><label class="fusion-control">报告期<select data-fusion-industry-period>${(archive.cb.industry?.l1||[]).slice().reverse().map(p=>`<option value="${p.dt}">${p.dt}</option>`).join('')}</select></label><div data-fusion-industry-output>${industryArchive(d)}</div>`):'')+
   positionArchive(d)+
   section('条款、次新与评级','历史价格条件与发行人公告分开',clauseBody(d));
 }
 function ipoPanel(fund,d){
  const ipo=d.archive?.ipo;
  if(!ipo)return section('打新获配与价差','当前缺少本组合的逐笔获配记录',empty('现有库未匹配到该组合的获配、发行价和开板卖出记录，打新贡献暂不记零，持仓法归因残差保持原值。'));
  if(!ipo.trades?.length)return section('打新获配记录',`历史记录截至 ${d.archive.source_as_of}`,empty('现有资料未匹配到获配记录，尚无逐笔覆盖证明；本页保留未覆盖，不把“未匹配”改写为实际打新收益为零。'));
  const trades=ipo.trades;
  return section('网下获配与开板估算',`历史记录截至 ${d.archive.source_as_of}`,table(['股票','上市日','估算卖出日','获配股数','发行价','开板均价','锁定比例','估算价差金额'],trades.map(r=>[`${esc(r.name)}<small>${esc(r.stock)}</small>`,r.list_dt,r.sell_dt,num(r.shares,0),num(r.issue),num(r.avgp),pct(r.lock),num(r.spread)])))+section('价差贡献','销售回款与收益分别展示',table(['口径','金额／收益','覆盖'],[['卖出回款',num(ipo.total?.amount),'包含认购成本'],['估算价差',num(ipo.total?.spread_amount),'(开板估算价−发行价)×非锁定获配数量'],['估算价差贡献',pp(ipo.total?.spread_ret),'历史平均净资产分母，非逐日TWR']]))+'<p class="method-note">开板均价为估算卖出价格；交易费用及实际卖出成交未覆盖。打新表不重复加到现有净值桥。</p>';
 }
 function attributionAudit(data,d){
  if(!data?.periods?.length)return '';
  const rows=data.periods.map(p=>[p.start+' → '+p.end,pct(p.actual_return),pct(p.market),pct(p.allocation),pct(p.selection),pct(p.residual),finite(bridge(p))?bridge(p).toExponential(1):'缺字段']);
  const a=d?.archive;
  const prior=a?`<details><summary>历史口径对照</summary><p class="method-note">区间截止 ${esc(a.baseline_A.at(-1)?.d1)}；B只修纯债收益重复除100，现站C另用自身输入。此对照不计作模型准确率提升。</p>${table(['区间','实际收益','原A选券贡献','纠错B选券贡献','原A残差','纠错B残差'],a.baseline_A.map((x,i)=>[x.d0+' → '+x.d1,pp(x.actual),pp(x.sel),pp(a.baseline_B[i].sel),pp(x.resid),pp(a.baseline_B[i].resid)]))}</details>`:'';
  return section('收益桥核对',`现有持仓法区间至 ${data.periods.at(-1).end}`,`<p class="method-note">实际收益＝市场＋配置＋证券选择＋残差。各项为同一净值分母的小数收益，显示时转换为百分比；打新尚未另行剥离。</p><details><summary>逐期贡献与闭合</summary>${table(['区间','实际收益','市场','配置','选择','残差','闭合差'],rows)}</details>${prior}`);
 }
 function bind(host,d){
  host.querySelector('[data-fusion-feature]')?.addEventListener('change',event=>{host.querySelector('[data-fusion-feature-output]').innerHTML=featureBody(d,event.target.value);bindMiniLineCharts();});
  const updateIndustry=()=>{host.querySelector('[data-fusion-industry-output]').innerHTML=industryArchive(d,host.querySelector('[data-fusion-industry]').value,host.querySelector('[data-fusion-industry-period]').value);};
  host.querySelector('[data-fusion-industry]')?.addEventListener('change',updateIndustry);
  host.querySelector('[data-fusion-industry-period]')?.addEventListener('change',updateIndustry);
  bindMiniLineCharts();
 }
 root.BondCBFusion={finite,assets,weighted,bridge,isEligible,adaptFund,adaptDetail,load,riskPanel,convertiblePanel,ipoPanel,attributionAudit,bind};
 if(typeof module!=='undefined')module.exports=root.BondCBFusion;
})(typeof window==='undefined'?globalThis:window);
