/* Full disclosed weights, loaded only for visible rows. No model calculation. */
(function () {
  const labels = {sector:'板块',level1:'中信一级',level2:'中信二级',level3:'中信三级'};
  const requested = new Map(), failures = new Map();
  let level = new URLSearchParams(location.search).get('industryView') || 'level1';
  if (!labels[level]) level = 'level1';
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const percent = n => `${(n*100).toFixed(n>0 && n<.001 ? 2 : 1)}%`;
  const palette = ['#ac674c','#537d8d','#8b8b52','#a47b9c','#c49a50','#629286','#b87779','#727fa1','#9d785b','#83a4a0','#ad9b77','#7f8563','#bb8070','#6f99b0','#b19bc1','#c3ad66'];
  const fixed = {'科技':'#537d8d','消费':'#ac674c','制造':'#8b8b52','金融':'#a47b9c','周期':'#c49a50','医疗':'#629286','电子':'#537d8d','通信':'#ac674c','基础化工':'#8b8b52','电力设备及新能源':'#c49a50','医药':'#629286','港股':'#7f8563','未映射':'#a29b91','UNKNOWN':'#a29b91'};
  function color(name) { let hash=0; for(const c of name) hash=(hash*31+c.charCodeAt(0))>>>0; return fixed[name] || palette[hash%palette.length]; }
  function entries(record, selected) {
    const weights = selected==='sector' ? record?.sector_weights : record?.industry_weights?.[selected];
    return Object.entries(weights || {}).filter(([,v])=>typeof v==='number' && Number.isFinite(v) && v>0).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],'zh-CN'));
  }
  function markup(record, selected, stockWeight, assetDate="") {
    if(stockWeight===0 && assetDate) return `<span class="industry-empty">无股票持仓</span><small class="industry-date">${escape(assetDate)} · 资产配置披露</small>`;
    if(!record?.report_date) return '<span class="industry-empty">暂无完整行业披露</span>';
    const rows=entries(record,selected), total=rows.reduce((s,[,v])=>s+v,0), scale=Math.max(1,total);
    if(!rows.length) return `<span class="industry-empty">${record.disclosed_stock_weight==null || record.disclosed_stock_weight===0?'该报告期暂无可用股票明细':'该层级暂无行业映射'}</span>`;
    const segment=([name,value])=>`<span class="industry-segment" tabindex="0" style="width:${value/scale*100}%;background:${color(name)}" aria-label="${escape(name)}，占净值${percent(value)}" title="${escape(name)} · 占净值 ${percent(value)}"><span class="industry-tooltip">${escape(name)} ${percent(value)}</span></span>`;
    const legend=([name,value])=>`<span class="industry-key"><i style="background:${color(name)}"></i><span>${escape(name)}</span><b>${percent(value)}</b></span>`;
    return `<div class="industry-stack" aria-label="${labels[selected]}分布，占净值，合计${percent(total)}">${rows.map(segment).join('')}${total<1?`<span class="industry-remainder" style="width:${(1-total)*100}%" title="其余净值比例 ${(100-total*100).toFixed(1)}%"></span>`:''}</div><div class="industry-top">${rows.slice(0,3).map(legend).join('')}</div><details class="industry-breakdown"><summary>全部 ${rows.length} 项 · 合计 ${percent(total)}</summary><div>${rows.map(legend).join('')}</div></details><small class="industry-date">${escape(record.report_date || '报告期未提供')} · ${labels[selected]} · 占净值${total>1?' · 条长按合计缩放':''}</small>`;
  }
  function placeholder(fund) {
    return `<div class="industry-composition" data-industry-code="${escape(fund.code)}" data-asset-date="${escape(fund.asset?.report_date || '')}" data-stock-weight="${typeof fund.asset?.stock_weight==='number'?fund.asset.stock_weight:''}"><span class="industry-empty">${fund.asset?.stock_weight===0 && fund.asset?.report_date?'无股票持仓':'行业分布加载中…'}</span></div>`;
  }
  function load(prefix) {
    if(window.INDUSTRY_BAR_SHARDS?.[prefix]) return Promise.resolve();
    if(requested.has(prefix)) return requested.get(prefix);
    const task=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      const finish=error=>{clearTimeout(timer);script.remove();error?reject(error):resolve();};
      const timer=setTimeout(()=>finish(new Error('行业分布加载超时')),20000);
      script.src=`https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/industry_bars/${prefix}.js`;
      script.onload=()=>finish(window.INDUSTRY_BAR_SHARDS?.[prefix]?null:new Error('行业分布内容缺失'));
      script.onerror=()=>finish(new Error('行业分布暂未载入'));
      document.head.append(script);
    }).catch(error=>{requested.delete(prefix);failures.set(prefix,error.message);throw error;});
    requested.set(prefix,task); return task;
  }
  function paint(node) {
    if(!node.isConnected) return;
    const code=node.dataset.industryCode, prefix=code.slice(0,3), stock=node.dataset.stockWeight===''?null:Number(node.dataset.stockWeight);
    const record=window.FUND_STOCK_CLASSIFICATION?.funds?.[code] || window.INDUSTRY_BAR_SHARDS?.[prefix]?.[code];
    if(stock!==0 && !record && failures.has(prefix)) {node.innerHTML=`<span class="industry-empty">${escape(failures.get(prefix))}</span> <button type="button" data-industry-retry>重试</button>`;return;}
    node.innerHTML=markup(record,level,stock,node.dataset.assetDate);node.dataset.industryLevel=level;
  }
  function hydrate(root=document) {
    root.querySelectorAll('[data-industry-code]').forEach(node=>{
      const code=node.dataset.industryCode,prefix=code.slice(0,3);
      if((node.dataset.stockWeight==='0' && node.dataset.assetDate)||window.FUND_STOCK_CLASSIFICATION?.funds?.[code]||window.INDUSTRY_BAR_SHARDS?.[prefix]) return paint(node);
      load(prefix).then(()=>paint(node),()=>paint(node));
    });
  }
  function controls(category,view) {
    const el=document.querySelector('#industry-bar-controls');if(!el)return;
    el.hidden=category==='all'||category==='pure-bond'||view==='changes';
    el.querySelectorAll('button[data-industry-level]').forEach(b=>{const active=b.dataset.industryLevel===level;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }
  function setLevel(value) {
    if(!labels[value])return;level=value;
    document.querySelectorAll('button[data-industry-level]').forEach(b=>{const active=b.dataset.industryLevel===level;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    const url=new URL(location.href);url.searchParams.set('industryView',level);try{history.replaceState(null,'',url);}catch(_){}
    hydrate();
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('button[data-industry-level]');if(b){setLevel(b.dataset.industryLevel);return;}
    const retry=event.target.closest('[data-industry-retry]');if(retry){const node=retry.closest('[data-industry-code]');failures.delete(node.dataset.industryCode.slice(0,3));node.innerHTML='<span class="industry-empty">重新加载中…</span>';hydrate(node.parentElement);}
  });
  window.IndustryBars={get level(){return level;},entries,markup,placeholder,hydrate,controls,setLevel};
})();
