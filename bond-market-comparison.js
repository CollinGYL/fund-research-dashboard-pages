/* Two-window display comparison. Uses existing exported results, never fits a model. */
(function (root) {
  'use strict';
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (x, n = 2) => finite(x) ? x.toFixed(n) : '—';
  const periods = [['1w','最近一周'],['2w','最近两周'],['1m','最近一个月'],['3m','最近三个月'],['6m','最近六个月'],['1y','最近一年']];
  const names = ['Q1 · 涨幅前列','Q2','Q3','Q4','Q5 · 涨幅末列'];
  const colors = ['#3b7d78','#b38a46'];
  function median(values) {
    if (!values.length) return null;
    const v = values.slice().sort((a,b) => a-b), n = v.length, i = n >> 1;
    return n % 2 ? v[i] : (v[i-1]+v[i])/2;
  }
  function ranks(values) {
    const order = values.map((value,i) => ({value,i})).sort((a,b) => a.value-b.value), result = [];
    for (let i=0;i<order.length;) {
      let j=i+1; while(j<order.length && order[j].value===order[i].value) j++;
      for(let k=i;k<j;k++) result[order[k].i]=(i+j-1)/2+1;
      i=j;
    }
    return result;
  }
  function spearman(rows) {
    if (rows.length < 3) return null;
    const a=ranks(rows.map(r=>r.return)), b=ranks(rows.map(r=>r.duration)), mean=(a.length+1)/2;
    let ab=0,aa=0,bb=0;
    a.forEach((v,i)=>{ab+=(v-mean)*(b[i]-mean);aa+=(v-mean)**2;bb+=(b[i]-mean)**2;});
    return aa>0&&bb>0 ? ab/Math.sqrt(aa*bb) : null;
  }
  function summarize(data, window, type='all', moment='initial', statistic='median') {
    const durationIndex=moment==='initial'?1:2;
    const counts={pool:0,nav_start_missing:0,nav_end_missing:0,return_pairs:0,duration_missing:0,eligible:0};
    const rows=[];
    data.funds.forEach((f,i)=>{
      if(type!=='all' && f[2]!==type) return;
      counts.pool++;
      const record=window.rows[i] || [null,null,null,0], mask=record[3];
      if(!(mask&1))counts.nav_start_missing++;
      if(!(mask&2))counts.nav_end_missing++;
      if(!finite(record[0]))return;
      counts.return_pairs++;
      if(!finite(record[durationIndex])){counts.duration_missing++;return;}
      rows.push({code:f[0],name:f[1],type:f[2],return:record[0],duration:record[durationIndex]});
    });
    rows.sort((a,b)=>b.return-a.return || a.code.localeCompare(b.code));
    const groups=Array.from({length:5},(_,i)=>({label:names[i],rows:[]}));
    // Preserve tied returns together; consequently a group may contain other than 20%.
    let first=0;
    rows.forEach((r,i)=>{if(!i||r.return!==rows[i-1].return)first=i;groups[Math.min(4,Math.floor(first/Math.max(1,rows.length)*5))].rows.push(r);});
    groups.forEach(g=>{
      g.n=g.rows.length;
      g.duration=statistic==='mean' ? (g.n?g.rows.reduce((s,r)=>s+r.duration,0)/g.n:null) : median(g.rows.map(r=>r.duration));
      g.return=median(g.rows.map(r=>r.return));
    });
    counts.eligible=rows.length;
    return {groups,counts,rho:spearman(rows),difference:finite(groups[0].duration)&&finite(groups[4].duration)?groups[0].duration-groups[4].duration:null};
  }
  let loading;
  function load() {
    if(root.FUND_BOND_MARKET_COMPARISON)return Promise.resolve(root.FUND_BOND_MARKET_COMPARISON);
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      const s=document.createElement('script');let done=false;
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);s.remove();error?reject(error):resolve(root.FUND_BOND_MARKET_COMPARISON);};
      const timer=setTimeout(()=>finish(new Error('两期对比数据加载超时')),20000);
      s.src='https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/bond_market_comparison.js';
      s.onload=()=>finish(Array.isArray(root.FUND_BOND_MARKET_COMPARISON?.funds)?null:new Error('两期对比数据缺失'));
      s.onerror=()=>finish(new Error('两期对比数据加载失败'));
      document.head.append(s);
    }).catch(error=>{loading=null;throw error;});
    return loading;
  }
  function options(selected) {return periods.map(([v,t])=>`<option value="${v}"${v===selected?' selected':''}>${t}</option>`).join('');}
  function label(key) {return periods.find(p=>p[0]===key)?.[1] || key;}
  function svgChart(host, results, labels, durationLabel) {
    const W=Math.max(620,Math.min(1120,Math.round(host.getBoundingClientRect().width || 920))), H=320, L=44,R=12,T=32,B=84;
    const values=results.flatMap(r=>r.groups.map(g=>g.duration)).filter(finite),maximum=Math.max(0,...values),minimum=Math.min(0,...values);
    const rawStep=(maximum-minimum || 1)/4, power=10**Math.floor(Math.log10(rawStep));
    const step=([1,2,2.5,5,10].find(v=>v*power>=rawStep) || 10)*power;
    const tickDigits=Math.max(0,-Math.floor(Math.log10(step))+(Math.abs(step/power-2.5)<1e-8?1:0));
    const lo=Math.floor(minimum/step)*step, hi=Math.ceil((maximum || 1)/step)*step;
    const Y=v=>T+(hi-v)/(hi-lo)*(H-T-B), span=(W-L-R)/5, bw=Math.min(48,span*.25), zero=Y(0);
    let html=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(labels.join('与'))}的五组${esc(durationLabel)}对比" class="market-comparison-chart"><text x="${L}" y="14">久期 · 年</text>`;
    for(let v=lo;v<=hi+step*.01;v+=step)html+=`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" class="comparison-grid"/><text x="${L-8}" y="${Y(v)+4}" text-anchor="end">${fmt(v,tickDigits)}</text>`;
    for(let i=0;i<5;i++){
      const center=L+span*(i+.5);
      for(let j=0;j<2;j++){
        const g=results[j].groups[i], x=center+(j===0?-bw-4:4), valid=finite(g.duration), y=valid?Y(g.duration):zero;
        const text=`${labels[j]} · ${names[i]}：${valid?fmt(g.duration)+'年':'暂无可比值'}；${g.n}只；收益中位数${finite(g.return)?fmt(g.return*100,3)+'%':'—'}`;
        html+=`<g role="button" tabindex="0" data-window="${j}" data-group="${i}" aria-label="${esc(text)}"><title>${esc(text)}</title><rect x="${x}" y="${Math.min(y,zero)}" width="${bw}" height="${valid?Math.max(Math.abs(y-zero),1):0}" rx="3" fill="${colors[j]}"/><rect x="${x-3}" y="${T-8}" width="${bw+6}" height="${H-T-B+16}" fill="transparent" class="comparison-hit"/><text x="${x+bw/2}" y="${valid?Math.max(T-7,Math.min(y,zero)-8):zero-8}" text-anchor="middle" class="comparison-value">${valid?fmt(g.duration):'—'}</text></g>`;
      }
      html+=`<text x="${center}" y="${H-B+24}" text-anchor="middle" class="comparison-group">${esc(names[i])}</text><text x="${center}" y="${H-B+44}" text-anchor="middle">主 ${results[0].groups[i].n}只 ／ 对 ${results[1].groups[i].n}只</text><text x="${center}" y="${H-B+63}" text-anchor="middle">${fmt(results[0].groups[i].return==null?null:results[0].groups[i].return*100,3)}% ／ ${fmt(results[1].groups[i].return==null?null:results[1].groups[i].return*100,3)}%</text>`;
    }
    host.innerHTML=html+'</svg>';
  }
  function render(host, data) {
    host.innerHTML=`<div class="market-panel-head"><div><h3>涨幅靠前的基金久期更长吗</h3><p class="method-note">两窗口各自按复权净值涨幅分为五组，并排比较久期。</p></div></div>
      <div class="comparison-controls">
        <label>收益窗口<select data-comparison-main aria-label="主收益窗口">${options('1w')}</select></label>
        <label>对比窗口<select data-comparison-other aria-label="对比收益窗口">${options('2w')}</select></label>
        <label>时间口径<select data-comparison-basis aria-label="比较时间口径"><option value="calendar">自然日口径</option><option value="trading">交易日口径</option></select></label>
        <label>基金类型<select data-comparison-type aria-label="比较基金类型"><option value="all">全部纯债基金</option>${data.types.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></label>
        <label>久期时点<select data-comparison-moment aria-label="比较久期时点"><option value="initial">期初：收益区间起点</option><option value="final">期末：收益区间终点</option></select></label>
        <label>汇总统计<select data-comparison-statistic aria-label="久期汇总统计"><option value="median">中位数</option><option value="mean">平均数</option></select></label>
      </div><div data-comparison-dates class="comparison-dates"></div><div data-comparison-summaries class="comparison-summaries"></div>
      <div data-comparison-legend class="comparison-legend"></div><div data-comparison-chart class="comparison-chart-scroll"></div>
      <p class="method-note comparison-group-note">每组依次列出主／对窗口只数与收益中位数。相同涨幅不拆组，五组人数可能不等；点柱形可看该组基金。</p>
      <details class="comparison-quality"><summary>样本与计算口径</summary><div data-comparison-quality></div><p>两个窗口独立选取可比基金、独立排序，不取强制交集。期初、期末均取相应起止日的现有估计；净值或久期端点缺失则排除，不向前补值。</p><p>${esc(data.history_scope)}；各窗口结束日为 ${esc(data.date)}。自然日目标落在非交易日时，统一取之前最近的估计交易日。期初值为历史序列读数，历史修订采用当前缓存版本。</p><p>收益为期末复权净值／期初复权净值−1；组内久期按所选平均数或中位数汇总，秩相关使用相同有效样本。样本未按基金规模筛选。</p></details>
      <details class="comparison-details"><summary>基金明细</summary><div class="comparison-detail-controls"><label>窗口<select data-detail-window aria-label="明细窗口"><option value="0">主窗口</option><option value="1">对比窗口</option></select></label><label>分组<select data-detail-group aria-label="明细涨幅分组">${names.map((n,i)=>`<option value="${i}">${n}</option>`).join('')}</select></label></div><div data-comparison-table></div></details>`;
    let results=[], labels=[], selectedWindows=[], page=0;
    const q=s=>host.querySelector(s), value=key=>q('[data-comparison-'+key+']').value;
    const details=q('.comparison-details');
    function detailRows() {
      if(!details.open)return;
      const j=Number(q('[data-detail-window]').value), i=Number(q('[data-detail-group]').value), rows=results[j].groups[i].rows;
      const pages=Math.max(1,Math.ceil(rows.length/50));page=Math.min(page,pages-1);const w=selectedWindows[j];
      q('[data-comparison-table]').innerHTML=`<p class="method-note">${esc(labels[j])} · ${esc(w.start)}—${esc(w.end)} · ${esc(names[i])} · ${rows.length}只</p><div class="comparison-table-scroll"><table><thead><tr><th>基金</th><th>区间收益</th><th>${value('moment')==='initial'?'期初':'期末'}久期</th><th>类型</th></tr></thead><tbody>${rows.slice(page*50,(page+1)*50).map(r=>`<tr><td><a href="fund.html?code=${encodeURIComponent(r.code)}&tab=alloc">${esc(r.name)}</a><small>${esc(r.code)}</small></td><td>${fmt(r.return*100,3)}%</td><td>${fmt(r.duration,3)}年</td><td>${esc(r.type)}</td></tr>`).join('') || '<tr><td colspan="4">本组没有可比基金。</td></tr>'}</tbody></table></div><div class="comparison-paging"><button type="button" data-page="prev" ${page?'':'disabled'}>上一页</button><span>${page+1} / ${pages} · 每页50只</span><button type="button" data-page="next" ${page+1<pages?'':'disabled'}>下一页</button></div>`;
      q('[data-page="prev"]').addEventListener('click',()=>{page--;detailRows();});q('[data-page="next"]').addEventListener('click',()=>{page++;detailRows();});
    }
    function update() {
      const keys=[value('main'),value('other')], basis=value('basis'),moment=value('moment'),stat=value('statistic'),type=value('type');
      selectedWindows=keys.map(k=>data.windows[basis][k]);
      results=selectedWindows.map(w=>summarize(data,w,type,moment,stat));
      labels=keys.map((k,i)=>(i?'对比窗口 · ':'主窗口 · ')+label(k));
      const durationLabel=(moment==='initial'?'期初':'期末')+'久期'+(stat==='mean'?'平均数':'中位数');
      q('[data-comparison-dates]').innerHTML=selectedWindows.map((w,i)=>`<p><b>${esc(labels[i])}</b><span>${esc(w.start)} → ${esc(w.end)} · ${w.intervals}个交易日区间 · 可比 ${results[i].counts.eligible} / ${results[i].counts.pool}只${basis==='calendar'&&w.start!==w.requested_start?' · 自然日目标 '+esc(w.requested_start):''}</span></p>`).join('');
      q('[data-comparison-summaries]').innerHTML=results.map((r,i)=>`<section style="--comparison-color:${colors[i]}"><h4>${esc(labels[i])}</h4><p>涨幅前列 <strong>${fmt(r.groups[0].duration,3)}年</strong><span>涨幅末列 <b>${fmt(r.groups[4].duration,3)}年</b></span></p><div>${esc(durationLabel)} · 首尾差 <b>${fmt(r.difference,3)}年</b> · 秩相关 <b>${fmt(r.rho,3)}</b></div></section>`).join('');
      q('[data-comparison-legend]').innerHTML=labels.map((l,i)=>`<span><i style="background:${colors[i]}"></i>${esc(l)} · ${results[i].counts.eligible}只</span>`).join('');
      q('[data-comparison-quality]').innerHTML=results.map((r,i)=>{const c=r.counts;return `<p><b>${esc(labels[i])}</b>：所选类型 ${c.pool}只；起点净值缺失 ${c.nav_start_missing}只、终点净值缺失 ${c.nav_end_missing}只（可能重叠）；净值两端齐全 ${c.return_pairs}只，其中所选时点久期缺失 ${c.duration_missing}只，最终可比 ${c.eligible}只。</p>`;}).join('');
      svgChart(q('[data-comparison-chart]'),results,labels,durationLabel);page=0;detailRows();
    }
    host.querySelectorAll('.comparison-controls select').forEach(s=>s.addEventListener('change',update));
    q('[data-detail-window]').addEventListener('change',()=>{page=0;detailRows();});q('[data-detail-group]').addEventListener('change',()=>{page=0;detailRows();});
    details.addEventListener('toggle',detailRows);
    const choose=event=>{
      if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
      const bar=event.target.closest('[data-window][data-group]');if(!bar)return;
      event.preventDefault();q('[data-detail-window]').value=bar.dataset.window;q('[data-detail-group]').value=bar.dataset.group;page=0;details.open=true;detailRows();
    };
    q('[data-comparison-chart]').addEventListener('click',choose);q('[data-comparison-chart]').addEventListener('keydown',choose);
    update();
    let lastWidth=host.getBoundingClientRect().width;
    if(typeof ResizeObserver==='function')new ResizeObserver(()=>{const width=host.getBoundingClientRect().width;if(width>0&&Math.abs(width-lastWidth)>8){lastWidth=width;const moment=value('moment'),stat=value('statistic');svgChart(q('[data-comparison-chart]'),results,labels,(moment==='initial'?'期初':'期末')+'久期'+(stat==='mean'?'平均数':'中位数'));}}).observe(host);
  }
  async function mount(host) {
    if(!host||host.dataset.comparisonMounted||host.dataset.comparisonLoading)return;
    host.dataset.comparisonLoading='true';host.innerHTML='<p role="status">正在加载两期比较…</p>';
    try{const data=await load();render(host,data);host.dataset.comparisonMounted='true';}
    catch(error){host.innerHTML=`<p role="status">${esc(error.message)}</p><button type="button" data-comparison-retry>重试</button>`;host.querySelector('button').addEventListener('click',()=>mount(host));}
    finally{delete host.dataset.comparisonLoading;}
  }
  const api={mount,summarize,median,spearman};root.FundMarketComparison=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
