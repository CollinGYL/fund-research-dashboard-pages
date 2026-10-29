/* Shared performance presentation. Existing NAV and risk formulas stay in fund.js. */
(function () {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const pct = value => finite(value) ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%` : '—';
  const promises = new Map();
  function load(code) {
    if (!promises.has(code)) promises.set(code, Promise.all([FundLifecycle.loadRanks(), loadDataScript(`https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/performance_context/${encodeURIComponent(code)}.js`, '任期与同类排名', () => window.WARM_PERFORMANCE_CONTEXT?.[code] || null)]).then(([, value]) => value).catch(error => { promises.delete(code); throw error; }));
    return promises.get(code);
  }
  function context(fund) { return window.WARM_PERFORMANCE_CONTEXT?.[fund.code] || {}; }
  // Split at every manager / acting-manager change, clipped to available NAV.
  function segments(managers, first, last) {
    if (!first || !last) return [];
    const iv = (managers || []).filter(m => m.start && m.start <= last && (!m.end || m.end > first));
    const bounds = [...new Set([first,last,...iv.flatMap(m => [m.start,m.end,m.escrow_start,m.escrow_end]).filter(d => d && d > first && d < last)])].sort();
    const output = [];
    for (let i=0;i<bounds.length-1;i++) {
      const s=bounds[i],e=bounds[i+1],active=iv.filter(m => m.start <= s && (!m.end || m.end >= e));
      if (!active.length) continue;
      const notes=[],who=[...new Set(active.map(m => {
        if (m.escrow && m.escrow_start && m.escrow_start <= s && (!m.escrow_end || m.escrow_end >= e)) { notes.push(`${m.escrow}代${m.name}`); return m.escrow; }
        return m.name;
      }))].sort();
      const kind=notes.length?'代管':who.length>1?'共管':'独任',label=who.join('、')+' · '+kind;
      const previous=output.at(-1);
      if (previous && previous.e===s && previous.label===label && previous.note===notes.join('；')) previous.e=e;
      else output.push({s,e,label,note:notes.join('；')});
    }
    return output;
  }
  function ranges(fund, nav) {
    if (!nav.length) return [];
    const c=context(fund),first=nav[0].date,last=nav.at(-1).date;
    const current=(c.managers || []).filter(m => (fund.manager || []).includes(m.name) && m.start <= last && (!m.end || m.end > last));
    const indiv=[...new Map(current.map(m => [m.name,{s:m.start<first?first:m.start,e:last,label:`${m.name} · 任职以来`,note:m.start<first?`任职自${m.start}；净值自${first}`:'',current:true}])).values()];
    return [...indiv,...segments(c.managers,first,last).reverse()];
  }
  function controls(fund, nav) {
    const rs=ranges(fund,nav);
    return `<div class="warm-tenure"><label for="warm-tenure-select">按经理任期</label><select id="warm-tenure-select"><option value="">选择任职区间</option>${rs.map((r,i)=>`<option value="${i}">${esc(r.label)} ｜ ${r.s} — ${r.e}</option>`).join('')}</select><span>${rs.length?'独任、共管与代管分段展示':'现有资料未记录任职日期'}</span></div>`;
  }
  function annual(nav) {
    return [...new Set(nav.map(p=>p.date.slice(0,4)))].sort().map(year => {
      const points=nav.filter(p=>p.date.startsWith(year)),prior=nav.filter(p=>p.date<year+'-01-01').at(-1);
      const series=prior?[prior,...points]:points,stats=performanceStats(series);
      return {year,value:stats?.cumulative ?? null,partial:!prior || year===nav.at(-1).date.slice(0,4),start:series[0]?.date,end:series.at(-1)?.date};
    });
  }
  function annualChart(nav) {
    const years=annual(nav);if (!years.length) return '<p class="empty-copy">暂无年度净值。</p>';
    const w=Math.max(560,years.length*58),h=220,m={l:48,r:18,t:30,b:36};
    const values=years.map(x=>x.value).filter(finite),lo=Math.min(0,...values),hi=Math.max(.01,...values),pad=(hi-lo)*.16,min=lo-pad,max=hi+pad;
    const y=v=>m.t+(max-v)/(max-min)*(h-m.t-m.b),step=(w-m.l-m.r)/years.length;
    const ticks=[0,hi,...(lo<0?[lo]:[])];
    return `<div class="warm-annual-scroll"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="年度收益率柱状图" style="min-width:${Math.min(w,1050)}px">${ticks.map(v=>`<line x1="${m.l}" x2="${w-m.r}" y1="${y(v)}" y2="${y(v)}" class="chart-grid-line"/><text x="${m.l-7}" y="${y(v)+4}" text-anchor="end" class="chart-axis-label">${(v*100).toFixed(0)}%</text>`).join('')}${years.map((a,i)=>{
      const x=m.l+step*(i+.5),v=a.value;if (!finite(v)) return '';
      return `<g tabindex="0" aria-label="${a.year}年 ${pct(v)}，${a.start}至${a.end}"><title>${a.year}：${pct(v)}\n${a.start} — ${a.end}</title><rect x="${x-step*.28}" y="${Math.min(y(v),y(0))}" width="${step*.56}" height="${Math.max(1,Math.abs(y(v)-y(0)))}" fill="${v>=0?'#B01625':'#347466'}"/><text x="${x}" y="${v>=0?y(v)-7:y(v)+15}" text-anchor="middle" class="warm-bar-label">${pct(v)}</text><text x="${x}" y="${h-12}" text-anchor="middle" class="chart-axis-label">${a.year}${a.partial?'*':''}</text></g>`;
    }).join('')}</svg></div><p class="method-note">* 首年按可得净值统计；最新年度截至 ${esc(nav.at(-1)?.date)}。</p>`;
  }
  function peer(fund, nav) {
    const c=context(fund),last=nav.at(-1)?.date;
    if (!FundLifecycle.currentEligible(fund)) return '<p class="empty-copy">该组合已退出当前基金池，保留历史净值与年度表现。</p>';
    const rs=FundLifecycle.ranks(fund).filter(r=>r.end===last);
    if (!rs.length) return `<p class="empty-copy">${fund.warm_context_error?'任期与排名资料加载失败，可刷新重试。':last!==FundLifecycle.data().as_of?'当前排名统一截至 '+FundLifecycle.data().as_of+'，本基金净值末日为 '+last+'。':'同截止日、覆盖完整窗口的同类样本不足。'}</p>`;
    return `<div class="warm-rank-subtitle">${esc(c.cohort)} · 截至 ${esc(last)}</div><div class="research-table-wrap"><table class="research-table warm-rank-table"><thead><tr><th>阶段</th><th>收益</th><th>同类排名</th><th>超过同类</th></tr></thead><tbody>${rs.map(r=>`<tr><td title="${r.start} — ${r.end}">${esc(r.label)}</td><td class="${r.return>=0?'value-positive':'value-negative'}">${pct(r.return)}</td><td><b>${r.rank}</b><span> / ${r.n}</span></td><td><div class="warm-rank-bar"><i style="width:${Math.max(0,Math.min(100,r.beaten*100))}%"></i><span>${(r.beaten*100).toFixed(2)}%</span></div></td></tr>`).join('')}</tbody></table></div><details class="warm-method"><summary>完整排名数据</summary>${renderTable(['阶段','统计区间','同类中位收益','排名分档'],rs.map(r=>[esc(r.label),r.start+' — '+r.end,pct(r.median),r.rank/r.n<=.25?'前25%':r.rank/r.n<=.5?'25%—50%':r.rank/r.n<=.75?'50%—75%':'后25%']))}</details><details class="warm-method"><summary>排名口径</summary><p>按当前分类、同一净值截止日比较目录已有区间收益；主动权益细分股票型/混合型，指数增强按跟踪指数，一级/二级债基分别比较。份额按产品去重，成立不足区间不参与；收益相同并列。超过同类为收益严格低于本基金的其他产品比例。每个窗口核对实际净值起点、末日与交易日覆盖；只使用通过核对的目录指标。当前分类与当前基金池用于历史窗口比较。</p></details>`;
  }
  function summary(fund,nav,calendarRows) {
    return `<div class="warm-performance-pair"><article class="subpanel warm-annual"><div class="subpanel-heading"><div><p class="eyebrow">02 / CALENDAR YEAR</p><h3>年度表现</h3></div></div>${annualChart(nav)}<details class="warm-method"><summary>查看各年度风险收益明细</summary>${renderTable(['年度','年度收益','年化收益','年化波动','最大回撤','Sharpe','Calmar'],calendarRows)}</details></article><article class="subpanel warm-peer"><div class="subpanel-heading"><div><p class="eyebrow">03 / PEER RANK</p><h3>同类排名</h3></div></div>${peer(fund,nav)}</article></div>`;
  }
  function tenureTable(fund,nav) {
    const rs=segments(context(fund).managers,nav[0]?.date,nav.at(-1)?.date).reverse();
    if(!rs.length)return '';
    const rows=rs.map(r=>{
      const points=nav.filter(p=>p.date>=r.s && p.date<=r.e),s=performanceStats(points);
      return [esc(r.label)+(r.note?`<small>${esc(r.note)}</small>`:''),`${points[0]?.date || r.s} — ${points.at(-1)?.date || r.e}`,pct(s?.cumulative),pct(s?.annualizedReturn),pct(s?.maxDrawdown),points.length];
    });
    return `<article class="subpanel"><details class="warm-method"><summary>经理任期表现 <span>共 ${rs.length} 段</span></summary>${renderTable(['经理 / 管理方式','实际净值区间','累计收益','年化收益','最大回撤','净值日'],rows)}<p class="method-note">任期按任职与离任日期切分，使用区间内首末有效净值；任职当天至首次净值之间的收益不计入。</p></details></article>`;
  }
  function bind(points, fund, benchmarkName, nav) {
    const buttons=[...document.querySelectorAll('[data-generic-nav-range]')],output=document.querySelector('#generic-nav-chart-output'),metrics=document.querySelector('#generic-performance-range-metrics'),select=document.querySelector('#warm-tenure-select'),note=document.querySelector('#warm-range-note');
    if(!output)return;
    const rs=ranges(fund,nav);
    const metricDraw=(p,label)=>{if(metrics)metrics.innerHTML=renderPerformanceMetricCards('custom',p,false);if(note)note.textContent=`${label} · ${p[0]?.date || '—'} — ${p.at(-1)?.date || '—'} · ${p.length}个净值日`;};
    const draw=(selected,label)=>{
      const s=selected[0]?.date,e=selected.at(-1)?.date,chart=points.filter(p=>p.date>=s && p.date<=e);
      const display=chart.length>=2?chart:selected.map(p=>({...p,benchmark:null}));
      output.innerHTML=renderZoomableNavChart(rebaseNavPoints(display),fund.name,benchmarkName);
      metricDraw(selected,label);
      if(display.length>=2)bindNavChartZoom(display,fund.name,benchmarkName,output,(start,end)=>metricDraw(selected.filter(p=>p.date>=start && p.date<=end),label));
    };
    buttons.forEach(b=>b.addEventListener('click',()=>{buttons.forEach(x=>x.classList.toggle('active',x===b));if(select)select.value='';draw(selectPerformanceRange(nav,b.dataset.genericNavRange),b.textContent);}));
    select?.addEventListener('change',()=>{if(select.value==='')return;const r=rs[Number(select.value)];if(!r)return;buttons.forEach(b=>b.classList.remove('active'));draw(nav.filter(p=>p.date>=r.s && p.date<=r.e),r.label);});
    draw(nav,'可得历史');
  }
  window.WarmPerformance={load,context,segments,ranges,controls,annual,annualChart,peer,summary,tenureTable,bind};
})();
