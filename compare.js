(function(){
 const $=s=>document.querySelector(s),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const codes=$('#compare-codes'),output=$('#comparison-result'),status=$('#compare-status'),colors=['#B01625','#B98B4F','#496675','#347466'];
 const cache=new Map();let current=[],lastResult=null,requestVersion=0;
 function signedPercent(value){
  if(!Number.isFinite(value))return '—';
  const n=Number((value*100).toFixed(2)),kind=n===0?'value-zero':n>0?'value-positive':'value-negative';
  return `<strong class="${kind}">${n===0?'0':(n>0?'+':'')+n.toFixed(2)}%</strong>`;
 }
 function load(code){
  if(cache.has(code))return cache.get(code);
  const promise=new Promise((resolve,reject)=>{const script=document.createElement('script');let ended=false;
   const finish=error=>{if(ended)return;ended=true;clearTimeout(timer);script.remove();if(error)reject(error);else{const d=window.FUND_DETAIL_DATA?.[code];if(d?.fund?.category==='index-enhanced'){const error=Error(`${code} 已移出当前展示范围，请返回基金总览重新选择。`);error.code='CATEGORY_REMOVED';reject(error);}else d?.nav?.length?resolve(d):reject(Error(`${code} 没有净值数据`));}};
   const timer=setTimeout(()=>finish(Error(`${code} 加载超时，请重试`)),15000);script.src=`https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/funds/${encodeURIComponent(code)}.js`;
   script.onload=()=>finish();script.onerror=()=>finish(Error(`${code} 分片暂不可用`));document.head.append(script);
  }).catch(error=>{cache.delete(code);throw error;});cache.set(code,promise);return promise;
 }
 function draw(){
  if(current.length<2)return;
  const latest=current.map(d=>d.nav.at(-1)?.[0]).filter(Boolean).sort()[0];
  const period=$('#compare-period').value,start=period==='all'?'0000-01-01':FundResearch.monthStart(latest,Number(period));
  const result=ReviewCore.compare(current,start,latest);lastResult=result;
  if(result.dates.length<2){output.innerHTML='<p class="empty-copy">所选基金在该区间没有足够的共同净值日期。</p>';return;}
  output.innerHTML=current.filter(d=>FundLifecycle.exitEvent(d.fund||d.code)).map(d=>FundLifecycle.notice(d.fund||d.code)).join('')+`<article class="subpanel"><div class="subpanel-heading"><h3>同区间净值表现</h3><span data-common-dates></span></div><div data-compare-chart></div><div class="compare-zoom"><label>起点<input id="comparison-start" aria-label="比较区间起点" type="range" min="0" max="${result.dates.length-2}" value="0"></label><label>终点<input id="comparison-end" aria-label="比较区间终点" type="range" min="1" max="${result.dates.length-1}" value="${result.dates.length-1}"></label></div></article><article class="subpanel"><h3>区间结果</h3><div class="table-scroll" data-comparison-metrics></div></article><article class="subpanel"><h3>收益相关性</h3><div class="table-scroll" data-comparison-correlation></div><p class="method-note">按共同观测日期之间的收益计算；相同净值日期、相同区间。至少3个收益观测，恒定序列显示—。</p></article>`;
  const update=()=>{
   let left=Number($('#comparison-start').value),right=Number($('#comparison-end').value);
   if(left>=right){right=Math.min(result.dates.length-1,left+1);$('#comparison-end').value=right;}
   const dates=result.dates.slice(left,right+1),s=result.series.map(r=>{const raw=r.points.slice(left,right+1).map(p=>p[1]+1),base=raw[0];return {...r,points:dates.map((d,j)=>[d,(raw[j]/base-1)*100]),stats:ReviewCore.stats(raw),returns:raw.slice(1).map((v,j)=>v/raw[j]-1)};});
   $('[data-common-dates]').textContent=`${dates[0]}—${dates.at(-1)} · ${dates.length}个共同观测`;
   FundMarket.chart($('[data-compare-chart]'),s.map((r,i)=>({label:r.name||r.code,unit:'%',color:colors[i],points:r.points})));
   $('[data-comparison-metrics]').innerHTML=`<table class="data-table"><thead><tr><th>基金</th><th>区间收益</th><th>最大回撤</th><th>各自净值末日</th></tr></thead><tbody>${s.map((r,i)=>`<tr><td><a href="fund.html?code=${esc(r.code)}">${esc(r.name)} <small>${esc(r.code)}</small></a></td><td>${signedPercent(r.stats.return)}</td><td>${signedPercent(r.stats.drawdown)}</td><td>${esc(current[i].nav.at(-1)[0])}</td></tr>`).join('')}</tbody></table>`;
   $('[data-comparison-correlation]').innerHTML=`<table class="data-table"><thead><tr><th>基金</th>${s.map(r=>`<th>${esc(r.name)}</th>`).join('')}</tr></thead><tbody>${s.map(a=>`<tr><th>${esc(a.name)}</th>${s.map(b=>{const c=ReviewCore.correlation(a.returns,b.returns);return `<td>${c===null?'—':c.toFixed(3)}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
  };
  $('#comparison-start').addEventListener('input',update);$('#comparison-end').addEventListener('input',update);update();
 }
 async function submit(){
  const version=++requestVersion;current=[];output.innerHTML="";$('#compare-run').disabled=false;
  let list=[...new Set(codes.value.trim().split(/[\s,，;；]+/).filter(Boolean).map(c=>c.toUpperCase().replace(/^(\d{6})$/,'$1.OF')))];
  if(list.length<2||list.length>4||list.some(c=>!/^\d{6}\.(OF|SH|SZ)$/.test(c))){status.textContent='请输入2—4个基金代码，以空格或逗号分隔。';return;}
  const historical=$('#compare-mode').value==='history';
  try { list=FundLifecycle.comparisonCodes(list,historical); } catch(error) {status.textContent=error.message;return;}
  if(list.length<2){status.textContent='同一组合的A/C等份额合并计算，请再选一只不同组合的基金。';return;}
  status.textContent='正在并行读取净值…';$('#compare-run').disabled=true;
  const settled=await Promise.allSettled(list.map(load));
  if(version!==requestVersion)return;
  const failures=settled.filter(s=>s.status==='rejected');
  if(failures.length){status.textContent=failures.map(s=>s.reason.message).join('；');if(failures.some(s=>s.reason.code==='CATEGORY_REMOVED'))output.innerHTML='<p class="empty-copy">分类已调整。<a href="index.html#samples">返回基金总览选择基金</a></p>';$('#compare-run').disabled=false;return;}
  current=settled.map(s=>historical?FundLifecycle.historicalNav(s.value):s.value);const url=new URL(location.href);url.searchParams.set('codes',list.join(','));url.searchParams.set('mode',historical?'history':'current');history.replaceState(null,'',url);
  status.textContent=`${list.length}只基金已加载 · ${historical?'历史资料对比，净值截到各组合最后运作日':'当前基金对比'} · 可调整区间`;$('#compare-run').disabled=false;draw();
 }
 $('#compare-run').addEventListener('click',submit);$('#compare-period').addEventListener('change',draw);codes.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
 $('#compare-mode').value=new URLSearchParams(location.search).get('mode')==='history'?'history':'current';$('#compare-mode').addEventListener('change',submit);
 codes.value=new URLSearchParams(location.search).get('codes')||'';if(codes.value)submit();else status.textContent='在基金列表勾选2—4只基金，或在这里输入代码。';
})();
