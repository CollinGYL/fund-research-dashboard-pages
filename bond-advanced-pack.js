/* Independent candidate API. Does not change navigation, shared page functions or models. */
(function(root){
 'use strict';
 const ok=x=>typeof x==='number'&&Number.isFinite(x),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pct=x=>ok(x)?(x*100).toFixed(2)+'%':'—',num=(x,n=2)=>ok(x)?x.toLocaleString('zh-CN',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
 const note=x=>`<p class="bap-note">${esc(x)}</p>`,section=(title,body)=>`<section class="bap-section"><h3>${esc(title)}</h3>${body}</section>`;
 const table=(heads,rows)=>`<div class="bap-table"><table><thead><tr>${heads.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>'<tr>'+r.map(x=>`<td>${x}</td>`).join('')+'</tr>').join(''):`<tr><td colspan="${heads.length}">暂无披露明细。</td></tr>`}</tbody></table></div>`;
 const unit=x=>({fraction:'百分比',percent:'百分比'}[x]||x);
 const field=x=>x.unit==='fraction'?pct(x.value):x.unit==='percent'?(ok(x.value)?num(x.value)+'%':'—'):num(x.value);
 function contextKey(f){if(f.category==='active-equity')return 'active-equity';if(f.category==='convertible-bond')return 'convertible-bond';if(f.category==='hybrid-bond')return f.internal_category==='primary_bond'||f.subtype==='一级债基'?'primary-bond':'secondary-bond';return null;}
 function features(p,selection='latest'){
  if(selection==='latest'&&!p.latest_quotes_on_last_disclosure&&p.periods?.length)selection=p.periods.at(-1).report_date;
  const current=selection==='latest'?p.latest_quotes_on_last_disclosure:(p.periods||[]).find(x=>x.report_date===selection);
  const opts=(p.latest_quotes_on_last_disclosure?[['latest','最近披露权重 × 最新可得行情']]:[]).concat((p.periods||[]).slice().reverse().map(x=>[x.report_date,x.report_date]));
  const controls=`<label>数据视图<select data-bap-feature-period>${opts.map(([k,v])=>`<option value="${esc(k)}"${k===selection?' selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
  if(!current)return section('转债高级特征',controls+note('该视图缺少可用持仓或对应日期行情。'));
  const dates=current.view_kind?`持仓报告 ${current.holdings_report_date}；行情 ${current.quote_date}。按最近披露的原权重计算，并非当前真实仓位，也未按价格漂移估计仓位。`:`持仓与特征报告期 ${current.report_date}。默认只使用7个自然日内可得的源观察值，旧报价不计入本期均值。`;
  const dated=!!current.feature_observation_dates;
  const rows=Object.entries(current.features||{}).map(([key,x])=>{const row=[esc(x.label),field(x),esc(unit(x.unit)),pct(x.coverage_disclosed),pct(x.coverage_all_CB)];if(dated){const ds=ok(x.value)?(current.feature_observation_dates[key]||[]):[];row.push(esc(ds.length===1?ds[0]:ds.length?ds[0]+' ～ '+ds.at(-1):'—'));}return row;});
  const under=Object.values(current.underlying||{}).map(x=>[esc(x.label),field(x),esc(unit(x.unit)),pct(x.coverage_disclosed),pct(x.coverage_all_CB)]);
  return section('转债高级特征',controls+note(dates)+note(`披露转债占净资产 ${pct(current.disclosed_cb_weight_nav)}；资产表全部转债 ${pct(current.asset_cb_weight_nav)}；可定价权重覆盖 ${pct(current.priced_weight_coverage)}。`)+table(['特征','市值加权均值','单位','有该项数据的转债占已披露转债比例','有该项数据的转债占全部转债比例',...(dated?['实际行情日']:[])],rows))+section('转债对应正股特征',table(['特征','市值加权均值','单位','有该项数据的转债占已披露转债比例','有该项数据的转债占全部转债比例'],under))+note('直接股票、转债名义正股映射和Delta敞口分别处理；无Delta输入，不生成股票等价仓位。同事BS边界参数与可复算隐波分列；条款和映射的完整历史生效版本尚未核实。');
 }
 function ownFunds(p,selection){
  const all=p.periods||[],selected=all.find(x=>x.report_date===selection)||all.at(-1),history=p.asset_history||[],latest=history.at(-1);
  const summary=latest?table(['最新资产报告期','基金投资金额（元）','占总资产','占净资产'],[[esc(latest.report_date),num(latest.fund_value_cny),pct(latest.fund_weight_total),pct(latest.fund_weight_nav)]]):note('尚无可核对的基金投资资产表。');
  const trend=root.BondComplete?.line?root.BondComplete.line(history.map(x=>[x.report_date,ok(x.fund_weight_nav)?x.fund_weight_nav*100:null]),'基金投资占净资产',{suffix:'%',points:true}):'';
  const historyTable=`<details class="bap-coverage"><summary>基金投资历史</summary>${table(['报告期','基金投资金额（元）','占总资产','占净资产'],history.slice().reverse().map(x=>[esc(x.report_date),num(x.fund_value_cny),pct(x.fund_weight_total),pct(x.fund_weight_nav)]))}</details>`;
  let body=section('基金投资仓位',summary+trend+historyTable);
  if(!selected)return body+section('持有基金／ETF明细',note('当前未取得可核对的明细；以资产表基金投资金额判断仓位，不能把缺明细当作零投资。'));
  const opts=all.slice().reverse().map(x=>`<option value="${x.report_date}"${x===selected?' selected':''}>${x.report_date}${x.detail_scope==='all'?' · 全部':x.detail_scope==='top10'?' · 前十大':x.detail_scope==='aggregate_only'?' · 仅汇总':' · 已取得明细'}</option>`).join('');
  const scope=selected.detail_scope==='all'?'全部明细':selected.detail_scope==='top10'?'前十大明细':'已取得明细';
  const stale=p.latest_asset_date&&selected.report_date<p.latest_asset_date?note(`所选明细为${selected.report_date}，最新资产期为${p.latest_asset_date}。`):'';
  const amount=ok(selected.asset_fund_value_cny)?`；基金投资总额 ${num(selected.asset_fund_value_cny)}元`:'';
  const aggregateOnly=selected.details_status==='aggregate_only';
  const content=`<label>明细报告期<select data-bap-fund-period>${opts}</select></label>`+stale+(aggregateOnly?note(`基金投资总额 ${num(selected.asset_fund_value_cny)}元。`):note(`${scope} ${selected.rows.length}项；明细合计 ${num(selected.disclosed_value_cny)}元${amount}；金额覆盖 ${pct(selected.coverage_of_asset_funds)}。`));
  const related=x=>x===true?'是':x===false?'否':typeof x==='string'?esc(x):'—';
  const rows=selected.rows.map(r=>[esc(r.held_fund_code),esc(r.held_fund_name),num(r.quantity_shares),num(r.market_value_cny),pct(r.weight_nav),esc(r.held_fund_manager||'—'),esc(r.operation_type||'—'),related(r.related_party)]);
  const details=aggregateOnly?note('本期原报告只列出基金投资合计，未列逐只明细。'):selected.details_status==='confirmed_zero'?note('本期资产表可核对基金投资为零。'):table(['基金代码','名称','持有份额（份）','公允价值（元）','占净资产','管理人','运作方式','关联方基金'],rows);
  return body+section('持有基金／ETF明细',content+details+(selected.source_pdf_url?`<p class="bap-note"><a href="${esc(selected.source_pdf_url)}" target="_blank" rel="noopener">查看本期原报告</a></p>`:''));
 }
 const lockLabel=x=>({'explicit_no_lock':'原文明确无锁定','explicit_locked_percentage':'原文明确锁定比例','duration_only; colleague_assumes_all_locked':'仅有锁定期限；情景按全部锁定','missing_lock_text; explicit10pct_scenario_only':'锁定文本缺失；情景假设10%','unrecognized_text; explicit10pct_scenario_only':'锁定文本待核；情景假设10%'}[x]||x);
 function ipo(p,mode='strict',limit=50){
  const rows=(p.allocations||[]).slice().sort((a,b)=>(a.allocation_date||'').localeCompare(b.allocation_date||'')),key=mode==='scenario'?'colleague_lock_scenario':'strict_lock_estimate';const valid=rows.filter(r=>ok(r[key]?.estimated_gross_spread_cny));const shown=limit==='all'?rows.length:Math.min(rows.length,Number(limit)||50);
  const controls=`<label>锁定口径<select data-bap-ipo-mode><option value="strict"${mode==='strict'?' selected':''}>仅锁定比例有明确依据</option><option value="scenario"${mode==='scenario'?' selected':''}>同事锁定假设情景（逐笔标明）</option></select></label><label>显示记录<select data-bap-ipo-count>${[[50,"最近50笔"],[100,"最近100笔"],["all","全部"]].map(([v,t])=>`<option value="${v}"${String(v)===String(limit)?" selected":""}>${t}</option>`).join("")}</select></label>`;
  return section('打新获配事实与估算',controls+note(`已匹配 ${rows.length} 笔获配（${rows[0]?.allocation_date||'无可用日期'} 至 ${rows.at(-1)?.allocation_date||'无可用日期'}）；当前口径可估算 ${valid.length} 笔。开板日均价是假设卖价，回款不是利润；实际成交与费用未知，净收益保持空缺。`)+table(['获配日','证券','获配股数','发行价','锁定依据','假设卖出日','假设均价','回款（元）','毛价差（元）'],rows.slice(-shown).reverse().map(r=>[esc(r.allocation_date),esc(r.stock_code)+' '+esc(r.stock_name),num(r.allocated_shares,0),num(r.issue_price_cny),esc(lockLabel(r.lock.basis)),esc(r.opening_price.assumed_sale_date||'未识别'),num(r.opening_price.assumed_sale_vwap),num(r[key]?.sale_proceeds_cny),num(r[key]?.estimated_gross_spread_cny)]))+note(`当前显示${shown}笔；选择“全部”查看所有获配记录。无匹配记录不等于未打新；缺锁定文本的10%和仅期限文本的全锁定均属于假设。`))+section('历史区间估算',table(['区间','平均净资产（元）','已匹配笔数','明确锁定的毛价差贡献','情景毛价差贡献','P35回款率（不是收益）'],(p.bridge_intervals||[]).slice().reverse().map(x=>[esc(x.start+' → '+x.end),num(x.average_NAV_cny),String(x.observed_allocation_rows),pct(x.strict_lock_gross_spread_rate_allocated_in_period),pct(x.colleague_scenario_gross_spread_rate_allocated_in_period),pct(x.colleague_P35_proceeds_rate_allocated_in_period)])))+note('毛价差按获配日或假设卖出日分别统计；实际成交、费用、融资成本及部分获配记录尚缺，净收益暂缺。');
 }
 function windowStats(points,start,end){
  const rows=points.filter(x=>x[0]>=start&&x[0]<=end&&ok(x[1])&&x[1]>0);if(rows.length<2)return {n:rows.length,value:null,first:rows[0]?.[0],last:rows.at(-1)?.[0]};let peak=rows[0][1],dd=0;for(const[d,v]of rows){peak=Math.max(peak,v);dd=Math.min(dd,v/peak-1);}return {n:rows.length,value:rows.at(-1)[1]/rows[0][1]-1,first:rows[0][0],last:rows.at(-1)[0],maxDrawdown:dd,points:rows};
 }
 const colors=['#9a2034','#b68945','#376a80','#687c4b','#916e92','#758395'];
 function multiChart(lines,label){
  const valid=lines.filter(x=>x.points?.length>1);if(!valid.length)return note('当前区间缺少可比较曲线，不填充或延长缺失序列。');
  const dates=valid.flatMap(x=>x.points.map(p=>Date.parse(p[0]))),values=valid.flatMap(x=>x.points.map(p=>p[1]));const x0=Math.min(...dates),x1=Math.max(...dates),lo=Math.min(...values),hi=Math.max(...values);
  const paths=valid.map((s,i)=>`<path d="${s.points.map(([d,v],j)=>(j?'L':'M')+(50+(Date.parse(d)-x0)/(x1-x0||1)*680).toFixed(2)+','+(145-(v-lo)/(hi-lo||1)*115).toFixed(2)).join('')}" fill="none" stroke="${colors[i%colors.length]}" stroke-width="2"/>`).join('');
  return `<div class="bap-legend">${valid.map((s,i)=>`<span style="color:${colors[i%colors.length]}">● ${esc(s.name)}</span>`).join('')}</div><svg viewBox="0 0 780 180" class="bap-chart" role="img" tabindex="0" data-bap-chart-lines="${esc(JSON.stringify(valid))}" aria-label="${esc(label)}；悬停或用左右方向键查看数值"><title>${esc(label)}：按实际观察日期绘制，不补零</title><path d="M50 20V145H730" fill="none" stroke="#cfd6db"/><text x="5" y="25">${num(hi)}</text><text x="5" y="145">${num(lo)}</text><text x="50" y="171">${new Date(x0).toISOString().slice(0,10)}</text><text x="645" y="171">${new Date(x1).toISOString().slice(0,10)}</text>${paths}<line data-bap-rule hidden y1="20" y2="145" stroke="#736b60" stroke-dasharray="3 3"/></svg><output class="bap-chart-readout"></output>`;
 }
 function marketWindow(p,key,start,end,label,compact=false){
  const context=p.contexts[key];if(!context)return note('该类别未配置市场概览。');if(!start||!end||start>end)return note('请选择有效起止日期。');
  const series=context.indices.map(c=>p.indices[c]).filter(Boolean),rows=[],lines=[];
  for(const s of series){const stat=windowStats(s.series,start,end),covered=stat.points&&Math.abs(Date.parse(stat.first)-Date.parse(start))<=14*86400000&&Math.abs(Date.parse(end)-Date.parse(stat.last))<=14*86400000;rows.push([esc(s.name),s.kind==='bond_wealth'?'财富回报（含票息再投资）':'价格回报',esc(stat.first||'—'),esc(stat.last||'—'),String(stat.n),pct(stat.value),pct(stat.maxDrawdown),covered?'区间有足够起止覆盖':'起止覆盖不足/无数据']);if(covered)lines.push({name:s.name,points:stat.points.map(([d,v])=>[d,v/stat.points[0][1]*100])});}
  const stats=table(['指数','回报口径','实际开始','实际结束','观察数','区间回报','最大回撤','覆盖'],rows);return section(label+'：指数市场表现',multiChart(lines,'实际指数区间走势（期初100）')+(compact?'<details class="bap-coverage"><summary>查看区间数据</summary>'+stats+'</details>':stats)+note(compact?'各指数实际起点为100；转债、股票用价格回报，普通债用含票息再投资的财富回报。':'只对起止覆盖相近的序列绘制比较图，其他系列保留实际可得统计；价格与财富回报口径分别标明，不据此宣称同风险收益排名。历史指数回看不是完整成分股PIT。'));
 }
 function marketCard(label,value,caption){return `<div class="bap-market-card"><span>${esc(label)}</span><strong>${value}</strong><small>${esc(caption)}</small></div>`;}
 function convertibleSummary(p,start,end){
  const index=p.indices['000832.SH'],stat=windowStats(index?.series||[],start,end),sample=p.convertible_sample_market,prices=sample?.series||[],price=prices.at(-1),premium=p.convertible_sample_premium,pr=premium?.series?.at(-1),beta=p.convertible_stock_beta?.series?.filter(x=>ok(x[1])&&x[0]<=end).at(-1);
  const cards=[marketCard('中证转债 · 区间涨跌',pct(stat.value),stat.n>1?`${stat.first} 至 ${stat.last}`:'当前区间数据不足'),marketCard('中证转债 · 最大回撤',pct(stat.maxDrawdown),`${stat.n}个实际价格观察日`),marketCard('样本最新价格中位数',price?num(price[1])+'<i>元</i>':'—',price?`${price[0]} · 固定${sample.fixed_price_count}只`:'样本行情待补'),marketCard('样本最新转股溢价中位数',pr?pct(pr[1]):'—',pr?`${pr[0]} · 固定${premium.sample_size}只`:'样本行情待补')].join('');
  const sentence=stat.n>1?`从${stat.first}到${stat.last}，中证转债${stat.value<0?'下跌':'上涨'}${pct(Math.abs(stat.value))}，区间最大回撤${pct(Math.abs(stat.maxDrawdown))}。`:'当前观察区间没有足够的转债指数价格。';
  return `<div class="bap-market-cards">${cards}</div><p class="bap-market-readout">${esc(sentence)}${beta?` 截至${esc(beta[0])}，最近${beta[2]}个共同收益观察的股市联动β为${num(beta[1])}。`:''}</p>`;
 }
 function convertibleSample(p){
  const m=p.convertible_sample_market,s=p.convertible_sample_premium,last=m?.latest;
  if(!last)return section('价格、估值与交易活跃度',note('可得转债样本的价格与交易统计正在补齐；指数表现仍可查看。'));
  const price=m.series?.at(-1),priceText=price?`截至${price[0]}，固定${m.fixed_price_count}只样本的价格中位数为${num(price[1])}元，在${m.first}至${m.last}的${m.dates}个观察日中处于${pct(m.price_percentile_in_sample_history)}分位。`:'';
  const priceChart=section('样本价格处在什么位置',multiChart([{name:'转债全价中位数（元/百元面值）',points:(m.series||[]).map(x=>[x[0],x[1]])}],'固定持券样本价格中位数')+note(priceText));
  const bands=section('相近平价的券，溢价多高',table(['平价区间','转股溢价中位数','有效券数'],(last.parity_bands||[]).map(b=>[esc(b.label),pct(b.premium_median),String(b.count)]))+note(`${last.date} · ${last.parity_count}只有同日价格与平价。平价是按当日转股条件换成股票后的价值；溢价是转债价格高于平价的比例。`)+`<details class="bap-coverage"><summary>查看样本溢价历史</summary>${multiChart([{name:'固定样本转股溢价中位数（%）',points:(s?.series||[]).map(x=>[x[0],x[1]*100])}],'固定持券样本转股溢价历史')}${note(`固定${s?.sample_size||0}只、${s?.dates||0}个观察日；最新溢价中位数在该段样本历史中处于${pct(s?.latest_percentile_in_own_sample_history)}分位。`)}</details>`);
  const activity=section('样本成交是否集中',`<div class="bap-market-cards bap-market-cards-three">${marketCard('当日成交额',ok(last.amount_cny)?num(last.amount_cny/1e8)+'<i>亿元</i>':'—',`${last.amount_count}只成交额有效`)}${marketCard('剩余规模',ok(last.balance_cny)?num(last.balance_cny/1e8)+'<i>亿元</i>':'—',`${last.positive_balance_count}只余额大于零`)}${marketCard('成交额前十集中度',pct(last.top10_amount_share),'前十券成交额 / 样本成交额')}</div>`+note(`${last.date} · ${last.zero_amount_count}只成交额为零；${last.missing_amount_count}只缺成交额。集中度越高，样本交易越集中在少数券上。`));
  return `<div class="bap-market-two">${priceChart}${bands}</div>${activity}<details class="bap-coverage"><summary>样本范围与尚缺指标</summary><p>持券来源共${m.source_bonds}只，${last.date}有${last.positive_balance_count}只余额大于零、${last.quote_count}只价格有效；${last.zero_balance_count}只余额为零，${last.missing_balance_count}只余额缺失。价格历史使用整段均有有效价格的固定${m.fixed_price_count}只；分位窗口仅为${m.first}至${m.last}，共${m.dates}日。</p><p>价格为每百元面值的全价；估值使用同日平价。强赎公告状态、完整历史上市名单和停牌标记尚缺；零成交量与停牌分别处理。上述成交与估值统计范围均为可得持券样本。</p></details>`;
 }
 function convertibleMarket(p,start,end,year){
  const dateInput=(key,label,value)=>`<label>${label}<input type="date" aria-label="${label}" data-bap-${key} value="${value}"></label>`;
  return section('可转债市场',`<p class="bap-market-intro">先看转债指数的涨跌，再看样本价格、转股溢价和成交集中度。转股溢价反映转债价格高于按当日条件转换成股票后价值的比例；样本范围和实际日期分别标明。</p><div class="bap-controls">${dateInput('a-start','观察开始',start)}${dateInput('a-end','观察结束',end)}<button type="button" data-bap-window-reset>近三个月</button></div><div data-bap-cb-summary>${convertibleSummary(p,start,end)}</div><div data-bap-market-a>${marketWindow(p,'convertible-bond',start,end,'当前观察区间',true)}</div><details class="bap-comparison"><summary>增加一个对比区间</summary><div class="bap-controls">${dateInput('b-start','对比开始',year)}${dateInput('b-end','对比结束',end)}</div><div data-bap-market-b>${marketWindow(p,'convertible-bond',year,end,'对比区间',true)}</div></details>`)+convertibleSample(p)+`<div data-bap-cb-beta>${convertibleBeta(p,start,end)}</div>`;
 }
 function convertibleBeta(p,start,end){
  const beta=p.convertible_stock_beta,points=(beta?.series||[]).filter(x=>ok(x[1])&&x[0]>=start&&x[0]<=end);
  return section('转债与股市的联动',multiChart([{name:'转债相对中证800的滚动β',points:points.map(x=>[x[0],x[1]])}],'转债与中证800的历史收益联动')+note('β衡量转债指数日收益随股票指数变化的幅度；使用最近60个共同收益观察，至少40个才展示。β上升表示这段时间对股市变化更敏感。'));
 }
 function bindMarketCharts(host){
  host.querySelectorAll('svg[data-bap-chart-lines]').forEach(svg=>{
   if(svg.dataset.bapChartReady)return;svg.dataset.bapChartReady='1';
   const lines=JSON.parse(svg.dataset.bapChartLines),dates=[...new Set(lines.flatMap(s=>s.points.map(p=>p[0])))].sort(),lo=Date.parse(dates[0]),hi=Date.parse(dates.at(-1)),output=svg.nextElementSibling;let selected=dates.length-1;
   function show(i){
    selected=Math.max(0,Math.min(dates.length-1,i));const date=dates[selected],x=50+(Date.parse(date)-lo)/(hi-lo||1)*680,rule=svg.querySelector('[data-bap-rule]');rule.setAttribute('x1',x);rule.setAttribute('x2',x);rule.removeAttribute('hidden');
    output.textContent=date+' · '+lines.map(s=>{const point=s.points.find(p=>p[0]===date);return s.name+' '+(point?num(point[1],3):'该日无值');}).join('；');
   }
   svg.addEventListener('pointermove',event=>{const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const matrix=svg.getScreenCTM();if(!matrix)return;const local=point.matrixTransform(matrix.inverse()),time=lo+Math.max(0,Math.min(1,(local.x-50)/680))*(hi-lo);let best=0;for(let i=1;i<dates.length;i++)if(Math.abs(Date.parse(dates[i])-time)<Math.abs(Date.parse(dates[best])-time))best=i;show(best);});
   svg.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();show(event.key==='Home'?0:event.key==='End'?dates.length-1:selected+(event.key==='ArrowLeft'?-1:1));}});show(selected);
  });
 }

 // Display the same window statistics already used by the index detail table.
 function marketBrief(p,key,start,end){
  if(!start||!end||start>end)return note('请选择有效起止日期。');
  const selections={
   'active-equity':[['000300.SH','沪深300 · 大盘股票'],['000905.SH','中证500 · 中盘股票'],['000852.SH','中证1000 · 小盘股票'],['000906.SH','中证800 · 沪深主要股票']],
   'primary-bond':[['CBA00101.CS','中债综合 · 普通债'],['CBA00601.CS','中债国债 · 利率债'],['CBA02001.CS','中债企业债 · 信用债'],['000832.SH','中证转债 · 可转债']],
   'secondary-bond':[['CBA00101.CS','中债综合 · 普通债'],['CBA02001.CS','中债企业债 · 信用债'],['000906.SH','中证800 · 股票'],['000832.SH','中证转债 · 可转债']]
  };
  const rows=(selections[key]||[]).map(([code,label])=>{const index=p.indices[code],stat=windowStats(index?.series||[],start,end);return {code,label,index,stat};});
  return `<div class="bap-market-cards">${rows.map(({code,label,index,stat})=>`<div class="bap-market-card" data-market-brief-code="${esc(code)}"><span>${esc(label)} · 区间涨跌</span><strong>${pct(stat.value)}</strong><small>${index?.kind==='bond_wealth'?'含票息再投资':'价格回报'} · 最大回撤 ${pct(stat.maxDrawdown)}<br>${esc(stat.first||'—')} 至 ${esc(stat.last||'—')}</small></div>`).join('')}</div>`;
 }
 function marketReading(key){
  return {
   'active-equity':'先看大盘、中盘、小盘指数的涨跌，了解市场风格；再结合最大回撤，判断这段走势经历了多大波动。',
   'primary-bond':'先看普通债与信用债的表现，再看转债带来的市场变化。债券财富指数包含票息再投资，转债指数展示价格回报；基金的实际表现还取决于仓位和持券。',
   'secondary-bond':'把普通债、股票和转债分开观察，了解收益来自哪类市场。债券财富指数包含票息再投资，股票和转债展示价格回报；各基金的实际配置比例不同。'
  }[key]||'';
 }
 function market(p,key='active-equity'){
  const c=p.contexts[key];if(!c)return note('该类别暂无市场概览。');const end=p.latest_observation,dt=new Date(end+'T00:00:00Z'),prior=new Date(dt);prior.setUTCMonth(prior.getUTCMonth()-3);const start=prior.toISOString().slice(0,10),year=end.slice(0,4)+'-01-01';
  if(key==='convertible-bond')return convertibleMarket(p,start,end,year);
  const dateInput=(key,label,value)=>`<label>${label}<input type="date" aria-label="${label}" data-bap-${key} value="${value}"></label>`;
  return section(c.name,`<p class="bap-market-intro">${esc(marketReading(key))}</p><div class="bap-controls">${dateInput('a-start','观察开始',start)}${dateInput('a-end','观察结束',end)}<button type="button" data-bap-window-reset>近三个月</button></div><div data-bap-market-brief>${marketBrief(p,key,start,end)}</div><p class="bap-market-readout">区间涨跌看这段时间涨了多少、跌了多少；最大回撤看期间从此前高点向下跌得最多的幅度。每项实际起止日期分别标明。</p><div data-bap-market-a>${marketWindow(p,key,start,end,'当前观察区间',true)}</div><details class="bap-comparison"><summary>增加一个对比区间</summary><div class="bap-controls">${dateInput('b-start','对比开始',year)}${dateInput('b-end','对比结束',end)}</div><div data-bap-market-b>${marketWindow(p,key,year,end,'对比区间',true)}</div></details>`)+`<details class="bap-coverage"><summary>指数范围、回报口径与数据覆盖</summary>${note(c.scope+'。各指数按自身真实截至日展示；当前缓存最长观察日至'+end+'，不代表所有序列均已更新到该日。')}${note('只对起止覆盖相近的序列绘制比较图；起止日期、观察数及覆盖状态见各图的区间数据。无可靠成交额、指数估值或全市场转债溢价输入时保持缺项；新行情与报告由原更新流程刷新。')}</details>`;
 }
 function bind(host,p,kind,key){
  if(kind==='features')host.querySelector('[data-bap-feature-period]')?.addEventListener('change',e=>{host.innerHTML=features(p,e.target.value);bind(host,p,kind,key);});
  if(kind==='ownFunds')host.querySelector('[data-bap-fund-period]')?.addEventListener('change',e=>{host.innerHTML=ownFunds(p,e.target.value);bind(host,p,kind,key);});
  if(kind==='ipo'){const draw=()=>{const mode=host.querySelector('[data-bap-ipo-mode]').value,limit=host.querySelector('[data-bap-ipo-count]').value;host.innerHTML=ipo(p,mode,limit);bind(host,p,kind,key);};host.querySelectorAll('[data-bap-ipo-mode],[data-bap-ipo-count]').forEach(x=>x.addEventListener('change',draw));}
  if(kind==='market'){
   bindMarketCharts(host);
   const draw=()=>{const v=x=>host.querySelector(`[data-bap-${x}]`).value;host.querySelector('[data-bap-market-a]').innerHTML=marketWindow(p,key,v('a-start'),v('a-end'),'当前观察区间',true);host.querySelector('[data-bap-market-b]').innerHTML=marketWindow(p,key,v('b-start'),v('b-end'),'对比区间',true);if(key!=='convertible-bond')host.querySelector('[data-bap-market-brief]').innerHTML=marketBrief(p,key,v('a-start'),v('a-end'));if(key==='convertible-bond'){host.querySelector('[data-bap-cb-summary]').innerHTML=convertibleSummary(p,v('a-start'),v('a-end'));host.querySelector('[data-bap-cb-beta]').innerHTML=convertibleBeta(p,v('a-start'),v('a-end'));}bindMarketCharts(host);};
   host.querySelectorAll('input[type=date]').forEach(x=>x.addEventListener('change',draw));host.querySelector('[data-bap-window-reset]')?.addEventListener('click',()=>{host.innerHTML=market(p,key);bind(host,p,kind,key);});
  }
 }
 const cache=new Map();
 function termAt(p,code,cutoff,strict=true){
  const snapshots=(p.bonds?.[code]||[]).filter(x=>x.observed_date&&x.observed_date<=cutoff).sort((a,b)=>a.observed_date.localeCompare(b.observed_date));
  if(strict){const valid=snapshots.filter(x=>x.verified_effective_interval&&x.effective_from<=cutoff&&(!x.effective_to||cutoff<x.effective_to));return valid.at(-1)||{status:'no_verified_historical_effective_interval',fields:null};}
  const fields={};for(const s of snapshots)for(const[k,v]of Object.entries(s.fields||{}))fields[k]={value:v,observed_date:s.observed_date,effective_interval_verified:false};
  return {status:snapshots.length?'observed_snapshots_only':'no_snapshot_known_by_cutoff',fields,snapshots:snapshots.length};
 }
 async function load(index,kind,code,loader){
  const module=index.modules[kind],entry=module?.path?module:module?.funds?.[code];if(!entry)throw new Error('该模块或基金没有登记载荷');const hash=entry.content_hash;if(!hash)throw new Error('载荷缺内容版本，请先更新数据索引');const key=kind+':'+code+':'+hash;
  if(cache.has(key))return cache.get(key);const promise=(async()=>{const get=()=>module.path?root[module.global_name]:root[module.global_name]?.[code];let p=get();if(p?._content_hash!==hash){await loader(entry.path+'?v='+entry.file_sha256.slice(0,16),kind,get);p=get();}if(p?._content_hash!==hash||(!module.path&&p.code!==code))throw new Error('载荷身份或版本不符，保留旧有效结果并重试');return p;})().catch(e=>{cache.delete(key);throw e;});cache.set(key,promise);return promise;
 }
 const api={convertibleSummary,convertibleSample,convertibleMarket,bindMarketCharts,features,ownFunds,ipo,market,marketWindow,windowStats,multiChart,contextKey,termAt,load,bind};root.BondAdvancedPack=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
