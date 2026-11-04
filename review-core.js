/* Shared local presentation helpers. Derived values only; no model calculations. */
(function(root){
 const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
 function matches(text,query){
  const exact=String(query||'').normalize('NFKC').trim();
  if(/^\d{6}(?:\.(?:OF|SH|SZ))?$/i.test(exact))return new RegExp('(^|[^0-9])'+exact.slice(0,6)+'(?:\\.(?:OF|SH|SZ))?(?![0-9])','i').test(String(text||'').normalize('NFKC'));
  const tokens=String(query||'').trim().split(/\s+/).map(normalize).filter(Boolean);
  if(!tokens.length)return true;
  const source=normalize(text);
  if(tokens.length>1)return tokens.every(t=>source.includes(t));
  if(source.includes(tokens[0]))return true;
  // Adjacent search fragments may span fund name and manager, without spaces.
  // Require two contiguous fragments of at least two characters, never a loose character subsequence.
  const token=tokens[0];if(token.length<4)return false;
  for(let i=2;i<=token.length-2;i++)if(source.includes(token.slice(0,i))&&source.includes(token.slice(i)))return true;
  return false;
 }
 function scale(values,{zero=true,steps=4}={}){
  const data=values.filter(valid).map(Number);let low=Math.min(...data,0),high=Math.max(...data,0);
  if(!zero&&data.length){low=Math.min(...data);high=Math.max(...data);}
  if(high===low){if(high===0)high=1;else{low-=Math.abs(high)*.1;high+=Math.abs(high)*.1;}}
  const rough=(high-low)/steps,power=10**Math.floor(Math.log10(rough));
  const step=[1,2,2.5,5,10].find(x=>x*power>=rough)*power;
  const min=Math.floor(low/step)*step,max=Math.ceil(high/step)*step;
  const ticks=Array.from({length:Math.round((max-min)/step)+1},(_,i)=>Number((min+i*step).toPrecision(12)));
  return {min,max,step,ticks};
 }
 function dateLabel(date,spanDays){
  if(spanDays>1000)return date.slice(0,7);
  if(spanDays>160)return `${date.slice(0,7)} · Q${Math.ceil(Number(date.slice(5,7))/3)}`;
  return date.slice(5,10);
 }
 // Report snapshots are separate columns: null is never an interpolated zero.
 function stackColumns(dates,values,{left=0,right=1,maxWidth=18}={}){
  if(dates.length!==values.length)throw Error('堆积图日期与数值行数不一致');
  const times=dates.map(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?Date.parse(d):NaN);
  if(times.some((t,i)=>!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==dates[i]||(i&&t<=times[i-1])))throw Error('堆积图报告日期须有效、唯一且递增');
  const xs=times.map(t=>left+(times.at(-1)===times[0]?.5:(t-times[0])/(times.at(-1)-times[0]))*(right-left));
  return values.map((row,i)=>{
   const neighbours=[xs[i]-xs[i-1],xs[i+1]-xs[i]].filter(v=>Number.isFinite(v)&&v>0);
   const half=Math.min(maxWidth/2,neighbours.length?Math.min(...neighbours)*.4:maxWidth/2);
   const x=Math.max(left,xs[i]-half),end=Math.min(right,xs[i]+half),missing=[],bands=[];
   let total=0;const invalid=row.some(v=>typeof v==='number'&&Number.isFinite(v)&&v<0);
   row.forEach((value,j)=>{
    if(typeof value!=='number'||!Number.isFinite(value)){missing.push(j);return;}
    if(invalid)return;
    bands.push({layer:j,value,lower:total,upper:total+value});total+=value;
   });
   return {index:i,date:dates[i],center:xs[i],x,width:end-x,bands,missing,total,
    status:invalid?'invalid':!bands.length?'unavailable':missing.length?'partial':total===0?'zero':'available'};
  });
 }
 // Each band depends only on its own value and the availability of lower
 // bands. A missing upper component cannot invalidate a known lower area.
 // Explicit empty observations break the series; calendar distance alone is
 // not evidence of a missing report (some sources are semiannual/annual).
 function stackAreas(dates,values,{left=0,right=1,maxGapDays=Infinity,orderByCoverage=false}={}){
  if(!(right>left)||!(maxGapDays>0))throw Error('堆积面积图坐标或日期间隔无效');
  const count=Math.max(0,...values.map(r=>r.length));
  const order=Array.from({length:count},(_,i)=>i);
  if(orderByCoverage)order.sort((a,b)=>values.filter(r=>Number.isFinite(r[b])).length-values.filter(r=>Number.isFinite(r[a])).length||a-b);
  const rank=new Map(order.map((layer,i)=>[layer,i]));
  const reports=stackColumns(dates,values.map(r=>order.map(i=>r[i])),{left,right}),segments=[];
  reports.forEach(r=>{r.bands.forEach(b=>{b.layer=order[b.layer];});r.missing=r.missing.map(i=>order[i]);});
  for(const layer of order){
   let current=null;
   reports.forEach(r=>{
    const band=r.bands.find(b=>b.layer===layer);
    if(!band){current=null;return;}
    const signature=r.bands.filter(b=>rank.get(b.layer)<=rank.get(layer)).map(b=>b.layer).join(',');
    const previous=current?.reports.at(-1);
    if(!current||current.signature!==signature||(Date.parse(r.date)-Date.parse(previous.date))/86400000>maxGapDays){
     current={index:segments.length,signature,reports:[],bands:[{layer,points:[]}]};segments.push(current);
    }
    current.reports.push(r);
    current.bands[0].points.push({date:r.date,x:r.center,...band});
   });
  }
  segments.forEach(s=>{s.start=s.reports[0].date;s.end=s.reports.at(-1).date;});
  return {reports,segments,order};
 }
 root.ReviewCore={matches,normalize,scale,dateLabel,stackColumns,stackAreas};
 if(typeof module!=='undefined')module.exports=root.ReviewCore;
})(typeof window==='undefined'?globalThis:window);
(function(root){
 const MIN_CORRELATION_RETURNS=12;
 function navSeries(points=[]){
  const values=new Map();
  for(const row of points){
   const date=Array.isArray(row)?row[0]:row?.date,value=Array.isArray(row)?row[1]:row?.fund;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||typeof value!=='number'||!Number.isFinite(value)||value<=0)continue;
   if(values.has(date)&&values.get(date)!==value)throw Error(`${date}存在冲突净值，暂不计算`);
   values.set(date,value);
  }
  return [...values].sort(([a],[b])=>a.localeCompare(b));
 }
 function monthlyReturns(points=[]){
  const nav=navSeries(points),ends=[];
  for(const point of nav){
   const month=point[0].slice(0,7);
   if(ends.at(-1)?.month===month)ends[ends.length-1]={month,point};
   else ends.push({month,point});
  }
  return ends.map((item,i)=>{
   const base=i?ends[i-1].point:nav[0],end=item.point;
   const value=end[0]>base[0]?end[1]/base[1]-1:null;
   const monthIndex=date=>Number(date.slice(0,4))*12+Number(date.slice(5,7));
   return {year:Number(item.month.slice(0,4)),month:Number(item.month.slice(5,7)),
    return:Number.isFinite(value)?value:null,start:base[0],end:end[0],partial:!i,
    crossMonth:Boolean(i&&monthIndex(end[0])-monthIndex(base[0])>1)};
  });
 }
 function stats(values){
  if(values.length<2)return null;
  let peak=values[0],dd=0;for(const v of values){peak=Math.max(peak,v);dd=Math.min(dd,v/peak-1);}
  return {return:values.at(-1)/values[0]-1,drawdown:dd};
 }
 function correlationSummary(a,b){
   if(a.length!==b.length)return {correlation:null,observations:0,invalidObservations:0,status:'unaligned',reason:'收益序列未按相同区间配对'};
   const pairs=a.flatMap((x,i)=>Number.isFinite(x)&&Number.isFinite(b[i])?[[x,b[i]]]:[]),n=pairs.length,invalid=a.length-n;
   const result={correlation:null,observations:n,invalidObservations:invalid,status:'available',reason:''};
   if(!n)return {...result,status:invalid?'nonfinite':'empty',reason:invalid?'共同收益区间均为非有限值':'没有有效共同收益区间'};
   if(n<MIN_CORRELATION_RETURNS)return {...result,status:'insufficient',reason:`仅${n}个有效共同收益区间，至少需要${MIN_CORRELATION_RETURNS}个${invalid?`；另排除${invalid}个非有限区间`:''}`};
   if(pairs.every(v=>v[0]===pairs[0][0])||pairs.every(v=>v[1]===pairs[0][1]))return {...result,status:'zero_variance',reason:'至少一只基金的区间收益无变化，相关性无定义'};
   const x=pairs.reduce((s,v)=>s+v[0]/n,0),y=pairs.reduce((s,v)=>s+v[1]/n,0);
   const dx=pairs.map(v=>v[0]-x),dy=pairs.map(v=>v[1]-y),sx=Math.max(...dx.map(Math.abs)),sy=Math.max(...dy.map(Math.abs));
   if(!sx||!sy)return {...result,status:'zero_variance',reason:'至少一只基金的区间收益无变化，相关性无定义'};
   let xx=0,yy=0,xy=0;for(let i=0;i<n;i++){const u=dx[i]/sx,v=dy[i]/sy;xx+=u*u;yy+=v*v;xy+=u*v;}
   const value=xy/Math.sqrt(xx*yy);
   if(!Number.isFinite(value))return {...result,status:'nonfinite',reason:'相关性计算得到非有限值'};
   return {...result,correlation:Math.max(-1,Math.min(1,value))};
 }
 function correlation(a,b){return correlationSummary(a,b).correlation;}
 function pairedNavCorrelation(left,right,start='0000-01-01',end='9999-12-31'){
   // Keep each fund's original consecutive intervals; intersect BOTH endpoints.
   // Intersecting NAV dates first would turn one-day and multi-day returns into a false pair.
   const intervals=points=>{
    const nav=navSeries(points),out=new Map();
    for(let i=1;i<nav.length;i++)if(nav[i-1][0]>=start&&nav[i][0]<=end)out.set(`${nav[i-1][0]}|${nav[i][0]}`,nav[i][1]/nav[i-1][1]-1);
    return out;
   };
   const a=intervals(left),b=intervals(right),keys=[...a.keys()].filter(k=>b.has(k));
   return {...correlationSummary(keys.map(k=>a.get(k)),keys.map(k=>b.get(k))),matchedIntervals:keys.length};
 }
 function compare(details,start='0000-01-01',end='9999-12-31'){
   const navs=details.map(d=>navSeries(d.nav)),maps=navs.map(nav=>new Map(nav));
  if(!maps.length)return {dates:[],series:[],correlations:[]};
  const common=[...maps[0].keys()].filter(day=>day<=end&&maps.every(m=>m.has(day))).sort();
  const i=common.findIndex(day=>day>=start);const dates=i<0?[]:common.slice(Math.max(0,i-1));
  if(dates.length<2)return {dates,series:[],correlations:[]};
   const series=maps.map((m,i)=>{const values=dates.map(d=>m.get(d));return {code:details[i].fund?.code,name:details[i].fund?.name,nav:navs[i],stats:stats(values),points:dates.map((d,j)=>[d,values[j]/values[0]-1]),returns:values.slice(1).map((v,j)=>v/values[j]-1)};});
   const correlationResults=series.map(a=>series.map(b=>pairedNavCorrelation(a.nav,b.nav,dates[0],dates.at(-1))));
   return {dates,series,correlationResults,correlations:correlationResults.map(row=>row.map(r=>r.correlation))};
 }
 Object.assign(root.ReviewCore,{compare,stats,correlation,correlationSummary,pairedNavCorrelation,MIN_CORRELATION_RETURNS,navSeries,monthlyReturns});
})(typeof window==='undefined'?globalThis:window);
