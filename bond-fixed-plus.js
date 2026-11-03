/* Existing colleague fixed-plus module, isolated display adapter; no model/vendor calls. */
(function(root){
'use strict';
const mounts=new WeakMap();let sequence=0,libraryPromise;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NN=(x,d=2)=>(x==null||Number.isNaN(x))?'—':Number(x).toFixed(d);
const P=(x,d=2)=>(x==null||Number.isNaN(x))?'—':(x*100).toFixed(d)+'%';
function create(host,payload,options={}){
 if(!payload||!Array.isArray(payload.daily)||!Array.isArray(payload.quarterly))throw Error('固收+来源数据结构不完整');
 const CURRENT={code:payload.code,head:options.head||{},fixed_plus:payload};
 let __chartSeq=++sequence*100000,destroyed=false;
 const $id=id=>host.querySelector('[id="'+id+'"]');
 const sub=(title,caption,body)=>'<article class="selection-panel"><div class="subpanel-heading"><h3>'+esc(title)+'</h3><span>'+esc(caption)+'</span></div>'+body+'</article>';
 const xTicks=(a,b)=>[...new Set([a,a+(b-a)/2,b])].map(t=>[new Date(t).toISOString().slice(0,10),new Date(t).toISOString().slice(0,7)]);
 const hideTT=()=>{const t=host.querySelector('[data-fixed-plus-tooltip]');if(t)t.hidden=true;};
 const showTT=(html,event)=>{const t=host.querySelector('[data-fixed-plus-tooltip]');if(!t)return;t.innerHTML=html;t.hidden=false;t.style.left=Math.max(8,Math.min(event.clientX+12,root.innerWidth-t.offsetWidth-8))+'px';t.style.top=Math.max(8,Math.min(event.clientY+12,root.innerHeight-t.offsetHeight-8))+'px';};
 function zoomSlider(id,a,b,c,d){
  return '<div class="fixed-plus-zoom" data-fixed-plus-zoom="'+id+'"><label>图表起点<input type="range" data-fixed-plus-zoom-start aria-label="固收+图表起始日期" min="'+a+'" max="'+b+'" step="86400000" value="'+c+'"></label><label>图表终点<input type="range" data-fixed-plus-zoom-end aria-label="固收+图表结束日期" min="'+a+'" max="'+b+'" step="86400000" value="'+d+'"></label></div>';
 }
 function wireZoomSlider(id,a,b,onChange){
  const box=host.querySelector('[data-fixed-plus-zoom="'+id+'"]');if(!box)return;
  const start=box.querySelector('[data-fixed-plus-zoom-start]'),end=box.querySelector('[data-fixed-plus-zoom-end]');
  const update=()=>{let lo=Number(start.value),hi=Number(end.value);if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo>=hi)return;onChange(lo,hi);};
  start.addEventListener('change',update);end.addEventListener('change',update);
 }
/* 当前基金的固收+定位与日频变迁。 */
let fixedPlusFund='',fixedPlusIndex=-1,fixedPlusZoom=null;
const FIXED_PLUS_COLORS={stable:'#0a7c78',balanced:'#c69a4b',aggressive:'#bc554a',bondlike:'#7fa8a3',high_equity:'#713d45',young:'#c5ced5',insufficient:'#aab5bf',uncertain:'#929ba5',outside:'#8a99a8'};
const FIXED_PLUS_CATEGORIES=['bondlike','stable','balanced','aggressive','high_equity'];
function fixedPlusData(){return payload;}
function fixedRange(lo,hi,dp=2,suffix='%'){
 if(lo==null||hi==null)return '—';if(Math.abs(hi-lo)<1e-7)return NN(lo,dp)+suffix;
 while(dp<5&&NN(lo,dp)===NN(hi,dp))dp++;
 return NN(lo,dp)+'—'+NN(hi,dp)+suffix;
}
function fixedPlusCurrent(p){return p.daily[Math.max(0,Math.min(p.daily.length-1,fixedPlusIndex<0?p.daily.length-1:fixedPlusIndex))];}
function fixedPlusPoint(r,key,lo,hi){
 if(Number.isFinite(r[key]))return r[key];
 return Number.isFinite(r[lo])&&r[lo]===r[hi]?r[lo]:null;
}
function fixedPlusPoolText(r){return {in:'已满足固收+筛选条件',out:'不满足固收+筛选条件',pending:'是否满足固收+筛选条件待判定'}[r.pool_status]||'尚未完成入池条件判定';}
function fixedPlusEstimateText(r){
 const parts=[];
 if(r.cf_estimated)parts.push('合并权益仓位使用延续估计：'+(r.cf_carry_reason||'零转股期样本')+'，沿用 '+r.cf_carry_dt+' 按已公告仓位可计算的CF');
 if(r.uses_cf_estimate)parts.push('最近12季度窗口含 '+(r.estimate_periods||[]).join('、')+' 期的延续估计');
 return parts.join('；');
}
function fixedPlusDiagnostics(p,r){
 const candidates=r.candidates||[],gaps=r.gap_periods||[];
 let html='<p class="method-note" data-fixed-plus-pool="'+(r.pool_status||'unavailable')+'"><b>入池判定：'+fixedPlusPoolText(r)+'</b>'+(candidates.length>1?'。可能类别：'+candidates.map(c=>esc(p.labels[c])).join('／')+'。':'。')+'</p>';
 const estimate=fixedPlusEstimateText(r);if(estimate)html+='<p class="method-note" data-fixed-plus-estimate="true">'+esc(estimate)+'。延续值属于估计，未作为当日重新取得的逐券估值展示。</p>';
 if(!gaps.length)return html;
 const lookup=new Map(p.quarterly.map(q=>[q.dt,q]));
 const rows=gaps.map(dt=>{const latest=dt===r.quarter,q=latest?r:lookup.get(dt);if(!q)return '';return '<tr><td>'+dt+'</td><td>'+(latest?'最新日频点':'冻结历史点')+'</td><td>'+fixedRange(q.eq_lo,q.eq_hi)+'</td><td>'+q.known+'／'+q.n+'</td><td>'+P(q.coverage,1)+'</td><td>'+esc(q.note||'')+'</td></tr>';}).join('');
 return html+'<details class="fixed-plus-diagnostic" data-fixed-plus-gap="true"><summary>查看最近12季度中的仓位／折算缺口 · '+gaps.length+' 点</summary><p class="method-note">缺口可能位于冻结的历史季度，即使当日折算已经完整，也要等旧季度滚出最近12季度窗口，或补齐该季度仓位与估值后，才能消除其影响。以下范围用于检验是否能够唯一归类，不是另外一种基金类别。</p><div class="rt-wrap fixed-plus-table"><table class="rt"><thead><tr><th>使用报告期</th><th>窗口位置</th><th>合并权益仓位范围</th><th>有效／样本只数</th><th>加权估值覆盖</th><th>缺口说明</th></tr></thead><tbody>'+rows+'</tbody></table></div></details>';
}
function fixedPlusConversionRule(p){return '<p>'+esc(p.meta.conversion_rule||'转债折算样本按计算日的自愿转股起止日期筛选。')+'</p>';}
function fixedPlusHeaderDates(p,r){
 const head=CURRENT?.code===p.code?CURRENT.head||{}:{};
 const format=value=>{const s=String(value??'');return /^\d{8}$/.test(s)?s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6):/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null;};
 const setup=format(p.setup)||format(head.setup);
 return '<span data-fixed-plus-setup="'+(setup||'')+'">成立日期：'+(setup||'未取得')+'</span><span data-fixed-plus-selected-date="'+r.dt+'">选定日期：'+r.dt+(r.cf_estimated||r.uses_cf_estimate?' · 含延续估计':'')+(r.bounded?(r.state==='uncertain'?' · 上下界跨档':' · 按上下界确认'):'')+'</span>';
}
function fixedPlusCards(p){
 const r=fixedPlusCurrent(p);if(!r)return '<p class="method-note">暂无可用历史日期。</p>';
 return '<div class="fixed-plus-current" data-fixed-plus-date="'+r.dt+'"><div class="fixed-plus-title"><span class="fixed-plus-label" style="background:'+FIXED_PLUS_COLORS[r.state]+'">'+esc(p.labels[r.state])+'</span><strong>'+esc(p.name)+' · '+esc(p.code)+'</strong>'+fixedPlusHeaderDates(p,r)+'</div>'+
 '<div class="fixed-plus-metrics"><div><span>当期合并权益仓位（季度最新值）</span><b>'+fixedRange(r.eq_lo,r.eq_hi)+'</b></div><div><span>最近12季度平均合并权益仓位</span><b>'+fixedRange(r.avg_lo,r.avg_hi)+'</b></div><div><span>最近12季度最高合并权益仓位</span><b>'+fixedRange(r.peak_lo,r.peak_hi)+'</b></div></div>'+
 '<p class="method-note">'+esc(r.reason)+'。使用 '+r.quarter+' 期仓位，公告日期 '+r.available+'；连续已公告季度 '+r.n_reports+'／12。'+(r.cf_lo!=null?'用于折算的转股期内明细 '+r.n+' 只，当日有效 '+r.known+' 只，加权行情覆盖 '+P(r.coverage,1)+'。':'')+'</p>'+fixedPlusDiagnostics(p,r)+'</div>';
}
function fixedPlusTooltip(p,r){
 const estimate=fixedPlusEstimateText(r);
 return '<b>'+r.dt+' · '+esc(p.labels[r.state])+'</b><br>入池判定：'+fixedPlusPoolText(r)+(r.candidates?.length>1?'<br>可能类别：'+r.candidates.map(c=>esc(p.labels[c])).join('／'):'')+'<br>季报分类对照：'+esc(p.labels[r.quarterly_state])+'<br>当期合并权益仓位（季度最新值）：'+fixedRange(r.eq_lo,r.eq_hi)+'<br>最近12季度平均合并权益仓位：'+fixedRange(r.avg_lo,r.avg_hi)+'<br>最近12季度最高合并权益仓位：'+fixedRange(r.peak_lo,r.peak_hi)+'<br>股票仓位：'+(r.stock==null?'—':NN(r.stock,2)+'%')+'<br>转债总仓位：'+(r.cb==null?'—':NN(r.cb,2)+'%')+'<br>使用 '+r.quarter+' 期，公告 '+r.available+'<br>'+esc(r.reason)+(estimate?'<br>'+esc(estimate):'');
}
function fixedPlusCharts(p){
 if(!p.daily.length)return '<p class="method-note">没有满足公告可得要求的日频日期。</p>';
 const rows=p.daily,first=+new Date(rows[0].dt),last=+new Date(rows.at(-1).dt),x0=fixedPlusZoom?.x0??first,x1=fixedPlusZoom?.x1??last;
 const shown=rows.filter(r=>+new Date(r.dt)>=x0&&+new Date(r.dt)<=x1),id=__chartSeq++;
 const w=1000,h=315,pl=53,pr=210,pt=22,pb=30,pw=w-pl-pr,ph=h-pt-pb;
 const X=t=>pl+(x1===x0?.5:(t-x0)/(x1-x0))*pw;
 const defs=[{key:'eq',lo:'eq_lo',hi:'eq_hi',name:'当期合并权益仓位（季度最新值）',color:'#0a7c78'},{key:'avg',lo:'avg_lo',hi:'avg_hi',name:'最近12季度平均合并权益仓位',color:'#c69a4b'},{key:'peak',lo:'peak_lo',hi:'peak_hi',name:'最近12季度最高合并权益仓位',color:'#102c45'}];
 let hi=Math.max(50,...shown.flatMap(r=>defs.map(d=>fixedPlusPoint(r,d.key,d.lo,d.hi)??0)))*1.08;const Y=v=>pt+ph-v/hi*ph;
 const rules=[{value:15,label:'均值15%：稳健型 → 平衡型',color:'#0a7c78'},{value:25,label:'25%：均值平衡型 → 激进型；最高稳健型 → 平衡型',color:'#a27b2d'},{value:35,label:'最高35%：平衡型 → 激进型',color:'#bc554a'},{value:50,label:'单期上限50%',color:'#bc554a'}];
 let svg='<svg id="fixedPlusSvg_'+id+'" viewBox="0 0 '+w+' '+h+'" data-fixed-plus-chart="true" data-x0="'+x0+'" data-x1="'+x1+'" role="img" aria-label="合并权益仓位与12期平均及最高仓位，含15%、25%、35%分类参考线和50%单期上限">';
 // 分类阈值固定显示；过近的自动刻度让位，避免轴标签挤在一起。
 const ticks=Array.from({length:6},(_,i)=>({value:hi*i/5,color:'#7b8a98'})).filter(t=>rules.every(r=>Math.abs(Y(t.value)-Y(r.value))>=16)).concat(rules).sort((a,b)=>a.value-b.value);
 for(const t of ticks){const y=Y(t.value),rule=t.label!=null;if(!rule)svg+='<line x1="'+pl+'" x2="'+(w-pr)+'" y1="'+y+'" y2="'+y+'" stroke="#e1e8ec"/>';svg+='<text data-fixed-plus-tick="'+t.value+'" x="'+(pl-7)+'" y="'+(y+4)+'" text-anchor="end" font-size="11"'+(rule?' font-weight="600"':'')+' fill="'+t.color+'">'+NN(t.value,0)+'%</text>';}
 for(const r of rules)svg+='<line data-fixed-plus-threshold="'+r.value+'" x1="'+pl+'" x2="'+(w-pr)+'" y1="'+Y(r.value)+'" y2="'+Y(r.value)+'" stroke="'+r.color+'" stroke-opacity="'+(r.value===50?1:.72)+'" stroke-dasharray="5 4"/>';
 for(const def of defs){
  let path='',open=false,count=0;
  for(const r of shown){
   const value=fixedPlusPoint(r,def.key,def.lo,def.hi);if(value==null){open=false;continue;}
   path+=(open?' L':' M')+X(+new Date(r.dt)).toFixed(2)+','+Y(value).toFixed(2);open=true;count++;
  }
  svg+='<path data-fixed-plus-series="'+def.key+'" data-point-count="'+count+'" d="'+path.trim()+'" stroke="'+def.color+'" stroke-width="2" fill="none"/>';
 }
 let labelBottom=-Infinity;
 for(const r of [...rules].reverse()){
  const lines=r.value===25?['25%：均值平衡型 → 激进型','最高稳健型 → 平衡型']:[r.label];
  const x=w-pr+12,y=Math.max(Y(r.value)-4,labelBottom+14);
  svg+='<g data-fixed-plus-threshold-label="'+r.value+'"><text x="'+x+'" y="'+y+'" text-anchor="start" fill="'+r.color+'" font-size="10">'+lines.map((line,i)=>'<tspan x="'+x+'" dy="'+(i?12:0)+'">'+esc(line)+'</tspan>').join('')+'</text></g>';
  labelBottom=y+(lines.length-1)*12;
 }
 xTicks(x0,x1).forEach(([dt,label])=>{svg+='<text x="'+X(+new Date(dt))+'" y="'+(h-7)+'" text-anchor="middle" font-size="11" fill="#7b8a98">'+esc(label)+'</text>';});
 const selected=+new Date(fixedPlusCurrent(p).dt),selectedX=X(selected),selectedVisible=selected>=x0&&selected<=x1;
 svg+='<line data-fixed-plus-cursor="true" id="fixedPlusCursor_'+id+'" x1="'+selectedX+'" x2="'+selectedX+'" y1="'+pt+'" y2="'+(pt+ph)+'" stroke="#8a99a8" stroke-dasharray="3 3" opacity="'+(selectedVisible?1:0)+'"/><rect id="fixedPlusHit_'+id+'" x="'+pl+'" y="'+pt+'" width="'+pw+'" height="'+ph+'" fill="transparent"/></svg>';
 const present=[...new Set(rows.map(r=>r.state).concat(rows.map(r=>r.quarterly_state)))];
 let ribbon='<svg id="fixedPlusState_'+id+'" viewBox="0 0 '+w+' 95" data-fixed-plus-states="true" role="img" aria-label="日频分类与季报分类状态带">';
 for(const [row,key,label] of [[0,'state','日频分类'],[1,'quarterly_state','季报对照']]){
  ribbon+='<text x="0" y="'+(row*38+23)+'" font-size="11" fill="#7b8a98">'+label+'</text>';
  let start=null,state=null,tail=null;
  const flush=end=>{if(start==null)return;const a=X(+new Date(start)),b=X(+new Date(end));ribbon+='<rect x="'+a+'" y="'+(row*38+9)+'" width="'+Math.max(1,b-a)+'" height="23" fill="'+FIXED_PLUS_COLORS[state]+'"><title>'+start+' ～ '+tail+'：'+esc(p.labels[state])+'</title></rect>';};
  for(let i=0;i<shown.length;i++){const r=shown[i];if(r[key]!==state){flush(r.dt);start=r.dt;state=r[key];}tail=r.dt;}if(tail)flush(shown.at(-1).dt);
 }
 ribbon+='</svg>';
 setTimeout(()=>{
  const root=$id('fixedPlusSvg_'+id),ribbonRoot=$id('fixedPlusState_'+id),cursor=$id('fixedPlusCursor_'+id);if(!root)return;
  const locate=e=>{const rect=e.currentTarget.getBoundingClientRect();if(!rect.width)return;const x=Math.max(pl,Math.min(w-pr,(e.clientX-rect.left)/rect.width*w)),t=x0+(x-pl)/pw*(x1-x0);let left=0,right=rows.length-1;while(left<right){const mid=(left+right)>>1;if(+new Date(rows[mid].dt)<t)left=mid+1;else right=mid;}if(left>0&&Math.abs(+new Date(rows[left-1].dt)-t)<Math.abs(+new Date(rows[left].dt)-t))left--;return left;};
  const hover=e=>{const i=locate(e);if(i==null)return;const r=rows[i],x=X(+new Date(r.dt));cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);cursor.setAttribute('opacity','1');showTT(fixedPlusTooltip(p,r),e);};
  for(const el of [root,ribbonRoot])if(el){el.addEventListener('mousemove',hover);el.addEventListener('mouseleave',()=>{updateFixedPlusCursor();hideTT();});el.addEventListener('click',e=>{const i=locate(e);if(i!=null)locateFixedPlusIndex(i);});}
  wireZoomSlider(id,first,last,(a,b)=>{fixedPlusZoom={x0:a,x1:b};refreshFixedPlusPlot();});
 },0);
 const legend='<div class="chart-legend">'+defs.map(d=>'<span><i class="sw" style="background:'+d.color+'"></i>'+d.name+'</span>').join('')+'</div>';
 const swatch=k=>'<span><i style="background:'+FIXED_PLUS_COLORS[k]+'"></i>'+esc(p.labels[k])+'</span>';
 const statusLegend='<div class="fixed-plus-legend" data-fixed-plus-fund-categories="true"><b>基金类别：</b>'+FIXED_PLUS_CATEGORIES.map(swatch).join('')+'</div><div class="fixed-plus-legend" data-fixed-plus-data-states="true"><b>资格／可判定状态：</b>'+present.filter(k=>!FIXED_PLUS_CATEGORIES.includes(k)).map(swatch).join('')+'</div>';
 return '<div class="chart-wrap">'+svg+'</div>'+legend+'<div class="chart-wrap">'+ribbon+'</div>'+statusLegend+(fixedPlusZoom?'<button class="zoom-reset" type="button" data-fixed-plus-reset>重置缩放</button>':'')+zoomSlider(id,first,last,x0,x1);
}
function refreshFixedPlusPlot(){const p=fixedPlusData(),el=$id('fixedPlusPlots');if(p&&el)el.innerHTML=fixedPlusCharts(p);}
function updateFixedPlusCursor(){
 const p=fixedPlusData(),svg=host.querySelector('[data-fixed-plus-chart]'),cursor=svg?.querySelector('[data-fixed-plus-cursor]');if(!p||!cursor)return;
 const t=+new Date(fixedPlusCurrent(p).dt),a=Number(svg.dataset.x0),b=Number(svg.dataset.x1),x=53+(b===a?.5:(t-a)/(b-a))*737;
 cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);cursor.setAttribute('opacity',t>=a&&t<=b?'1':'0');
}
function locateFixedPlusIndex(i){
 const p=fixedPlusData();if(!p?.daily.length)return;fixedPlusIndex=Math.max(0,Math.min(p.daily.length-1,+i));
 $id('fixedPlusCards').innerHTML=fixedPlusCards(p);const r=p.daily[fixedPlusIndex];
 const date=$id('fixedPlusDate'),range=$id('fixedPlusRange');if(date)date.value=r.dt;if(range)range.value=fixedPlusIndex;
 if(fixedPlusZoom&&(+new Date(r.dt)<fixedPlusZoom.x0||+new Date(r.dt)>fixedPlusZoom.x1)){fixedPlusZoom=null;refreshFixedPlusPlot();}else updateFixedPlusCursor();
}
function locateFixedPlusDate(date){const p=fixedPlusData();if(!p)return;let i=p.daily.findIndex(r=>r.dt>=date);if(i<0)i=p.daily.length-1;locateFixedPlusIndex(i);}
function resetFixedPlusZoom(){fixedPlusZoom=null;refreshFixedPlusPlot();}
function fixedPlusHistoryPeriods(p){
 const segments=[];
 p.daily.forEach((r,i)=>{let s=segments.at(-1);if(!s||s.state!==r.state){s={start:r.dt,end:r.dt,state:r.state,entry:r,previous:p.daily[i-1]||null,quarters:[]};segments.push(s);}else s.end=r.dt;});
 const unassigned=[];
 for(const q of p.quarterly){
  const day=q.available?p.daily.find(r=>r.dt>q.available):null;
  const segment=day?segments.find(s=>s.start<=day.dt&&day.dt<=s.end):null;
  if(segment)segment.quarters.push(q);else unassigned.push(q);
 }
 return {segments,unassigned};
}
function fixedPlusHistoryReason(p,s){
 const r=s.entry,b=s.previous,label=p.labels[r.state],old=b?p.labels[b.state]:null;
 if(r.state==='young')return '基金成立于 '+String(p.setup).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')+'，这一时期尚未满3年，暂不进行固收+分类。';
 if(r.state==='insufficient'){
  if((r.reason||'').includes('12个已公告季度')){const n=p.quarterly.filter(q=>q.available&&q.available<r.dt).length;return '基金已满3年，但这一时期开始时仅有 '+n+' 个已公告季度，尚未满足连续12季度要求。';}
  return '最近12季度仍有仓位资料缺口：'+(r.reason||'无法算齐分类指标')+'。';
 }
 if(r.state==='outside')return '这一时期不属于本分类规则适用的基金范围。';
 if(r.state==='uncertain')return '持仓或估值缺口使结果可能落入 '+(r.candidates||[]).map(c=>p.labels[c]).join('／')+'，暂时无法唯一归类。';
 const same=b&&b.quarter===r.quarter;
 const cause=same?'仍沿用 '+r.quarter+' 期持仓，转债折算系数CF由 '+(b.cf==null?'未确定':NN(b.cf,4))+' 变为 '+(r.cf==null?'未确定':NN(r.cf,4))+'。':'新公告的 '+r.quarter+' 期持仓纳入12季度窗口。';
 const avg=fixedRange(r.avg_lo,r.avg_hi),peak=fixedRange(r.peak_lo,r.peak_hi);
 const previousMetric=key=>b&&Number.isFinite(b[key])?NN(b[key],2)+'% → ':'';
 let why='';
 if(r.state==='high_equity'){
  const failed=[];if(r.avg_lo>40)failed.push('12季度平均值 '+avg+' 高于40%');if(r.peak_lo>50)failed.push('12季度最高值 '+peak+' 高于50%');
  why=failed.length?failed.join('，')+'，不满足固收+入池条件。':'不满足固收+入池条件，且12季度平均值不低于5%。';
 }else if(r.state==='bondlike')why='最近12季度平均值为 '+avg+'，低于5%，归入类债券型。';
 else if(b&&b.peak!=null&&r.peak!=null&&[25,35].some(t=>(b.peak<t&&r.peak>=t)||(b.peak>=t&&r.peak<t)||(b.peak<=t&&r.peak>t)||(b.peak>t&&r.peak<=t))){
  why='最近12季度最高合并权益仓位 '+previousMetric('peak')+peak+'；平均值为 '+avg+'，按平均与最高值中较高的风险档归类。';
 }else why='最近12季度平均值为 '+avg+'，最高值为 '+peak+'；符合固收+条件，按两项中较高的风险档归类。';
 return cause+why+(old?'因此从“'+old+'”转为“'+label+'”。':'本段开始判为“'+label+'”。')+(r.cf_estimated||r.uses_cf_estimate?'其中含CF延续估计，未当作完整逐券估值。':'');
}
function fixedPlusQuarterEvidence(rows,p){
 return '<div class="rt-wrap fixed-plus-table"><table class="rt"><thead><tr>'+['报告期','公告日期','当期合并权益仓位（季度最新值）','最近12季度平均合并权益仓位','最近12季度最高合并权益仓位','季报类别／状态','计算状态'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+[...rows].reverse().map(r=>'<tr data-fixed-plus-quarter="'+r.dt+'">'+[r.dt,esc(r.available||'未取得'),fixedRange(r.eq_lo,r.eq_hi),fixedRange(r.avg_lo,r.avg_hi),fixedRange(r.peak_lo,r.peak_hi),esc(p.labels[r.state]),esc(fixedPlusEstimateText(r)||'按可得仓位与估值计算')].map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function fixedPlusHistoryTable(p){
 const {segments,unassigned}=fixedPlusHistoryPeriods(p);
 const rows=[...segments].reverse().map(s=>'<tr data-fixed-plus-period="'+s.start+'"><td style="white-space:nowrap">'+s.start+' ～ '+s.end+'</td><td>'+esc(p.labels[s.state])+'</td><td>'+esc(fixedPlusHistoryReason(p,s))+(s.quarters.length?'':'<br><span class="method-note">本段无新季报纳入，沿用 '+esc(s.entry.quarter)+' 期持仓。</span>')+'</td></tr>'+(s.quarters.length?'<tr><td colspan="3"><details class="fixed-plus-evidence"><summary>本段新纳入的季度依据 · '+s.quarters.length+' 期</summary>'+fixedPlusQuarterEvidence(s.quarters,p)+'</details></td></tr>':'')).join('');
 return '<details class="selection-method"><summary>历史分类与季度依据 · '+segments.length+' 段 / '+p.quarterly.length+' 期</summary><p class="method-note">每行直接说明“这一时期属于哪类”，原因解释进入本段时发生的变化。起止日期按可计算交易日；最近一段截至 '+p.asof+'。季度明细按公告后首次可采用的日期归入对应阶段，每期只列一次；季报期末分类可能与公告后日频类别不同。</p><div class="rt-wrap fixed-plus-history"><table class="rt"><thead><tr><th>时期</th><th>这一时期的类型／状态</th><th>为什么进入这一类</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(unassigned.length?'<details class="fixed-plus-evidence"><summary>尚无法对应日频阶段的季度 · '+unassigned.length+' 期</summary>'+fixedPlusQuarterEvidence(unassigned,p)+'</details>':'')+'</details>';
}
function renderFixedPlus(d){
 const p=d.fixed_plus||payload;
 if(!p)return sub('固收+定位与变迁','当前所选基金','<p class="method-note">该基金的合并权益仓位定位尚未计算。</p>');
 if(fixedPlusFund!==d.code){fixedPlusFund=d.code;fixedPlusIndex=p.daily.length-1;fixedPlusZoom=null;}
 const last=fixedPlusCurrent(p);if(!last)return sub('固收+定位与变迁','当前所选基金','<p class="method-note">尚无满足公告可得要求的日期。</p>');
 const windowStart=p.daily.find(r=>fixedPlusPoint(r,'avg','avg_lo','avg_hi')!=null)?.dt;
 const update=p.meta?.input_update,previous=update?.previous_success;
 const updateNote=update&&update.status!=='current'?'<p class="method-note" data-fixed-plus-input-status="'+esc(update.status)+'"><b>最新披露：'+esc(update.report_date)+' · '+(update.status==='insufficient'?'资料不足':'分类待更新')+'</b>。'+esc((update.missing||[]).join('；'))+'。'+(previous?'上次可算结果截至 '+esc(previous.dt)+'，作为历史参考。':'下方历史结果截至 '+esc(update.history_asof||p.asof)+'。')+'</p>':'';
 return sub('固收+定位与变迁','当前所选基金 · 日频推算至 '+p.asof,
  updateNote+'<p class="method-note">本定位对应当前基金，与下方散点图的统计窗口分别控制。季报明细中的“季度最新值”为对应报告期末的冻结值；上方曲线与指标卡则沿用所选日最近已公告的股票、转债总仓位及逐券持仓权重，按当日转股期状态筛选样本并更新折算系数CF。最近12季度统计使用前11季冻结值＋本季最新值，不是最近12个交易日。'+(windowStart?'最近12季度均值、最高值自 '+windowStart+' 起计算。':'尚未形成可计算的连续12季度窗口。')+'延续估计在日期提示及明细中单独标注。</p>'+
  '<div class="fixed-plus-controls"><label>定位日期 <input id="fixedPlusDate" type="date" min="'+p.daily[0].dt+'" max="'+p.asof+'" value="'+last.dt+'" data-fixed-plus-date-input></label><button type="button" data-fixed-plus-step="-1">前一日</button><button type="button" data-fixed-plus-step="1">后一日</button><button type="button" data-fixed-plus-latest>最新</button><input id="fixedPlusRange" type="range" aria-label="定位历史分类日期" min="0" max="'+(p.daily.length-1)+'" value="'+fixedPlusIndex+'" data-fixed-plus-index-input></div>'+
  '<div id="fixedPlusCards">'+fixedPlusCards(p)+'</div><div id="fixedPlusPlots">'+fixedPlusCharts(p)+'</div>'+
  '<p class="method-note">在曲线或状态带悬浮可查看当日口径，点击可定位上方指标。基金类别仅有类债券型、稳健型固收+、平衡型固收+、激进型固收+、高权益型五类；灰色区间表示资格或资料尚不足以判定，并非第六种基金类别。待判定日期会单独列出入池状态、可能类别和受影响的历史季度。</p>'+
  fixedPlusHistoryTable(p)+
  '<details class="selection-method"><summary>分类规则与日频计算口径</summary><div class="method-note"><p>平底溢价率＝转股价值÷纯债价值−1。低于−20%折算为0.3，高于20%折算为0.7，其余折算为0.5。CF＝Σ(转股期内已披露转债仓位×折算权重)÷Σ转股期内已披露转债仓位；合并权益仓位＝股票仓位＋CF×全部转债仓位。</p><p>适用范围为中长期纯债、一级债基、二级债基、偏债混合、灵活配置。成立满3年且有连续12期已公告仓位，最近12季度平均合并权益仓位在5%—40%，且最近12季度最高合并权益仓位不超过50%时进入固收+池。平均仓位分档为5%—15%、15%—25%、25%—40%；最高仓位分档为低于25%、25%—35%、高于35%，最终取较高风险档。</p><p>'+esc(p.meta.non_plus_rule||'不满足固收+筛选条件时，最近12季度平均合并权益仓位低于5%为类债券型，剩余基金为高权益型。')+'</p><p>'+esc(p.meta.tie_rule)+'</p><p>'+esc(p.meta.frequency_rule)+'</p>'+fixedPlusConversionRule(p)+'<p>'+esc(p.meta.availability_rule)+'</p><p>'+esc(p.meta.missing_rule)+'</p><p>'+esc(p.meta.no_snapshot_rule)+'</p><p>日频估算不反映未披露的真实买卖或日内股票仓位漂移。季报快照按报告期末估值计算，只在其公告后的交易日作为对照；不是提前可知的交易信号。</p></div></details>');
}

 const click=e=>{const b=e.target.closest('button');if(!b||!host.contains(b))return;
  if(b.hasAttribute('data-fixed-plus-reset'))resetFixedPlusZoom();
  else if(b.hasAttribute('data-fixed-plus-latest'))locateFixedPlusIndex(payload.daily.length-1);
  else if(b.dataset.fixedPlusStep)locateFixedPlusIndex(fixedPlusIndex+Number(b.dataset.fixedPlusStep));};
 const input=e=>{if(e.target.hasAttribute('data-fixed-plus-index-input'))locateFixedPlusIndex(Number(e.target.value));};
 const change=e=>{if(e.target.hasAttribute('data-fixed-plus-date-input'))locateFixedPlusDate(e.target.value);};
 host.classList.add('fund-fixed-plus');host.dataset.fixedPlusSourceCode=payload.code;
 host.innerHTML=renderFixedPlus(CURRENT)+'<div data-fixed-plus-tooltip class="fixed-plus-tooltip" role="tooltip" hidden></div>';
 host.addEventListener('click',click);host.addEventListener('input',input);host.addEventListener('change',change);
 return {destroy(){destroyed=true;host.removeEventListener('click',click);host.removeEventListener('input',input);host.removeEventListener('change',change);host.innerHTML='';},
  setDate:locateFixedPlusDate,setIndex:locateFixedPlusIndex,resetZoom:resetFixedPlusZoom,
  state:()=>({code:payload.code,index:fixedPlusIndex,date:fixedPlusCurrent(payload)?.dt,asof:payload.asof,zoom:fixedPlusZoom}),
  render:{cards:()=>fixedPlusCards(payload),chart:()=>fixedPlusCharts(payload),history:()=>fixedPlusHistoryTable(payload)},
  _test:{fixedPlusPoint,fixedPlusHistoryPeriods,fixedPlusHistoryReason,fixedPlusQuarterEvidence}};
}
function resolve(index,code){const source=index?.aliases?.[code]||code;return index?.funds?.[source]?source:null;}
async function load(options={}){
 if(options.payload)return options.payload;
 const loader=options.loader||(typeof loadDataScript==='function'?loadDataScript:null);if(!loader)throw Error('固收+数据加载器未准备好');
 const version=encodeURIComponent(String(options.version||'source20261028'));
 if(!libraryPromise)libraryPromise=loader('https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/fixed_plus_index.js?v='+version,'固收+样本目录',()=>{const i=root.FUND_FIXED_PLUS_INDEX;if(i?.schema_version!=='fund_fixed_plus_index.v1')throw Error('固收+目录格式不完整');return i;}).catch(e=>{libraryPromise=null;throw e;});
 const index=await libraryPromise,source=resolve(index,options.currentCode);if(!source)return null;
 const proof=index.funds[source];return await loader('https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/fixed_plus/'+encodeURIComponent(source)+'.js?v='+proof.sha256.slice(0,16),'固收+定位来源快照',()=>{const p=root.FUND_FIXED_PLUS_DATA?.[source];if(p?.code!==source||p.asof!==proof.asof||p.daily?.length!==proof.daily_points||p.quarterly?.length!==proof.quarterly_reports)throw Error('固收+来源快照版本不匹配');return p;});
}
async function mount(host,options={}){
 if(!host)return false;mounts.get(host)?.instance?.destroy();const token={};mounts.set(host,{token});
 host.setAttribute('aria-busy','true');
 try{const p=await load(options);if(mounts.get(host)?.token!==token||host.isConnected===false)return false;
  if(!p){host.innerHTML='';return false;}const instance=create(host,p,options);mounts.set(host,{token,instance});return true;
 }catch(e){if(mounts.get(host)?.token!==token)return false;host.innerHTML='<p class="method-note">固收+定位暂未加载：'+esc(e.message)+'</p><button type="button" data-fixed-plus-retry>重试</button>';host.querySelector('button').addEventListener('click',()=>mount(host,options));return false;}
 finally{if(mounts.get(host)?.token===token)host.removeAttribute('aria-busy');}
}
root.FundFixedPlus={create,mount,load,resolve};
if(typeof module!=='undefined')module.exports=root.FundFixedPlus;
})(typeof window!=='undefined'?window:globalThis);
