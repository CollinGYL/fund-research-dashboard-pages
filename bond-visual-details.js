/* Disclosure presentation only. No fetch, cache mutation, inference or model computation. */
(function(root){
 'use strict';
 const ok=v=>typeof v==='number'&&Number.isFinite(v),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=(v,n=2)=>ok(v)?v.toLocaleString('zh-CN',{minimumFractionDigits:n,maximumFractionDigits:n}):'—',pct=v=>ok(v)?number(v*100)+'%':'—';
 const note=t=>`<p class="method-note">${esc(t)}</p>`,panel=(t,b)=>`<article class="subpanel bv-panel"><h3>${esc(t)}</h3>${b}</article>`;
 const table=(heads,rows)=>`<div class="bv-table"><table><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${heads.length}">该期没有可用明细；不代表未持有。</td></tr>`}</tbody></table></div>`;
 const general=[['government','国家债券','#102c45'],['financial','金融债券','#0a7c78'],['corporate','企业债券','#c69a4b'],['commercial_paper','企业短期融资券','#aa966b'],['medium_term_note','中期票据','#7fa8a3'],['central_bank','央行票据','#d1d8dd'],['deposit_certificate','同业存单','#9bb7c8'],['other','其他债券','#a2adb5']];
 const groups=all=>all?[...general,['convertible','可转债／可交换债','#bc554a']]:general;
 function classRows(periods,basis='composition',all=false){
  return (periods||[]).map(p=>{const keys=groups(all),raw=keys.map(([k])=>p.bond_classes?.[k]),known=raw.filter(ok),sum=known.length?known.reduce((s,v)=>s+v,0):null,invalid=known.some(v=>v<0),den=basis==='nav'?p.nav:sum;return {...p,raw,sum,den,invalid,values:raw.map(v=>!invalid&&ok(v)&&ok(den)&&den>0?v/den:null),missing:keys.filter((_,i)=>!ok(raw[i])).map(([,label])=>label)};});
 }
 function classTable(p){
  if(!p)return note('暂无券种金额汇总。');
  const rows=groups(true).map(([k,label])=>[esc(label),number(ok(p.bond_classes?.[k])?p.bond_classes[k]/10000:null),pct(ok(p.bond_classes?.[k])&&ok(p.nav)&&p.nav>0?p.bond_classes[k]/p.nav:null)]);
  rows.splice(2,0,['其中：政策性金融债',number(ok(p.bond_classes?.policy_financial)?p.bond_classes.policy_financial/10000:null),pct(ok(p.bond_classes?.policy_financial)&&ok(p.nav)&&p.nav>0?p.bond_classes.policy_financial/p.nav:null)]);
  rows.push(['债券合计（不含ABS）',number(ok(p.bond)?p.bond/10000:null),pct(ok(p.bond)&&ok(p.nav)&&p.nav>0?p.bond/p.nav:null)]);
  return table(['债券品种','公允价值（万元）','占基金净资产'],rows)+note(`报告期 ${p.date}；金融债含政策性金融债，企业债、短融、中票分别列示；— 为未取得，不作为0。`);
 }
 function stackChart(periods,basis='composition',all=false){
  const rows=classRows(periods,basis,all);if(!rows.length)return note('暂无券种金额序列。');
  const W=800,H=300,L=55,R=20,T=25,B=37,times=rows.map(r=>Date.parse(r.date)),x=i=>L+(times.at(-1)===times[0]?.5:(times[i]-times[0])/(times.at(-1)-times[0]))*(W-L-R),totals=rows.map(r=>r.values.filter(ok).reduce((s,v)=>s+v,0)),max=basis==='composition'?1:Math.max(1,Math.ceil(Math.max(...totals)*4)/4),y=v=>T+(1-v/max)*(H-T-B);const keys=groups(all),geometry=root.ReviewCore.stackAreas(rows.map(r=>r.date),rows.map(r=>r.values),{left:L,right:W-R});
  const areas=geometry.segments.map(s=>s.bands.map(b=>{
   const [key,label,color]=keys[b.layer],tag=`data-stack-layer="${key}" data-stack-start="${s.start}" data-stack-end="${s.end}" data-stack-mask="${s.signature}"`;
   if(b.points.length===1){const p=b.points[0];return `<circle data-stack-point ${tag} cx="${p.x}" cy="${y(p.upper)}" r="2.5" fill="${color}"><title>${p.date} · ${esc(label)} ${pct(p.value)}</title></circle>`;}
   const points=[...b.points.map(p=>`${p.x},${y(p.upper)}`),...b.points.slice().reverse().map(p=>`${p.x},${y(p.lower)}`)].join(' ');
   return `<polygon ${tag} points="${points}" fill="${color}" stroke="none"><title>${s.start} — ${s.end} · ${esc(label)}</title></polygon>`;
  }).join('')).join('');
  const ticks=[...new Set([0,.25*max,.5*max,.75*max,max,1])].sort((a,b)=>a-b);
  return `<div class="bv-legend">${groups(all).map(([,label,color])=>`<span><i style="background:${color}"></i>${label}</span>`).join('')}</div><svg class="bv-stack" viewBox="0 0 ${W} ${H}" role="img" aria-label="${all?'债券':'一般债'}${basis==='composition'?'已取得金额构成百分比':'占净资产比例'}">${ticks.map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#e1e8ec"/><text x="${L-7}" y="${y(v)+4}" text-anchor="end">${number(v*100,0)}%</text>`).join('')}${areas}<line x1="${L}" x2="${W-R}" y1="${y(1)}" y2="${y(1)}" stroke="#9c695c" stroke-dasharray="4 4"/>${[0,Math.floor((rows.length-1)/2),rows.length-1].filter((i,j,a)=>a.indexOf(i)===j).map(i=>`<text x="${x(i)}" y="${H-10}" text-anchor="${i===0?'start':i===rows.length-1?'end':'middle'}">${rows[i].date}</text>`).join('')}</svg>`;
 }
 function snapshot(p,basis,all){
  if(!p)return note('暂无该期券种数据。');const r=classRows([p],basis,all)[0],cb=p.bond_classes?.convertible,total=all?p.bond:ok(p.bond)&&ok(cb)?p.bond-cb:null;
  return `<strong>${esc(p.date)}</strong>`+table(['券种','市值（万元）',basis==='composition'?'占已取金额':'占净资产'],groups(all).map(([,label],i)=>[label,number(ok(r.raw[i])?r.raw[i]/10000:null),pct(r.values[i])]))+note(`已取金额 ${number(ok(r.sum)?r.sum/10000:null)} 万元；${all?'债券':'一般债'}总额 ${number(ok(total)?total/10000:null)} 万元；覆盖 ${pct(ok(r.sum)&&ok(total)&&total>0?r.sum/total:null)}。${r.invalid?'存在负值，本期图形留空。':''}${r.missing.length?'缺项：'+r.missing.join('、')+'。':''}`);
 }
 function mountStructure(host,periods,all=false){
  let basis='composition',date=periods.at(-1)?.date;
  host.innerHTML=`<div class="bc-stock-nav" role="group" aria-label="${all?'债券':'一般债'}券种显示口径"><button type="button" data-bv-basis="composition" aria-pressed="true">${all?'券种':'一般债券种'}构成（100%）</button><button type="button" data-bv-basis="nav" aria-pressed="false">${all?'债券':'一般债'}占净资产（原始比例）</button></div><p class="method-note" data-bv-note></p><div class="bv-structure-grid"><div data-bv-chart></div><div><label class="bc-control">报告期<select data-bv-class-date>${periods.slice().reverse().map(p=>`<option value="${p.date}">${p.date}</option>`).join('')}</select></label><div data-bv-snapshot></div></div></div>${all?'<details class="bc-legacy-details"><summary>按债券品种分类的债券投资组合</summary><div data-bv-raw></div></details>':''}`;
  const draw=()=>{host.querySelectorAll('[data-bv-basis]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.bvBasis===basis)));host.querySelector('[data-bv-chart]').innerHTML=stackChart(periods,basis,all);host.querySelector('[data-bv-snapshot]').innerHTML=snapshot(periods.find(p=>p.date===date),basis,all);if(all)host.querySelector('[data-bv-raw]').innerHTML=classTable(periods.find(p=>p.date===date));host.querySelector('[data-bv-note]').textContent=(basis==='composition'?`已取得的${all?'九':'八'}类金额合计归一至100%；缺项不补零，归一化不代表完整覆盖。`:'已取得金额 ÷ 同期基金净资产，可超过100%。')+(all?'ABS单列，政策性金融债不重复堆叠。':'一般债八类不含转债与ABS。')+' 色带连接相同已取得分项的相邻报告期；分项变化或缺季处分段，孤立报告期仅标点。缺项见报告期明细。';};
  host.querySelectorAll('[data-bv-basis]').forEach(b=>b.addEventListener('click',()=>{basis=b.dataset.bvBasis;draw();}));host.querySelector('[data-bv-class-date]').addEventListener('change',e=>{date=e.target.value;draw();});draw();
 }
 function category(row,features={},date){
  const b=securityFeature(row,features),explicit=row.security_category||b.security_category;
  if(['ordinary','convertible','abs'].includes(explicit))return explicit;
  const labels=[row.bond_type,b.report_features?.[date]?.bond_type,b.local_static?.bond_type,b.local_static?.level1,b.chinabond_level1,b.chinabond_level2,b.choice_level1,b.choice_level2].filter(Boolean).join(' ');
  if(/资产支持|资产证券化|\bABS\b/i.test(labels))return 'abs';
  if(/可转|可交换|转债|交换债/.test(labels))return 'convertible';
  if(/国债|政府债|金融债|金融机构债|利率债|公司信用债|企业债|公司债|短期融资|中期票据|央行票据|同业存单|地方债/.test(labels))return 'ordinary';
  return 'unknown';
 }
 function securityFeature(row,features={}){
  const direct=features[row.code];if(direct)return direct;
  if(!/^\d{5,9}$/.test(row.code||''))return {};
  // A suffix is resolved only by one existing full code AND its exact source
  // name. The original report code remains on screen and in the disclosure.
  const matches=Object.entries(features).filter(([c,b])=>c.split('.')[0]===row.code&&/^\d{5,9}\.(IB|SH|SZ)$/.test(c)&&(b.local_static?.bond_name||b.bond_name)===row.name);
  return matches.length===1?{...matches[0][1],resolved_code:matches[0][0],code_resolution:'unique_full_code_and_exact_source_name'}:{};
 }
 function remainingYears(row,feature={},date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
  if(feature.is_perpetual==='是')return null;
  const local=feature.local_static?.maturity_date,maturity=feature.maturity_date||local;
  if(local&&feature.maturity_date&&local!==feature.maturity_date)return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(maturity||'')){const days=(Date.parse(maturity)-Date.parse(date))/86400000;return days>=0?days/365.25:null;}
  const dated=feature.report_features?.[date];return ok(dated?.remaining_years)?dated.remaining_years:null;
 }
 function featureView(row,features={},date){
  const b=securityFeature(row,features),s=b.local_static||{},p=b.report_features?.[date],r=p?.ratings?.bond||p?.ratings?.issuer;
  const rating=r&&r.rating_date<=date?r:null;
  return {feature:b,remaining_years:remainingYears(row,b,date),rating:rating?.value||null,rating_date:rating?.rating_date||null,
   rating_source:rating?(p.ratings.bond?'债项':'主体'):null,rating_agency:rating?.agency||null,
   issuer_name:s.issuer_name||null,issuer_type:s.issuer_type||null,issuer_reference_date:s.source?.observed_at||null,
   issuer_at_report:s.source?.observed_at===date?s.issuer_name||null:null,
   static_source:s.source?.label||null,report_source:p?.source||null,
   latest_rating:b.bond_rating||b.issuer_rating||null,latest_rating_date:b.as_of||null,
   bond_type:row.bond_type||p?.bond_type||s.bond_type||b.chinabond_level2||b.choice_level2||s.level1||b.chinabond_level1||b.choice_level1||null};
 }
 function holdingTable(rows,features={},date){
  return table(['代码','债券名称','券种','报告日剩余期限','报告期评级 / 评级日','主体类型（名录参考）','发行人（名录参考）','持有数量（原表）','公允价值（万元）','占基金净资产','属性来源日期'],rows.map(r=>{const v=featureView(r,features,date),b=v.feature;return [esc(r.code)+(b.resolved_code?'<small>属性匹配 '+esc(b.resolved_code)+'</small>':''),esc(r.name),esc(v.bond_type||'—'),ok(v.remaining_years)?number(v.remaining_years)+'年':'—',v.rating?esc(v.rating)+'<small>'+esc(v.rating_source)+' · '+esc(v.rating_date)+'</small>':'—（未核）',esc(v.issuer_type||'—'),esc(v.issuer_name||'—'),r.quantity===0&&ok(r.market_value)&&r.market_value>0?'待核（原值0）':number(r.quantity,0),number(ok(r.market_value)?r.market_value/10000:null),pct(r.weight),esc(v.static_source?(v.issuer_reference_date||'名录未注明日期'):(b.as_of||'—'))];}));
 }
 function holdingRows(period,lens,features){return (period?.holdings||[]).filter(r=>category(r,features,period.report_date)===lens);}
 function topRows(period){
  if(Array.isArray(period?.top5))return {rows:period.top5.slice(0,5),verified:period.top5_verified===true&&period.top5_source?.kind==='original_report_top5'};
  const rows=(period?.holdings||[]).filter(r=>ok(r.market_value)).slice().sort((a,b)=>b.market_value-a.market_value).slice(0,5);
  return {rows,verified:period?.top5_verified===true};
 }
 function topPeriods(periods,disclosure={}){
  const byDate=new Map((periods||[]).map(p=>[p.report_date,{...p}]));
  for(const p of disclosure.top5_reports||[]){
   if(p.top5_verified!==true||p.top5_source?.kind!=='original_report_top5'||!Array.isArray(p.top5)||p.top5.length!==5)continue;
   byDate.set(p.report_date,{...(byDate.get(p.report_date)||{}),...p});
  }
  return [...byDate.values()].sort((a,b)=>a.report_date.localeCompare(b.report_date));
 }
 function lensDates(periods,lens,features={},disclosure={}){const actual=(periods||[]).filter(p=>holdingRows(p,lens,features).length>0).map(p=>p.report_date),proved=lens==='abs'?(root.BondVisualABSEvidence?.dates(disclosure)||[]):[];return [...new Set([...actual,...proved])].sort();}
 function selectLensDate(periods,lens,features,date,disclosure={}){const dates=lensDates(periods,lens,features,disclosure);return {dates,date:dates.includes(date)?date:dates.at(-1)||null};}
 function mountHoldings(host,periods,features={},disclosure={},preferredLens='ordinary'){
  const sorted=(periods||[]).slice().sort((a,b)=>a.report_date.localeCompare(b.report_date)),tops=topPeriods(sorted,disclosure);let lens=preferredLens,date=sorted.at(-1)?.report_date;
  const options=(dates,selected)=>dates.length?dates.slice().reverse().map(d=>`<option value="${d}"${d===selected?' selected':''}>${d}</option>`).join(''):'<option value="">暂无可得日期</option>';
  host.innerHTML=panel('可得持债金额前五',`<label class="bc-control">报告期<select data-bv-top-date>${options(tops.map(p=>p.report_date),tops.at(-1)?.report_date)}</select></label><div data-bv-top></div>`)+panel('可得持债明细',`<div class="bv-controls"><label class="bc-control">类别<select data-bv-lens><option value="ordinary">一般债券</option><option value="convertible">可转换债券（可交换债券）</option><option value="abs">资产支持证券</option></select></label><label class="bc-control">日期<select data-bv-holding-date></select></label></div><div data-bv-holdings></div>`);
  const top=()=>{const p=tops.find(x=>x.report_date===host.querySelector('[data-bv-top-date]').value),x=topRows(p);host.querySelector('.bv-panel h3').textContent=x.verified?'重仓券明细（前五大债券投资明细）':'可得持债金额前五';host.querySelector('[data-bv-top]').innerHTML=holdingTable(x.rows,features,p?.report_date)+note(`报告期 ${p?.report_date||'—'}；${x.verified?'原报告前五大名单；原报告代码未映射的证券按原码显示，券种及发行人未知则留空。':'当前按可得披露金额排序取前五；前五大原表标识待接入，不视为完整组合。'}剩余期限按到期日减报告日÷365.25；无法核实则留空。评级仅使用对应报告期带日期记录；发行人/主体类型为名录参考，来源日期独立列示，历史时点未核。`)+(x.verified&&p.top5_source?.url?`<p class="method-note"><a href="${esc(p.top5_source.url)}" target="_blank" rel="noopener noreferrer">原报告第${number(p.top5_source.page,0)}页</a> · 原表摘录已对账，仅前五披露。</p>`:'');};
  const draw=()=>{const p=sorted.find(x=>x.report_date===date),rows=holdingRows(p,lens,features),unknown=(p?.holdings||[]).filter(r=>category(r,features,date)==='unknown').length;const proof=lens==='abs'&&rows.length===0?root.BondVisualABSEvidence?.view(disclosure,date)||'':'';host.querySelector('[data-bv-holdings]').innerHTML=proof||holdingTable(rows,features,date)+note(date?`报告期 ${date}；按证券名录类别互斥筛选。${unknown}条类别未匹配，未猜作一般债；明细仅代表已取得部分。剩余期限按报告日计算，评级仅使用对应报告期的带日期记录；名录参考的发行人及主体类型不代表历史时点核证，属性来源日期独立列示。`:'该类别尚无可得明细及对应日期；不能据此推断历年未持有。');};
  const sync=()=>{const state=selectLensDate(sorted,lens,features,date,disclosure);date=state.date;const sel=host.querySelector('[data-bv-holding-date]');sel.innerHTML=options(state.dates,date);sel.disabled=!state.dates.length;draw();};
  host.querySelector('[data-bv-lens]').value=lens;
  host.querySelector('[data-bv-top-date]').addEventListener('change',top);host.querySelector('[data-bv-holding-date]').addEventListener('change',e=>{date=e.target.value;draw();});host.querySelector('[data-bv-lens]').addEventListener('change',e=>{lens=e.target.value;sync();});top();sync();
 }
 function mountBonds(host,p,history,features,category='hybrid-bond'){
  const periods=(p.disclosure?.asset_periods||[]).filter(p=>p.bond_classes);if(!periods.length)return false;
  const archive=document.createElement('details');archive.className='bc-legacy-details';archive.innerHTML='<summary>既有债券分析资料（原日期与口径）</summary>';while(host.firstChild)archive.appendChild(host.firstChild);
  host.innerHTML=panel('券种结构','<div data-bv-structure></div>')+'<div class="bv-holding-pair" data-bv-holding-pair></div>'+panel('一般债券种分布','<div data-bv-general></div>');host.appendChild(archive);
  mountStructure(host.querySelector('[data-bv-structure]'),periods,true);mountHoldings(host.querySelector('[data-bv-holding-pair]'),history,features,p.disclosure,category==='convertible-bond'?'convertible':'ordinary');mountStructure(host.querySelector('[data-bv-general]'),periods,false);return true;
 }
 root.BondVisualDetails={classRows,classTable,stackChart,snapshot,category,securityFeature,remainingYears,featureView,holdingTable,holdingRows,lensDates,selectLensDate,topRows,topPeriods,mountStructure,mountHoldings,mountBonds};
 if(typeof module!=='undefined')module.exports=root.BondVisualDetails;
})(typeof window==='undefined'?globalThis:window);
