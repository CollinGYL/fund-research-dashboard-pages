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
 // A whole stack shares one availability mask. Never carry an upper band across
 // a change in a missing lower component, or across an unobserved quarter.
 function stackAreas(dates,values,{left=0,right=1,maxGapDays=110}={}){
  if(!(right>left)||!(maxGapDays>0))throw Error('堆积面积图坐标或日期间隔无效');
  const reports=stackColumns(dates,values,{left,right}),segments=[];let current=null;
  reports.forEach(r=>{
   const signature=r.bands.map(b=>b.layer).join(',');
   if(!r.bands.length){current=null;return;}
   const previous=current?.reports.at(-1);
   if(!current||current.signature!==signature||(Date.parse(r.date)-Date.parse(previous.date))/86400000>maxGapDays){
    current={index:segments.length,signature,reports:[],bands:[]};segments.push(current);
   }
   current.reports.push(r);
  });
  segments.forEach(s=>{
   s.start=s.reports[0].date;s.end=s.reports.at(-1).date;
   s.bands=s.reports[0].bands.map((b,j)=>({layer:b.layer,points:s.reports.map(r=>({date:r.date,x:r.center,...r.bands[j]}))}));
  });
  return {reports,segments};
 }
 root.ReviewCore={matches,normalize,scale,dateLabel,stackColumns,stackAreas};
 if(typeof module!=='undefined')module.exports=root.ReviewCore;
})(typeof window==='undefined'?globalThis:window);
(function(root){
 function stats(values){
  if(values.length<2)return null;
  let peak=values[0],dd=0;for(const v of values){peak=Math.max(peak,v);dd=Math.min(dd,v/peak-1);}
  return {return:values.at(-1)/values[0]-1,drawdown:dd};
 }
 function correlation(a,b){
  if(a.length!==b.length||a.length<3)return null;
  const x=a.reduce((s,v)=>s+v,0)/a.length,y=b.reduce((s,v)=>s+v,0)/b.length;
  let xx=0,yy=0,xy=0;for(let i=0;i<a.length;i++){xx+=(a[i]-x)**2;yy+=(b[i]-y)**2;xy+=(a[i]-x)*(b[i]-y);}
  return xx>0&&yy>0?Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))):null;
 }
 function compare(details,start='0000-01-01',end='9999-12-31'){
  const maps=details.map(d=>new Map((d.nav||[]).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r[0])&&r[1]!=null&&Number.isFinite(Number(r[1]))&&Number(r[1])>0).map(r=>[r[0],Number(r[1])])));
  if(!maps.length)return {dates:[],series:[],correlations:[]};
  const common=[...maps[0].keys()].filter(day=>day<=end&&maps.every(m=>m.has(day))).sort();
  const i=common.findIndex(day=>day>=start);const dates=i<0?[]:common.slice(Math.max(0,i-1));
  if(dates.length<2)return {dates,series:[],correlations:[]};
  const series=maps.map((m,i)=>{const values=dates.map(d=>m.get(d));return {code:details[i].fund?.code,name:details[i].fund?.name,stats:stats(values),points:dates.map((d,j)=>[d,values[j]/values[0]-1]),returns:values.slice(1).map((v,j)=>v/values[j]-1)};});
  return {dates,series,correlations:series.map(a=>series.map(b=>correlation(a.returns,b.returns)))};
 }
 Object.assign(root.ReviewCore,{compare,stats,correlation});
})(typeof window==='undefined'?globalThis:window);
