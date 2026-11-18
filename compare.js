(function(){
 'use strict';
 const $=s=>document.querySelector(s),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const codes=$('#compare-codes'),output=$('#comparison-result'),status=$('#compare-status'),colors=['#B01625','#B98B4F','#496675','#347466'];
 const cache=new Map();let current=[],requestVersion=0,selectedCodes=[],selectedMode='current';
 const parameters=()=>new URL(location.href).searchParams;
 function cutoff(){const q=parameters(),value=q.get('navDate') || new URLSearchParams(q.get('list')||'').get('navDate');return FundLifecycle.validDate(value)?value:null;}
 function save(values){const url=new URL(location.href);for(const [key,value] of Object.entries(values))value?url.searchParams.set(key,value):url.searchParams.delete(key);history.replaceState(null,'',url);}
 function selectionLabel(){return current.map(d=>`${d.fund?.name||d.code}（${d.fund?.code||d.code}）`).join('、');}
 function signedPercent(value, preserveSmall=false){
  if(!Number.isFinite(value))return '—';
  const displayed=preserveSmall?value:Number((value*100).toFixed(2)),kind=displayed===0?'value-zero':displayed>0?'value-positive':'value-negative';
  return `<strong class="${kind}">${FundResearch.percent(value,2,true,{preserveSmall})}</strong>`;
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
 function disclosureTable(){
  const limit=cutoff();
  const value=(n,unit)=>Number.isFinite(n)?(unit==='%'?(100*n).toFixed(2):n.toFixed(2))+unit:'—';
  const rows=current.map(detail=>{
    const f=detail.fund, a=(detail.asset_history||[]).filter(row=>!limit || (row.announcement_date && row.announcement_date<=limit && (row.available_at||row.announcement_date).slice(0,10)<=limit)).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
    const d=f.duration;
    const canShowDuration=!limit || (d?.report_date && d.report_date<=limit && (detail.asset_history||[]).some(row=>row.date===d.report_date && row.announcement_date && row.announcement_date<=limit && (row.available_at||row.announcement_date).slice(0,10)<=limit));
    return '<tr><td>'+esc(f.name)+'</td><td>'+esc(a?.date||'—')+'<br><small>公告 '+esc(a?.announcement_date||'—')+'</small></td><td>'+value(a?.stock,'%')+'</td><td>'+value(a?.convertible_bond,'%')+'</td><td>'+value(a?.leverage,' 倍')+'</td><td>'+(canShowDuration?value(d?.value,' 年'):'—')+'<br><small>'+esc(canShowDuration?d?.report_date||'—':'历史可用日未核实')+'</small></td></tr>';
  });
  return '<article class="subpanel"><h3>持仓与杠杆披露</h3><p class="method-note">股票和转债占基金净资产。配置与久期分别标明报告期；滑动净值区间只改变收益和回撤。</p><div class="table-scroll"><table class="data-table"><thead><tr><th>基金</th><th>资产报告期</th><th>股票</th><th>转债</th><th>杠杆</th><th>披露久期</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div></article>';
 }
 function draw(result){
  if(current.length<2)return false;
  result ??= comparison(current);
  if(result.dates.length<2){status.textContent='所选区间没有足够的共同净值日期；保留上次结果，可调整期间后重试。';return false;}
  const days=result.dates, last=days.length-1, q=parameters();
  let left=q.get('compareStart')?days.findIndex(d=>d>=q.get('compareStart')):0;
  let right=q.get('compareEnd')?days.findLastIndex(d=>d<=q.get('compareEnd')):last;
  if(left<0||right<=left){left=0;right=last;}
  const fundTypes=new Map(current.map(d=>[d.fund?.code || d.code,d.fund?.subtype || d.fund?.category_label || '分类待核']));
  const mixedTypes=new Set(fundTypes.values()).size>1;
  const notices=current.filter(d=>FundLifecycle.exitEvent(d.fund||d.code)).map(d=>FundLifecycle.notice(d.fund||d.code)).join('');
  output.innerHTML=notices+`<article class="subpanel comparison-summary"><h3>区间结果</h3>
    <p data-common-dates></p>${mixedTypes?'<p class="method-note">所选基金分类不同。比较收益和回撤时，请同时核对各自的投资范围。</p>':''}<div class="table-scroll" data-comparison-metrics></div>
    <p class="method-note">两端采用共同净值日。每只基金的收益和最大回撤使用这段时间内自身全部有效复权净值。峰谷为最大回撤对应的高点和低点。</p></article>
    <article class="subpanel unified-performance-chart"><div class="subpanel-heading"><h3>同区间净值表现</h3></div>
    <div class="performance-date-range">
      <label>起始<input type="date" class="nav-window-start" aria-label="净值区间起始日期" min="${days[0]}" max="${days[last]}"></label><span>—</span>
      <label>结束<input type="date" class="nav-window-end" aria-label="净值区间结束日期" min="${days[0]}" max="${days[last]}"></label>
      <button type="button" class="nav-zoom-reset">全部区间</button></div>
    <p class="method-note" data-range-message aria-live="polite" hidden></p><div data-compare-chart></div>
    ${ReviewCore.sliderYearTicks(days)}
    <div class="dual-range-control nav-dual-range" aria-label="净值图缩放区间">
      <div class="dual-range-track"><span></span></div>
      <input id="comparison-start" class="dual-range-start" type="range" min="0" max="${last}" step="1" aria-label="比较区间起点">
      <input id="comparison-end" class="dual-range-end" type="range" min="0" max="${last}" step="1" aria-label="比较区间终点">
      <div class="dual-range-labels"><span data-range-start></span><small>拖动横条中段可平移，拖动两端可缩放</small><span data-range-end></span></div>
    </div></article>${disclosureTable()}<article class="subpanel"><h3>收益相关性</h3><div class="table-scroll" data-comparison-correlation></div>
    <p class="method-note">按两只基金原始净值相邻日期形成收益，仅配对起止日期均相同的区间；至少${ReviewCore.MIN_CORRELATION_RETURNS}个有效配对收益观测。每格 n 为实际收益样本数。</p></article>`;
  const dateStart=$('.nav-window-start'),dateEnd=$('.nav-window-end'),startInput=$('#comparison-start'),endInput=$('#comparison-end');
  const range=$('.nav-dual-range'),track=range.querySelector('.dual-range-track'),handle=track.querySelector('span'),message=$('[data-range-message]');
  function controls(){
    startInput.value=left;endInput.value=right;
    dateStart.value=days[left];dateEnd.value=days[right];
    startInput.setAttribute('aria-valuetext',days[left]);endInput.setAttribute('aria-valuetext',days[right]);
    range.style.setProperty('--range-start',100*left/last+'%');range.style.setProperty('--range-end',100*right/last+'%');
    $('[data-range-start]').textContent=days[left];$('[data-range-end]').textContent=days[right];
  }
  function detailLink(code){
    const p=new URLSearchParams({code});for(const key of ['navDate','list'])if(q.get(key))p.set(key,q.get(key));
    if(cutoff())p.set('navDate',cutoff());return 'fund.html?'+p;
  }
  function render(){
    if(!range.isConnected)return;
    const first=days[left],end=days[right];
    const series=result.series.map(r=>({...r,...ReviewCore.navWindow(r.nav,first,end)}));
    $('[data-common-dates]').textContent=`${first}—${end} · ${right-left+1} 个共同净值日${cutoff()?' · 净值截止 '+cutoff():''}`;
    $('[data-comparison-metrics]').innerHTML=`<table class="data-table"><thead><tr><th>基金</th><th>区间收益</th><th>最大回撤</th><th>回撤峰谷日期</th><th>有效净值日</th></tr></thead><tbody>${series.map(r=>`<tr><td><a href="${esc(detailLink(r.code))}">${esc(r.name)} <small>${esc(r.code)} · ${esc(fundTypes.get(r.code))}</small></a></td><td>${signedPercent(r.stats.return)}</td><td>${signedPercent(r.stats.drawdown,true)}</td><td>${r.peakDate?r.peakDate+' → '+r.troughDate:'区间内无回撤'}</td><td>${r.rows.length}</td></tr>`).join('')}</tbody></table>`;
    FundMarket.chart($('[data-compare-chart]'),series.map((r,i)=>({label:r.name||r.code,unit:'%',color:colors[i],points:r.rows.map(([day,v])=>[day,(v/r.rows[0][1]-1)*100])})));
    const matrix=series.map(()=>[]);
    for(let i=0;i<series.length;i++)for(let j=i;j<series.length;j++){
      matrix[i][j]=matrix[j][i]=ReviewCore.pairedNavCorrelation(series[i].rows,series[j].rows,first,end);
    }
    $('[data-comparison-correlation]').innerHTML=`<table class="data-table"><thead><tr><th>基金</th>${series.map(r=>`<th>${esc(r.name)}</th>`).join('')}</tr></thead><tbody>${series.map((a,i)=>`<tr><th>${esc(a.name)}</th>${matrix[i].map(c=>{const label=c.correlation!==null?c.correlation.toFixed(3):c.status==='insufficient'?'样本不足':c.status==='empty'?'无配对收益':c.status==='zero_variance'?'无变化':'暂不可算';return `<td title="${esc(c.reason||'相同起止日期的配对收益相关性')}">${label}<small> n=${c.observations}${c.invalidObservations?' · 排除'+c.invalidObservations+'个非有限区间':''}</small></td>`}).join('')}</tr>`).join('')}</tbody></table>`;

  }
  let frame=0;
  function select(a,b,note=''){
    left=a;right=b;controls();message.textContent=note;message.hidden=!note;
    if(!frame)frame=requestAnimationFrame(()=>{frame=0;render()});
  }
  function commit(){
    if(frame){cancelAnimationFrame(frame);frame=0;}
    render();
    save({codes:selectedCodes.join(','),mode:selectedMode,comparePeriod:$('#compare-period').value,compareStart:days[left],compareEnd:days[right],...(cutoff()?{navDate:cutoff()}:{})});
  }
  function fromDate(){
    const a=days.findIndex(d=>d>=dateStart.value),b=days.findLastIndex(d=>d<=dateEnd.value);
    if(!dateStart.value||!dateEnd.value||!dateStart.validity.valid||!dateEnd.validity.valid||a<0||b<=a){
      select(left,right,'请选择范围内至少两个不同的共同净值日，已保留上次区间。');return;
    }
    const adjusted=dateStart.value!==days[a]||dateEnd.value!==days[b];
    select(a,b,adjusted?'已对齐到共同净值日：'+days[a]+' 至 '+days[b]+'。':'');commit();
  }
  dateStart.addEventListener('change',fromDate);dateEnd.addEventListener('change',fromDate);
  startInput.addEventListener('input',()=>select(Math.min(Number(startInput.value),right-1),right));
  endInput.addEventListener('input',()=>select(left,Math.max(Number(endInput.value),left+1)));
  startInput.addEventListener('change',commit);endInput.addEventListener('change',commit);
  $('.nav-zoom-reset').addEventListener('click',()=>{select(0,last);commit()});
  handle.addEventListener('pointerdown',event=>{
    const initial=left,span=right-left,x=event.clientX,width=Math.max(1,track.getBoundingClientRect().width);
    handle.setPointerCapture(event.pointerId);
    const move=e=>{const a=Math.max(0,Math.min(last-span,initial+Math.round((e.clientX-x)*last/width)));select(a,a+span);};
    const stop=()=>{commit();handle.removeEventListener('pointermove',move);handle.removeEventListener('lostpointercapture',stop);};
    handle.addEventListener('pointermove',move);handle.addEventListener('lostpointercapture',stop);
  });
  controls();commit();return true;
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
  let result;
  try{result=comparison(next);}catch(error){status.textContent=error.message+(current.length?'。已保留上次结果。':'');return;}
  if(result.dates.length<2){status.textContent='所选基金在该区间没有足够的共同净值日期。'+(current.length?'已保留上次结果。':'');return;}
  const changed=selectedCodes.join(',')!==list.join(',')||selectedMode!==(historical?'history':'current');
  if(current.length&&changed)save({compareStart:null,compareEnd:null});
  current=next;selectedCodes=list;selectedMode=historical?'history':'current';
  status.textContent=`已选：${selectionLabel()} · ${historical?'历史资料对比':'当前基金对比'}`;draw(result);
 }
 $('#compare-run').addEventListener('click',submit);
 $('#compare-period').addEventListener('change',()=>{save({comparePeriod:$('#compare-period').value,compareStart:null,compareEnd:null});draw();});
 codes.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
 const q=parameters();$('#compare-mode').value=q.get('mode')==='history'?'history':'current';$('#compare-mode').addEventListener('change',submit);
 const period=q.get('comparePeriod');if(['3','6','12','36','all'].includes(period))$('#compare-period').value=period;
 codes.value=q.get('codes')||'';if(codes.value)submit();else status.textContent='在基金列表勾选2—4只基金，或在这里输入代码。';
})();
