/* Source-faithful six-category scatter; isolated host, no global helper collisions. */
(function(root){
'use strict';
const mounts=new WeakMap();
let mountSeq=0;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const P=(v,d=2)=>root.FundResearch.percent(v,d);
function representative(library,code,siteAliases={}){
  // Prefer the exact supplied share's product mapping; site aliases are display only.
  let seen=new Set();
  while(code&&!seen.has(code)){if(library.aliases?.[code])return library.aliases[code];seen.add(code);code=siteAliases[code];}
  return code;
}
function create(host,library,options={}){
 const CURRENT={code:representative(library,options.currentCode,options.siteAliases)||options.currentCode};
 const searchAliases=new Map();for(const [share,rep] of Object.entries(library.aliases||{})){if(!searchAliases.has(rep))searchAliases.set(rep,[]);searchAliases.get(rep).push(share);}
 let __chartSeq=++mountSeq*100000;
 const $id=id=>host.querySelector('[id="'+id+'"]');
 const sub=(title,caption,body)=>'<article class="selection-panel"><h3>'+esc(title)+'</h3><p class="method-note">'+esc(caption)+'</p>'+body+'</article>';
 const hideTT=()=>{const t=host.querySelector('.selection-tooltip');if(t)t.hidden=true;};
 const showTT=(html,event)=>{const t=host.querySelector('.selection-tooltip');if(!t)return;t.innerHTML=html;t.hidden=false;t.style.left=Math.max(8,Math.min(event.clientX+12,root.innerWidth-t.offsetWidth-8))+'px';t.style.top=Math.max(8,Math.min(event.clientY+12,root.innerHeight-t.offsetHeight-8))+'px';};
/* 六类基金风险收益截面，原生SVG，无在线依赖。 */
let selectionWindow="1y",selectionQuery="",selectionPicked=null,selectionRiskFree=0;
const selectionHidden=new Set();
const SELECTION_COLORS={"2001010201":"#b85b50","2001010202":"#b89a59","2001010203":"#2c7376","2001010204":"#b5c1ca","2001010303":"#1c3a50","2001010304":"#8ca9a5"};
function selectionRows(){
 const lib=library;if(!lib)return [];
 const terms=selectionQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return lib.windows[selectionWindow].rows.filter(r=>!selectionHidden.has(r.sector)&&terms.every(term=>(r.code+" "+r.name+" "+r.product+" "+(searchAliases.get(r.code)||[]).join(" ")).toLowerCase().includes(term)));
}
function selectionPointNote(r){
 const lib=library,p=lib.windows[selectionWindow];
 return '<b>'+esc(r.name)+' · '+esc(r.code)+'</b><br>'+esc(lib.sectors[r.sector])+'<br>年化收益率：<b>'+P(r.ann)+'</b><br>年化波动率：<b>'+P(r.vol)+'</b><br>区间累计收益：'+P(r.cum)+'<br>有效日收益 '+r.n+' / '+r.expected+'（'+P(r.coverage,1)+'）<br>'+p.start+' ～ '+p.end;
}
function selectionDetail(rows){
 const lib=library,current=lib.aliases[CURRENT?.code]||CURRENT?.code;
 const row=rows.find(r=>r.code===selectionPicked)||rows.find(r=>r.code===current);
 if(!row)return '<p class="method-note">悬浮查看，点击固定基金。每点使用一个固定代表份额。</p>';
 const self=current===row.code;
 return '<div class="selection-detail">'+(self?'<span class="selection-tag">当前基金所属产品</span> ':'')+'<strong>'+esc(row.name)+' · '+esc(row.code)+'</strong><span>'+esc(lib.sectors[row.sector])+'</span><span>年化收益 <b>'+P(row.ann)+'</b></span><span>年化波动 <b>'+P(row.vol)+'</b></span><span>累计收益 '+P(row.cum)+'</span><span>日收益覆盖 '+row.n+'/'+row.expected+'</span></div>';
}
function updateSelectionRiskFree(input){
 const value=input.valueAsNumber;
 const valid=input.value.trim()!==""&&Number.isFinite(value);
 input.setCustomValidity(valid?"":"请输入有效的年化无风险利率（%）。");
 input.setAttribute("aria-invalid",String(!valid));
 const status=$id("selectionRiskFreeStatus");
 if(status)status.textContent=valid?"":"请输入有效数值；参考线暂保留上次设定。";
 if(!valid)return;
 selectionRiskFree=value/100;hideTT();refreshSelectionPlot();
}
function selectionScatter(rows){
 if(!rows.length)return '<p class="method-note">当前类别／搜索条件下没有满足区间数据要求的基金。</p>';
 const p=library.windows[selectionWindow],id=__chartSeq++,w=920,h=460,pl=65,pr=22,pt=20,pb=48,pw=w-pl-pr,ph=h-pt-pb;
 const xs=rows.map(r=>r.ann),ys=rows.map(r=>r.vol);
 const xAxis=root.FundResearch.displayAxis(xs,{includeZero:true,steps:5}),yAxis=root.FundResearch.displayAxis(ys,{includeZero:true,floor:0,steps:5});
 const {min:xmin,max:xmax}=xAxis,{min:ymin,max:ymax}=yAxis;
 const xDigits=root.FundResearch.percentDigits(xAxis.step),yDigits=root.FundResearch.percentDigits(yAxis.step);
 const tickLabel=(v,d)=>{const n=Number((v*100).toFixed(d));return (n===0?0:n).toFixed(d)+'%';};
 const X=v=>pl+(v-xmin)/(xmax-xmin)*pw,Y=v=>pt+ph-(v-ymin)/(ymax-ymin)*ph;
 const lib=library,current=lib.aliases[CURRENT?.code]||CURRENT?.code;
 let svg='<svg id="selectionSvg_'+id+'" viewBox="0 0 '+w+' '+h+'" role="group" aria-label="基金年化收益率与年化波动率散点图" data-selection-scatter="true" data-count="'+rows.length+'" data-x-min="'+xmin+'" data-x-max="'+xmax+'" data-y-max="'+ymax+'">';
 for(const yv of yAxis.ticks){const y=Y(yv);
  svg+='<line x1="'+pl+'" y1="'+y+'" x2="'+(w-pr)+'" y2="'+y+'" stroke="#e1e8ec"/><text data-selection-y-tick x="'+(pl-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="12" fill="#7b8a98">'+tickLabel(yv,yDigits)+'</text>';
 }
 for(const xv of xAxis.ticks){const x=X(xv);
  if(xv!==0&&Math.abs(x-X(0))>42)svg+='<text data-selection-x-tick x="'+x+'" y="'+(h-25)+'" text-anchor="middle" font-size="12" fill="#7b8a98">'+tickLabel(xv,xDigits)+'</text>';
 }
 const zero=X(0);svg+='<line data-selection-zero="true" x1="'+zero+'" y1="'+pt+'" x2="'+zero+'" y2="'+(pt+ph)+'" stroke="var(--navy)" stroke-width="1.5" stroke-dasharray="5 4"/><line x1="'+zero+'" y1="'+(pt+ph)+'" x2="'+zero+'" y2="'+(pt+ph+6)+'" stroke="var(--navy)"/><circle data-selection-zero-dot="true" cx="'+zero+'" cy="'+(pt+ph)+'" r="3.7" fill="var(--navy)"/><text data-selection-zero-label="true" x="'+zero+'" y="'+(h-25)+'" text-anchor="middle" font-size="12" font-weight="700" fill="var(--navy)">0%</text>';
 svg+='<text x="'+(pl+pw/2)+'" y="'+(h-4)+'" text-anchor="middle" font-size="13" fill="var(--navy)">年化收益率（%）</text><text transform="translate(16 '+(pt+ph/2)+') rotate(-90)" text-anchor="middle" font-size="13" fill="var(--navy)">年化波动率（%）</text>';
 const sharpeStart=Math.max(xmin,selectionRiskFree),sharpeEnd=Math.min(xmax,selectionRiskFree+ymax);
 const sharpeVisible=sharpeEnd>sharpeStart;
 if(sharpeVisible)svg+='<line data-selection-sharpe="1" data-risk-free="'+selectionRiskFree+'" data-return-start="'+sharpeStart+'" data-return-end="'+sharpeEnd+'" data-vol-start="'+(sharpeStart-selectionRiskFree)+'" data-vol-end="'+(sharpeEnd-selectionRiskFree)+'" x1="'+X(sharpeStart)+'" y1="'+Y(sharpeStart-selectionRiskFree)+'" x2="'+X(sharpeEnd)+'" y2="'+Y(sharpeEnd-selectionRiskFree)+'" stroke="var(--gold)" stroke-width="2" stroke-dasharray="8 5" pointer-events="none"><title>夏普 = 1；年化无风险利率 '+P(selectionRiskFree,2)+'</title></line>';
 const ordered=[...rows.filter(r=>r.code!==current&&r.code!==selectionPicked),...rows.filter(r=>r.code===current||r.code===selectionPicked)];
 for(const r of ordered){
  const highlight=r.code===current||r.code===selectionPicked,selected=r.code===selectionPicked;
  svg+='<circle data-selection-code="'+esc(r.code)+'" data-sector="'+r.sector+'" cx="'+X(r.ann).toFixed(2)+'" cy="'+Y(r.vol).toFixed(2)+'" r="'+(highlight?6:3.4)+'" fill="'+SELECTION_COLORS[r.sector]+'" fill-opacity="'+(highlight?1:.6)+'" stroke="'+(highlight?(selected?'#a43d30':'var(--navy)'):'none')+'" stroke-width="2" tabindex="0" role="button" aria-label="'+esc(r.name+' '+r.code+'，年化收益率'+P(r.ann)+'，年化波动率'+P(r.vol))+'"><title>'+esc(r.name+' '+r.code)+'</title></circle>';
 }
 svg+='</svg>';
 setTimeout(()=>{
  const root=$id('selectionSvg_'+id);if(!root)return;
  const lookup=new Map(rows.map(r=>[r.code,r]));
  const pick=code=>{selectionPicked=code;hideTT();refreshSelectionPlot();setTimeout(()=>host.querySelector('[data-selection-code="'+code+'"]')?.focus({preventScroll:true}),0);};
  root.addEventListener('mousemove',e=>{const node=e.target.closest('[data-selection-code]');if(node)showTT(selectionPointNote(lookup.get(node.dataset.selectionCode)),e);else hideTT();});
  root.addEventListener('mouseleave',hideTT);
  root.addEventListener('click',e=>{const node=e.target.closest('[data-selection-code]');if(node)pick(node.dataset.selectionCode);});
  root.addEventListener('keydown',e=>{const node=e.target.closest('[data-selection-code]');if(node&&['Enter',' '].includes(e.key)){e.preventDefault();pick(node.dataset.selectionCode);}});
  root.addEventListener('focusin',e=>{const node=e.target.closest('[data-selection-code]');if(node){const rect=node.getBoundingClientRect();showTT(selectionPointNote(lookup.get(node.dataset.selectionCode)),{clientX:rect.left,clientY:rect.top});}});
  root.addEventListener('focusout',hideTT);
 },0);
 return '<div class="chart-wrap selection-scatter">'+svg+'</div><p class="method-note">金色虚线：夏普 = 1。Rf 为年化无风险利率，当前 '+P(selectionRiskFree,2)+'，只影响参考线。'+(sharpeVisible?'':'参考线超出当前坐标范围。')+'描边大点表示当前或选中的基金。</p>';
}
function selectionBody(){
 const lib=library,p=lib.windows[selectionWindow],rows=selectionRows();
 const buttons=Object.entries(lib.windows).map(([k,v])=>'<button type="button" class="seg-dim '+(selectionWindow===k?'active':'')+'" data-selection-window="'+k+'" aria-pressed="'+(selectionWindow===k)+'">'+esc(v.label)+'</button>').join('');
 const legends=Object.keys(lib.sectors).map(k=>'<button type="button" class="selection-legend '+(selectionHidden.has(k)?'off':'')+'" data-selection-sector="'+k+'" aria-pressed="'+!selectionHidden.has(k)+'"><i style="background:'+SELECTION_COLORS[k]+'"></i>'+esc(lib.sectors[k])+'（'+p.counts[k]+'）</button>').join('');
 const current=lib.aliases[CURRENT?.code]||CURRENT?.code,target=p.rows.find(r=>r.code===current);
 const present=target?'当前产品代表份额：'+target.name+'（'+target.code+'）。':'当前基金未进入本窗口：类别不适用，或净值数据不足。';
 return '<div class="selection-windows" role="group" aria-label="基金优选统计区间">'+buttons+'</div>'+
 '<p class="selection-window-note" data-selection-period="'+selectionWindow+'"><b>'+esc(p.label)+'：'+p.start+' ～ '+p.end+'</b> · 有效产品 '+p.n+' 只 · 当前显示 '+rows.length+' 只 · 候选 '+lib.meta.cohort.products+' 只</p>'+
 '<div class="selection-legends" role="group" aria-label="基金类型筛选">'+legends+'<span class="selection-zero-legend"><i></i>0%收益参考线／横轴圆点</span><button type="button" class="selection-legend" data-selection-reset>显示全部类别</button></div>'+
 '<div class="selection-search"><label>基金搜索 <input id="selectionSearch" type="search" placeholder="输入代码或名称" value="'+esc(selectionQuery)+'" data-selection-query></label><button type="button" data-selection-clear>清空搜索</button></div>'+
 '<div class="selection-sharpe-control"><label for="selectionRiskFree">年化无风险利率（Rf） <input id="selectionRiskFree" type="number" step="any" value="'+Number((selectionRiskFree*100).toPrecision(12))+'" data-selection-rf aria-describedby="selectionRiskFreeStatus"> %</label><span class="selection-sharpe-legend"><i aria-hidden="true"></i>夏普 = 1</span><span id="selectionRiskFreeStatus" role="status" aria-live="polite"></span></div>'+
 '<div id="selectionPlot">'+selectionScatter(rows)+selectionDetail(rows)+'</div>'+
 '<p class="method-note" id="selectionCurrentNote">'+esc(present)+'</p>'+
 '<p class="method-note">本窗口未纳入 '+p.excluded+' 只：区间净值不全或成立不足 '+p.exclusion_reasons["区间端点净值缺失／成立不足"]+' 只，日收益数据不足 '+p.exclusion_reasons["有效日收益覆盖不足95%"]+' 只。缺数不纳入。</p>';
}
function refreshSelectionPlot(){
 const lib=library;if(!lib)return;
 const rows=selectionRows(),p=lib.windows[selectionWindow],plot=$id('selectionPlot');if(plot)plot.innerHTML=selectionScatter(rows)+selectionDetail(rows);
 const note=host.querySelector('[data-selection-period]');if(note)note.innerHTML='<b>'+esc(p.label)+'：'+p.start+' ～ '+p.end+'</b> · 有效产品 '+p.n+' 只 · 当前显示 '+rows.length+' 只 · 候选 '+lib.meta.cohort.products+' 只';
}
function switchSelectionWindow(key){
 if(!library?.windows[key])return;
 selectionWindow=key;selectionPicked=null;hideTT();
 const body=$id('selectionBody');if(body)body.innerHTML=selectionBody();
}
function toggleSelectionSector(key){
 selectionHidden.has(key)?selectionHidden.delete(key):selectionHidden.add(key);
 const button=host.querySelector('[data-selection-sector="'+key+'"]');button?.classList.toggle('off',selectionHidden.has(key));button?.setAttribute('aria-pressed',String(!selectionHidden.has(key)));hideTT();refreshSelectionPlot();
}
function resetSelectionCategories(){selectionHidden.clear();const body=$id('selectionBody');if(body)body.innerHTML=selectionBody();}
function searchSelectionFunds(query){selectionQuery=query;selectionPicked=null;hideTT();refreshSelectionPlot();}
function clearSelectionSearch(){selectionQuery="";selectionPicked=null;const input=$id('selectionSearch');if(input)input.value="";hideTT();refreshSelectionPlot();}
function renderFundSelection(d){
 const lib=library;if(!lib)return sub("基金优选","六类基金",'<p class="method-note">尚未加载基金优选数据，请稍后重试。</p>');
 const m=lib.meta;
 return '<p class="tab-lead">六类基金的收益与波动，可按区间、类别或名称筛选。</p>'+
 sub("年化收益率—年化波动率","固定代表份额 · 不合并不同份额净值",'<div id="selectionBody">'+selectionBody()+'</div>')+
 '<div class="selection-data-note"><b>共同截止日 '+m.asof+'</b> · 最新净值日期 '+m.nav_source_last+'。不同类别数据更新进度不同，使用共同日期。</div>';
}

 host.classList.add('fund-selection');
 host.innerHTML=renderFundSelection()+'<div class="selection-tooltip" role="tooltip" hidden></div>';
 const click=e=>{
  const b=e.target.closest('button');if(!b||!host.contains(b))return;
  if(b.dataset.selectionWindow)switchSelectionWindow(b.dataset.selectionWindow);
  else if(b.dataset.selectionSector)toggleSelectionSector(b.dataset.selectionSector);
  else if(b.hasAttribute('data-selection-reset'))resetSelectionCategories();
  else if(b.hasAttribute('data-selection-clear'))clearSelectionSearch();
 };
 const input=e=>{if(e.target.hasAttribute('data-selection-query'))searchSelectionFunds(e.target.value);else if(e.target.hasAttribute('data-selection-rf'))updateSelectionRiskFree(e.target);};
 host.addEventListener('click',click);host.addEventListener('input',input);
 return {destroy(){host.removeEventListener('click',click);host.removeEventListener('input',input);host.innerHTML='';},
   rows:selectionRows,scatter:selectionScatter,setWindow:switchSelectionWindow,
   setQuery:searchSelectionFunds,setRiskFree:updateSelectionRiskFree,toggleSector:toggleSelectionSector,
   state:()=>({window:selectionWindow,query:selectionQuery,picked:selectionPicked,riskFree:selectionRiskFree,hidden:[...selectionHidden]})};
}
let libraryPromise;
function load(options={}){
 if(options.library)return Promise.resolve(options.library);
 if(!libraryPromise){
  const loader=options.loader||(typeof loadDataScript==='function'?loadDataScript:null);
  if(!loader)return Promise.reject(new Error('基金数据加载器未准备好'));
  const version=encodeURIComponent(String(options.version||'1'));
  libraryPromise=loader('https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/fund_selection_library.js?v='+version,'基金优选',()=>{
   const value=root.FUND_SELECTION_LIB;if(value?.schema_version!=='fund_selection.v1'||!value.windows?.['1y'])throw new Error('基金优选数据不完整');return value;
  }).catch(e=>{libraryPromise=null;throw e;});
 }
 return libraryPromise;
}
async function mount(host,options={}){
 if(!host)return false;
 const token={};mounts.get(host)?.instance?.destroy();mounts.set(host,{token});
 host.setAttribute('aria-busy','true');host.innerHTML='<p class="method-note">正在加载基金优选…</p>';
 try{
  const lib=await load(options);if(mounts.get(host)?.token!==token||host.isConnected===false)return false;
  const instance=create(host,lib,options);mounts.set(host,{token,instance});return true;
 }catch(e){
  if(mounts.get(host)?.token!==token)return false;
  host.innerHTML='<p class="method-note">基金优选暂未加载：'+esc(e.message)+'</p><button type="button" data-selection-retry>重试</button>';
  host.querySelector('button').addEventListener('click',()=>mount(host,options));return false;
 }finally{if(mounts.get(host)?.token===token)host.removeAttribute('aria-busy');}
}
root.FundSelection={mount,load,representative,create};
if(typeof module!=='undefined')module.exports=root.FundSelection;
})(typeof window!=='undefined'?window:globalThis);
