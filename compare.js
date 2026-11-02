(function(){
 'use strict';
 const $=s=>document.querySelector(s),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const codes=$('#compare-codes'),output=$('#comparison-result'),status=$('#compare-status'),colors=['#B01625','#B98B4F','#496675','#347466'];
 const cache=new Map();let current=[],requestVersion=0,selectedCodes=[],selectedMode='current';
 const parameters=()=>new URL(location.href).searchParams;
 function cutoff(){const q=parameters(),value=q.get('navDate') || new URLSearchParams(q.get('list')||'').get('navDate');return FundLifecycle.validDate(value)?value:null;}
 function save(values){const url=new URL(location.href);for(const [key,value] of Object.entries(values))value?url.searchParams.set(key,value):url.searchParams.delete(key);history.replaceState(null,'',url);}
 function selectionLabel(){return current.map(d=>`${d.fund?.name||d.code}（${d.fund?.code||d.code}）`).join('、');}
 function signedPercent(value){
  if(!Number.isFinite(value))return '—';
  const n=Number((value*100).toFixed(2)),kind=n===0?'value-zero':n>0?'value-positive':'value-negative';
  return `<strong class="${kind}">${n===0?'0':(n>0?'+':'')+n.toFixed(2)}%</strong>`;
 }
 function load(code){
  if(cache.has(code))return cache.get(code);
  const promise=new Promise((resolve,reject)=>{const script=document.createElement('script');let ended=false;
   const finish=error=>{if(ended)return;ended=true;clearTimeout(timer);script.remove();if(error)reject(error);else{const d=window.FUND_DETAIL_DATA?.[code];if(d?.fund?.category==='index-enhanced')reject(Error(`${code} 已移出当前展示范围，请返回基金总览重新选择。`));else Array.isArray(d?.nav)&&d.nav.length?resolve(d):reject(Error(`${code} 净值资料尚未就绪，请重试`));}};
   const timer=setTimeout(()=>finish(Error(`${code} 加载超时，请重试`)),15000);
   script.src=`https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/funds/${encodeURIComponent(code)}.js?v=${encodeURIComponent(FundLifecycle.data().catalog_generated_at||'history-v4')}`;
   script.onload=()=>finish();script.onerror=()=>finish(Error(`${code} 数据加载失败，请重试`));document.head.append(script);
  }).catch(error=>{cache.delete(code);throw error;});cache.set(code,promise);return promise;
 }
 function comparison(details){
  const dates=details.map(d=>d.nav.at(-1)?.[0]).filter(Boolean),limit=cutoff();
  if(dates.length!==details.length)return {dates:[],series:[]};
  const latest=[...dates,...(limit?[limit]:[])].sort()[0],period=$('#compare-period').value;
  return ReviewCore.compare(details,period==='all'?'0000-01-01':FundResearch.monthStart(latest,Number(period)),latest);
 }
 function draw(){
  if(current.length<2)return false;
  const result=comparison(current);
  if(result.dates.length<2){status.textContent='所选区间没有足够的共同净值日期；保留上次结果，可调整期间后重试。';return false;}
  const q=parameters(),savedStart=q.get('compareStart'),savedEnd=q.get('compareEnd');
  let left=savedStart?result.dates.findIndex(d=>d>=savedStart):0,right=savedEnd?result.dates.findLastIndex(d=>d<=savedEnd):result.dates.length-1;
  if(left<0||right<0||left>=right){left=0;right=result.dates.length-1;}
  output.innerHTML=current.filter(d=>FundLifecycle.exitEvent(d.fund||d.code)).map(d=>FundLifecycle.notice(d.fund||d.code)).join('')+`<article class="subpanel"><div class="subpanel-heading"><h3>同区间净值表现</h3><span data-common-dates></span></div><p data-selected-funds></p><div data-compare-chart></div><div class="compare-zoom"><label>起点<input id="comparison-start" aria-label="比较区间起点" type="range" min="0" max="${result.dates.length-2}" value="${left}"></label><label>终点<input id="comparison-end" aria-label="比较区间终点" type="range" min="1" max="${result.dates.length-1}" value="${right}"></label></div></article><article class="subpanel"><h3>区间结果</h3><div class="table-scroll" data-comparison-metrics></div></article><article class="subpanel"><h3>收益相关性</h3><div class="table-scroll" data-comparison-correlation></div><p class="method-note">使用相同区间的共同日期收益；3个及以下收益观测显示“样本不足”，恒定序列显示—。</p></article>`;
  $('[data-selected-funds]').textContent=`已选：${selectionLabel()}`;
  const update=()=>{
   let left=Number($('#comparison-start').value),right=Number($('#comparison-end').value);
   if(left>=right){right=Math.min(result.dates.length-1,left+1);$('#comparison-end').value=right;}
   const dates=result.dates.slice(left,right+1),s=result.series.map(r=>{const raw=r.points.slice(left,right+1).map(p=>p[1]+1),base=raw[0];return {...r,points:dates.map((d,j)=>[d,(raw[j]/base-1)*100]),stats:ReviewCore.stats(raw),returns:raw.slice(1).map((v,j)=>v/raw[j]-1)};});
   $('[data-common-dates]').textContent=`${dates[0]}—${dates.at(-1)} · ${dates.length}个共同观测${cutoff()?` · 净值截止 ${cutoff()}`:''}`;
   FundMarket.chart($('[data-compare-chart]'),s.map((r,i)=>({label:r.name||r.code,unit:'%',color:colors[i],points:r.points})));
   const detailLink=code=>{const p=new URLSearchParams({code});for(const key of ['navDate','list'])if(parameters().get(key))p.set(key,parameters().get(key));if(cutoff())p.set('navDate',cutoff());return `fund.html?${p}`;};
   $('[data-comparison-metrics]').innerHTML=`<table class="data-table"><thead><tr><th>基金</th><th>区间收益</th><th>最大回撤</th><th>所用净值末日</th></tr></thead><tbody>${s.map((r,i)=>`<tr><td><a href="${esc(detailLink(r.code))}">${esc(r.name)} <small>${esc(r.code)}</small></a></td><td>${signedPercent(r.stats.return)}</td><td>${signedPercent(r.stats.drawdown)}</td><td>${esc(dates.at(-1)||'—')}</td></tr>`).join('')}</tbody></table>`;
   $('[data-comparison-correlation]').innerHTML=`<table class="data-table"><thead><tr><th>基金</th>${s.map(r=>`<th>${esc(r.name)}</th>`).join('')}</tr></thead><tbody>${s.map(a=>`<tr><th>${esc(a.name)}</th>${s.map(b=>{const c=a.returns.length<=3?null:ReviewCore.correlation(a.returns,b.returns);return `<td>${a.returns.length<=3?'样本不足':c===null?'—':c.toFixed(3)}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
   save({codes:selectedCodes.join(','),mode:selectedMode,comparePeriod:$('#compare-period').value,compareStart:dates[0],compareEnd:dates.at(-1),...(cutoff()?{navDate:cutoff()}:{})});
  };
  $('#comparison-start').addEventListener('input',update);$('#comparison-end').addEventListener('input',update);update();return true;
 }
 async function submit(){
  const version=++requestVersion;$('#compare-run').disabled=false;
  let list=[...new Set(codes.value.trim().split(/[\s,，;；]+/).filter(Boolean).map(c=>c.toUpperCase().replace(/^(\d{6})$/,'$1.OF')))];
  if(list.length<2||list.length>4||list.some(c=>!/^\d{6}\.(OF|SH|SZ)$/.test(c))){status.textContent='请输入2—4个基金代码，以空格或逗号分隔。'+(current.length?'已保留上次结果。':'');return;}
  const historical=$('#compare-mode').value==='history';
  try{list=FundLifecycle.comparisonCodes(list,historical);}catch(error){status.textContent=error.message+(current.length?'已保留上次结果。':'');return;}
  if(list.length<2){status.textContent='所选份额属于同一组合，请再选一只不同组合的基金。'+(current.length?'已保留上次结果。':'');return;}
  status.textContent='正在读取净值…'+(current.length?'上次结果保留。':'');$('#compare-run').disabled=true;
  const settled=await Promise.allSettled(list.map(load));
  if(version!==requestVersion)return;
  $('#compare-run').disabled=false;
  const failures=settled.filter(s=>s.status==='rejected');
  if(failures.length){status.textContent=failures.map(s=>s.reason.message).join('；')+'。点击“开始比较”重试。'+(current.length?'已保留上次结果。':'');return;}
  const next=settled.map(s=>historical?FundLifecycle.historicalNav(s.value):s.value);
  if(comparison(next).dates.length<2){status.textContent='所选基金在该区间没有足够的共同净值日期。'+(current.length?'已保留上次结果。':'');return;}
  const changed=selectedCodes.join(',')!==list.join(',')||selectedMode!==(historical?'history':'current');
  if(current.length&&changed)save({compareStart:null,compareEnd:null});
  current=next;selectedCodes=list;selectedMode=historical?'history':'current';
  status.textContent=`已选：${selectionLabel()} · ${historical?'历史资料对比':'当前基金对比'}`;draw();
 }
 $('#compare-run').addEventListener('click',submit);
 $('#compare-period').addEventListener('change',()=>{save({comparePeriod:$('#compare-period').value,compareStart:null,compareEnd:null});draw();});
 codes.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
 const q=parameters();$('#compare-mode').value=q.get('mode')==='history'?'history':'current';$('#compare-mode').addEventListener('change',submit);
 const period=q.get('comparePeriod');if(['3','6','12','36','all'].includes(period))$('#compare-period').value=period;
 codes.value=q.get('codes')||'';if(codes.value)submit();else status.textContent='在基金列表勾选2—4只基金，或在这里输入代码。';
})();
