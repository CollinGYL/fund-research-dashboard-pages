/* Small adapter: use the existing bounded loaders and the validated local API. */
(function(root){
 'use strict';
 const base='https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/',prefix=['data','fund_dashboard',''].join('/');
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let indexPromise;
 function dataURL(path){
  if(!path.startsWith(prefix))throw new Error('补充数据路径无效');
  const rel=path.slice(prefix.length);
  if(!/^(?:(?:own_fund_investments|cb_advanced_inputs|ipo_inputs)\/\d{6}\.(?:OF|SH|SZ)|applicable_market_context|cb_term_snapshots|bond_advanced_pack_index)\.js(?:\?v=[a-f0-9]+)?$/.test(rel))throw new Error('补充数据路径未登记');
  return base+rel;
 }
 function loader(path,label,get){
  const url=dataURL(path);
  if(typeof loadDataScript==='function')return loadDataScript(url,label,get);
  if(typeof loadHomepageScript==='function')return loadHomepageScript(url,label,get);
  return Promise.reject(new Error('网页数据加载器未准备好'));
 }
 function index(){
  if(root.BOND_ADVANCED_PACK_INDEX?.schema_version==='bond_advanced_pack_index.v1'&&root.BOND_ADVANCED_PACK_INDEX?.modules)return Promise.resolve(root.BOND_ADVANCED_PACK_INDEX);
  if(!indexPromise){
   const value=typeof DASHBOARD_DATA_VERSION!=='undefined'?DASHBOARD_DATA_VERSION:typeof catalog!=='undefined'?catalog?.generated_at:null;
   const version=String(value||'1').replace(/[^a-f0-9]/gi,'').slice(0,32);
   indexPromise=loader(prefix+'bond_advanced_pack_index.js?v='+version,'债基补充资料',()=>{
    const p=root.BOND_ADVANCED_PACK_INDEX;if(p?.schema_version!=='bond_advanced_pack_index.v1'||!p.modules)throw new Error('债基补充资料索引不完整');return p;
   }).catch(e=>{indexPromise=null;throw e;});
  }
  return indexPromise;
 }
 async function payload(kind,code){return root.BondAdvancedPack.load(await index(),kind,code,loader);}
 async function mount(host,kind,code){
  if(!host)return false;
  const kinds={features:'cb_advanced_inputs',ownFunds:'own_fund_investments',ipo:'ipo_inputs'};
  if(!kinds[kind])throw new Error('补充资料类型无效');
  if(host.dataset.advancedReady===code+':'+kind)return true;
  host.setAttribute('aria-busy','true');if(!host.hasChildNodes())host.innerHTML='<p class="method-note" data-advanced-loading>正在加载补充资料…</p>';
  try{
   const p=await payload(kinds[kind],code);if(!host.isConnected)return false;
   host.innerHTML=root.BondAdvancedPack[kind](p);root.BondAdvancedPack.bind(host,p,kind);host.dataset.advancedReady=code+':'+kind;return true;
  }catch(e){
   if(host.isConnected){host.querySelector('[data-advanced-loading]')?.remove();let message=host.querySelector('[data-advanced-error]');if(!message){message=document.createElement('div');message.dataset.advancedError='';host.append(message);}message.innerHTML=`<p class="method-note">补充资料暂未加载：${esc(e.message)}</p><button type="button" data-advanced-retry>重试</button>`;message.querySelector('button').addEventListener('click',()=>{message.remove();void mount(host,kind,code);});}
   return false;
  }finally{host.removeAttribute('aria-busy');}
 }
 async function mountMarket(host,category){
  if(!host)return;
  const supported=['active-equity','hybrid-bond','convertible-bond'];host.hidden=!supported.includes(category);if(host.hidden)return;
  if(host.dataset.advancedCategory===category)return;
  host.dataset.advancedCategory=category;
  try{
   const p=await payload('market','');if(host.hidden||host.dataset.advancedCategory!==category)return;
   const secondary=category==='hybrid-bond';const key=secondary?'secondary-bond':category;
   host.innerHTML=(secondary?'<div class="bap-market-switch" role="group" aria-label="债基市场类型"><button type="button" data-bap-context="secondary-bond" aria-pressed="true">二级债基市场</button><button type="button" data-bap-context="primary-bond" aria-pressed="false">一级债基市场</button></div>':'')+'<div data-advanced-market-body></div>';
   const body=host.querySelector('[data-advanced-market-body]');
   const show=k=>{body.innerHTML=root.BondAdvancedPack.market(p,k);root.BondAdvancedPack.bind(body,p,'market',k);host.querySelectorAll('[data-bap-context]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.bapContext===k)));};
   host.querySelectorAll('[data-bap-context]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.bapContext)));show(key);
  }catch(e){if(host.dataset.advancedCategory!==category)return;delete host.dataset.advancedCategory;host.innerHTML=`<p class="method-note">市场概览暂未加载：${esc(e.message)}</p><button type="button" data-advanced-market-retry>重试</button>`;host.querySelector('button').addEventListener('click',()=>mountMarket(host,category));}
 }
 root.BondAdvancedUI={mount,mountMarket,payload,dataURL};
 if(typeof module!=='undefined')module.exports=root.BondAdvancedUI;
})(typeof window!=='undefined'?window:globalThis);
