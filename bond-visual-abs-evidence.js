/* Only explicit, product-scoped report evidence can create an ABS no-hold view. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function audit(disclosure){
  const a=disclosure?.abs_history;
  if(a?.schema_version!=='abs_history_display.v1'||a.status!=='verified_no_disclosed_holdings'||a.portfolio_id!=='M7eccoZXdr'||a.source_code!=='519030.OF'||!['018042.OF','519030.OF'].includes(a.representative_code)||a.report_count!==94||a.periods?.length!==63||a.conflict_dates?.length)return null;
  if(a.start!=='2011-03-31'||a.end!=='2026-09-30'||!a.periods.every(p=>p.reports?.length&&p.reports.every(r=>r.status==='explicit_no_hold'&&r.report_date===p.date&&r.published_on<=a.available_on)))return null;
  return a;
 }
 function dates(disclosure){return audit(disclosure)?.periods.map(p=>p.date).sort()||[];}
 function url(value,page){try{const u=new URL(value);return u.protocol==='https:'&&['pdf.dfcfw.com','money.finance.sina.com.cn'].includes(u.hostname)&&!u.hash?u.href+(Number.isInteger(page)&&page>0?'#page='+page:''):null;}catch{return null;}}
 function view(disclosure,selected){
  const a=audit(disclosure),period=a?.periods.find(p=>p.date===selected);if(!period)return '';
  const reportRows=a.periods.flatMap(p=>p.reports).map(r=>{const e=r.evidence?.[0],href=url(r.url,e?.page);return `<tr><td>${esc(r.report_date)}</td><td>${esc(r.report_type)}</td><td>${esc(r.published_on)}</td><td>${esc(e?.text||'')}</td><td>${href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${e?.page?'原报告第'+e.page+'页':esc(e?.section||'公告原文')}</a>`:'原报告链接待核'}</td></tr>`;}).join('');
  return `<div class="bv-abs-proof"><p><strong>${esc(a.start)} 至 ${esc(a.end)} 已核查的季报、半年报、年报均明确披露：报告期末未持有资产支持证券。</strong></p><p class="method-note">共94份报告（63份季报、16份半年报、15份年报），覆盖63个报告期。所选 ${esc(selected)} 的${period.reports.map(r=>esc(r.report_type)).join('、')}均有明确未持有披露。最新公告 ${esc(a.latest_announcement_date)}；原核查日期 ${esc(a.checked_at)}，接入复核 ${esc(a.verified_on)}；本证据映射可用于 ${esc(a.available_on)} 及之后的当前视图。</p><p class="method-note">${esc(a.scope_note)}${a.latest_period_covered===false?' 最新资产报告为'+esc(a.latest_asset_report_date)+'，超出证据范围，尚待核查。':''}</p><details class="bc-legacy-details"><summary>94份报告核查依据</summary><div class="bv-table"><table><thead><tr><th>报告期</th><th>类型</th><th>公告日（既有目录）</th><th>明确披露原文</th><th>原报告</th></tr></thead><tbody>${reportRows}</tbody></table></div></details></div>`;
 }
 root.BondVisualABSEvidence={audit,dates,view};if(typeof module!=='undefined')module.exports=root.BondVisualABSEvidence;
})(typeof window==='undefined'?globalThis:window);
