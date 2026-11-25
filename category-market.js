/* Category market dashboard. Sources and dates are supplied by the published data slice. */
window.CategoryMarket=(()=>{
const keys={'active-equity':'equity','pure-bond':'pure','hybrid-bond':'hybrid','primary-bond':'first','secondary-bond':'second','convertible-bond':'cb'};
const shell="<style>\n:host{--paper:#f7f6f2;--market-accent:var(--accent,#b01625);--up:#a02b39;--down:#27715c}*{box-sizing:border-box}:host{display:block;margin:0;background:var(--paper);color:var(--ink,#253247);font:inherit;font-size:14px;line-height:1.55;font-variant-numeric:tabular-nums}button,input,select{font:inherit}button,select,summary{cursor:pointer}button,a,select,input,summary{touch-action:manipulation}button:focus-visible,a:focus-visible,select:focus-visible,summary:focus-visible,input:focus-visible{outline:3px solid var(--market-accent);outline-offset:2px}button{border:1px solid #ccc5ba;border-radius:6px;background:#fff;color:var(--market-accent);padding:7px 13px}button:hover{background:#f7f4f0}a{color:var(--market-accent);text-underline-offset:3px}.shell{width:min(1220px,100%);margin:auto;padding:0 32px}.top{background:var(--nav);color:#edf5ef}.top .shell{min-height:52px;display:flex;align-items:center;justify-content:space-between}.brand{font-weight:650;letter-spacing:.05em}.status{font-size:13px;color:#cee0d7}.tabs{display:flex;gap:24px;overflow:auto;scrollbar-width:thin;padding-block:0}.tabwrap{background:#fff;border-bottom:1px solid var(--line,#e3dfd8)}.tabs button{border:0;border-bottom:3px solid transparent;border-radius:0;padding:12px 2px 10px;white-space:nowrap;color:#625b55}.tabs button[aria-pressed=true]{border-color:var(--market-accent);color:var(--ink,#253247);font-weight:700}.mast{margin:25px 0 14px;display:flex;justify-content:space-between;align-items:center;gap:15px}.mast h1{font-size:clamp(26px,4vw,39px);margin:0;letter-spacing:-.05em;font-family:\"Songti SC\",\"STSong\",serif}.period{display:flex;align-items:center;gap:12px}.period small,.muted,.caption,small{color:var(--muted,#625b55)}.seg{display:inline-flex;white-space:nowrap}.seg button{border-radius:0;padding:5px 10px}.seg button:first-child{border-radius:5px 0 0 5px}.seg button:last-child{border-left:0;border-radius:0 5px 5px 0}.seg button[aria-pressed=true]{background:var(--market-accent);color:white}.summary{margin:0 0 12px;font-size:16px;font-weight:500}.cards{display:grid;grid-template-columns:repeat(3,1fr);background:#fff;border:1px solid var(--line,#e3dfd8);border-radius:4px;overflow:hidden}.card{padding:14px 20px;border-left:1px solid var(--line,#e3dfd8)}.card:first-child{border-left:0}.card strong{font-weight:550;font-size:clamp(22px,2.3vw,29px);line-height:1.2;display:block;margin:4px 0;letter-spacing:-.04em}.card .cap{font-weight:600}.up{color:var(--up)}.down{color:var(--down)}.lookup{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0 16px}.lookup label{font-weight:650}.lookup input{width:min(245px,100%);border:1px solid #c9c2b8;border-radius:5px;background:white;padding:6px 10px;color:var(--ink,#253247)}.linkbtn{background:transparent;border:0;text-decoration:underline;text-underline-offset:3px;padding:3px 0}.result{display:none;margin:-5px 0 15px;border-left:3px solid #b01625;padding:8px 12px;background:#f7f4f0}.result.show{display:block}.result button{margin:3px 6px 3px 0}.grid{display:grid;grid-template-columns:1.1fr 1fr;gap:14px;align-items:start}.box{min-width:0;background:#fff;border:1px solid var(--line,#e3dfd8);border-radius:4px;padding:17px 20px;margin-bottom:14px}.box h2{margin:0 0 4px;font-size:18px;font-weight:600;letter-spacing:0}.box h3{margin:8px 0 0;font-size:16px}.caption{margin:0 0 9px;font-size:13px}.legend{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:13px}.legend b{display:inline-block;width:14px;height:3px;vertical-align:middle;margin-right:4px}.chart{width:100%;display:block;max-height:200px}.chart text{font:11px sans-serif;fill:#625b55}.marketlist{margin-top:6px;border-top:1px solid var(--line,#e3dfd8)}.r{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid #eeeae4}.r:last-child{border:0}.r b{white-space:nowrap}.sectorrow{width:100%;border:0;border-radius:0;display:grid;grid-template-columns:minmax(75px,1fr) minmax(50px,1.2fr) 71px;align-items:center;gap:8px;text-align:left;padding:4px;color:var(--ink,#253247);background:none}.sectorrow:hover,.sectorrow[aria-pressed=true]{background:#f7f4f0}.sectorrow strong{text-align:right}.track{height:9px;background:linear-gradient(90deg,transparent 49.6%,#c9c2b8 49.6%,#c9c2b8 50.4%,transparent 50.4%);position:relative}.track i{position:absolute;height:6px;top:2px;border-radius:2px}.pos{left:50%;background:#b66b5c}.neg{right:50%;background:#75a58e}details{margin-top:10px}summary{color:var(--market-accent);font-weight:550}.detailscopy{font-size:14px;color:var(--muted,#625b55);margin:7px 0}.fofhead{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end}.fofhead label{font-size:13px;color:var(--muted,#625b55)}select{padding:5px 8px;border:1px solid #ccc5ba;border-radius:4px;background:white;color:var(--ink,#253247)}table{border-collapse:collapse;text-align:left;width:100%;font-size:14px}th{color:#4b625c;font-size:13px}td,th{border-bottom:1px solid #e4e9e3;padding:7px 5px}td:first-child,th:first-child{padding-left:0}.tablewrap{max-width:100%;overflow-x:auto}.smalltbl{min-width:530px}.tip{background:#edf3ed;border-radius:5px;padding:9px 12px;margin:9px 0}.peek{max-width:100%;height:auto;display:block;margin-top:12px;border:1px solid var(--line,#e3dfd8)}.tail{margin:10px 0 34px}.tail details{border-top:1px solid var(--line,#e3dfd8);padding:10px 0}.rail{display:flex;gap:12px;flex-wrap:wrap}.chip{display:inline-block;font-size:13px;margin-right:12px;color:var(--muted,#625b55)}.mono{font-variant-numeric:tabular-nums}.kicker{color:var(--market-accent);font-size:12px;letter-spacing:.08em;font-weight:650;margin-bottom:2px}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.two>div{min-width:0}.endnote{font-size:13px;color:var(--muted,#625b55);margin:8px 0 0}.rule{height:1px;border:0;background:var(--line,#e3dfd8);margin:9px 0}.tail img{max-width:100%}.subfoot{font-size:13px;margin:4px 0 0;color:var(--muted,#625b55)}\n@media(max-width:820px){.shell{padding:0 18px}.grid{grid-template-columns:1fr 1fr}.period{flex-direction:column-reverse;gap:2px;align-items:flex-end}.card{padding:11px 12px}.box{padding:14px}.tabs{gap:20px}}@media(max-width:680px){.shell{padding:0 14px}.tabs{gap:15px}.mast{align-items:flex-start;gap:6px;margin:19px 0 8px}.summary{font-size:16px}.cards{grid-template-columns:repeat(3,minmax(0,1fr))}.card{padding:10px 7px}.card .cap,.card small{font-size:12px;line-height:1.35;display:block}.card strong{font-size:23px}.grid{grid-template-columns:1fr;gap:0}.box{margin-bottom:10px}.lookup{gap:6px 10px}.lookup input{flex:1;min-width:120px;width:125px}.lookup label,.lookup button{font-size:13px}.caption{margin-bottom:6px}.two{grid-template-columns:1fr}.period small{font-size:11px}.status{font-size:12px}.fofhead{align-items:start}.chart{max-height:185px}.smalltbl{min-width:490px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}\n.range{font-size:.72em;white-space:normal}.range em{font-size:.65em;font-weight:500;font-style:normal;color:var(--muted,#625b55)}@media(max-width:680px){.range{line-height:1.45;display:block}} @media(max-width:680px){.mast{display:block}.period{flex-direction:row-reverse;align-items:center;justify-content:space-between;margin-top:7px}.period small{white-space:nowrap;font-size:12px}.range{font-size:.66em}.cards .cap{min-height:2.7em}} \n.eqhead{display:flex;align-items:baseline;justify-content:space-between;gap:4px 12px;flex-wrap:wrap;margin-bottom:4px}\n.eqhead h2{margin:0}\n.eqhead .add-index{white-space:nowrap}\n#market-cross{width:100%;display:block;touch-action:pan-y;cursor:crosshair;overflow:visible}\n#market-cross:focus-visible{outline:2px solid #496d81;outline-offset:2px}\n#market-cross text{font:12px -apple-system,sans-serif;fill:#625b55}\n#cross-guides line{stroke:#625b55;stroke-width:1;stroke-dasharray:4 3}\n#cross-guides rect{fill:#253247}\n#cross-guides text{fill:white;font-size:11px}\n.eqread{margin:10px 0 7px}\n.eqdate{display:flex;align-items:baseline;justify-content:space-between;gap:8px;color:var(--muted,#625b55);font-size:12px}\n.eqvalues{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,125px),1fr));gap:6px 0;list-style:none;margin:4px 0 0;padding:6px 0;border-block:1px solid var(--line,#e3dfd8)}\n.eqvalues li{display:flex;min-width:0;flex-direction:column;justify-content:space-between;padding:0 8px;border-inline-start:1px solid var(--line,#e3dfd8)}\n.eqvalues li:first-child{border-inline-start:0}\n.eqvalues span{font-size:13px;line-height:1.4;overflow-wrap:anywhere}\n.eqvalues .index-qualifier{display:inline-block;white-space:nowrap}.eqvalues i{display:inline-block;vertical-align:middle;width:12px;height:3px;margin-inline-end:5px}\n.eqvalues b{margin-top:3px;font-size:16px;line-height:1.25;white-space:nowrap;font-variant-numeric:tabular-nums}\n.seg button+button{border-left:0}\n@media(max-width:680px){.eqhead h2{font-size:18px}.period{gap:6px}.period small{font-size:11px}.seg button{padding:5px 7px}}\n@media(max-width:680px){#market-cross text{font-size:15px}#cross-guides text{font-size:12px}} .mixed-nav{display:flex;gap:4px;margin:16px 0 0}.mixed-nav[hidden]{display:none}.mixed-nav button{font-size:14px;padding:6px 14px}.mixed-nav button[aria-pressed=true]{background:var(--market-accent);color:#fff;border-color:var(--market-accent)}.mixed-choices{display:grid;grid-template-columns:1fr 1fr;gap:16px}.mixed-choice .choice-ret{font-size:28px}.mixed-choice button{margin-top:10px;background:var(--market-accent);color:#fff;border:1px solid var(--market-accent)}.mixed-choice .caption{margin-bottom:4px}.mixed-choice{margin-bottom:0}.mixed-choices{margin-bottom:16px}.add-index{font-size:13px;color:var(--muted,#625b55);display:inline-flex;align-items:center;gap:5px;cursor:pointer}.add-index input{accent-color:var(--market-accent)}.mixed-nav+.mast{margin-top:16px}#title:focus{outline:0}#body>.eqmarket #market-cross{max-height:250px} @media(max-width:680px){.mixed-choices{grid-template-columns:1fr;gap:8px}.mixed-choice{padding:11px 13px}.mixed-choice button{margin-top:5px}.mixed-nav{margin:10px 0 0}.mixed-choice .choice-ret{font-size:24px}}  .shell{max-width:none;width:100%;padding:0}.mast{margin-top:6px}.mast h1{display:none}:host{background:transparent}\n/* Follow the workbench navigation and table controls inside the shadow root. */\n.mast{justify-content:flex-end;margin:10px 0 12px}\n.period{align-items:center}\n.seg,.mixed-nav{gap:6px}\n.seg button,.seg button:first-child,.seg button:last-child,.mixed-nav button{\n  color:var(--muted,#625b55);background:transparent;border:0;border-radius:0;\n  border-bottom:2px solid transparent;padding:5px 8px;font-size:13px\n}\n.seg button[aria-pressed=true],.mixed-nav button[aria-pressed=true]{\n  background:transparent;color:var(--market-accent);border-color:var(--market-accent);font-weight:600\n}\n.cards{border:0;border-radius:0;border-block:1px solid var(--line,#e3dfd8);padding-block:10px}\n.card{padding:2px 16px}.card:first-child{padding-left:0}.card strong{font-variant-numeric:tabular-nums}\n.lookup input,select{border-radius:3px}\n.box{padding:16px}.smalltbl th{color:var(--muted,#625b55);background:#f7f5f1}\n.seg button:focus-visible,.mixed-nav button:focus-visible{outline-offset:-2px}\n@media(max-width:680px){.mast{display:block}.period{align-items:center;flex-wrap:wrap}.card{padding:2px 7px}.box{padding:12px}.cards .cap{min-height:2.7em}}\n@media(max-width:480px){\n  .eqvalues{grid-template-columns:repeat(2,minmax(0,1fr))}\n  .eqvalues li:nth-child(odd){border-inline-start:0}\n  .cards{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:8px;padding-block:8px}\n  .cards .cap{min-height:0}\n  .cards .card:last-child{grid-column:1/-1;display:grid;grid-template-columns:auto 1fr;align-items:baseline;gap:2px 8px;border-left:0;border-top:1px solid var(--line,#e3dfd8);padding:6px 0 0}\n  .card:last-child strong{white-space:nowrap;text-align:right;margin:0}\n  .card:last-child small{grid-column:1/-1}\n  .card:last-child .range{font-size:17px}\n}\n:host, :host *{font-family:var(--dashboard-font,sans-serif)!important}:host h2{font-size:var(--dashboard-card-size,18px);font-weight:600;line-height:1.45}.holding-value,.holding-sample{display:block;font-variant-numeric:tabular-nums;white-space:nowrap}.holding-sample{font-size:12px;color:var(--muted,#625b55);line-height:1.45;margin-top:2px}.holding-low{font-weight:600;color:var(--ink,#253247)}.holdings-table th:not(:first-child),.holdings-table td:not(:first-child){text-align:right}.holdings-table td{vertical-align:top}@media(max-width:680px){.holdings-table th,.holdings-table td{padding-inline:7px}.holdings-table th{white-space:normal}.holdings-table td:first-child{white-space:normal}.holding-sample{font-size:12px}}</style><main class=\"shell\"><nav id=\"mixed-nav\" class=\"mixed-nav\" aria-label=\"混合债基子类\" hidden></nav><div class=\"mast\"><h1 id=\"title\" tabindex=\"-1\"></h1><div class=\"period\"><small id=\"dates\"></small><span class=\"seg\" role=\"group\" aria-label=\"全页观察区间\"></span></div></div><div id=\"body\"></div></main>";
function render(host,root,data,initial,previousPeriod,carry,onSubtype){
const names={equity:'主动权益',pure:'纯债',hybrid:'混合债基',first:'一级债基',second:'二级债基',cb:'转债基金'};
const funds={equity:'主动权益基金',pure:'纯债基金',first:'一级债基',second:'二级债基',cb:'转债基金',hybrid:'混合债基'};
const groupLabels=['收益前20%','前20%～40%','中间20%','后20%～40%','收益后20%'];
const lookupExamples={equity:'000541',pure:'000015',first:'000014',hybrid:'000014'};
const bonds='CBA00101.CS',cb='000832.SH',large='000300.SH',small='000852.SH',red='000922.CSI';
const categories={equity:[large,small,red,'000001.SH'],pure:[bonds,'CBA00601.CS','CBA02001.CS'],first:[bonds,cb],second:[bonds,cb,large],hybrid:[bonds,cb,large],cb:[cb,'000906.SH',bonds]};
const color=['#39587c','#ad7337','#756790','#a23445'];
let k=initial, industry='', chosen=carry;
let period=previousPeriod;
const shanghai='000001.SH';
const showShanghai={pure:false,first:false,second:true,hybrid:true,cb:true};
const mixed=()=>['hybrid','first','second'].includes(k);
const plottedCodes=()=>k==='equity'||!showShanghai[k]?categories[k]:[...categories[k],shanghai];
const chartTitle={equity:'上证、大小盘与红利走势',pure:'综合债市、国债与企业债走势',hybrid:'一级、二级共同面对的市场',first:'普通债与转债走势',second:'普通债、转债与股票走势',cb:'转债、股票与普通债走势'};
const extraIndices=()=>k==='equity'?['000905.SH','399006.SZ','000688.SH','HSI.HI']:k==='cb'?[]:['CBA07501.CS','CBA01201.CS','CBA00601.CS','CBA02001.CS'].filter(c=>!categories[k].includes(c));
const $=s=>root.querySelector(s),w=()=>data.windows[period],g=()=>w().groups[k],idx=c=>w().baseline[c],T=n=>Number(n).toLocaleString('zh-CN'),valid=Number.isFinite;
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const pc=(v,sign=true,dp=2)=>valid(v)?((v<0?'−':sign&&v>0?'+':'')+Math.abs(v*100).toFixed(dp)+'%'):'暂无';
const pp=v=>(v<0?'−':v>0?'+':'')+Math.abs(v*100).toFixed(2)+' 个百分点';
const tint=v=>v<0?'down':v>0?'up':'';
const ink=v=>`<b class="${tint(v)}">${pc(v)}</b>`;
const row=(a,b)=>`<div class="r"><span>${a}</span><b>${b}</b></div>`;
const note=s=>`<p class="endnote">${s}</p>`;
const card=(cap,value,sub,cls='')=>`<div class="card"><span class="cap">${cap}</span><strong class="${cls}">${value}</strong><small>${sub}</small></div>`;
const box=(h,desc,inner)=>`<section class="box"><h2>${h}</h2><p class="caption">${desc}</p>${inner}</section>`;
const date=d=>d.slice(5);
const focusIndustry=()=>Object.entries(g().bins[0].industries).sort(([a,x],[b,y])=>Math.abs(y-g().bins[4].industries[b])-Math.abs(x-g().bins[4].industries[a]))[0]?.[0]||'银行';
function chart(series){
 const pts=series.flatMap(q=>q.points),v=pts.map(x=>x[1]*100),min=Math.floor(Math.min(0,...v)*10)/10,max=Math.ceil(Math.max(0,...v)*10)/10,h=max-min||1;
 const start=Date.parse(w().start),end=Date.parse(data.end),x=d=>49+451*(Date.parse(d)-start)/(end-start),y=n=>11+120*(max-n)/h;
 const ticks=[max,(max+min)/2,min];
 return `<div class="legend">${series.map((s,i)=>`<span><b style="background:${color[i]}"></b>${esc(s.name)}</span>`).join('')}</div><svg class="chart" viewBox="0 0 525 155" role="img" aria-label="所选区间累计涨跌幅，起点为零。区间结果见数据表"><title>${series.map(s=>s.name+' '+pc(s.points.at(-1)[1])).join('，')}</title>${ticks.map(a=>`<line x1="49" x2="500" y1="${y(a)}" y2="${y(a)}" stroke="#dce4de"/><text x="1" y="${y(a)+4}">${a.toFixed(1)}%</text>`).join('')}${series.map((s,i)=>`<polyline fill="none" stroke="${color[i]}" stroke-width="2.8" stroke-linejoin="round" points="${s.points.map(([d,n])=>x(d)+','+y(n*100)).join(' ')}"/>`).join('')}<text x="49" y="151">${date(w().start)}</text><text x="465" y="151">${date(data.end)}</text></svg>`;
}
function market(){
 const more=extraIndices();
 const series=plottedCodes().map(code=>({...idx(code),name:code==='000001.SH'?'上证指数':idx(code).name}));
 const prices=series.flatMap(s=>s.points.map(p=>p[1]));
 const lo=Math.min(0,...prices),hi=Math.max(0,...prices);
 const raw=(hi-lo||.01)/4,unit=10**Math.floor(Math.log10(raw));
 const step=([1,2,2.5,5,10].find(v=>v>=raw/unit)||10)*unit;
 const bottom=Math.floor(lo/step)*step,top=Math.max(bottom+step,Math.ceil(hi/step)*step);
 const width=540,left=53,right=515,upper=13,lower=174;
 const dates=series[0].points.map(p=>p[0]),n=dates.length;
 const x=i=>left+(right-left)*i/(n-1),y=v=>lower-(v-bottom)/(top-bottom)*(lower-upper);
 const grid=[];
 for(let i=0;i<=Math.round((top-bottom)/step);i++){
   const val=bottom+i*step,yy=y(val);
   grid.push(`<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="${Math.abs(val)<1e-9?'#bcb6ac':'#e8e4de'}"/><text x="${left-6}" y="${yy+4}" text-anchor="end">${Math.abs(val)<1e-9?'0':Number((val*100).toFixed(2))}%</text>`);
 }
 const ticks=[0,Math.round((n-1)/3),Math.round((n-1)*2/3),n-1].map(i=>`<text x="${x(i)}" y="195" text-anchor="middle">${date(dates[i])}</text>`);
 const lines=series.map((s,j)=>`<polyline class="index-line" points="${s.points.map((p,i)=>x(i).toFixed(2)+','+y(p[1]).toFixed(2)).join(' ')}" fill="none" stroke="${color[j]}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
 const indexName=name=>esc(name).replace(/（[^（）]+）$/,qualifier=>`<wbr><span class="index-qualifier">${qualifier}</span>`);
 const readout=series.map((s,j)=>`<li><span><i aria-hidden="true" style="background:${color[j]}"></i>${indexName(s.name)}</span><b class="${tint(s.ret)}">${pc(s.ret)}</b></li>`).join('');
 const shanghaiToggle=k==='equity'?'':`<label class="add-index"><input type="checkbox" id="with-shanghai" ${showShanghai[k]?'checked':''}> 对照上证指数</label>`;
 const markers=series.map((s,j)=>`<circle r="4" fill="${color[j]}" stroke="white" stroke-width="1.5"/>`).join('');
 return `<section class="box eqmarket" id="market-chart"><div class="eqhead"><h2>${chartTitle[k]}</h2>${shanghaiToggle}</div>
   <p class="caption">${dates[0]} 至 ${dates[n-1]} · 从起点收盘起累计涨跌</p>
   <div class="eqread"><div class="eqdate"><strong id="read-title">区间收盘</strong><time id="read-date">${dates[n-1]}</time></div>
     <ul class="eqvalues" role="list" aria-label="所选日期各指数累计涨跌">${readout}</ul></div>
   <svg id="market-cross" viewBox="0 0 ${width} 200" tabindex="0" role="slider" aria-label="指数走势，逐交易日查看" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${n}" aria-describedby="cross-hint" data-plot="${[left,right,upper,lower,bottom,top].join(',')}">${grid.join('')}${lines}${ticks.join('')}<g id="cross-guides" display="none" pointer-events="none"><line class="cross-v" y1="${upper}" y2="${lower}"/><line class="cross-h" x1="${left}" x2="${right}"/>${markers}<g class="cross-x-label"><rect x="-32" y="0" width="64" height="17" rx="3"/><text text-anchor="middle" y="12"/></g><g class="cross-y-label"><rect x="0" y="-8" width="51" height="16" rx="3"/><text x="48" y="4" text-anchor="end"/></g></g></svg>
   <p class="endnote" id="cross-hint">移动鼠标、在图中横向拖动或使用 ← → 键，查看同一天的累计涨跌。</p>${more.length?`<details><summary>更多${k==='equity'?'宽基、板块与港股':'债券指数'}</summary>${more.map(c=>row(esc(idx(c).name)+' · 区间收盘',ink(idx(c).ret))).join('')}</details>`:''}</section>`;
}
function wireMarket(){
 const svg=$('#market-cross');if(!svg)return;
 const codes=plottedCodes(),series=codes.map(idx), dates=series[0].points.map(p=>p[0]),last=dates.length-1;
 const [left,right,upper,lower,min,max]=svg.dataset.plot.split(',').map(Number);
 const x=i=>left+(right-left)*i/last,y=v=>lower-(v-min)/(max-min)*(lower-upper);
 const clamp=(z,a,b)=>Math.max(a,Math.min(b,z));
 const guides=$('#cross-guides'),vertical=guides.querySelector('.cross-v'),horizontal=guides.querySelector('.cross-h');
 const dots=[...guides.querySelectorAll('circle')], values=[...root.querySelectorAll('.eqvalues b')];
 const axisTicks=[...svg.querySelectorAll(':scope > text')];
 const xLabel=guides.querySelector('.cross-x-label'),yLabel=guides.querySelector('.cross-y-label');
 let selected=last,activePointer=null;
 function show(i,py,active=true){
   selected=clamp(i,0,last);
   const xx=x(selected),ys=series.map(s=>y(s.points[selected][1]));
   const nearest=py==null?0:ys.reduce((best,v,j)=>Math.abs(v-py)<Math.abs(ys[best]-py)?j:best,0);
   const yy=ys[nearest];
   const day=dates[selected];
   guides.setAttribute('display',active?'inline':'none');
   for(const attr of ['x1','x2'])vertical.setAttribute(attr,xx);
   for(const attr of ['y1','y2'])horizontal.setAttribute(attr,yy);
   xLabel.setAttribute('transform',`translate(${clamp(xx,left+6,right-8)},179)`);
   xLabel.querySelector('text').textContent=date(day);
   yLabel.setAttribute('transform',`translate(0,${yy})`);
   yLabel.querySelector('text').textContent=pc(series[nearest].points[selected][1]);
   for(const tick of axisTicks){
     const xTick=tick.getAttribute('text-anchor')==='middle';
     const intersects=xTick?Math.abs(Number(tick.getAttribute('x'))-clamp(xx,left+6,right-8))<54:Math.abs(Number(tick.getAttribute('y'))-4-yy)<16;
     tick.style.visibility=active&&intersects?'hidden':'visible';
   }
   $('#read-title').textContent=active?'十字线读数':'区间收盘';
   $('#read-date').textContent=day;
   const spoken=[];
   series.forEach((s,j)=>{
     const ret=s.points[selected][1];
     dots[j].setAttribute('cx',xx);dots[j].setAttribute('cy',ys[j]);dots[j].setAttribute('r',j===nearest?5.4:4);
     values[j].textContent=pc(ret);values[j].className=tint(ret);
     spoken.push((codes[j]===shanghai?'上证指数':s.name)+' '+pc(ret));
   });
   svg.setAttribute('aria-valuenow',String(selected+1));
   svg.setAttribute('aria-valuetext',day+'，'+spoken.join('，'));
 }
 function point(e){
   const matrix=svg.getScreenCTM();if(!matrix)return;
   const st=svg.createSVGPoint();st.x=e.clientX;st.y=e.clientY;
   const p=st.matrixTransform(matrix.inverse());
   const i=Math.round(clamp((p.x-left)/(right-left),0,1)*last);
   show(i,p.y);
 }
 svg.addEventListener('pointerdown',e=>{
   if(!e.isPrimary||e.button!==0)return;
   activePointer=e.pointerId;svg.setPointerCapture(e.pointerId);point(e);
 });
 svg.addEventListener('pointermove',e=>{
   if(e.isPrimary&&(e.pointerType==='mouse'||e.pointerId===activePointer))point(e);
 });
 svg.addEventListener('pointerup',e=>{
   if(e.pointerId===activePointer){point(e);activePointer=null;}
 });
 svg.addEventListener('pointercancel',()=>{activePointer=null;show(last,null,false);});
 svg.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&activePointer===null)show(last,null,false);});
 svg.addEventListener('focus',()=>show(selected));
 svg.addEventListener('blur',()=>show(last,null,false));
 svg.addEventListener('keydown',e=>{
   const keys={Home:0,End:last,ArrowLeft:selected-1,ArrowRight:selected+1};
   if(Object.hasOwn(keys,e.key)){e.preventDefault();show(keys[e.key]);}
   if(e.key==='Escape')show(last,null,false);
 });
 show(last,null,false);
}

function sectors(){
 const list=Object.entries(w().industries).sort((a,b)=>b[1].ret-a[1].ret),limit=Math.max(...list.map(a=>Math.abs(a[1].ret)))||1;
 const r=([n,o])=>`<button class="sectorrow" data-ind="${esc(n)}" aria-pressed="${industry===n}"><span>${esc(n)}</span><span class="track"><i class="${o.ret<0?'neg':'pos'}" style="width:${Math.abs(o.ret)/limit*49}%"></i></span><strong class="${tint(o.ret)}">${pc(o.ret)}</strong></button>`;
 return box('哪些行业收益靠前，哪些靠后？',`30 个中信一级行业的 A 股等权样本 · ${list.filter(a=>a[1].ret>0).length} 个上涨`,list.slice(0,3).map(r).join('')+'<hr class="rule">'+list.slice(-3).map(r).join('')+`<details id="sectorMore"><summary>展开中间 24 个行业</summary>${list.slice(3,-3).map(r).join('')}</details>`+note('点行业可联动下方走势与基金持仓。行业涨跌按可得成分股等权计算。'));
}
function holdingCell(value, known, total, asYears=false){
 const enoughData=known>0&&valid(value);
 const label=!enoughData?'暂无数据':asYears?value.toFixed(2)+' 年':pc(value,false);
 const lowCoverage=known>0&&known*2<total;
 return `<span class="holding-value">${label}</span><small class="holding-sample${lowCoverage?' holding-low':''}">有效 ${T(known)} / ${T(total)} 只${lowCoverage?'<br>覆盖不足半数':''}</small>`;
}
function equityEvidence(){
 const b=g().bins,n=industry,o=w().industries[n];
 return `<section class="box" id="evidence"><div class="fofhead"><div><div class="kicker">基金持仓</div><h2>收益靠前和靠后的基金，此前重仓什么？</h2></div><label>查看行业 <select id="chooseInd">${Object.keys(w().industries).sort((a,b)=>a.localeCompare(b,'zh')).map(s=>`<option ${s===n?'selected':''}>${esc(s)}</option>`).join('')}</select></label></div><div class="tip">${esc(n)}股票样本同期 ${pc(o.ret)}。收益前、后两组此前披露的${esc(n)}重仓分别占基金净资产 <b>${pc(b[0].industries[n],false)}</b> 和 <b>${pc(b[4].industries[n],false)}</b>。</div><p class="caption">按全部有效基金区间收益排序。行业重仓占基金净资产，取组内均值。前十大集中度取组内中位数。持仓报告期 ${w().period}。</p><div class="tablewrap" tabindex="0" aria-label="收益分组与披露持仓"><table class="smalltbl holdings-table"><thead><tr><th>收益分组</th><th>收益中位数</th><th>${esc(n)}重仓占净资产</th><th>前十大集中度</th></tr></thead><tbody>${b.map((v,i)=>`<tr><td>${groupLabels[i]}</td><td>${ink(v.mid)}</td><td>${holdingCell(v.industries[n],v.known,v.n)}</td><td>${holdingCell(v.metrics.conc.v,v.metrics.conc.n,v.n)}</td></tr>`).join('')}</tbody></table></div><details id="stockproof"><summary>两端组最常见的重仓股</summary><div class="two">${[0,4].map(i=>`<div><h3>${groupLabels[i]}</h3>${b[i].common.map(s=>row(esc(s.name),T(s.n)+' / '+T(b[i].known)+' 只持有')).join('')}</div>`).join('')}</div></details><details id="sectortrend"><summary>看${esc(n)}的逐日走势与样本覆盖</summary>${chart([{name:n+'等权样本',points:o.points},idx(large)])}<p class="endnote">各日可得成分股比例最低 ${pc(o.minCoverage,false,1)}。季报只列前十大，未列某行业时仅在披露重仓中计零；基金可能在报告期之后调仓。持仓差异提供核查线索，实际收益贡献还取决于区间持仓和交易。</p></details></section>`;
}
function subtype(){
 const explain={first:'债券为主，先看普通债底仓与转债带来的波动。',second:'可直接配置股票，除了债券和转债，还要看股市波动。'};
 return '<div class="mixed-choices">'+['first','second'].map(id=>{
   const group=w().groups[id];return `<section class="box mixed-choice"><h2>${names[id]}</h2><p class="caption">${explain[id]}</p><strong class="choice-ret ${tint(group.mid)}">${pc(group.mid)}</strong> <span class="caption">收益中位数</span>${row('中间六成基金收益',pc(group.lo)+' 至 '+pc(group.hi))}${row('取得正收益',group.up+' / '+T(group.n)+' 只')}<small>有效收益样本 ${T(group.n)} / 目录 ${T(group.total)} 只</small><br><button data-jump="${id}">进入${names[id]} →</button></section>`;
 }).join('')+'</div>';
}
function debtMarket(){
 const d=w(),a=g();
 if(k==='pure'){
   if(!d.yields?.every(r=>Number.isFinite(r?.[2])&&Number.isFinite(r?.[4])))return box('国债收益率','本窗口缺少可比收益率。','');const [y,z]=d.yields;return box('短债和中长期纯债都这样吗？','基金按正式站子类分别统计。',Object.entries(a.sub).map(([n,s])=>row(n,ink(s.mid)+' · '+s.up+'/'+s.n+' 只上涨')).join('')+'<hr class="rule">'+row('1 年国债收益率',z[4].toFixed(3)+'%')+row('10 年国债收益率',z[2].toFixed(3)+'%')+note(`10 年期收益率从 ${y[2].toFixed(3)}% 变至 ${z[2].toFixed(3)}%，变动 ${((z[2]-y[2])*100).toFixed(2)} 个基点。其他条件相同时，利率上行对久期长的债券价格影响更大。`));
 }
 if(k==='cb'){
   if(!d.cbPrice?.every(Boolean)||!d.cbPremium?.every(Boolean))return box('转债价格与溢价','本窗口缺少可核对的期初或期末样本。','');const [p,q]=d.cbPrice,[u,v]=d.cbPremium;return box('转债价格和溢价怎么变？',`固定样本 ${v[2]} 只转债，区间内持续有行情。`,row('价格中位数',p[1].toFixed(2)+' → '+q[1].toFixed(2)+' 元')+row('转股溢价率中位数',pc(u[1],false)+' → '+pc(v[1],false))+row('溢价率变化',pp(v[1]-u[1]))+note('转股溢价表示买入转债比按当日正股价值换股多付的比例。样本按全段行情可得性固定，覆盖范围小于全部上市转债。'));
 }
 const refs=k==='first'?[bonds,cb]:[bonds,cb,large];
 return box(k==='first'?'一级债基与普通债、转债表现如何？':'股票、转债的波动传到了基金吗？','对照同一窗口的基金收益分布和市场回报。',row('基金收益中位数',ink(a.mid))+row('中间六成基金的收益',pc(a.lo)+' 至 '+pc(a.hi))+row('获得正收益',T(a.up)+' / '+T(a.n)+' 只')+note(refs.map(c=>idx(c).name+' '+pc(idx(c).ret)).join('，')+'。各基金持有的资产比例会影响净值反应。'));
}
function debtEvidence(){
 const s=g(),b=s.bins;
 const spec=k==='pure'?[['duration','期初估计久期']]:k==='first'?[['conv','转债占净资产']]:[['conv','转债占净资产'],['stock','股票占净资产']];
 const cols=spec.filter(([key])=>b.some(v=>v.metrics[key].n));
 const title={pure:'收益靠前的纯债基金，期初久期有多长？',first:'哪些收益组在期初披露了更多转债？',second:'两端基金的股票和转债暴露差多少？',cb:'不同收益组的转债基金，期初持仓有何差异？'}[k];
 const detail=cols.length?(k==='pure'?'久期为区间起点的净值模型估计，单位为年。':`仓位报告期 ${w().bondPeriod}，按期初可核对的披露统计。`)+' 每格显示中位数，下方为有效只数 / 组内总数。':`本窗口起点 ${w().start} 。当前样本缺少可核验的同期资产记录，以下展示净值分布。`;
 return box(title,detail,`<div class="tablewrap" tabindex="0" aria-label="收益分组与持仓指标"><table class="holdings-table"><thead><tr><th>收益分组</th><th>组内只数</th><th>收益中位数</th>${cols.map(c=>`<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${b.map((v,i)=>`<tr><td>${groupLabels[i]}</td><td>${v.n}</td><td>${ink(v.mid)}</td>${cols.map(([key])=>{const m=v.metrics[key];return `<td>${holdingCell(m.v,m.n,v.n,key==='duration')}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>`+note(k==='pure'?'净值对利率的敏感程度可用于解释不同基金为何涨跌有别。估计久期与实际持仓久期可能有差异。':'缺失仓位不按零处理。覆盖较少的组尤其需要回到单基金报告复核。'));
}
function top(){
 const a=g(), share=a.n>0?a.up/a.n:null;
 const code=k==='equity'?large:k==='cb'?cb:bonds;
 const base=idx(code)?.ret;
 const label=k==='equity'?'沪深300':k==='cb'?'中证转债':'中债新综合财富（总值）';
 const secondary=k==='equity'?['中证1000',small]:k==='cb'?['中证800','000906.SH']:mixed()?['中证转债',cb]:null;
 let line=`${label} ${pc(base)}`;
 if(secondary) line+=`，${secondary[0]} ${pc(idx(secondary[1])?.ret)}`;
 if(valid(a.mid)&&valid(base)){
   const difference=a.mid-base, gap=Math.abs(difference*100).toFixed(2);
   line+=Number(gap)===0?`。同类基金收益中位数与${label}基本持平。`:
     `。同类基金收益中位数比${label}${difference>0?'高':'低'} ${gap} 个百分点。`;
 } else line+='。';
 const cards=card('同类基金收益中位数',pc(a.mid),`有效 ${T(a.n)} / ${T(a.total)} 只`,tint(a.mid))+card('正收益基金占比',pc(share,false,1),`${T(a.up)} 只取得正收益`)+card('中间六成基金的收益',`<span class="range">${pc(a.lo)} <em>至</em> ${pc(a.hi)}</span>`,'排除两端各 20% 后的范围');
 return `<p class="summary">${line}</p><div class="cards">${cards}</div>`;
}
function searchBox(){
 const example=lookupExamples[k]||g().members[Math.floor(g().members.length/2)][0].slice(0,6);
 return `<div class="lookup"><label for="lookup">${k==='hybrid'?'我的基金属于哪一类？':'我的基金在什么位置？'}</label><input type="search" id="lookup" placeholder="输入基金名称或代码" autocomplete="off"><button class="linkbtn" id="example" data-q="${esc(example)}">试查 ${esc(example)}</button></div><div id="result" class="result" aria-live="polite"></div>`;
}
function showSearch(query){
 const out=$('#result'),members=k==='hybrid'?data.hybridDirectory:g().members;
 if(!query.trim()){out.className='result';out.innerHTML='';return;}
 const matches=members.filter(r=>r[0].toLowerCase().includes(query.trim().toLowerCase())||r[1].includes(query.trim()));
 out.className='result show';
 if(!matches.length){
   if(k==='first'||k==='second'){
     const exact=data.hybridDirectory.find(r=>r[2]===k&&(r[0]===query.toUpperCase()||r[0].split('.')[0]===query||r[1]===query));
     if(exact){out.innerHTML=`<strong>${esc(exact[1])}</strong> · ${names[k]}。本窗口缺少有效起止净值，同类分组暂无。 <a href="fund.html?code=${encodeURIComponent(exact[0])}">查看基金详情 →</a>`;return;}
   }
   if(k==='hybrid'){out.textContent='混合债基当前目录中没有匹配基金。可尝试基金简称或代表份额代码。';return;}
   out.textContent='当前分类、所选区间的有效样本中没有匹配基金。可尝试简称、六位代码或切换分类。';return;}
 if(matches.length>1){out.innerHTML=`匹配 ${T(matches.length)} 只。${matches.slice(0,6).map(r=>`<button data-find="${esc(r[0])}">${esc(r[1])} · ${esc(r[0])}</button>`).join('')}`;return;}
 const r=matches[0];
 if(k==='hybrid'){
   out.innerHTML=`<strong>${esc(r[1])}</strong> · ${esc(r[0])} · ${names[r[2]]}　<button data-jump="${r[2]}" data-carry="${esc(r[0])}">进入${names[r[2]]}查看这只基金 →</button>`;return;
 }
 const diff=r[2]-g().mid;
 out.innerHTML=`<strong>${esc(r[1])}</strong> · ${esc(r[0])}　区间收益 ${ink(r[2])}，位于<strong>${groupLabels[r[3]]}</strong>。比${funds[k]}中位数${diff>=0?'高':'低'} ${Math.abs(diff*100).toFixed(2)} 个百分点。${r[4]?.length?`<br>${w().period} 披露重仓中，占净资产较高的行业为 ${r[4].map(([n,v])=>esc(n)+' '+pc(v,false)).join('、')}。`:''} <a href="fund.html?code=${encodeURIComponent(r[0])}">查看基金详情 →</a>`;
}
function modelOverview(){
 const equity=k==='equity', win=w();
 if(!(equity?win.equityModels:win.bondModels))return '';
 const e=win.equityModels, bond=win.bondModels;
 const table=(headers,rows)=>`<div class="tablewrap" tabindex="0" aria-label="可横向滚动的数据表"><table><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(cells=>`<tr>${cells.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 const unit=v=>valid(v)?v.toFixed(2)+' 年':'—';
 const scope=(win.bondPeriod||'暂无')+' 报告期、期初已知净资产加权。当前目录回看，两端使用同一组基金。';
 const periods=data.disclosureEvidence?.periods || [];
 const backtest=periods.length?`<details><summary>估算与实际披露相差多少？（至 ${esc(periods.at(-1).date)}）</summary>${equity?
  table(['报告期','配对基金','全市场配置偏差','单只平均偏差'],periods.slice().reverse().map(v=>[esc(v.date),T(v.equityN),v.totalVariation.toFixed(2)+' 个百分点',v.fundMean.toFixed(2)+' 个百分点'])):
  table(['报告期','原报告复核只数','久期偏差','扩展字段只数','扩展字段偏差'],periods.slice().reverse().map(v=>[esc(v.date),T(v.bondN),unit(v.bondBias),T(v.extendedN),unit(v.extendedBias)]))}
  ${note(equity?'30 个已映射 A 股行业权重归一后，与半年报或年报完整持仓比较。配置偏差为各行业权重差绝对值之和的一半。市场汇总会抵消不同基金的偏差。':'偏差为模型估算减披露参照，以年计。原报告组核过双向利率敏感性；扩展组含仅有披露参考字段的基金。样本较少时，市场代表性有限。')}${note('历史核验采用当期可配对样本及同一组规模权重，可能遗漏已退出目录的基金。')}</details>`:'';
 if(equity){
  const rows=e.rows.map(x=>[esc(x.name),pc(x.start,false),pc(x.end,false),pp(x.passive),pp(x.residual),pp(x.total)]);
  const leaders=e.rows.slice(0,3).map(r=>esc(r.name)+' '+pc(r.end,false)).join('、');
  return box('主动权益基金的行业配置怎样变化？',leaders?'占已映射 A 股行业的期末模型权重前三为'+leaders+'。':'本窗口缺少两端均可核验的模型样本。',
   row('模型样本 / 主动权益全池',T(e.n)+' / '+T(e.pool)+' 只')+
   (rows.length?`<details><summary>查看全部 ${rows.length} 个行业</summary>${table(['中信一级行业','期初','期末','价格推动','剩余变化','总变化'],rows)}</details>`:'')+
   note(scope+' 模型池涵盖当前有效的主动权益基金，含因名称带“量化”“多因子”等字样而未进入收益分组的基金。价格推动按期初持仓随行业行情漂移估算，剩余变化含模型误差，无法据此确认基金买卖。')+backtest);
 }
 return box('纯债基金的久期拉长还是缩短？',scope,
   table(['基金范围','期初久期','期末久期','变化','有效 / 候选'],bond.map(r=>[esc(r.type),unit(r.start),unit(r.end),unit(valid(r.start)&&valid(r.end)?r.end-r.start:null),T(r.n)+' / '+T(r.pool)]))+
   note('久期越长，利率变动对净值的影响通常越大。数值来自每日净值模型，缺少规模或任一端估算的基金不参与均值。')+backtest);
}
function methods(){
 return `<details><summary>数据来源、样本与计算方法</summary><p class="detailscopy">目录截至 ${data.asof}。同类收益使用列表当前可见且有效的代表份额，按产品 ID 去重。区间首尾都要有本基金的有效复权净值，缺一天即排除，不按零收益补齐。各基金等权，当前名单回看，含存续偏差。分组按收益从高到低均分五组，同收益按代码排序；中间六成显示第20与第80百分位。</p><p class="detailscopy">市场使用本站行情缓存。股票指数为价格涨跌，普通债为财富回报；恒生指数按港元。行业按历史中信一级行业归属，逐日对有复权行情的 A 股等权后复利。季报行业统计仅覆盖披露重仓股，以基金净资产为分母；已披露组内按基金等权。本窗口权益重仓报告期 ${w().period}，债券基金仓位报告期 ${w().bondPeriod}。按期初已公告或已入库数据统计。持仓、市场行情与净值均来自本项目，股票仓位只在适用的分组研究中出现。</p></details>`;
}
function draw(){
 const d=w(); if(k==='equity'&&!industry)industry=focusIndustry();
 $('#mixed-nav').hidden=!mixed();
 $('#mixed-nav').innerHTML=mixed()?['hybrid','first','second'].map(id=>`<button data-sub="${id}" aria-pressed="${k===id}">${id==='hybrid'?'两类总览':names[id]}</button>`).join(''):'';
 root.querySelector('.seg').innerHTML=Object.entries({'1w':'近一周','1m':'近一月','3m':'近三月'}).map(([id,label])=>`<button data-win="${id}" aria-pressed="${id===period}">${label}</button>`).join('');
 $('#title').textContent=k==='hybrid'?'混合债基 · 选择研究类别':funds[k]+'市场概览';const catalogDate=window.FUND_DASHBOARD_CATALOG?.as_of || data.asof;
 $('#dates').textContent=d.start+' 至 '+data.end+(catalogDate>data.end?' · 目录截至 '+catalogDate+'，概览等待同期数据':'');
 if(k==='hybrid'){
   $('#body').innerHTML=searchBox()+subtype()+market()+methods();
 }else{
   const companion=k==='equity'?sectors():debtMarket();
   const list='';
   $('#body').innerHTML=top()+searchBox()+`<div class="grid">${market()}${companion}</div>`+(k==='equity'?equityEvidence():debtEvidence())+((k==='equity'||k==='pure')?modelOverview():'')+list+methods();
 }
 wireMarket();
 if(chosen){$('#lookup').value=chosen;showSearch(chosen);}
}
function setWindow(next){
 period=next; host.dataset.period=next;
 draw();
}
function updateIndustry(n,source){
 industry=n;const keepTrend=source==='rank'||$('#sectortrend').open;
 $('#evidence').outerHTML=equityEvidence();
 $('#sectortrend').open=keepTrend;
 root.querySelectorAll('[data-ind]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.ind===n));
 if(source==='rank')$('#evidence').scrollIntoView({block:'start'});else $('#chooseInd').focus({preventScroll:true});
}
root.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 const id=b.dataset.tab||b.dataset.sub||b.dataset.jump;
 if(id){
   if(id!==k){onSubtype({first:'primary_bond',second:'secondary_bond',hybrid:'all'}[id], b.dataset.carry||'');return;}
   k=id;industry='';chosen=b.dataset.carry||'';draw();
   if(b.dataset.jump||b.dataset.sub){$('#title').focus({preventScroll:true});}
 }
 else if(b.dataset.win){setWindow(b.dataset.win);root.querySelector('[data-win="'+period+'"]').focus({preventScroll:true});}
 else if(b.dataset.ind)updateIndustry(b.dataset.ind,'rank');
 else if(b.id==='example'||b.dataset.find){chosen=b.dataset.q||b.dataset.find;$('#lookup').value=chosen;showSearch(chosen);}
});
root.addEventListener('change',e=>{if(e.target.id==='with-shanghai'){showShanghai[k]=e.target.checked;$('#market-chart').outerHTML=market();wireMarket();$('#with-shanghai').focus({preventScroll:true});}else if(e.target.id==='chooseInd')updateIndustry(e.target.value,'select')});
root.addEventListener('input',e=>{if(e.target.id==='lookup'){chosen=e.target.value;showSearch(chosen);}});

draw();
}
function update(host,key,cutoff,version,change){
 const view=keys[key];if(!view)return;
 const token=JSON.stringify([view,cutoff,version]);
 if(host.dataset.request===token)return;
 host.dataset.request=token;
 const shadow=host.shadowRoot||host.attachShadow({mode:'open'});
 const panel=document.createElement('div');shadow.replaceChildren(panel);
 if(cutoff){panel.textContent='当前按 '+cutoff+' 回看净值。分类市场概览可切回最新净值日查看。';return;}
 panel.textContent='正在加载分类市场行情…';
 loadHomepageScript('https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/category_market.js?v='+encodeURIComponent(version||''),'分类市场行情',()=>window.FUND_CATEGORY_MARKET)
 .then(data=>{
   if(host.dataset.request!==token)return;
   panel.innerHTML=shell;
   const carry=host.dataset.carry||'';delete host.dataset.carry;
   render(host,panel,data,view,host.dataset.period||'3m',carry,(v,query)=>{host.dataset.carry=query;change(v);});
 }).catch(error=>{
   if(host.dataset.request!==token)return;
   panel.textContent=error.message+' ';const retry=document.createElement('button');retry.textContent='重新加载市场概览';
   retry.onclick=()=>{delete host.dataset.request;update(host,key,cutoff,version,change);};panel.append(retry);
 });
}
return {update};
})();
