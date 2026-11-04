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
 function withAssetVersions(p,detail){
  const fund=detail?.fund || {code:p.code},phaseRows=rows=>root.FundResearch.selectReportVersions(rows).map(row=>({...row,history_phase:root.FundResearch.assetPhase(fund,row.date || row.report_date)}));
  p={...p,disclosure:p.disclosure?{...p.disclosure,asset_periods:phaseRows(p.disclosure.asset_periods || [])}:p.disclosure};
  const source=detail?.asset_history;
  if(!source?.length)return {...p,metrics:{...p.metrics,position:root.FundResearch.selectReportVersions(p.metrics.position || [])},fund_investment:root.FundResearch.selectReportVersions(p.fund_investment || [])};
  const assets=root.FundResearch.selectReportVersions(source),quarter=d=>Number(d.slice(0,4))*4+Math.floor((Number(d.slice(5,7))-1)/3);
  const positions=assets.map(a=>({...a,report_date:a.date || a.report_date,stock_weight_nav:a.stock??null,all_bond_weight_nav:a.bond??null,convertible_weight_nav:a.convertible_bond??null,ordinary_bond_weight_nav:finite(a.bond)&&finite(a.convertible_bond)?a.bond-a.convertible_bond:null,gross_assets_to_nav:a.leverage??null}));
  positions.forEach((p,i)=>{
   const win=positions.slice(Math.max(0,i-3),i+1),values=win.map(r=>r.convertible_weight_nav),continuous=win.length===4&&win.every((r,j)=>!j||quarter(r.report_date)-quarter(win[j-1].report_date)===1),mean=continuous&&values.every(finite)?values.reduce((a,b)=>a+b,0)/4:null;
   p.cb_position_cv_4q=mean>0?Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/3)/mean:null;
   p.cv_status=p.cb_position_cv_4q!==null?'available':mean===0?'zero_mean_not_applicable':'missing_four_consecutive_quarters';
  });
  return {...p,metrics:{...p.metrics,position:positions},fund_investment:assets.map(a=>({...a,date:a.date || a.report_date,fund:a.fund??null}))};
 }
 function assetPanel(p){
  const rows=root.FundResearch.selectReportVersions(p.metrics.position||[]);
  return section('转债仓位与四季度波动',`<div class="bc-position-pair"><div><h4>转债占净资产（%）</h4>${line(rows.map(x=>[x.report_date,finite(x.convertible_weight_nav)?x.convertible_weight_nav*100:null]),'转债占净资产（%）')}</div><div><h4>仓位波动（四季度变异系数）</h4>${line(rows.map(x=>[x.report_date,x.cb_position_cv_4q]),'仓位变异系数')}</div></div>`+note('按同一资产版本的四个连续季度计算；缺失不作零。报告序列不是每日持仓估计。')+`<details><summary>历史仓位与变异系数（${rows.length}期）</summary>${table(['报告期','股票/NAV','普通债/NAV','转债/NAV','总资产/NAV','转债仓位CV（4季度）'],rows.slice().reverse().map(x=>[esc(x.report_date),pct(x.stock_weight_nav),pct(x.ordinary_bond_weight_nav),pct(x.convertible_weight_nav),finite(x.gross_assets_to_nav)?num(x.gross_assets_to_nav,3)+'倍':'—',num(x.cb_position_cv_4q)]))}</details>`);
 }
 function featurePair(features,date,key,control){
  const entries=Object.entries(features||{});if(!features?.[key])key=entries[0]?.[0];
  const item=features?.[key],percentage=percentFields.has(key),suffix=percentage||nativePercentFields.has(key)?'（%）':fieldUnits[key]?'（'+fieldUnits[key]+'）':'';
  const chart=line((item?.points||[]).filter(x=>x[0]<=date).map(x=>[x[0],finite(x[1])&&percentage?x[1]*100:x[1]]),(item?.label||'特征')+suffix);
  return `<div class="bc-feature-pair"><div>${fieldTable(features,date)}</div><div><label class="bc-control">历史指标<select ${control}>${entries.map(([k,v])=>`<option value="${esc(k)}"${k===key?' selected':''}>${esc(v.label)}</option>`).join('')}</select></label>${chart}<p class="method-note">${esc(item?.label||'特征')}${esc(suffix)}；历史截止 ${esc((item?.points||[]).filter(x=>x[0]<=date).at(-1)?.[0]||'—')}。空值不连线。</p></div></div>`;
 }
 function reportDates(p){return [...new Set([...(p.metrics.position||[]).map(x=>x.report_date),...(p.metrics.concentration_turnover||[]).map(x=>x.report_date),...(p.advanced.clause?.rows||[]).map(x=>x.dt)])].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();}
 function distribution(title,rows){return section(title,table(['分组','占基金净资产','占已披露转债'],(rows||[]).map(x=>[esc(x.k),pct(finite(x.w)?x.w/100:null),finite(x.share)?num(x.share,1)+'%':'—'])));}
 function bondOutput(p,date,key='BondZGYJL',stockKey='S_DQ_MV'){
  const m=p.metrics.concentration_turnover.find(x=>x.report_date===date),position=root.FundResearch.selectReportVersions(p.metrics.position).find(x=>x.report_date===date),c=p.advanced.clause?.rows?.find(x=>x.dt===date),q=p.advanced.quote_coverage?.find(x=>x.report_date===date),f=p.advanced.features||{};
  const cards=`<div class="research-metric-grid metric-four">${metric('披露转债只数',m?String(m.holding_count):'—')}${metric('披露转债内部HHI',num(m?.hhi_disclosed_cb))}${metric('单期权重变化合计',pp(m?.turnover_single_nav))}${metric('四期累计权重变化',pp(m?.turnover_roll4q_nav))}</div>`;
  const source=note(`报告期 ${date}。披露转债占净值 ${pct(m?.disclosed_cb_weight_nav)}；资产表全部转债 ${pct(position?.convertible_weight_nav)}；同日报价权重 ${pct(q?.same_date_quote_weight_nav)}；后向匹配旧报价权重 ${pct(q?.stale_quote_weight_nav)}${q?.max_quote_lag_days?`，最大滞后${q.max_quote_lag_days}天`:''}。转债HHI及各均值限于已披露部分，不能冒充全组合。`);
  const features=section('转债估值与交易特征',featurePair(f,date,key,'data-bc-feature')+note('市值加权；价格为全价，缺字段为—。覆盖分母分别为已披露转债与资产表全部转债。'));
  const underlying=section('转债对应正股特征',featurePair(p.underlying.features,date,stockKey,'data-bc-underlying')+note('按转债名义市值加权；总市值单位亿元。财务使用已保存公告日匹配，历史修订版本待核。'));
  const clauses=c?section('次新债、转股期与条款价格条件',table(['指标','该期数值'],[['次新债（上市≤180天）占净值',pct(c.w_new180/100)],['次新债（上市≤90天）占净值',pct(c.w_new90/100)],['尚未进入转股期占净值',pct(c.w_pre_convert/100)],['距强赎价格线的加权距离',finite(c.sh_dist_wavg)?num(c.sh_dist_wavg,2)+' pp':'—'],['接近强赎价格线占净值',pct(c.w_sh_near/100)],['达到强赎价格线占净值',pct(c.w_sh_over/100)],['达到下修价格线占净值',pct(c.w_xz_hit/100)],['强赎价格条件有效覆盖',pct(c.sh_cov)],['下修价格条件有效覆盖',pct(c.xz_cov)]])+note(`条款来源快照 ${c.terms_snapshot_date}，历史条款版本未核。只计算价格条件，不代表满足连续天数或发行人决定强赎/下修；转股起始日未知时保持未知。`))+distribution('券龄分布',c.age_buckets)+distribution('转股溢价率分布',c.prem_buckets)+distribution('评级分布',c.rating_buckets):note('该报告期缺少可用转债结构明细，不能推断无转债。');
  return source+cards+features+underlying+clauses;
 }
 function bondPanel(p){const dates=reportDates(p);return section('可转债专题',note('权重变化为Σ绝对披露权重变化，不除2；包含价格、申赎和披露影响，不是实际交易换手。首期无比较基期，缺明细不当清仓。')+`<label class="bc-control">报告期<select data-bc-date>${dates.map(d=>`<option value="${d}">${d}</option>`).join('')}</select></label><div data-bc-output>${dates.length?bondOutput(p,dates[0]):note('尚无可用报告序列。')}</div>`);}
 const windows={'1m':'近1月','2m':'近2月','3m':'近3月','6m':'近6月',ytd:'今年以来','1y':'近1年','3y':'近3年','5y':'近5年',all:'可得历史'};
 function correlationOutput(p,key){
  const source=p.correlations?.schema_version==='bond_complete_correlation.v1'?p.correlations:p.correlation,w=source?.windows?.[key];
  if(!w)return note('该窗口没有足够有效净值。');
  const unique=new Map();
  for(const row of [...(w.positive||[]),...(w.negative||[])]){
   if(!finite(row.correlation)||finite(row.observations)&&row.observations<=3)continue;
   const code=root.FundLifecycle?.canonicalCode(row.code)||row.code;
   if(!unique.has(code))unique.set(code,row);
  }
  const ordered=[...unique.values()].sort((a,b)=>b.correlation-a.correlation),limit=Math.min(12,Math.max(1,Math.floor(ordered.length/2)));
  const high=ordered.slice(0,limit),highCodes=new Set(high.map(x=>root.FundLifecycle?.canonicalCode(x.code)||x.code));
  const low=ordered.slice().reverse().filter(x=>!highCodes.has(root.FundLifecycle?.canonicalCode(x.code)||x.code)).slice(0,limit);
  const grid=(title,rows)=>section(title,table(['基金','相关系数','共同有效日'],rows.map(x=>[`<a href="${esc(typeof detailRoute==='function'?detailRoute(x.code):'fund.html?code='+encodeURIComponent(x.code))}">${esc(x.name)}</a><small>${esc(x.code)}</small>`,num(x.correlation),finite(x.observations)?String(x.observations):'—'])));
  return note(`区间 ${w.start} 至 ${w.end}；同类池${w.pool_size}个组合，有效比较${w.n_valid_peers}个；每对至少${w.min_observations}个共同有效日。日收益仍裁切在±10%，缺净值不前填。高低榜不重复列同一产品；小样本不足时保留空位。`)+grid('相关性最高的同类基金',high)+grid('相关性最低的同类基金',low);
 }

 function correlationPanel(p){return section('同类基金相关性',note('一级和二级债同池，转债基金独立池；同组合的不同份额已合并，剔除自身。各基金使用实际净值截止日。')+`<label class="bc-control">区间<select data-bc-window>${Object.entries(windows).map(([k,v])=>`<option value="${k}"${k==='1y'?' selected':''}>${v}</option>`).join('')}</select></label><div data-bc-correlation>${correlationOutput(p,'1y')}</div>`);}
 function fundPanel(p){const rows=root.FundResearch.selectReportVersions(p.fund_investment||[]),latest=rows.at(-1);return section('基金与ETF投资',latest?note(`资产配置报告期 ${latest.date}，基金投资占净资产 ${pct(latest.fund)}。${latest.fund===0?'该资产表明确为零，不能据此推断整个历史没有投资。':finite(latest.fund)?'资产表有基金投资，具体持有的子基金/ETF明细尚待补齐。':'资产表基金投资字段缺失，不能判断为零。'}`):note('暂无可用基金投资资产表。'))+`<details class="bc-legacy-details"><summary>基金投资历史（${rows.length}期）</summary>${table(['报告期','基金投资/占净值'],rows.slice().reverse().map(x=>[esc(x.date),pct(x.fund)]))}</details>`+note('本板块仅展示本基金自身投资。其他FOF持有本基金的数据属于相反方向，不混入这里。');}
 const portfolioGroups=[['stock','股票','#bc554a'],['fixed','固定收益','#0a7c78'],['fund','基金','#c69a4b'],['cash','现金','#102c45'],['other_total','其他资产','#89989e']];
 function portfolioRows(periods,basis='composition'){
  return periods.map(p=>{
   const known=portfolioGroups.map(([k])=>p[k]).filter(finite),sum=known.length?known.reduce((a,b)=>a+b,0):null,den=basis==='nav'?p.nav:sum;
   const invalid=known.some(v=>v<0),values=portfolioGroups.map(([k])=>!invalid&&finite(p[k])&&finite(den)&&den>0?p[k]/den:null);
   return {...p,values,sum,den,invalid};
  });
 }
 function portfolioChart(periods,basis,width=920){
  const rows=portfolioRows(periods,basis);if(!rows.length)return note('暂无可用资产报告。');
  const height=width<600?250:280,left=58,right=24,top=22,bottom=40,plotWidth=width-left-right,plotBottom=height-bottom;
  const times=rows.map(p=>Date.parse(p.date)),span=times.at(-1)-times[0];const x=i=>left+(span?(times[i]-times[0])/span:.5)*plotWidth;
  const totals=rows.map(r=>r.values.filter(finite).reduce((a,b)=>a+b,0));
  const high=basis==='composition'?1:Math.max(1,...totals,...rows.map(r=>finite(r.leverage)?r.leverage:0));
  const step=high<=1?.25:high<=2?.25:Math.pow(10,Math.floor(Math.log10(high)))/2,max=basis==='composition'?1:Math.ceil(high/step)*step;
  const y=v=>top+(1-v/max)*(plotBottom-top),ticks=[...new Set([0,1,max,...Array.from({length:5},(_,i)=>max*i/4)])].sort((a,b)=>a-b);
  const geometry=root.ReviewCore.stackAreas(rows.map(r=>r.date),rows.map(r=>r.values),{left,right:width-right});
  const areas=geometry.segments.map(s=>s.bands.map(b=>{
   const [key,label,color]=portfolioGroups[b.layer],tag=`data-stack-layer="${key}" data-stack-start="${s.start}" data-stack-end="${s.end}" data-stack-mask="${s.signature}"`;
   if(b.points.length===1){const p=b.points[0];return `<circle data-stack-point ${tag} cx="${p.x}" cy="${y(p.upper)}" r="2.5" fill="${color}"><title>${p.date} · ${esc(label)} ${pct(p.value)}</title></circle>`;}
   const points=[...b.points.map(p=>`${p.x},${y(p.upper)}`),...b.points.slice().reverse().map(p=>`${p.x},${y(p.lower)}`)].join(' ');
   return `<polygon ${tag} points="${points}" fill="${color}" stroke="none"><title>${s.start} — ${s.end} · ${esc(label)}</title></polygon>`;
  }).join('')).join('');
  let lev='',pen=false;rows.forEach((r,i)=>{if(basis!=='nav'||!finite(r.leverage)){pen=false;return;}lev+=(pen?'L':'M')+x(i)+','+y(r.leverage);pen=true;});
  const tickCount=width<600?3:5,dateIndices=[...new Set(Array.from({length:tickCount},(_,i)=>Math.round((rows.length-1)*i/(tickCount-1))))];
  return `<div class="bc-portfolio-legend">${portfolioGroups.map(([,label,color])=>`<span style="--portfolio-color:${color}">${label}</span>`).join('')}${basis==='nav'?'<span class="bc-leverage-legend" style="--portfolio-color:#ba3934">杠杆（总资产／净资产）</span>':''}</div><div class="bc-portfolio-chart" data-bc-basis="${basis}"><svg viewBox="0 0 ${width} ${height}" tabindex="0" role="img" aria-label="${basis==='nav'?'资产占净值及杠杆':'已披露资产构成百分比'}；左右方向键选择报告期"><title>缺项保持空缺；100%参考线与纵轴共用刻度</title>${ticks.map(t=>`<line x1="${left}" x2="${width-right}" y1="${y(t)}" y2="${y(t)}" class="chart-grid-line"/><text x="${left-8}" y="${y(t)+4}" text-anchor="end" class="chart-axis-label">${(t*100).toFixed(Math.abs(t*100-Math.round(t*100))<1e-8?0:1)}%</text>`).join('')}${areas}<line x1="${left}" x2="${width-right}" y1="${y(1)}" y2="${y(1)}" class="bc-reference-line"/>${lev?`<path d="${lev}" fill="none" stroke="#ba3934" stroke-width="2.4"/>`:''}${dateIndices.map(i=>`<text x="${x(i)}" y="${height-12}" text-anchor="${i===0?'start':i===rows.length-1?'end':'middle'}" class="chart-axis-label">${esc(rows[i].date.slice(0,4)+' Q'+Math.ceil(Number(rows[i].date.slice(5,7))/3))}</text>`).join('')}<line data-bc-asset-cursor x1="${x(rows.length-1)}" x2="${x(rows.length-1)}" y1="${top}" y2="${plotBottom}" class="bc-asset-cursor"/><rect data-bc-asset-hover x="${left}" y="${top}" width="${plotWidth}" height="${plotBottom-top}" fill="transparent"/></svg><p data-bc-asset-readout class="bc-asset-readout" aria-live="polite"></p></div>`;
 }
 const amount=x=>finite(x)?x.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 function portfolioTable(p){
  if(!p)return note('该报告期资产明细未接入。');
  const rows=[['股票投资','stock'],['基金投资','fund'],['固定收益投资','fixed'],['其中：债券','bond'],['其中：资产支持证券','abs'],['贵金属投资','metal'],['金融衍生品投资','derivatives'],['买入返售金融资产','repo'],['银行存款和结算备付金','cash'],['其他各项资产','other'],['总资产','total']].map(([label,key])=>[label,amount(p[key]),finite(p[key])&&finite(p.total)&&p.total>0?pct(p[key]/p.total):'—']);
  return table(['项目','金额（元）','占总资产'],rows)+portfolioGroups.filter(([key])=>finite(p[key])&&p[key]<0).map(([key,label])=>note(`${label}原始金额 ${amount(p[key])}元；该期堆积图留空。`)).join('')+note(`报告期 ${p.date}${p.history_phase?" · "+p.history_phase:""}；“其中”项不重复加总。${p.amount_basis==='reported_NAV_ratio_times_same_report_NAV'?'金额按当期披露比例与净资产换算。':''}缺项显示“—”。`);
 }
 function bindPortfolioChart(host,periods,basis){
  const svg=host.querySelector('.bc-portfolio-chart svg'),target=host.querySelector('[data-bc-asset-hover]'),cursor=host.querySelector('[data-bc-asset-cursor]'),out=host.querySelector('[data-bc-asset-readout]');if(!svg||!periods.length)return;
  const width=Number(svg.getAttribute('viewBox').split(' ')[2]),rows=portfolioRows(periods,basis),times=rows.map(r=>Date.parse(r.date)),span=times.at(-1)-times[0],xs=times.map(t=>58+(span?(t-times[0])/span:.5)*(width-82));let current=rows.length-1;
  const show=i=>{current=Math.max(0,Math.min(rows.length-1,i));const r=rows[current];cursor.setAttribute('x1',xs[current]);cursor.setAttribute('x2',xs[current]);out.innerHTML=`<strong>${esc(r.date)}${r.history_phase?" · "+esc(r.history_phase):""}</strong>${portfolioGroups.map(([,label],j)=>`<span>${label} ${pct(r.values[j])}</span>`).join('')}<span>已披露金额占总资产 ${pct(r.known_share_of_total)}</span>${finite(r.leverage)?`<span>杠杆 ${num(r.leverage,3)}倍</span>`:''}${r.invalid?'<span>本期存在负值，图中留空；见披露明细</span>':r.missing_groups?.length||r.fixed_partial||r.other_partial?'<span>部分分项未接齐</span>':''}`;};
  const move=e=>{const b=svg.getBoundingClientRect(),point=(e.clientX-b.left)/b.width*width;show(xs.reduce((best,x,i)=>Math.abs(x-point)<Math.abs(xs[best]-point)?i:best,0));};
  target.addEventListener('pointermove',move);target.addEventListener('pointerdown',move);svg.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();show(e.key==='Home'?0:e.key==='End'?rows.length-1:current+(e.key==='ArrowLeft'?-1:1));});show(current);
 }
 function enhancePortfolioAssets(host,p){
  const periods=p.disclosure?.asset_periods;if(!periods?.length)return;
  const article=host.querySelector('[data-asset-distribution]');if(!article)return;
  article.innerHTML='<div class="subpanel-heading"><h3>资产分布</h3><span>季度披露</span></div><div class="bc-stock-nav" role="group" aria-label="资产分布显示口径"><button type="button" data-asset-basis="composition" aria-pressed="true">资产构成（100%）</button><button type="button" data-asset-basis="nav" aria-pressed="false">占净值（含杠杆）</button></div><div data-portfolio-chart></div><p data-portfolio-basis-note class="method-note"></p><details class="bc-legacy-details"><summary>期末基金资产组合明细</summary><label class="bc-control">报告期<select data-portfolio-report>'+periods.slice().reverse().map(r=>`<option value="${r.date}">${r.date}</option>`).join('')+'</select></label><div data-portfolio-table>'+portfolioTable(periods.at(-1))+'</div></details>';
  const chart=article.querySelector('[data-portfolio-chart]');let currentBasis='nav',lastWidth=0;
  const draw=basis=>{currentBasis=basis;lastWidth=Math.max(280,Math.round(chart.clientWidth||920));article.querySelectorAll('[data-asset-basis]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.assetBasis===basis)));chart.innerHTML=portfolioChart(periods,basis,lastWidth);article.querySelector('[data-portfolio-basis-note]').textContent=basis==='nav'?'五类资产金额占基金净值，合计可超过100%。红线为总资产／净资产，130%对应1.30倍。色带连接相同已取得分项的相邻报告期；缺项或缺季处分段，孤立报告期仅标点。':'按已披露的五类资产金额合计归一至100%；缺项及金额覆盖率见图下读数。色带按相同已取得分项分段，缺季不跨连；孤立报告期仅标点。';bindPortfolioChart(chart,periods,basis);};
  article.querySelectorAll('[data-asset-basis]').forEach(b=>b.addEventListener('click',()=>draw(b.dataset.assetBasis)));
  article.querySelector('[data-portfolio-report]').addEventListener('change',e=>{article.querySelector('[data-portfolio-table]').innerHTML=portfolioTable(periods.find(r=>r.date===e.target.value));});draw('nav');
  if(typeof root.ResizeObserver==='function'){const observer=new root.ResizeObserver(()=>{const w=Math.max(280,Math.round(chart.clientWidth||920));if(Math.abs(w-lastWidth)>1)draw(currentBasis);});observer.observe(article);}
  host.querySelector('[data-hybrid-leverage]')?.remove();host.querySelector('[data-latest-asset-list]')?.remove();host.querySelector('[data-asset-history-table]')?.remove();
  const concentration=host.querySelector('[data-hybrid-concentration]');
  if(concentration){const fold=document.createElement('details');fold.className='bc-legacy-details';fold.innerHTML='<summary>持股重仓集中度</summary>';const grid=concentration.parentElement;grid.insertAdjacentElement('afterend',fold);fold.appendChild(concentration);}
  const trend=host.querySelector('[data-hybrid-stock-trend]');
  if(trend&&typeof renderMiniLineChart==='function'){
   const data=portfolioRows(periods,'nav').map(r=>({report_date:r.date,...Object.fromEntries(portfolioGroups.map(([key],i)=>[key,r.values[i]]))}));
   trend.innerHTML='<div class="subpanel-heading"><h3>五类资产仓位演变</h3><span>各类资产金额／基金净值</span></div>'+renderMiniLineChart(data,portfolioGroups.map(([key,label,color])=>({key,label,color,width:2.5})),'五类资产占净值历史',true);
   if(typeof bindMiniLineCharts==='function')bindMiniLineCharts();
  }
 }

 const cache=new Map();
 async function load(fund){
  const expected=root.BOND_COMPLETE_INDEX?.payloads?.[fund.code];if(!expected)throw new Error('该基金新增分析尚未登记');
  if(cache.has(fund.code))return cache.get(fund.code);
  const task=(async()=>{let p=root.BOND_COMPLETE_DATA?.[fund.code];if(p?.source_payload_sha256!==expected){if(root.BOND_COMPLETE_DATA)delete root.BOND_COMPLETE_DATA[fund.code];await loadDataScript(`https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/bond_complete/${encodeURIComponent(fund.code)}.js?v=${expected.slice(0,16)}`,'债券专题分析',()=>root.BOND_COMPLETE_DATA?.[fund.code]);p=root.BOND_COMPLETE_DATA?.[fund.code];}if(p?.schema_version!=='bond_complete_view.v1'||p?.code!==fund.code||p.source_payload_sha256!==expected)throw new Error('债券专题数据版本不匹配，请重试');return p;})().catch(e=>{cache.delete(fund.code);throw e;});cache.set(fund.code,task);return task;
 }
 function bind(host,p){
  const draw=()=>{const date=host.querySelector('[data-bc-date]')?.value,key=host.querySelector('[data-bc-feature]')?.value||'BondZGYJL',stockKey=host.querySelector('[data-bc-underlying]')?.value||'S_DQ_MV';host.querySelector('[data-bc-output]').innerHTML=bondOutput(p,date,key,stockKey);host.querySelector('[data-bc-feature]')?.addEventListener('change',draw);host.querySelector('[data-bc-underlying]')?.addEventListener('change',draw);};
  host.querySelector('[data-bc-date]')?.addEventListener('change',draw);host.querySelector('[data-bc-feature]')?.addEventListener('change',draw);host.querySelector('[data-bc-underlying]')?.addEventListener('change',draw);
  host.querySelector('[data-bc-window]')?.addEventListener('change',e=>{host.querySelector('[data-bc-correlation]').innerHTML=correlationOutput(p,e.target.value);});
 }
 const api={withAssetVersions,portfolioRows,portfolioChart,portfolioTable,enhancePortfolioAssets,load,assetPanel,bondPanel,bondOutput,correlationPanel,correlationOutput,fundPanel,reportDates,fieldTable,featurePair,formatField,line,pct,bind};root.BondComplete=api;
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
   if(oldTabs[fund.category]){const tabs=layout.map(x=>x.slice());if(fund.category==='hybrid-bond')tabs.splice(2,0,['selection','基金优选']);GENERIC_TABS[fund.category]=eligible(fund)?tabs:oldTabs[fund.category];}
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
   const p=withAssetVersions(await load(fund),detail);
   if(id==='funds'){
    const current=p;
    host.innerHTML=fundPanel(current)+'<div data-bap-own-funds></div>';if(root.BondAdvancedUI)await root.BondAdvancedUI.mount(host.querySelector('[data-bap-own-funds]'),'ownFunds',fund.code);return;
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
     if(fund.category==='hybrid-bond')enhancePortfolioAssets(host,p);
     if(fund.category==='hybrid-bond'&&root.BondVisualDuration){
      const durationHost=[...host.querySelectorAll('.hybrid-bond-asset-trends article')].find(a=>a.querySelector('h3')?.textContent==='久期时间序列');
      if(durationHost){
       let market=root.FUND_BOND_MARKET,marketError='';
       if(!market&&typeof loadDashboardAsset==='function'){try{await loadDashboardAsset('bond_market_overview.js');market=root.FUND_BOND_MARKET;}catch(error){marketError=error.message||'国债数据加载失败';}}
       durationHost.innerHTML='<div class="subpanel-heading"><h3>久期时间序列</h3><span>利率敏感性披露反推 · 与国债走势对照</span></div><div data-bvd-host></div>';
       root.BondVisualDuration.mount(durationHost.querySelector('[data-bvd-host]'),detail,market);if(marketError)durationHost.insertAdjacentHTML('beforeend',note('国债曲线暂未加载：'+marketError));
      }
     }
    host.insertAdjacentHTML('beforeend',assetPanel(p));
    if(fund.category==='hybrid-bond'){
     host.insertAdjacentHTML('beforeend','<details class="bc-legacy-details" data-bc-evaluation><summary>既有五维评价</summary><div data-panel="evaluation"></div></details>');
     const fold=host.querySelector('[data-bc-evaluation]');fold.addEventListener('toggle',()=>{if(fold.open)void base('evaluation');});if(requestedTab==='evaluation')fold.open=true;
    }
    return;
   }
   if(id==='bonds'){
    if(root.BondVisualDetails&&typeof loadGenericBondHistory==='function'){
     const history=await loadGenericBondHistory(fund.code);
     root.BondVisualDetails.mountBonds(host,p,history||[],root.FUND_BOND_CHARACTERISTICS?.bonds||{},fund.category);
    }
    const cbFirst=fund.category==='convertible-bond';
    const features='<div data-bap-features></div>';
    host.insertAdjacentHTML(cbFirst?'afterbegin':'beforeend',cbFirst?features:'<details class="bc-legacy-details"><summary>次要配置：转债高级特征（占净资产 '+pct(fund.asset?.convertible_bond_weight)+'）</summary>'+features+'</details>');
    host.insertAdjacentHTML('beforeend','<details class="bc-legacy-details"><summary>转债仓位、集中度与历史资料</summary>'+bondPanel(p)+'</details>');
    if(root.BondAdvancedUI)await root.BondAdvancedUI.mount(host.querySelector('[data-bap-features]'),'features',fund.code);
    host.insertAdjacentHTML('beforeend','<details class="bc-legacy-details" data-bc-convertibles-fold><summary>转债逐券、正股映射与既有历史资料</summary><div data-panel="convertibles"></div></details>');
    const fold=host.querySelector('[data-bc-convertibles-fold]');fold.addEventListener('toggle',()=>{if(fold.open)void base('convertibles');});if(requestedTab==='convertibles')fold.open=true;bind(host,p);return;
   }
   if(id==='attribution'){
    host.insertAdjacentHTML('beforeend','<details class="bc-legacy-details" data-bap-ipo-fold><summary>打新获配、锁定口径与收益估算</summary><div data-bap-ipo></div></details>');
    const fold=host.querySelector('[data-bap-ipo-fold]');fold.addEventListener('toggle',()=>{if(fold.open&&root.BondAdvancedUI)void root.BondAdvancedUI.mount(fold.querySelector('[data-bap-ipo]'),'ipo',fund.code);});if(requestedTab==='ipo')fold.open=true;
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
