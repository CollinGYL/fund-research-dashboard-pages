/* Additional facts use only saved disclosure records, never model inference. */
(function(){
 'use strict';if(!document.body.classList.contains('desktop-detail'))return;
 const root=document.querySelector('#fund-page');if(!root)return;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const percent=x=>{if(!finite(x))return '—';const n=Number((x*100).toFixed(2));return n===0?'0%':n.toFixed(2)+'%';};
 const difference=x=>finite(x)?(Math.abs(x)<.00005?'0':(x>0?'+':'')+(x*100).toFixed(2)):'—';
 const known=name=>!/(未知|未映射|未分类|unknown|unmapped)/i.test(name);
 if(typeof renderPairProfileComparison==='function'){
  const previous=renderPairProfileComparison;
  renderPairProfileComparison=function(left,right,key,base,peer,errors){
   let html=previous(left,right,key,base,peer,errors),a=left?.windows?.[key]?.industry,b=right?.windows?.[key]?.industry;
   if(!a||!b)return html;
   const labels=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(known),common=labels.filter(k=>(a[k]||0)>0&&(b[k]||0)>0).sort((x,y)=>Math.min(b[y]||0,a[y]||0)-Math.min(b[x]||0,a[x]||0)).slice(0,3),differences=labels.map(k=>({k,d:(a[k]||0)-(b[k]||0)})).sort((x,y)=>Math.abs(y.d)-Math.abs(x.d)).slice(0,3);
   const unknown=[a,b].map(v=>Object.entries(v).filter(([k])=>!known(k)).reduce((s,[,v])=>s+v,0));
   const facts=`<div class="profile-source-strip"><span>共同较重行业：<strong>${common.length?common.map(esc).join('、'):'暂无共同较重行业'}</strong></span><span>A股内部行业占比差：${differences.map(x=>`${esc(x.k)} ${difference(x.d)}个百分点`).join('；')}</span>${unknown.some(x=>x>0)?`<span>未映射行业：${percent(unknown[0])} ／ ${percent(unknown[1])}；共同点只列已识别行业。</span>`:''}</div>`;
   return facts+html;
  };
 }
 function mount(){
  const host=root.querySelector('[data-historical-profile]');if(!host||host.querySelector('[data-custom-profile-facts]'))return;
  const code=host.dataset.historicalProfile,r=window.FUND_PROFILE_DETAILS?.[code];if(!r?.history?.length)return;
  const dates=r.history.map(x=>x.date).sort(),panel=document.createElement('details');panel.className='subpanel profile-comparison-diagnostics';panel.dataset.customProfileFacts=code;
  panel.innerHTML=`<summary>自选区间 · 单基金完整披露记录</summary><p>筛选已有完整披露日期；此区间独立于上方相似基金的预设比较窗口。</p><div class="compare-controls"><label>开始日期 <input type="date" data-profile-from min="${dates[0]}" max="${r.as_of}" value="${dates[0]}"></label><label>结束日期 <input type="date" data-profile-to min="${dates[0]}" max="${r.as_of}" value="${dates.at(-1)}"></label></div><div data-custom-profile-output></div><div data-profile-change-output></div>`;
  host.append(panel);
  function update(){
   const from=panel.querySelector('[data-profile-from]').value,to=panel.querySelector('[data-profile-to]').value,out=panel.querySelector('[data-custom-profile-output]');
   if(!from||!to||from>to||to>r.as_of){out.textContent='请选择有效日期区间，结束日不晚于'+r.as_of+'。';return;}
   const rows=r.history.filter(p=>p.date>=from&&p.date<=to),fields=[['market_cap','持仓公司市值'],['pb','市净率'],['roe','持仓公司净资产收益率'],['concentration','前十大A股占A股比例'],['persistence','持股留存']];
   const value=(p,k)=>typeof profilePairMetricValue==='function'?profilePairMetricValue(k,p.values?.[k]):String(p.values?.[k]??'—');
   out.innerHTML=`<p class="method-note">实际纳入 ${rows.length} 期${rows.length?' · '+rows[0].date+' 至 '+rows.at(-1).date:''}。</p><div class="table-scroll"><table class="research-table"><thead><tr><th>完整披露</th><th>公告日期</th>${fields.map(([,n])=>'<th>'+n+'</th>').join('')}</tr></thead><tbody>${rows.map(p=>`<tr><td>${p.date}</td><td>${esc(p.announcement||'—')}</td>${fields.map(([k])=>'<td>'+esc(value(p,k))+'</td>').join('')}</tr>`).join('')||'<tr><td colspan="7">所选区间没有完整披露。</td></tr>'}</tbody></table></div>`;
  }
  panel.querySelectorAll('input').forEach(e=>e.addEventListener('change',update));update();
  const load=()=>{
   const out=panel.querySelector('[data-profile-change-output]');out.textContent='正在加载披露变化记录…';
   loadDataScript('https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/profile_changes/'+encodeURIComponent(code)+'.js','披露变化记录',()=>window.FUND_PROFILE_CHANGES?.[code]).then(data=>{
    const e=data.latest_change;if(!e){out.textContent='目前仅有一期或没有可比完整披露，保留当期事实。';return;}
    out.innerHTML=`<h4>最新完整披露变化（独立于上方自选区间） · ${esc(e.previous_date)} → ${esc(e.report_date)}</h4><p>${e.manager_changed?'期间经理结构变化；':''}以下为两期行业占净值比例之差；例如20%减10%=+10个百分点，并非相对增长10%。</p><div class="table-scroll"><table class="research-table"><thead><tr><th>行业</th><th>上期</th><th>本期</th><th>权重之差（百分点）</th></tr></thead><tbody>${e.industries.map(x=>`<tr><td>${esc(x.name)}</td><td>${percent(x.previous)}</td><td>${percent(x.current)}</td><td>${difference(x.change)}</td></tr>`).join('')}</tbody></table></div><p class="method-note">按已披露组合计算，包含价格与资产规模影响。事件版本 ${esc(e.id.slice(0,12))}。</p>`;
   }).catch(error=>{out.textContent='披露变化记录尚未加载：'+error.message+'。';const b=document.createElement('button');b.textContent='重试';b.onclick=load;out.append(b);});
  };
  let loaded=false;panel.addEventListener('toggle',()=>{if(panel.open&&!loaded){loaded=true;load();}});
 }
 new MutationObserver(mount).observe(root,{childList:true,subtree:true});mount();
})();
