/* Shared review requirements: one search, overview positioning, explicit data sources. */
(function(){
 'use strict';
 if(!document.body.classList.contains('desktop-home'))return;
 const top=document.querySelector('.research-sidebar'), original=document.querySelector('#fund-search'), toolbar=document.querySelector('.list-toolbar');
 if(!top||!original||!toolbar)return;
 const levels=document.querySelector('#industry-bar-controls');if(levels)toolbar.querySelector('.decision-view-switch')?.insertAdjacentElement('afterend',levels);
 const box=document.createElement('div');box.className='header-fund-search home-search-box';
 box.innerHTML='<label class="sr-only" for="header-fund-search">快速查找基金</label><input id="header-fund-search" type="search" placeholder="名称、代码、经理" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="fund-search-suggestions"><button type="button" aria-label="清空搜索关键词">×</button>';
 top.append(box);const quick=box.querySelector('input');quick.value=original.value;let anchor=original;
 const list=document.querySelector('#fund-search-suggestions');
 if(list){document.body.append(list);list.classList.add('shared-search-suggestions','home-search-box');}
 function position(){
  if(!list||list.hidden)return;
  const r=anchor.getBoundingClientRect(),h=document.querySelector('.site-header').getBoundingClientRect().height;
  if(r.bottom<h||r.top>innerHeight){closeSuggestions();return;}
  const width=Math.min(Math.max(r.width,340),innerWidth-24);
  Object.assign(list.style,{position:'fixed',zIndex:'1200',left:Math.min(Math.max(12,r.left),innerWidth-width-12)+'px',top:r.bottom+4+'px',width:width+'px',maxHeight:Math.max(90,innerHeight-r.bottom-20)+'px',overflow:'auto'});
  quick.setAttribute('aria-expanded',String(!list.hidden));
 }
 const priorSuggestions=renderSuggestions;
 renderSuggestions=function(){priorSuggestions();position();};
 quick.addEventListener('input',()=>{anchor=quick;original.value=quick.value;original.dispatchEvent(new Event('input',{bubbles:true}));});
 quick.addEventListener('focus',()=>{anchor=quick;renderSuggestions();});
 quick.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSuggestions();quick.setAttribute('aria-expanded','false');}else if(e.key==='Enter'){const item=list?.querySelector('.active')||list?.querySelector('[role=option]');if(item&&!list.hidden){e.preventDefault();item.click();}}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();moveSuggestion(e.key==='ArrowDown'?1:-1);}});
 original.addEventListener('focus',()=>{anchor=original;position();});original.addEventListener('input',()=>{quick.value=original.value;});
 box.querySelector('button').addEventListener('click',()=>{quick.value=original.value='';original.dispatchEvent(new Event('input',{bubbles:true}));quick.focus();});
 original.addEventListener('keydown',e=>{if(e.key==='Enter'&&!list.hidden){const item=list.querySelector('.active')||list.querySelector('[role=option]');if(item){e.preventDefault();item.click();}}});
 window.addEventListener('scroll',position,{passive:true,capture:true});window.addEventListener('resize',position,{passive:true});
 const snapshotKey='fund.overview.return.v2',routeKey='fund.overview.route.v2';
 const read=k=>{try{return JSON.parse(sessionStorage.getItem(k)||'null');}catch{return null;}};
 const store=(k,v)=>sessionStorage.setItem(k,JSON.stringify(v));
 let route=read(routeKey),highlight=route?.action==='locate'?route.code:null,scrolled=false,restored=false;
 const oldCore=allFundCoreCell;
 allFundCoreCell=function(f){const holder=document.createElement('div');holder.innerHTML=oldCore(f);holder.querySelectorAll('[data-industry-code]').forEach(x=>x.remove());return holder.innerHTML+(activeCategory==='all'?`<a class="locate-fund-category" href="index.html?category=${encodeURIComponent(f.category)}" data-locate-code="${f.code}">定位到分类列表 ↗</a>`:'');};
 const back=document.createElement('button');back.type='button';back.className='overview-return-button';back.textContent='返回基金总览';back.hidden=true;
 (toolbar.querySelector('.column-settings')||toolbar.querySelector('#clear-decision-filters'))?.insertAdjacentElement('afterend',back);
 function snapshot(){const wrap=document.querySelector('.fund-list-wrap');return {query:window.location.search,page:currentPage,scroll:window.scrollY,left:wrap?.scrollLeft||0};}
 document.addEventListener('click',e=>{
  const link=e.target.closest('[data-locate-code]');if(!link)return;
  const f=funds.find(x=>x.code===link.dataset.locateCode);if(!f)return;e.preventDefault();store(snapshotKey,snapshot());store(routeKey,{action:'locate',code:f.code});
  const url=new URL(window.location.href);url.pathname=url.pathname.replace(/[^/]*$/,'index.html');url.searchParams.set('category',f.category);url.searchParams.set('page','1');
  for(const k of ['q','size','subtype','profile','age','data'])url.searchParams.delete(k);
  const cutoff=url.searchParams.get('navDate');if(cutoff&&cutoff!=='latest'&&f.inception_date&&cutoff<f.inception_date)url.searchParams.set('navDate','latest');
  url.hash='samples';window.location.assign(url.pathname+url.search+url.hash);
 });
 back.addEventListener('click',()=>{const saved=read(snapshotKey);if(!saved)return;store(routeKey,{action:'return',saved});window.location.assign('index.html'+saved.query);});
 let changing=false;
 function synchronize(){
  quick.value=original.value;back.hidden=activeCategory==='all'||!read(snapshotKey);
  if(changing||!funds.length)return;
  if(route?.action==='return'&&!restored){const saved=route.saved;restored=true;changing=true;currentPage=saved.page;renderFunds();changing=false;requestAnimationFrame(()=>{const wrap=document.querySelector('.fund-list-wrap');if(wrap)wrap.scrollLeft=saved.left;window.scrollTo(0,saved.scroll);});sessionStorage.removeItem(routeKey);sessionStorage.removeItem(snapshotKey);route=null;}
  if(highlight){
   const rows=filteredFunds(),i=rows.findIndex(x=>x.code===highlight);
   if(i<0)return;
   const wanted=Math.floor(i/PAGE_SIZE)+1;
   if(currentPage!==wanted){changing=true;currentPage=wanted;renderFunds();changing=false;}
   const link=document.querySelector('#fund-grid a[href*="code='+highlight+'"]'),row=link?.closest('tr');
   if(row){row.classList.add('located-fund-row');if(!scrolled){scrolled=true;requestAnimationFrame(()=>row.scrollIntoView({block:'center'}));}}
   sessionStorage.removeItem(routeKey);
  }
 }
 document.addEventListener('click',e=>{if(e.target.closest('[data-page],[data-sort-key],[data-classification-direction-level],#clear-decision-filters')){highlight=null;document.querySelectorAll('.located-fund-row').forEach(x=>x.classList.remove('located-fund-row'));}});
 document.addEventListener('change',e=>{if(e.target.closest('.list-toolbar,#fund-list-head'))highlight=null;});
 new MutationObserver(synchronize).observe(document.querySelector('#fund-grid'),{childList:true});
 synchronize();
})();
