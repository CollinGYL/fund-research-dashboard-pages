/* Convertible industry display. No absent-to-zero fill and no turnover reconstruction. */
(function(root){
 'use strict';
 const ok=v=>typeof v==='number'&&Number.isFinite(v),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),pct=v=>ok(v)?v.toFixed(2)+'%':'—';
 const dimensions=[['l1','一级行业'],['l2','二级行业'],['l3','三级行业'],['sector','产业板块'],['chain','上下游产业链'],['style','风格板块']];
 function rows(periods,date){const p=periods.find(p=>p.dt===date),names=[...new Set(periods.flatMap(p=>(p.rows||[]).map(r=>r.name)))],map=new Map((p?.rows||[]).map(r=>[r.name,r.wt]));return names.map(name=>({name,value:ok(map.get(name))?map.get(name):null})).sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity));}
 function heatmap(periods,limit=12){
  const names=new Map();for(const p of periods)for(const r of p.rows||[])if(ok(r.wt))names.set(r.name,Math.max(names.get(r.name)??-Infinity,r.wt));
  const top=[...names].sort((a,b)=>b[1]-a[1]).slice(0,limit),cap=Math.max(.01,...top.map(x=>x[1]));
  const body=top.map(([name])=>'<tr><th scope="row">'+esc(name)+'</th>'+periods.map(p=>{const value=(p.rows||[]).find(r=>r.name===name)?.wt;return ok(value)?`<td style="background:rgba(61,128,130,${.05+Math.max(0,value)/cap*.6})" title="${esc(name+' '+p.dt)}：${pct(value)}">${value.toFixed(2)}</td>`:'<td class="bvc-missing" title="本期缺少该行业值">—</td>';}).join('')+'</tr>').join('');
  return `<div class="bvc-heatmap"><table><thead><tr><th>行业／报告期</th>${periods.map(p=>`<th>${esc(p.dt)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><p class="method-note">数字单位为占基金净资产百分比（NAV%），如1.20表示1.20%。行是历史最高权重前${top.length}个行业，列覆盖${esc(periods[0]?.dt||'—')}至${esc(periods.at(-1)?.dt||'—')}；色深上限${pct(cap)}。0.00为明确取得的零，—为该期缺值；横向滚动查看全部日期。</p>`;
 }
 function view(d,level='l1',date){
  const periods=d.archive?.cb?.industry?.[level]||[],current=periods.find(p=>p.dt===date)||periods.at(-1);if(!current)return '<p class="method-note">该维度没有可得转债行业历史，不填零。</p>';
  const items=rows(periods,current.dt),index=periods.indexOf(current),previous=periods[index-1],prior=new Map((previous?.rows||[]).map(r=>[r.name,r.wt])),cap=Math.max(.01,...items.map(r=>r.value??0));
  const weights=items.map(r=>`<div class="bvc-weight"><span>${esc(r.name)}</span><i style="width:${ok(r.value)?Math.max(0,r.value)/cap*100:0}%"></i><b>${pct(r.value)}</b></div>`).join('');
  const changes=items.map(r=>{const v=ok(r.value)&&ok(prior.get(r.name))?r.value-prior.get(r.name):null;return `<tr><td>${esc(r.name)}</td><td>${pct(prior.get(r.name))}</td><td>${pct(r.value)}</td><td>${ok(v)?(v>0?'+':'')+v.toFixed(2)+' pp':'—'}</td></tr>`;}).join('');
  return `<p class="method-note">${esc(current.dt)} · 转债对应正股名义市值／基金净资产。缺失未补零，未匹配行业单独保留。${level==='style'?'风格板块为行业周期性分类，不是大小盘或成长价值因子。':''}</p><div class="bvc-pair"><section><h4>行业权重分布</h4><div class="bvc-weight-list">${weights}</div></section><section><h4>行业权重变化</h4><p class="method-note">${previous?esc(previous.dt)+' → '+esc(current.dt):'无上一可得报告期'}；仅两端有值时计算。</p><div class="fusion-table-wrap"><table><thead><tr><th>行业</th><th>上期</th><th>本期</th><th>变化</th></tr></thead><tbody>${changes}</tbody></table></div></section></div><h4>行业配置时间轴</h4>${heatmap(periods)}`;
 }
 root.BondVisualCB={dimensions,rows,heatmap,view};if(typeof module!=='undefined')module.exports=root.BondVisualCB;
})(typeof window==='undefined'?globalThis:window);
