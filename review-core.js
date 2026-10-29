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
 root.ReviewCore={matches,normalize,scale,dateLabel};
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
