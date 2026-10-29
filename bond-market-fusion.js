/* Extend the existing disclosure adapter to the frozen whole-market universe. */
(function(root){
 'use strict';
 const base=root.BondEquityFusion,index=root.BOND_MARKET_INDEX;
 if(!base||!index)throw new Error('全市场披露索引或权益组件未加载');
 root.BOND_CB_FUSION_INDEX.equity_shards=[...new Set([...(root.BOND_CB_FUSION_INDEX.equity_shards||[]),...index.equity_shards])];
 const cache=new Map(),isMarket=p=>p?.method_version==='C_all_market_disclosure_1';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const finite=x=>typeof x==='number'&&Number.isFinite(x),pct=x=>finite(x)?(100*x).toFixed(2)+'%':'—';
 const section=(t,b)=>`<article class="subpanel fusion-section"><h3>${esc(t)}</h3>${b}</article>`;
 const table=(h,r)=>renderTable(h,r,'fusion-table-wrap',12);
 async function load(fund,detail){
  if(!index.payload_hashes[fund?.code])return base.load(fund,detail);
  const present=task=>task.then(p=>base.currentView(p,detail,fund.code));
  if(cache.has(fund.code))return present(cache.get(fund.code));
  const hash=index.payload_hashes[fund.code];
  const task=(async()=>{
   if(root.BOND_EQUITY_FUSION?.[fund.code]?.source_payload_sha256!==hash){
    if(root.BOND_EQUITY_FUSION)delete root.BOND_EQUITY_FUSION[fund.code];
    await loadDataScript(`https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/bond_equity/${encodeURIComponent(fund.code)}.js?v=${hash.slice(0,16)}`,'全市场披露画像',()=>root.BOND_EQUITY_FUSION?.[fund.code]);
   }
   const p=root.BOND_EQUITY_FUSION?.[fund.code];
   if(p?.code!==fund.code||p.schema_version!=='bond_cb_equity.v1'||p.source_payload_sha256!==hash||!p.direct_equity||!p.allocation)throw new Error('全市场画像内容版本或结构不匹配');
   return p;
  })().catch(e=>{cache.delete(fund.code);throw e;});cache.set(fund.code,task);return present(task);
 }
 function scope(p){return isMarket(p)?`<p class="method-note">全市场披露方法 · 净值截至 ${esc(p.nav_end_date||'待补')}。结构化缓存与原报告逐项核验状态分开；空缺不表示零持仓。<a href="bond-methodology.html" target="_blank">统一方法论与实现状态</a></p>`:'';}
 function cleanSource(html,p){return isMarket(p)?html.replace(' 中期报告',' 结构化披露记录').replace('最新完整披露：','所选完整报告期：'):html;}
 function profilePanel(p){return scope(p)+cleanSource(base.profilePanel(p),p);}
 function holdingsPanel(p,h){return scope(p)+cleanSource(base.holdingsPanel(p,h),p);}
 function disclosureIntro(p){return scope(p)+cleanSource(base.disclosureIntro(p),p);}
 function cbIndustry(p,level='level1'){
  if(!isMarket(p))return base.cbIndustry(p,level);
  const rows=p.convertibles.underlying_industry_nominal.find(x=>x.level===level)?.rows||[];
  return rows.length?table(['对应正股行业','转债名义占基金净值'],rows.map(r=>[esc(r.name),base.weightLabel(r.nominal_weight_nav)])):'<p class="empty-copy">暂无可用的转债正股行业映射。</p>';
 }
 function convertibleReportPanel(p){
  if(!isMarket(p))return base.convertibleReportPanel(p);
  const c=p.convertibles,rows=c.holdings||[];
  const warning=(c.status==='inconsistent_cb_coverage_requires_review'?'披露转债合计超过同日资产表，需核对；暂不据此推断完整组合。':c.status==='missing_same_date_asset_or_bond_disclosure'?'缺少同日净资产或逐券披露，不能计算完整转债画像。':rows.length?'以下是缓存已披露重仓债券中的可识别转债，覆盖率按同日资产表计算。':'当前缓存未识别到转债明细，不能据此判定基金没有转债。')+(c.coverage_note?' 资产表仓位舍入可使小额转债覆盖略超100%，保留原值。':'');
  const dates=`逐券报告 ${esc(c.report_date||'待补')} · 缓存公告 ${esc(c.announcement_date||'待核')} · 配置汇总 ${esc(p.allocation.report_date||'待补')}`;
  const body=rows.length?table(['转债','名义占净值','占同日全部转债','对应正股','中信一级','映射可得日'],rows.map(r=>[`${esc(r.bond_name)}<small>${esc(r.bond_code)}</small>`,base.weightLabel(r.nominal_weight_nav),pct(r.nominal_share_of_total_convertibles),esc(r.underlying_code||'未映射'),esc(r.industry?.level1||'未映射'),esc(r.mapping_available_date||'待补')])):'';
  return scope(p)+`<div class="panel-intro"><h2>转债名义持仓与正股映射</h2><p>${dates}</p></div><p class="method-note">${esc(warning)}${c.stale_vs_asset_date?' 逐券日期早于最新资产配置，两个日期分别展示。':''} Delta缺失；名义映射与直接股票仓位分别列示。</p><div class="research-metric-grid metric-four">${metric('该逐券期转债占净值',base.weightLabel(c.nominal_weight_nav))}${metric('已披露转债',rows.length+'只',`覆盖 ${pct(c.disclosure_coverage)}`)}${metric('映射覆盖同日全部转债',pct(c.mapping_coverage_of_total_cb))}${metric('Delta等价股票敞口','未覆盖')}</div>`+section('已披露转债明细',body||'<p class="empty-copy">逐券资料待补。</p>')+section('对应正股行业（名义市值）',`<label class="fusion-control">中信层级<select data-equity-cb-level><option value="level1">中信一级</option><option value="level2">中信二级</option><option value="level3">中信三级</option></select></label><div data-equity-cb-output>${cbIndustry(p)}</div>`);
 }
 function bind(host,p){base.bind(host,p);if(isMarket(p))host.querySelector('[data-equity-cb-level]')?.addEventListener('change',e=>{host.querySelector('[data-equity-cb-output]').innerHTML=cbIndustry(p,e.target.value);});}
 root.BondEquityFusion={...base,load,profilePanel,holdingsPanel,disclosureIntro,convertibleReportPanel,cbIndustry,bind};
 if(typeof module!=='undefined')module.exports=root.BondEquityFusion;
})(typeof window!=='undefined'?window:globalThis);
