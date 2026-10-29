/* Optional summaries share in-flight loads; rank failures keep the catalog usable. */
(function(){
 const items=[['fund_lifecycle_overlay.js','FUND_LIFECYCLE_DATA'],['fund_lifecycle_ranks.js','FUND_LIFECYCLE_RANKS'],['bond_fusion_index.js','BOND_CB_FUSION_INDEX']];
 const status=document.createElement('p');status.className='method-note';status.hidden=true;
 document.querySelector('#data-scope-details')?.append(status);
 function one([name,key]){
  if(window[key])return Promise.resolve();
  return new Promise((resolve,reject)=>{const s=document.createElement('script');let done=false;const finish=e=>{if(done)return;done=true;clearTimeout(timer);s.remove();e?reject(e):resolve();};const timer=setTimeout(()=>finish(Error(name+' 加载超时')),15000);s.src='https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/'+name;s.async=true;s.onload=()=>finish(window[key]?null:Error(name+' 内容不完整'));s.onerror=()=>finish(Error(name+' 暂时无法加载'));document.head.append(s);});
 }
 function refresh(){const tasks=items.map(one);window.FundIntegrationReady=tasks[0];window.FundRankReady=tasks[1];Promise.allSettled(tasks).then(results=>{const failures=results.filter(x=>x.status==='rejected');status.hidden=!failures.length;if(failures.length){status.textContent='部分分类摘要尚未加载。';const b=document.createElement('button');b.textContent='重试';b.onclick=refresh;status.append(b);}const update=()=>{if(typeof renderFunds==='function'&&typeof funds!=='undefined'&&funds.length)renderFunds();};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update,{once:true});else update();});}
 refresh();
})();
