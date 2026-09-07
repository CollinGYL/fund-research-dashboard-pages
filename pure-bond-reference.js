/* ===== 纯债看板渲染器（移植自 纯债基金.html，5 个 tab 整体替换）===== */
(function(){

const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const P=(x,d=2)=>(x==null||Number.isNaN(x))?"—":(x*100).toFixed(d)+"%";
const NN=(x,d=2)=>(x==null||Number.isNaN(x))?"—":Number(x).toFixed(d);
const pcls=x=>x==null?"":(x>=0?"value-positive":"value-negative");
/* ★2026-08-17 券种/大类按「市场生态统计」页模块九的四层科目树重做。
   券种八项合计≈固定收益投资(实测闭合 99.71%,原四项只有 55.99%);
   「未明细」是差额兜底,现在通常为 0——若某期它明显>0,说明那期没披露券种明细。
   ⚠ 不要再加 政策性金融债 / 地方政府债:它们已含在 金融债 / 国债 里,加了就是重复计。 */
const SC={gov:"var(--c-gov)",fin:"var(--c-fin)",corp:"var(--c-corp)",cb:"var(--c-cb)",
          bill:"var(--c-bill)",absv:"var(--c-abs)",cds:"var(--c-cds)",othbd:"var(--c-othbd)",
          other:"var(--c-other)"};
const SCN={gov:"国债及地方政府债",fin:"金融债",corp:"企业债",cb:"可转债",
           bill:"央行票据",absv:"资产支持证券",cds:"同业存单",othbd:"其他债券",
           other:"未明细"};
const SKEYS=["gov","fin","corp","cb","bill","absv","cds","othbd","other"];
/* 大类六项,合计=杠杆率×100(实测 100.00% 相等),不是 100 */
const AC={bond:"var(--c-bond)",cash:"var(--c-cash)",stk:"var(--c-stk)",
          othasset:"var(--c-othasset)",fund:"var(--c-fund)",mm:"var(--c-mm)"};
const ACN={bond:"固定收益投资",cash:"现金",stk:"股票",
           othasset:"其他资产",fund:"基金",mm:"货币市场工具"};
const AKEYS=["bond","cash","stk","othasset","fund","mm"];
const FACN={level:"利率",slope:"斜率",curve:"凸度",credit:"信用",default:"违约"};

/* ===== 悬浮提示(tooltip) ===== */
const tt=document.getElementById("tt");
function showTT(html,e){tt.innerHTML=html;tt.style.opacity=1;moveTT(e);}
function moveTT(e){tt.style.left=Math.min(e.clientX+12,innerWidth-tt.offsetWidth-10)+"px";tt.style.top=(e.clientY+12)+"px";}
function hideTT(){tt.style.opacity=0;}
document.addEventListener("mousemove",e=>{if(tt.style.opacity==="1")moveTT(e);});

/* ===== SVG 图表 ===== */
function xTicks(x0,x1){
  const d0=new Date(x0),d1=new Date(x1),span=(d1-d0)/864e5,out=[];
  if(span>550){for(let y=d0.getFullYear()+1;y<=d1.getFullYear();y++)out.push([`${y}-01-01`,String(y)]);}
  else if(span>40){let y=d0.getFullYear(),m=d0.getMonth();for(let i=0;i<24;i++){m++;if(m>11){m=0;y++;}const dt=`${y}-${String(m+1).padStart(2,"0")}-01`;if(new Date(dt)>d0&&new Date(dt)<d1)out.push([dt,`${String(y).slice(2)}-${String(m+1).padStart(2,"0")}`]);}}
  else{for(let i=1;i<6;i++){const t=new Date(d0.getTime()+(d1-d0)*i/6);out.push([t.toISOString().slice(0,10),t.toISOString().slice(5,10)]);}}
  return out;
}
let __chartSeq=900000;
const CHART_GEOM={};
function lineChart(series,opt={}){
  const id=__chartSeq++;
  // ★2026-08-05用户需求(参照旧看板"基金研究系统看板_本地版"的画法):回撤阴影要"从天花板
  // (0%)倒挂下来"、用独立右轴表现,不能跟净值曲线共用一个量程——净值累计收益能到100%+,
  // 回撤只有±5%量级,共轴的话回撤会被压成贴着0线的一条细线,完全看不出"悬垂"的效果。
  // 系列里标了rightAxis:true的,单独算一套y-scale(0在顶、当前窗口最深回撤在底),
  // 用polygon从顶边→回撤曲线→顶边收口画阴影(不额外画描边线,阴影本身自带细边框)。
  // 没有任何系列标rightAxis时这段逻辑完全不生效,不影响其他图表(资产配置/久期/因子等)。
  const rightSeries=series.filter(s=>s.rightAxis);
  const mainSeries=series.filter(s=>!s.rightAxis);
  const w=opt.w||700,h=opt.h||210,pl=46,pr=rightSeries.length?46:14,pt=12,pb=24,pw=w-pl-pr,ph=h-pt-pb;
  // ★2026-07-30修复(用户实测发现):forceX强制统一时间轴时,若某条series的原始数据范围
  // 比forceX的[x0,x1]更宽(比如国债收益率曲线2002年起,但资产配置tab统一对齐到基金自己
  // 的成立日~现在),原来的绘图逻辑不会裁掉窗口外的点,这些点算出来的像素坐标会跑到绘图区
  // 之外,画出一段"超出画面"的线段。改成:有forceX时,先按[x0,x1]裁剪掉窗口外的点,
  // 且y轴量程也只按裁剪后的可见点计算(否则窗口外的极值会把y轴撑得过松,浪费可见区域的分辨率)。
  const x0=opt.forceX?opt.forceX.x0:null,x1=opt.forceX?opt.forceX.x1:null;
  const inRange=t=>x0==null||(t>=x0&&t<=x1);
  const clipped=mainSeries.map(s=>({...s,points:s.points.filter(p=>p[1]!=null&&inRange(+new Date(p[0])))}));
  const clippedRight=rightSeries.map(s=>({...s,points:s.points.filter(p=>p[1]!=null&&inRange(+new Date(p[0])))}));
  // ★2026-08-07新增 opt.bands:区间带(如同类P25~P75分布带),画在折线【下面】当背景。
  // 形如 [{lo:[[dt,v]..], hi:[[dt,v]..], color, opacity, name}]。lo/hi 必须等长同日期。
  // 只在传了 opt.bands 时生效,不影响任何既有调用方。
  const bands=(opt.bands||[]).map(b=>({...b,
    lo:b.lo.filter(p=>p[1]!=null&&inRange(+new Date(p[0]))),
    hi:b.hi.filter(p=>p[1]!=null&&inRange(+new Date(p[0])))}));
  let all=[];clipped.forEach(s=>s.points.forEach(p=>all.push(p[1])));
  bands.forEach(b=>{b.lo.forEach(p=>all.push(p[1]));b.hi.forEach(p=>all.push(p[1]));});  // 带子也要进量程
  if(!all.length&&!clippedRight.some(s=>s.points.length))return `<div class="method-note">无数据</div>`;
  if(opt.refLine!=null)all.push(opt.refLine);   // ★2026-07-30:保证参考线(如杠杆1x)落在可视量程内
  let ymin=all.length?Math.min(...all):0,ymax=all.length?Math.max(...all):1;
  if(opt.zero)ymin=Math.min(ymin,0);
  const pad=(ymax-ymin)*0.1||0.01;ymin-=pad;ymax+=pad;
  if(opt.floor!=null)ymin=Math.max(ymin,opt.floor);
  if(opt.ceil!=null)ymax=Math.min(ymax,opt.ceil);   // ★2026-08-07:分位图要把量程夹在0~100%
  const allx=clipped.flatMap(s=>s.points.map(p=>+new Date(p[0]))).concat(clippedRight.flatMap(s=>s.points.map(p=>+new Date(p[0]))));
  const x0f=x0!=null?x0:Math.min(...allx),x1f=x1!=null?x1:Math.max(...allx);
  const X=t=>pl+(x1f===x0f?pw/2:(t-x0f)/(x1f-x0f)*pw),Y=v=>pt+ph-(v-ymin)/(ymax-ymin)*ph;
  const rAll=clippedRight.flatMap(s=>s.points.map(p=>p[1]));
  const rMin=rAll.length?Math.min(0,...rAll,-0.0001):-0.0001;   // 右轴永远以0为天花板,不留padding
  const YR=v=>pt+(Math.abs(v)/Math.abs(rMin))*ph;
  let svg=`<svg viewBox="0 0 ${w} ${h}" id="svg_${id}">`;
  for(let i=0;i<=4;i++){const v=ymin+(ymax-ymin)*i/4,y=Y(v);svg+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="#e1e8ec"/><text x="${pl-5}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="11" fill="#7b8a98">${opt.pctY?P(v,1):NN(v,opt.dp||2)}</text>`;}
  if(ymin<0&&ymax>0){const y=Y(0);svg+=`<line x1="${pl}" y1="${y}" x2="${w-pr}" y2="${y}" stroke="#aeb9c2"/>`;}
  if(opt.refLine!=null){const y=Y(opt.refLine);svg+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="${opt.refLineColor||"#c0392b"}" stroke-width="1.4" stroke-dasharray="5,4"/>`;}
  xTicks(x0f,x1f).forEach(([dt,lb])=>{const x=X(+new Date(dt));svg+=`<text x="${x.toFixed(1)}" y="${h-7}" text-anchor="middle" font-size="11" fill="#7b8a98">${lb}</text>`;});
  // 区间带画在最底层(网格之上、折线之下),上沿沿hi正向走、下沿沿lo逆向回来,闭合成多边形
  bands.forEach(b=>{
    if(b.lo.length<2||b.hi.length!==b.lo.length)return;
    const up=b.hi.map(p=>`${X(+new Date(p[0])).toFixed(1)},${Y(p[1]).toFixed(1)}`);
    const dn=b.lo.slice().reverse().map(p=>`${X(+new Date(p[0])).toFixed(1)},${Y(p[1]).toFixed(1)}`);
    svg+=`<polygon points="${up.concat(dn).join(" ")}" fill="${b.color}" fill-opacity="${b.opacity!=null?b.opacity:0.16}" stroke="none"/>`;
  });
  if(rightSeries.length){
    for(let i=0;i<=4;i++){const v=rMin*i/4,y=YR(v);svg+=`<text x="${w-pr+8}" y="${(y+4).toFixed(1)}" font-size="11" fill="#7b8a98">${P(v,0)}</text>`;}
  }
  clippedRight.forEach(s=>{
    const pts=s.points.map(p=>[X(+new Date(p[0])),YR(p[1])]);
    if(!pts.length)return;
    const poly=`${pts[0][0].toFixed(1)},${pt} `+pts.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ")+` ${pts[pts.length-1][0].toFixed(1)},${pt}`;
    svg+=`<polygon points="${poly}" fill="${s.color}" fill-opacity="0.18" stroke="${s.color}" stroke-opacity="0.55" stroke-width="1"/>`;
  });
  clipped.forEach(s=>{
    const pts=s.points.map(p=>[X(+new Date(p[0])),Y(p[1])]);
    if(!pts.length)return;
    if(s.fill){svg+=`<path d="${"M"+pts.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" L")} L${pts[pts.length-1][0].toFixed(1)},${Y(Math.max(ymin,0)).toFixed(1)} L${pts[0][0].toFixed(1)},${Y(Math.max(ymin,0)).toFixed(1)} Z" fill="${s.color}" opacity="0.1"/>`;}
    if(s.sw!==0)svg+=`<path d="${"M"+pts.map((p,i)=>(i?"L":"")+p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ")}" fill="none" stroke="${s.color}" stroke-width="${s.sw||2.6}" stroke-linecap="round" stroke-linejoin="round"/>`;
    // ★2026-08-31:s.dots=true 的系列画成离散圆点(半年频披露真值这类低频观测,连成线会让人
    // 误以为每天都有值)。只在系列显式声明 dots 时生效,不影响任何既有调用方。
    if(s.dots)pts.forEach(p=>{svg+=`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.8" fill="${s.color}" stroke="#fff" stroke-width="1.3"/>`;});
  });
  svg+=`<rect class="hit" id="hit_${id}" x="${pl}" y="${pt}" width="${pw}" height="${ph}" fill="transparent"/>`;
  svg+=`<line id="vl_${id}" x1="${pl}" y1="${pt}" x2="${pl}" y2="${pt+ph}" stroke="#8a99a8" stroke-width="1" opacity="0"/>`;
  svg+=`</svg>`;
  // ★2026-08-07:图例过去只列折线,区间带没有条目——用户看到图②的阴影只能开口问那是什么,
  // 这是缺陷不是风格。带子(有name的)也进图例,色块画成矮胖半透明方块以区别于折线的细长条。
  const lgItems=series.map(s=>`<span><i class="sw" style="background:${s.color}"></i>${esc(s.name)}</span>`)
    .concat(bands.filter(b=>b.name).map(b=>
      `<span><i class="sw sw-band" style="background:${b.color};opacity:${Math.min(1,(b.opacity!=null?b.opacity:0.16)*2.6)}"></i>${esc(b.name)}</span>`));
  const lg=lgItems.length>1?`<div class="chart-legend">`+lgItems.join("")+`</div>`:"";
  // ★2026-07-30用户需求:图表下方可加一条"缩放滑条"控制时间轴展示范围(不是在图上拖拽框选,
  // 是图片下方独立的拖拽横条,参考股票软件的时间轴缩放条)。opt.sliderId给了才渲染,
  // 由调用方(如idxCompareChart)提供完整时间范围+onChange回调,具体交互见 zoomSlider()/wireZoomSlider()。
  const slider=opt.slider?zoomSlider(id,opt.slider.fullX0,opt.slider.fullX1,x0f,x1f):"";
  CHART_GEOM[id]={pl,pr,pt,pb,pw,ph,x0:x0f,x1:x1f};
  lineChart.lastId=id;
  setTimeout(()=>{
    wireLineChart(id,clipped.concat(clippedRight),{pl,pr,pt,pb,pw,ph,x0:x0f,x1:x1f,pctY:opt.pctY,dp:opt.dp});
    if(opt.slider)wireZoomSlider(id,opt.slider.fullX0,opt.slider.fullX1,opt.slider.onChange);
  },0);
  return `<div class="chart-wrap">${svg}</div>${lg}${slider}`;
}
function wireLineChart(id,series,g){
  const hit=document.getElementById("hit_"+id),vl=document.getElementById("vl_"+id);
  if(!hit||!vl)return;
  // ★2026-08-07性能修复:同类百分位改日频后单条series有3200+点,原来每次mousemove都对
  // 每个点重新 new Date(p[0]) 解析字符串(5条线×3227点=16k次/帧),鼠标一动就卡。
  // 时间戳只跟数据有关、不随鼠标变,这里在wire时一次性解析好缓存成数字数组。
  // 对原有的小图(几十~几百点)同样有效,只是原来感觉不出来。
  series.forEach(s=>{if(!s._ts)s._ts=s.points.map(p=>+new Date(p[0]));});
  hit.addEventListener("mousemove",ev=>{
    const r=hit.getBoundingClientRect();
    const f=Math.max(0,Math.min(1,r.width?(ev.clientX-r.left)/r.width:0));
    const sx=g.pl+f*g.pw,t=g.x0+f*(g.x1-g.x0);
    vl.setAttribute("x1",sx);vl.setAttribute("x2",sx);vl.setAttribute("opacity","1");
    let bestDate="",bestDist=Infinity;const lines=[];
    series.forEach(s=>{
      let b=null,bd=Infinity;
      for(let i=0;i<s.points.length;i++){
        const p=s.points[i];if(p[1]==null)continue;
        const dd=Math.abs(s._ts[i]-t);if(dd<bd){bd=dd;b=p;}
      }
      if(b){if(bd<bestDist){bestDist=bd;bestDate=b[0];}lines.push(`<span style="color:${s.color}">●</span> ${esc(s.name)}: <b>${g.pctY?P(b[1],1):NN(b[1],g.dp||2)}</b>`);}
    });
    showTT(`<div style="opacity:.75">${esc(bestDate)}</div>${lines.join("<br>")}`,ev);
  });
  hit.addEventListener("mouseleave",()=>{hideTT();vl.setAttribute("opacity","0");});
}
/* 时间轴缩放横条(★2026-07-30用户需求:不在图上拖拽框选,改成图片下方独立的拖拽横条控制展示范围)。
   横条本身始终按"完整时间范围"(fullX0~fullX1)画,中间那块高亮"窗口"代表当前展示的子区间——
   拖窗口中段=平移(pan),拖窗口两端手柄=缩放(resize)。松手时把新的[t0,t1]回调给上层重新画图。 */
function zoomSlider(id,fullX0,fullX1,curX0,curX1){
  const span=fullX1-fullX0||1;
  const leftPct=Math.max(0,Math.min(100,(curX0-fullX0)/span*100));
  const rightPct=Math.max(0,Math.min(100,(curX1-fullX0)/span*100));
  const fmtDt=t=>new Date(t).toISOString().slice(0,10);
  // ★2026-08-05用户反馈:光有两端手柄,拖之前完全看不出某个位置对应哪个日期,没法"预先"
  // 瞄准想看的区间(比如2019~2025)。借xTicks()的分档逻辑在横条上加刻度线+年份/月份标签:
  // 刻度线逐个画(方便精确对位),但文字标签太密会挤在一起,超过7个就隔几个才标一次文字。
  // 标签放在横条上方(bottom:100%),下面那行"起始/提示/结束"精确日期原样保留,两者不打架。
  const allTicks=xTicks(fullX0,fullX1);
  const labelEvery=allTicks.length>7?Math.ceil(allTicks.length/7):1;
  const ticksHtml=allTicks.map(([dt,lb],i)=>{
    const pct=(+new Date(dt)-fullX0)/span*100;
    if(pct<2||pct>98)return "";   // 太靠边的刻度会被裁掉一半标签,干脆不画
    return `<div class="zoom-tick" style="left:${pct.toFixed(2)}%">${i%labelEvery===0?`<span>${lb}</span>`:""}</div>`;
  }).join("");
  return `<div class="zoom-slider">
    <div class="zoom-track" id="zt_${id}">
      ${ticksHtml}
      <div class="zoom-window" id="zw_${id}" style="left:${leftPct.toFixed(2)}%;width:${Math.max(0.8,rightPct-leftPct).toFixed(2)}%">
        <div class="zoom-handle zoom-handle-l"></div>
        <div class="zoom-handle zoom-handle-r"></div>
      </div>
    </div>
    <div class="zoom-track-labels"><span>${fmtDt(fullX0)}</span><span>拖动横条中段可平移，拖两端手柄可缩放</span><span>${fmtDt(fullX1)}</span></div>
  </div>`;
}
function wireZoomSlider(id,fullX0,fullX1,onChange){
  const track=document.getElementById("zt_"+id),win=document.getElementById("zw_"+id);
  if(!track||!win||!onChange)return;
  const span=fullX1-fullX0||1,MIN_W=1.5;   // MIN_W:窗口最小宽度(占整条百分比),防止缩到看不见/取不到点
  const pctToT=pct=>fullX0+pct/100*span;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  let mode=null,startClientX=0,startLeftPct=0,startWidthPct=0;
  const beginDrag=(m,ev)=>{
    mode=m;startClientX=ev.clientX;
    startLeftPct=parseFloat(win.style.left)||0;startWidthPct=parseFloat(win.style.width)||0;
    ev.preventDefault();ev.stopPropagation();
  };
  win.querySelector(".zoom-handle-l").addEventListener("mousedown",ev=>beginDrag("l",ev));
  win.querySelector(".zoom-handle-r").addEventListener("mousedown",ev=>beginDrag("r",ev));
  win.addEventListener("mousedown",ev=>{if(!ev.target.classList.contains("zoom-handle"))beginDrag("move",ev);});
  window.addEventListener("mousemove",ev=>{
    if(!mode)return;
    const r=track.getBoundingClientRect();
    const dxPct=r.width?(ev.clientX-startClientX)/r.width*100:0;
    let newLeft=startLeftPct,newWidth=startWidthPct;
    if(mode==="move"){
      newLeft=clamp(startLeftPct+dxPct,0,100-startWidthPct);
    }else if(mode==="l"){
      newLeft=clamp(startLeftPct+dxPct,0,startLeftPct+startWidthPct-MIN_W);
      newWidth=startLeftPct+startWidthPct-newLeft;
    }else if(mode==="r"){
      newWidth=clamp(startWidthPct+dxPct,MIN_W,100-startLeftPct);
    }
    win.style.left=newLeft.toFixed(2)+"%";
    win.style.width=newWidth.toFixed(2)+"%";
  });
  window.addEventListener("mouseup",()=>{
    if(!mode)return;
    mode=null;
    const leftPct=parseFloat(win.style.left),widthPct=parseFloat(win.style.width);
    onChange(pctToT(leftPct),pctToT(leftPct+widthPct));
  });
}
function linkCharts(idA,idB){
  const hitA=document.getElementById("hit_"+idA),hitB=document.getElementById("hit_"+idB);
  const vlA=document.getElementById("vl_"+idA),vlB=document.getElementById("vl_"+idB);
  const gA=CHART_GEOM[idA],gB=CHART_GEOM[idB];
  if(!hitA||!hitB||!vlA||!vlB||!gA||!gB)return;
  hitA.addEventListener("mousemove",ev=>{
    const r=hitA.getBoundingClientRect();
    const f=Math.max(0,Math.min(1,r.width?(ev.clientX-r.left)/r.width:0));
    const x=gB.pl+f*gB.pw;
    vlB.setAttribute("x1",x);vlB.setAttribute("x2",x);vlB.setAttribute("opacity","0.55");
  });
  hitA.addEventListener("mouseleave",()=>vlB.setAttribute("opacity","0"));
  hitB.addEventListener("mousemove",ev=>{
    const r=hitB.getBoundingClientRect();
    const f=Math.max(0,Math.min(1,r.width?(ev.clientX-r.left)/r.width:0));
    const x=gA.pl+f*gA.pw;
    vlA.setAttribute("x1",x);vlA.setAttribute("x2",x);vlA.setAttribute("opacity","0.55");
  });
  hitB.addEventListener("mouseleave",()=>vlA.setAttribute("opacity","0"));
}
/* 多图联动(★2026-07-29:资产配置tab 3张图统一时间轴,悬停任意一张同步十字线到其余全部) */
function linkChartsMulti(ids){
  const items=ids.map(id=>({id,hit:document.getElementById("hit_"+id),vl:document.getElementById("vl_"+id),g:CHART_GEOM[id]}))
    .filter(it=>it.hit&&it.vl&&it.g);
  if(items.length<2)return;
  items.forEach(cur=>{
    cur.hit.addEventListener("mousemove",ev=>{
      const r=cur.hit.getBoundingClientRect();
      const f=Math.max(0,Math.min(1,r.width?(ev.clientX-r.left)/r.width:0));
      items.forEach(other=>{
        if(other.id===cur.id)return;
        const x=other.g.pl+f*other.g.pw;
        other.vl.setAttribute("x1",x);other.vl.setAttribute("x2",x);other.vl.setAttribute("opacity","0.55");
      });
    });
    cur.hit.addEventListener("mouseleave",()=>items.forEach(other=>{if(other.id!==cur.id)other.vl.setAttribute("opacity","0");}));
  });
}
/* 三轴联合折线图(★2026-07-30用户需求:杠杆演变/久期时间序列/10年期国债收益率 合并成一幅图三条线。
   三者量纲不同(倍数/年/百分点),各自独立算Y轴量程,左轴给series[0],右侧两条轴依次给series[1]/[2]；
   网格线统一按行高画,每行同时标出三条轴各自在该行的取值(颜色跟对应折线一致,一眼对上是哪条线)。) */
function tripleAxisChart(seriesArr,opt={}){
  const id=__chartSeq++;
  const w=opt.w||780,h=opt.h||300,pl=50,pr=130,pt=14,pb=26,pw=w-pl-pr,ph=h-pt-pb;
  const x0=opt.forceX?opt.forceX.x0:null,x1=opt.forceX?opt.forceX.x1:null;
  const inRange=t=>x0==null||(t>=x0&&t<=x1);
  const clipped=seriesArr.map(s=>({...s,points:s.points.filter(p=>p[1]!=null&&inRange(+new Date(p[0])))}));
  if(!clipped.some(s=>s.points.length))return `<div class="method-note">无数据</div>`;
  const allx=clipped.flatMap(s=>s.points.map(p=>+new Date(p[0])));
  const x0f=x0!=null?x0:Math.min(...allx),x1f=x1!=null?x1:Math.max(...allx);
  const X=t=>pl+(x1f===x0f?pw/2:(t-x0f)/(x1f-x0f)*pw);
  const scales=clipped.map(s=>{
    const vs=s.points.map(p=>p[1]);
    let mn=Math.min(...vs),mx=Math.max(...vs);
    if(s.refLine!=null){mn=Math.min(mn,s.refLine);mx=Math.max(mx,s.refLine);}
    const pad=(mx-mn)*0.15||Math.abs(mx)*0.1||1;
    return {min:mn-pad,max:mx+pad};
  });
  const Ys=clipped.map((s,i)=>v=>pt+ph-(v-scales[i].min)/(scales[i].max-scales[i].min)*ph);
  const fmt=(s,v)=>NN(v,s.dp!=null?s.dp:2)+(s.unit||"");
  let svg=`<svg viewBox="0 0 ${w} ${h}" id="svg_${id}">`;
  // ★2026-07-30修复(用户实测发现:第3根轴的%单位没显示出来):原来axisX[2]=w-8跟axisX[1]
  // 几乎挤在同一块窄margin里,anchor="start"往右长的文字(带%号更长)会超出viewBox右边界被裁掉,
  // 视觉上看起来就是"没显示单位"。改成axisX[2]贴在画布最右边、anchor="end"往左长,
  // 配合pr加宽到130,两根右轴各自留够独立空间,不再互相挤占/裁切。
  const axisX=[pl,w-pr+8,w-6],axisAnchor=["end","start","end"];
  for(let i=0;i<=4;i++){
    const frac=i/4,y=pt+ph*frac;
    svg+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="#e1e8ec"/>`;
    clipped.forEach((s,si)=>{
      const v=scales[si].max-(scales[si].max-scales[si].min)*frac;
      svg+=`<text x="${axisX[si].toFixed(1)}" y="${(y+3).toFixed(1)}" text-anchor="${axisAnchor[si]}" font-size="10" fill="${s.color}">${fmt(s,v)}</text>`;
    });
  }
  xTicks(x0f,x1f).forEach(([dt,lb])=>{const x=X(+new Date(dt));svg+=`<text x="${x.toFixed(1)}" y="${h-8}" text-anchor="middle" font-size="11" fill="#7b8a98">${lb}</text>`;});
  clipped.forEach((s,si)=>{
    if(s.refLine!=null){const y=Ys[si](s.refLine);svg+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="#c0392b" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.6"/>`;}
  });
  clipped.forEach((s,si)=>{
    const pts=s.points.map(p=>[X(+new Date(p[0])),Ys[si](p[1])]);
    if(!pts.length)return;
    svg+=`<path d="${"M"+pts.map((p,i)=>(i?"L":"")+p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ")}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  svg+=`<rect class="hit" id="hit_${id}" x="${pl}" y="${pt}" width="${pw}" height="${ph}" fill="transparent"/>`;
  svg+=`<line id="vl_${id}" x1="${pl}" y1="${pt}" x2="${pl}" y2="${pt+ph}" stroke="#8a99a8" stroke-width="1" opacity="0"/>`;
  svg+=`</svg>`;
  const lg=`<div class="chart-legend">`+clipped.map(s=>`<span><i class="sw" style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")+`</div>`;
  CHART_GEOM[id]={pl,pr,pt,pb,pw,ph,x0:x0f,x1:x1f};
  tripleAxisChart.lastId=id;
  setTimeout(()=>wireTripleAxisChart(id,clipped),0);
  return `<div class="chart-wrap">${svg}</div>${lg}`;
}
function wireTripleAxisChart(id,series){
  const hit=document.getElementById("hit_"+id),vl=document.getElementById("vl_"+id),g=CHART_GEOM[id];
  if(!hit||!vl||!g)return;
  hit.addEventListener("mousemove",ev=>{
    const r=hit.getBoundingClientRect();
    const f=Math.max(0,Math.min(1,r.width?(ev.clientX-r.left)/r.width:0));
    const sx=g.pl+f*g.pw,t=g.x0+f*(g.x1-g.x0);
    vl.setAttribute("x1",sx);vl.setAttribute("x2",sx);vl.setAttribute("opacity","1");
    let bestDate="",bestDist=Infinity;const lines=[];
    series.forEach(s=>{
      let b=null,bd=Infinity;
      s.points.forEach(p=>{if(p[1]==null)return;const dd=Math.abs(+new Date(p[0])-t);if(dd<bd){bd=dd;b=p;}});
      if(b){if(bd<bestDist){bestDist=bd;bestDate=b[0];}lines.push(`<span style="color:${s.color}">●</span> ${esc(s.name)}: <b>${NN(b[1],s.dp!=null?s.dp:2)}${s.unit||""}</b>`);}
    });
    showTT(`<div style="opacity:.75">${esc(bestDate)}</div>${lines.join("<br>")}`,ev);
  });
  hit.addEventListener("mouseleave",()=>{hideTT();vl.setAttribute("opacity","0");});
}
function stackArea(rows,keys,opt={}){
  const id=__chartSeq++;
  const w=opt.w||700,h=opt.h||220,pl=42,pr=14,pt=12,pb=24,pw=w-pl-pr,ph=h-pt-pb;
  if(!rows.length)return `<div class="method-note">无数据</div>`;
  const xs=rows.map(r=>+new Date(r.dt)),x0=Math.min(...xs),x1=Math.max(...xs);
  const X=t=>pl+(x1===x0?pw/2:(t-x0)/(x1-x0)*pw);
  const ymax=Math.max(...rows.map(r=>keys.reduce((a,k)=>a+(r[k]||0),0)),100);
  const Y=v=>pt+ph-v/ymax*ph;
  let svg=`<svg viewBox="0 0 ${w} ${h}" id="svg_${id}">`;
  for(let i=0;i<=4;i++){const v=ymax*i/4,y=Y(v);svg+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="#e1e8ec"/><text x="${pl-5}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="11" fill="#7b8a98">${v.toFixed(0)}%</text>`;}
  if(opt.refLine!=null){const y=Y(opt.refLine);svg+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="#c0392b" stroke-width="1.4" stroke-dasharray="5,4"/>`;}
  xTicks(x0,x1).forEach(([dt,lb])=>{const x=X(+new Date(dt));svg+=`<text x="${x.toFixed(1)}" y="${h-7}" text-anchor="middle" font-size="11" fill="#7b8a98">${lb}</text>`;});
  let base=rows.map(()=>0);const colors=opt.colors||SC;
  keys.forEach(k=>{
    const top=rows.map((r,i)=>base[i]+(r[k]||0));
    const up=rows.map((r,i)=>[X(xs[i]),Y(top[i])]),dn=rows.map((r,i)=>[X(xs[i]),Y(base[i])]).reverse();
    svg+=`<path d="M${up.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" L")} L${dn.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" L")} Z" fill="${colors[k]}" opacity="0.85"/>`;
    base=top;
  });
  svg+=`<rect class="hit" id="hit_${id}" x="${pl}" y="${pt}" width="${pw}" height="${ph}" fill="transparent"/>`;
  svg+=`<line id="vl_${id}" x1="${pl}" y1="${pt}" x2="${pl}" y2="${pt+ph}" stroke="#8a99a8" stroke-width="1" opacity="0"/>`;
  svg+=`</svg>`;
  const names=opt.names||SCN;
  CHART_GEOM[id]={pl,pr,pt,pb,pw,ph,x0,x1,xs};
  stackArea.lastId=id;
  setTimeout(()=>wireStackArea(id,rows,keys,{pl,pr,pt,pb,pw,ph,x0,x1,xs,colors,names}),0);
  // ★2026-08-17 全期为 0 的科目:图例保留但灰化。判据是该键在所有报告期都不>0。
  const lgZero=k=>rows.every(r=>!((r[k]||0)>0));
  return `<div class="chart-wrap">${svg}</div><div class="chart-legend">`+keys.map(k=>{
    const z=lgZero(k);
    return `<span class="${z?"lg-zero":""}"${z?' title="本基金全期该科目均为 0（科目存在，但该基金未持有）"':""}>`
      +`<i class="sw" style="height:10px;width:10px;border-radius:2px;background:${colors[k]}"></i>${names[k]}`
      +`${z?"（无）":""}</span>`;
  }).join("")+`</div>`;
}
function wireStackArea(id,rows,keys,g){
  const hit=document.getElementById("hit_"+id),vl=document.getElementById("vl_"+id);
  if(!hit||!vl)return;
  hit.addEventListener("mousemove",ev=>{
    const r=hit.getBoundingClientRect();
    const f=Math.max(0,Math.min(1,r.width?(ev.clientX-r.left)/r.width:0));
    const sx=g.pl+f*g.pw,t=g.x0+f*(g.x1-g.x0);
    vl.setAttribute("x1",sx);vl.setAttribute("x2",sx);vl.setAttribute("opacity","1");
    let bi=0,bd=Infinity;
    g.xs.forEach((x,i)=>{const dd=Math.abs(x-t);if(dd<bd){bd=dd;bi=i;}});
    const row=rows[bi];
    const lines=keys.map(k=>`<span style="color:${g.colors[k]}">●</span> ${g.names[k]}: <b>${NN(row[k],1)}%</b>`).join("<br>");
    showTT(`<div style="opacity:.75">${esc(row.dt)}</div>${lines}`,ev);
  });
  hit.addEventListener("mouseleave",()=>{hideTT();vl.setAttribute("opacity","0");});
}
function barChart(items,opt={}){
  const w=opt.w||700,h=opt.h||200,pl=44,pr=14,pt=16,pb=30,pw=w-pl-pr,ph=h-pt-pb;
  if(!items.length)return `<div class="method-note">无数据</div>`;
  const vals=items.map(it=>it.v);
  let ymin=Math.min(0,...vals),ymax=Math.max(0,...vals);const pad=(ymax-ymin)*0.15||0.01;ymax+=pad;ymin-=pad;
  const Y=v=>pt+ph-(v-ymin)/(ymax-ymin)*ph,bw=Math.max(pw/items.length*0.6,4);
  const X=i=>pl+(i+0.5)/items.length*pw;
  let svg=`<svg viewBox="0 0 ${w} ${h}">`;
  for(let i=0;i<=4;i++){const v=ymin+(ymax-ymin)*i/4,y=Y(v);svg+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="#e1e8ec"/><text x="${pl-5}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="11" fill="#7b8a98">${opt.pctY?P(v,1):NN(v,2)}</text>`;}
  const yz=Y(0);svg+=`<line x1="${pl}" y1="${yz}" x2="${w-pr}" y2="${yz}" stroke="#aeb9c2"/>`;
  items.forEach((it,i)=>{const y=Y(it.v),top=Math.min(y,yz),hh=Math.abs(y-yz);const col=it.color||(it.v>=0?"var(--pos)":"var(--neg)");
    svg+=`<rect x="${(X(i)-bw/2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(hh,0.5).toFixed(1)}" fill="${col}" opacity="0.9" rx="1.5"/>`;
    svg+=`<text x="${X(i).toFixed(1)}" y="${h-8}" text-anchor="middle" font-size="10" fill="#7b8a98">${esc(it.label)}</text>`;
  });
  svg+=`</svg>`;return `<div class="chart-wrap">${svg}</div>`;
}
function heatColor(v){
  if(v==null)return "#f1f4f3";
  const cap=0.02,t=Math.max(-1,Math.min(1,v/cap));
  if(t>=0)return `rgba(188,85,74,${0.1+0.62*t})`;      /* 正=红(涨) */
  return `rgba(74,139,104,${0.1+0.62*(-t)})`;           /* 负=绿(跌) */
}
function monthlyHeatmap(mh){
  if(!mh.rows||!mh.rows.length)return `<div class="method-note">无数据</div>`;
  let html=`<div style="overflow-x:auto"><table class="hm"><thead><tr><th>年</th>`+
    ["1","2","3","4","5","6","7","8","9","10","11","12"].map(m=>`<th>${m}月</th>`).join("")+`<th>全年</th></tr></thead><tbody>`;
  mh.rows.forEach(r=>{
    html+=`<tr><td class="y">${r.year}</td>`+
      r.months.map(v=>`<td style="background:${heatColor(v)}">${v==null?"":(v*100).toFixed(1)}</td>`).join("")+
      `<td class="tot" style="background:${heatColor(r.annual==null?null:r.annual/6)}">${r.annual==null?"—":(r.annual*100).toFixed(1)+"%"}</td></tr>`;
  });
  html+=`</tbody></table></div><div class="method-note">单位 %（月度收益）。红=正/绿=负（红涨绿跌），色深表示幅度（±2% 封顶）。</div>`;
  return html;
}

/* ===== 变动徽章 / 指数对比 辅助函数 ===== */
function changeBadge(label,arr,field,unit,dp){
  if(!arr||!arr.length)return "";
  const last=arr[arr.length-1][field];
  if(last==null)return "";
  const prevRow=arr.length>=2?arr[arr.length-2]:null;
  const prev=prevRow?prevRow[field]:null;
  let diffHtml="";
  if(prev!=null){
    const diff=last-prev;
    const arrow=diff>0?"▲":diff<0?"▼":"–";
    const col=diff>0?"var(--pos)":diff<0?"var(--neg)":"var(--muted)";
    const sign=diff>0?"+":"";
    // ★2026-07-30用户要求:变动箭头要标注是相比哪一期(季报口径,通常是上一季度),不能只给个孤零零的箭头
    diffHtml=` <span class="chg-badge" style="color:${col}">${arrow}${sign}${NN(diff,dp)}${unit}</span><span style="color:var(--muted);font-weight:400">（较${esc(prevRow.dt)}）</span>`;
  }
  return `${label} ${NN(last,dp)}${unit}${diffHtml}`;
}
function matchIndexBucket(duration){
  const lib=window.BOND_INDEX_LIB;
  if(!lib)return null;
  if(duration==null)return lib.total;
  if(duration<1)return "CBA00111.CS";
  if(duration<3)return "CBA00121.CS";
  if(duration<5)return "CBA00131.CS";
  if(duration<7)return "CBA00141.CS";
  if(duration<10)return "CBA00151.CS";
  return "CBA00161.CS";
}
function rebaseIndexToFund(points,fundStart){
  if(!points||!points.length)return [];
  let i=points.findIndex(p=>p[0]>=fundStart);
  if(i<0)i=points.length-1;
  const base=points[i][1];
  return points.slice(i).map(p=>[p[0],(1+p[1])/(1+base)-1]);
}
let navZoom=null;   // ★2026-08-05新增:净值走势&动态回撤图的当前缩放区间(null=完整区间)
/* ★2026-08-08 用户需求:净值走势加区间按钮,含【按基金经理任期】切段。
   任期分段直接移植深度页 _manager_seg.py::scan_line_segments() 的 scan-line 算法:
   把所有经理的 start/leave 去重排序成边界点,逐段判定在任者 —— 这样才能把【共管期】切出来。
   ★陷阱20(深度页实测):110037 肉眼数是3段,scan-line 切出来是【7段】(4独任+3共管),
     其中有一段只有 63 天的极短重叠(胡剑+张雅君)极易漏看。所以绝不能按"经理条目"直接切。
   共管期单独标注,不并入任何一人 —— 这是深度页已拍板的口径,这里沿用。 */
function managerSegments(d){
  const mg=(d.head.managers||[]).filter(m=>m.start);
  if(!mg.length)return [];
  const asof=d.head.asof||(d.perf.curve.nav||[]).slice(-1)[0]?.[0];
  const iv=mg.map(m=>({nm:m.nm,s:m.start,e:m.leave||asof,
                       esc:m.escrow||null,es:m.escrow_start||null,ee:m.escrow_leave||null}));
  // ★2026-08-08 代管期必须参与切段(用户追问结构完整性时查出来的)。
  //   Wind 有 F_INFO_ESCROW_FUNDMANAGER 字段:名义经理休产假/借调时,职责由他人"代为履行"。
  //   实测纯债产品池 2457 只中【303 只(12.3%)有代管记录,共 319 条】,
  //   代管期从几个月到【六年半】都有(000074.OF 何秀红→李娜 2019-10~2026-06)。
  //   不切进来的话,按钮上写着名义经理的名字,而那段时间实际管钱的是另一个人 —— 与事实不符。
  //   深度页 _manager_seg.py 原本只把 escrow 当注释、不参与切段,这里补上。
  const bounds=[...new Set(iv.flatMap(x=>{
    const b=[x.s,x.e];
    if(x.esc&&x.es){b.push(x.es); b.push(x.ee||x.e);}
    return b;
  }))].sort();
  const segs=[];
  for(let i=0;i<bounds.length-1;i++){
    const t0=bounds[i],t1=bounds[i+1];
    const act=iv.filter(x=>x.s<=t0&&t1<=x.e);
    if(!act.length||t0===t1)continue;
    // 该段内每位在任者:若其代管期覆盖本段,则实际履职人是代管人
    const who=[],escNote=[];
    act.forEach(x=>{
      const covered=x.esc&&x.es&&x.es<=t0&&t1<=(x.ee||x.e);
      if(covered){who.push(x.esc);escNote.push(`${x.esc} 代 ${x.nm}`);}
      else who.push(x.nm);
    });
    const isEsc=escNote.length>0;
    segs.push({s:t0,e:t1,who,escNote,
               kind:isEsc?"代管":(who.length===1?"独任":"共管"),
               days:Math.round((new Date(t1)-new Date(t0))/86400000)});
  }
  return segs;
}
/* 区间按钮:预设窗口 + 现任经理任职以来 + 逐段任期 */
function navRangeBar(d){
  const navPts=(d.perf.curve.nav||[]).filter(p=>p[1]!=null);
  if(!navPts.length)return "";
  const first=navPts[0][0], last=navPts[navPts.length-1][0];
  const asof=new Date(last);
  const ymd=x=>x.toISOString().slice(0,10);
  const back=n=>{const t=new Date(asof);t.setFullYear(t.getFullYear()-n);return ymd(t);};
  const presets=[
    ["全部",first,last],
    ["今年以来",`${asof.getFullYear()}-01-01`,last],
    ["近1年",back(1),last],
    ["近3年",back(3),last],
    ["近5年",back(5),last],
  ];
  // 现任经理任职以来(可能多人共管 → 取最早的那位现任)
  const cur=(d.head.managers||[]).filter(m=>m.current&&m.start);
  let curBtn="";
  if(cur.length){
    const s=cur.map(m=>m.start).sort()[0];
    const nm=cur.map(m=>m.nm).join("、");
    curBtn=`<button type="button" class="rng-btn rng-cur${navRangeKey==="cur"?" on":""}"
      data-pb-onclick="setNavRange('cur','${s}','${last}')" title="${esc(nm)} 自 ${s} 起">现任经理任职以来<small>${esc(nm)}</small></button>`;
  }
  const segs=managerSegments(d);
  const segBtns=segs.map((g,i)=>{
    const k="seg"+i;
    const who=g.who.join("、");
    const cls=g.kind==="共管"?"rng-co":(g.kind==="代管"?"rng-esc":"");
    const tip=g.kind==="代管"?`代管期 · ${esc(g.escNote.join("；"))} · ${g.s} ~ ${g.e} · ${g.days}天`
                             :`${g.kind} · ${esc(who)} · ${g.s} ~ ${g.e} · ${g.days}天`;
    return `<button type="button" class="rng-btn rng-seg ${cls}${navRangeKey===k?" on":""}"
      data-pb-onclick="setNavRange('${k}','${g.s}','${g.e}')" title="${tip}">
      ${esc(who)}<small>${g.kind}·${g.days}天</small></button>`;
  }).join("");
  return `<div class="rng-bar">
      <span class="rng-lab">区间</span>
      ${presets.map(([lb,a,b])=>`<button type="button" class="rng-btn${navRangeKey===lb?" on":""}" data-pb-onclick="setNavRange('${lb}','${a}','${b}')">${lb}</button>`).join("")}
      ${curBtn}
    </div>`+
    (segs.length?`<div class="rng-bar rng-bar2">
      <span class="rng-lab">按任期<small>scan-line 切段，含共管/代管</small></span>${segBtns}
    </div>`:
    // ★全市场纯债有 51 只基金 Wind 无经理记录 —— 必须说明是"没数据"而不是功能坏了
    `<div class="rng-bar rng-bar2"><span class="rng-lab">按任期</span>
      <span class="rng-empty">本基金在 Wind 基金经理表中无任职记录，无法按任期切段（全市场纯债有 51 只属此情况）</span>
    </div>`);
}
let navRangeKey="全部";
function setNavRange(key,s,e){
  navRangeKey=key;
  navZoom={x0:+new Date(s),x1:+new Date(e)};
  refreshNavPerf();
}
function navPerfChart(d){
  const navPts=(d.perf.curve.nav||[]).filter(p=>p[1]!=null);
  if(!navPts.length)return `<div class="method-note">无数据</div>`;
  const fullX0=+new Date(navPts[0][0]),fullX1=+new Date(navPts[navPts.length-1][0]);
  const resetBtn=navZoom?`<button type="button" class="zoom-reset" data-pb-onclick="resetNavZoom()">↺ 重置缩放（当前 ${esc(new Date(navZoom.x0).toISOString().slice(0,10))} ~ ${esc(new Date(navZoom.x1).toISOString().slice(0,10))}）</button>`:"";
  return navRangeBar(d)+resetBtn+lineChart([
    {name:"累计收益",color:"var(--teal)",points:navPts,fill:"var(--teal)",sw:3},
    {name:"动态回撤",color:"#c06a58",points:d.perf.curve.dd,rightAxis:true}
  ],{h:220,pctY:true,zero:true,forceX:navZoom,slider:{fullX0,fullX1,onChange:zoomNavPerf}});
}
function zoomNavPerf(t0,t1){
  navZoom={x0:t0,x1:t1};
  navRangeKey=null;            // 手动拖过之后不再高亮任何预设按钮
  refreshNavPerf();
}
function resetNavZoom(){
  navZoom=null;
  navRangeKey="全部";          // 按钮高亮同步复位
  refreshNavPerf();
}
function refreshNavPerf(){
  const wrap=document.getElementById("navPerfWrap");
  if(wrap&&CURRENT)wrap.innerHTML=navPerfChart(CURRENT);
}
let idxZoom=null;   // ★2026-07-30新增:指数对比图的当前缩放区间(null=完整区间)
function idxCompareChart(d,bucketCode){
  const lib=window.BOND_INDEX_LIB;
  const navPts=(d.perf.curve.nav||[]).filter(p=>p[1]!=null);
  if(!navPts.length||!lib)return `<div class="method-note">无数据</div>`;
  const fundStart=navPts[0][0];
  const idxSeries=lib.series[bucketCode];
  const idxPts=idxSeries?rebaseIndexToFund(idxSeries.points,fundStart):[];
  const label=lib.labels[bucketCode]||bucketCode;
  const fullX0=+new Date(navPts[0][0]),fullX1=+new Date(navPts[navPts.length-1][0]);
  const resetBtn=idxZoom?`<button type="button" class="zoom-reset" data-pb-onclick="resetIdxZoom()">↺ 重置缩放（当前 ${esc(new Date(idxZoom.x0).toISOString().slice(0,10))} ~ ${esc(new Date(idxZoom.x1).toISOString().slice(0,10))}）</button>`:"";
  return resetBtn+lineChart([
    {name:"基金累计收益",color:"var(--teal)",points:navPts,fill:"var(--teal)",sw:3},
    {name:label+"·中债新综合财富指数",color:"var(--gold)",points:idxPts,sw:2}
  ],{h:220,pctY:true,zero:true,forceX:idxZoom,slider:{fullX0,fullX1,onChange:zoomIdxCompare}});
}
function zoomIdxCompare(t0,t1){
  idxZoom={x0:t0,x1:t1};
  refreshIdxCompare();
}
function resetIdxZoom(){
  idxZoom=null;
  refreshIdxCompare();
}
function refreshIdxCompare(){
  const wrap=document.getElementById("idxCompareWrap");
  const sel=document.getElementById("idxBucketSel");
  if(wrap&&CURRENT)wrap.innerHTML=idxCompareChart(CURRENT,sel?sel.value:matchIndexBucket((CURRENT.alloc.duration||[]).slice(-1)[0]&&(CURRENT.alloc.duration||[]).slice(-1)[0].dur));
}
function idxNoteText(duration,bucketCode){
  const lib=window.BOND_INDEX_LIB;
  const matched=matchIndexBucket(duration);
  const matchedLabel=lib&&matched?(lib.labels[matched]||matched):"总值";
  const durTxt=duration!=null?NN(duration,1)+"年":"—";
  const curLabel=lib&&lib.labels[bucketCode]?lib.labels[bucketCode]:bucketCode;
  return `指数对比：默认按基金最新久期(${durTxt})自动匹配「${matchedLabel}」期限档的中债新综合财富指数，当前显示「${curLabel}」，可手动切换其他期限档。指数累计收益已按基金成立日重新起算基期。`;
}

function sub(title,rightNote,body){
  return `<div class="subpanel"><div class="subpanel-heading"><h3>${title}</h3>${rightNote?`<span>${rightNote}</span>`:""}</div>${body}</div>`;
}
function panelIntro(eyebrow,title,rightP){
  return `<div class="panel-intro"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div>${rightP?`<p>${rightP}</p>`:""}</div>`;
}

/* ===== 模块 ===== */
function renderHead(d){
  const h=d.head;
  const st=Object.fromEntries((d.perf.stage||[]).map(s=>[s.stage,s]));
  const styleLast=(d.alloc.style||[]).slice(-1)[0]||{};
  const durLast=(d.alloc.duration||[]).slice(-1)[0]||{};
  const since=st["成立以来"]||{},y1=st["近1年"]||{};
  return `<section class="fund-page">
    <div class="fund-page-hero">
      <div>
        <p class="eyebrow">中长期纯债型基金</p>
        <h1>${esc(h.name||d.code)}<span class="code">${d.code}${h.fullname?" ／ "+esc(h.fullname):""}</span></h1>
        <p class="fund-page-summary">管理人 ${esc(h.corp||"—")} · 现任经理 ${esc((h.cur_managers||[]).join("、")||"—")} · 成立 ${esc(h.setup||"—")} · 数据截至 ${esc(h.asof||"—")}</p>
      </div>
      <dl class="hero-facts">
        <div><dt>业绩比较基准</dt><dd>${esc(h.benchmark||"—")}</dd></div>
        <div><dt>规模(A+C合计)</dt><dd>${h.scale!=null?NN(h.scale,2)+" 亿元":"—"}</dd></div>
        <div><dt>管理费 / 托管费</dt><dd>${h.mgmt_fee!=null?NN(h.mgmt_fee,2)+"% / "+NN(h.cust_fee,2)+"%":"—"}</dd></div>
      </dl>
    </div>
    <div class="fund-page-metrics">
      <div><span>成立以来收益</span><strong class="${since.cum>=0?'pos':'neg'}">${P(since.cum)}</strong></div>
      <div><span>近1年收益</span><strong class="${y1.cum>=0?'pos':'neg'}">${P(y1.cum)}</strong></div>
      <div><span>成立以来最大回撤</span><strong class="neg">${P(since.mdd)}</strong></div>
      <div><span>最新杠杆</span><strong>${styleLast.lev!=null?NN(styleLast.lev,2)+"x":"—"}</strong>${styleLast.dt?`<small>${esc(styleLast.dt)} 季报</small>`:""}</div>
      <div><span>最新久期</span><strong>${durLast.dur!=null?NN(durLast.dur,2)+"y":"—"}</strong>${durLast.dt?`<small>${esc(durLast.dt)}</small>`:""}</div>
      <div><span>券种占净值(国/金/企)</span><strong style="font-size:16px">${styleLast.gov!=null?`${NN(styleLast.gov,0)}%/${NN(styleLast.fin,0)}%/${NN(styleLast.corp,0)}%`:"—"}</strong>${styleLast.dt?`<small>${esc(styleLast.dt)} 季报</small>`:""}</div>
    </div>
  </section>`;
}

/* ===== 同类排名(★2026-08-05用户新需求) =====
   数据来自 _peerrank.py,窗口/收益口径与「阶段表现」表严格一致(同一套算法)。
   ★2026-08-05用户要求:去掉原来每个窗口一条的"分位带"图(peerRankBar,含最差/P25/中位/P75/最好
   标尺),说明文字也只保留"已剔除""局限"两条(原「同类范围」「收益口径」两条删去)。
   注:payload 里的 p25/p75/best/worst 字段现在前端不再展示,但保留在数据层不动——
   数据侧留着不碍事,以后想加回分位带不用重跑 build.py。 */
/* ★2026-08-08 路径B访问器:rank/corr 不再内联进每只基金的 js,改从共享层取。
   仍然优先读 d.* —— 自包含单文件导出时是内联的,那种场景要能离线自洽。 */
function getRank(d){
  if(d.perf&&d.perf.peer_rank&&d.perf.peer_rank.length)return d.perf.peer_rank;
  const S=window.RANK_SNAP;return (S&&S[d.code])||[];
}
function getCorr(d){
  if(d.corr&&d.corr.windows)return d.corr;
  const S=window.CORR_SNAP;return (S&&S[d.code])||null;
}
/* corr 分片按需加载:只在打开"相关性"tab 时拉本基金所在的那一片(约 640 KB),
   首屏不载 —— 这是路径B的另一半收益(首屏 192->165 KB)。 */
function ensureCorrShard(code,cb){
  if(window.CORR_SNAP&&window.CORR_SNAP[code])return cb(true);
  // ★2026-08-08 修正:原来按 code.slice(0,3) 分片,一片装几十只基金(最大5MB),
  // 而页面一次只看一只 —— 实测浪费 76 倍。改成一只一个文件。
  let sc=document.querySelector(`script[data-corr="${code}"]`);
  if(!sc){
    sc=document.createElement("script");
    sc.src="https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/pb_corr/"+code+".js?v="+Date.now();
    sc.dataset.corr=code;
    sc.onerror=()=>{sc.dataset.failed="1";};
    document.head.appendChild(sc);
  }
  let n=0;
  (function poll(){
    if(window.CORR_SNAP&&window.CORR_SNAP[code])return cb(true);
    if(sc.dataset.failed||++n>200)return cb(false);
    setTimeout(poll,40);
  })();
}
/* ===== 久期日频拟合（卡尔曼）=====
   数据源：纯债基金-久期高频拟合-卡尔曼-仅观测净值/10_全市场全量池_无筛除/
   口径与该文件夹的卡尔曼页一致（Q=3e-4、只用日频净值一条观测通道、120交易日预热），
   唯一差别是样本池不做任何类型筛除（摊余成本/持转债/定开封闭/规模门槛全部不剔），
   因为这个模块要覆盖选择器里的每一只纯债基金。分片按 corr 的路径B约定,一只一文件。 */
function ensureDurKF(code,cb){
  if(window.DURKF_STORE&&window.DURKF_STORE[code])return cb(true);
  let sc=document.querySelector(`script[data-durkf="${code}"]`);
  if(!sc){
    sc=document.createElement("script");
    sc.src="https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/pb_durkf/"+code+".js?v="+Date.now();
    sc.dataset.durkf=code;
    sc.onerror=()=>{sc.dataset.failed="1";};
    document.head.appendChild(sc);
  }
  let n=0;
  (function poll(){
    if(window.DURKF_STORE&&window.DURKF_STORE[code])return cb(true);
    if(sc.dataset.failed||++n>200)return cb(false);
    setTimeout(poll,40);
  })();
}
/* 真值点落在报告期末日,模型只在交易日有值 —— 取该日或之前最近的一个交易日(10天内)配对 */
function durKFPair(K){
  const idx=new Map();K.dates.forEach((d,i)=>idx.set(d,i));
  const out=[];
  (K.truth||[]).forEach(t=>{
    let j=-1,probe=new Date(t.dt+"T00:00:00");
    for(let k=0;k<10;k++){
      const key=probe.toISOString().slice(0,10);
      if(idx.has(key)){j=idx.get(key);break;}
      probe.setDate(probe.getDate()-1);
    }
    if(j>=0)out.push({dt:t.dt,real:t.dur,est:K.dur[j]});
  });
  return out;
}
function durKFBlock(d){
  const K=(window.DURKF_STORE||{})[d.code];
  if(!K){
    const why=(window.DURKF_MISS||{})[d.code];
    return why?`<div class="method-note"><b>本基金没有日频久期估计。</b>${esc(why)}</div>`
              :`<div class="method-note">久期日频拟合数据加载中…</div>`;
  }
  const line=K.dates.map((dt,i)=>[dt,K.dur[i]]);
  // 真值序列从 2016H2 起,模型要 120 交易日预热、最早 2018-08 才有值 —— 落在模型区间之外的
  // 真值点画出来只会把 x 轴拖长一大段空白,故只画区间内的(区间外的本来也无从对照)。
  const tin=(K.truth||[]).filter(t=>t.dt>=K.meta.d0&&t.dt<=K.meta.d1);
  const series=[{name:"卡尔曼日频估计",color:"var(--teal)",points:line,dp:2,unit:"年",sw:1.5}];
  if(tin.length)series.push({name:"披露真值（半年频）",color:"var(--gold)",
    points:tin.map(t=>[t.dt,t.dur]),dp:2,unit:"年",sw:0,dots:true});
  const chart=lineChart(series,{h:220,dp:2});
  const pair=durKFPair(K);
  const mafe=pair.length?pair.reduce((a,p)=>a+Math.abs(p.est-p.real),0)/pair.length:null;
  const bias=pair.length?pair.reduce((a,p)=>a+(p.est-p.real),0)/pair.length:null;
  const cards=[["最新久期",NN(K.dur[K.dur.length-1],2)+" 年"],
               ["估计区间",K.meta.d0+" ~ "+K.meta.d1],
               ["交易日数",K.meta.n.toLocaleString()],
               ["可对照真值",pair.length+" 期"],
               ["平均绝对误差",mafe==null?"—":NN(mafe,3)+" 年"],
               ["偏性",bias==null?"—":(bias>=0?"+":"")+NN(bias,3)+" 年"]];
  const grid=`<div class="metric-grid-in" style="grid-template-columns:repeat(6,1fr);margin-top:12px">`+
    cards.map(([k,v])=>`<div class="rmetric"><span>${k}</span><strong>${v}</strong></div>`).join("")+`</div>`;
  const fl=Object.entries(K.flags||{}).filter(([,v])=>v).map(([k])=>k);
  const rows=[`<div class="fg-row"><b>模型估计</b><span>卡尔曼滤波 · <b>日频</b>（每个交易日一个值）· 仅用日频净值一条观测通道</span></div>`,
    `<div class="fg-row"><b>披露真值</b><span>利率敏感性反推 · <b>半年频</b>（半年报/年报各一个点）</span></div>`];
  if(fl.length)rows.push(`<div class="fg-row"><b>原方法论标签</b><span>该基金命中 ${fl.join("、")}——在卡尔曼页的评价池里会被剔除，本模块不剔除</span></div>`);
  return chart+grid+`<div class="factor-glossary" style="margin-top:14px">${rows.join("")}</div>`;
}
function refreshDurKF(){
  const w=document.getElementById("durkfWrap");
  if(w&&CURRENT)w.innerHTML=durKFBlock(CURRENT);
}
function peerRankBlock(d){
  const rows=getRank(d);
  if(!rows.length)return `<div class="method-note">同类排名数据未生成（需重跑 build.py）。</div>`;
  let tbl=`<div class="rt-wrap"><table class="rt pb-rank-table"><thead><tr>
      <th>窗口</th><th>区间</th><th>本基金收益</th><th>同类排名</th><th>击败同类</th><th>分档</th><th>同类中位</th></tr></thead><tbody>`;
  rows.forEach(r=>{
    const qcls=r.pctl>=0.5?"value-positive":"value-negative";
    tbl+=`<tr><td>${esc(r.label)}</td><td class="pr-range">${esc(r.d0)} ~ ${esc(r.d1)}</td>
      <td class="${pcls(r.fund_ret)}">${P(r.fund_ret)}</td>
      <td><b>${r.rank}</b> <span class="pr-dim">/ ${r.n}</span></td>
      <td class="${qcls}">${P(r.pctl,1)}</td><td>${esc(r.quartile)}</td>
      <td>${P(r.p50)}</td></tr>`;
  });
  tbl+=`</tbody></table></div>`;
  return tbl;
}
/* ===== 阶段表现(★2026-08-07用户需求:原来只有 收益率/最大回撤/年化 三列,
   现补齐 区间 · 累计收益 · 年化收益 · 年化波动 · 最大回撤 · Sharpe · Calmar) =====
   口径全部在 _metrics.py::_seg_return_mdd,与 _cfg.perf_metrics 一致
   (收益按日历年化CAGR、波动按实际观测频率年化 opy=min(n/yrs,252))。
   短窗口(<300自然日,即近1月/3月/6月/今年以来)的 年化收益/Sharpe/Calmar 是外推值,
   按用户要求照算但标灰(.stage-extrap)并在表下注明,不做静默隐藏。 */
function stageTable(rows){
  if(!rows.length)return `<div class="method-note">阶段表现数据未生成（需重跑 build.py）。</div>`;
  const dim=(s,html)=>s.short?`<span class="stage-extrap">${html}</span>`:html;
  let tbl=`<div class="rt-wrap"><table class="rt stage-tbl"><thead><tr>
      <th>阶段</th><th>区间</th><th>累计收益</th><th>年化收益</th><th>年化波动</th>
      <th>最大回撤</th><th>Sharpe</th><th>Calmar</th></tr></thead><tbody>`;
  rows.forEach(s=>{
    tbl+=`<tr><td>${esc(s.stage)}</td>
      <td>${s.d0?`<span class="pr-range">${esc(s.d0)} ~ ${esc(s.d1)}</span><br><span class="pr-dim">${s.n} 个净值日</span>`:"—"}</td>
      <td class="${pcls(s.cum)}">${P(s.cum)}</td>
      <td>${dim(s,P(s.ann))}</td>
      <td>${P(s.vol)}</td>
      <td class="${s.mdd!=null?"value-negative":""}">${P(s.mdd)}</td>
      <td>${dim(s,NN(s.sharpe))}</td>
      <td>${dim(s,NN(s.calmar))}</td></tr>`;
  });
  tbl+=`</tbody></table></div>`;
  return tbl;
}

function renderPerf(d){
  const p=d.perf;
  const navChart=`<div id="navPerfWrap">${navPerfChart(d)}</div>`;
  const annBar=barChart((p.annual||[]).map(a=>({label:a.year+(a.partial?"*":""),v:a.cum})),{h:200,pctY:true});
  const annNote=(p.annual||[]).some(a=>a.partial)?`<div class="method-note">*成立首年不满整年</div>`:"";
  const stageTbl=stageTable(p.stage||[]);
  const durLast=(d.alloc.duration||[]).slice(-1)[0]||{};
  const lib=window.BOND_INDEX_LIB;
  let idxHtml=`<div class="method-note">指数库未加载（缺 data/bond_index_lib.js）</div>`;
  if(lib){
    const defBucket=matchIndexBucket(durLast.dur)||lib.total;
    const codes=[lib.total,...lib.buckets];
    const opts=codes.map(c=>`<option value="${c}"${c===defBucket?" selected":""}>${esc(lib.labels[c]||c)}</option>`).join("");
    idxHtml=`<select class="period" id="idxBucketSel" data-pb-onchange="switchIndexBucket(this.value)">${opts}</select>
      <div id="idxCompareWrap" style="margin-top:12px">${idxCompareChart(d,defBucket)}</div>
      <div class="method-note" id="idxCompareNote">${idxNoteText(durLast.dur,defBucket)}</div>`;
  }
  return `<p class="tab-lead">净值走势 · 动态回撤 · 年度表现 · 阶段表现 · 月度表现 · 同类排名 · 指数对比</p>`+
    `${/* ★2026-09-01 版式重排(用户拍板"方案B+c"):
          原来 ①净值走势 与 ②年度表现 并排,②内容只有 256px 却被等高网格拉到 473px,
          白空 217px;而 ⑤同类排名 7列×4行、内容高 265px 却独占整行 1180px,又宽又扁。
          改成:①独占整行(净值图 528→1126 宽,13年走势看得清)、②与⑤并排(256 vs 265 天然等高)。
          ③阶段表现(8列)/④月度表现(14列热力图) 压到半幅必横滚,仍保持整行不动。 */""}
    ${sub("净值走势 & 动态回撤","累计收益(青) + 回撤",navChart)}
    <div class="two-column">
      ${sub("年度表现","分年度收益率",annBar+annNote)}
      ${sub("同类排名","中长期纯债同类·今年以来/近1年/近3年/近5年",peerRankBlock(d))}
    </div>
    ${sub("阶段表现","区间 · 累计收益 · 年化收益 · 年化波动 · 最大回撤 · Sharpe · Calmar",stageTbl)}
    ${sub("月度表现","年 × 月收益热力图",monthlyHeatmap(p.monthly))}
    ${sub("指数对比","vs 中债新综合财富指数（按久期匹配期限档）",idxHtml)}`;
}

function renderAlloc(d){
  const style=d.alloc.style||[],dur=d.alloc.duration||[];
  // ★2026-07-29用户要求:资产配置4张图统一时间轴——以基金自身季度数据(style,资产分布/杠杆的口径)
  // 为准,久期/国债收益率两张图强制对齐到同一区间(forceX),不再各自按自己的数据范围单独定轴。
  const styleX=style.length?{x0:+new Date(style[0].dt),x1:+new Date(style[style.length-1].dt)}:null;
  // ★2026-07-30用户要求:资产配置4张图原为h:200/180/180/180高度不统一,堆叠起来参差不齐,
  // 统一成h:200(仅改传入lineChart/stackArea的opt.h数值,不动函数内部逻辑；forceX的3图联动
  // 靠水平方向的pl/pw几何决定,与h高度无关,故此改动不影响linkChartsMulti的hover同步)。
  const assetChart=stackArea(style,AKEYS,{h:200,colors:AC,names:ACN,refLine:100});
  const levBadge=changeBadge("杠杆",style,"lev","x",2);
  const durBadge=dur.length?changeBadge("久期",dur,"dur","年",2):"";
  // ★2026-07-30用户需求:杠杆演变/久期时间序列/10年期国债收益率 三张单独的图合并成一幅三轴联合折线图
  const combinedSeries=[{name:"杠杆率",color:"var(--navy)",points:style.map(r=>[r.dt,r.lev]),dp:2,unit:"x",refLine:1}];
  if(dur.length)combinedSeries.push({name:"修正久期",color:"var(--gold)",points:dur.map(r=>[r.dt,r.dur]),dp:2,unit:"年"});
  if(typeof YIELD_CURVE_LIB!=="undefined"&&YIELD_CURVE_LIB.points&&YIELD_CURVE_LIB.points.length){
    combinedSeries.push({name:"10年期国债到期收益率",color:"var(--teal)",points:YIELD_CURVE_LIB.points,dp:2,unit:"%"});
  }
  const combinedChart=tripleAxisChart(combinedSeries,{forceX:styleX});
  // ★2026-07-30用户要求:标签横幅("杠杆·久期·10年期国债到期收益率")要完整横着展示,不能被
  // 右侧说明文字挤占空间导致换行——把原来塞进sub()的rightNote的那段长说明挪出来,改成
  // 图表下方分段展示(每个指标独立一行,复用五因子含义说明同款.fg-row样式,风格统一)。
  const combinedDescRows=[
    `<div class="fg-row"><b>杠杆</b><span>总资产/净资产${levBadge?" · "+levBadge:""}</span></div>`,
    dur.length?`<div class="fg-row"><b>久期</b><span>利率冲击反推${durBadge?" · "+durBadge:""}</span></div>`:"",
    `<div class="fg-row"><b>国债收益率</b><span>宏观利率环境背景代理变量</span></div>`
  ].join("");
  const combinedWarn=(dur.length?"":"该基金无利率敏感性数据，久期序列缺失，仅展示杠杆率与国债收益率。")+
    (typeof YIELD_CURVE_LIB!=="undefined"&&YIELD_CURVE_LIB.points&&YIELD_CURVE_LIB.points.length?"":" 国债收益率曲线库未加载。");
  return `<p class="tab-lead">资产分布 · 杠杆/久期/利率环境（合并联动，时间轴统一对齐）</p>`+
    sub("资产分布","六大类资产占净值（季度）· 固定收益投资/现金/股票/其他资产/基金/货币市场工具",
      assetChart)+
    sub("杠杆 · 久期 · 10年期国债到期收益率","",
      combinedChart+`<div class="factor-glossary" style="margin-top:14px">${combinedDescRows}</div>`+
      (combinedWarn.trim()?`<div class="method-note">${combinedWarn.trim()}</div>`:""))+
    sub("本基金的久期日频拟合","卡尔曼滤波 · 逐交易日 · 全市场无筛除",
      `<div id="durkfWrap">${durKFBlock(d)}</div>`);
}

function renderBondStruct(d){
  const style=d.alloc.style||[];
  // ★2026-07-30用户需求:图太小+底部数值方框离卡片底边太远——图放大,方框用margin-top:auto
  // 顶到卡片底部(配合.subpanel现在的flex column布局,与"重仓债券"并排卡片等高对齐时不留大片空白)。
  // ★2026-08-17 用户要求:分母由「净资产」改为「固定收益投资市值 F_PRT_BONDVALUE」。
  // 依据生态统计页模块九的四层科目树——八券种的父项就是固定收益投资,合计应当≈100%
  // (全样本实测闭合 99.71%)。原先除以净资产,含杠杆时合计会 >100%,读者没法直接读出
  // 「债券仓位内部结构」;而资产配置tab的「资产分布」已经承担了"占净值"那一层。
  // 换算放前端:每行都带 bond,不必重跑 2457 只的数据文件。
  const bStyle=style.filter(r=>(r.bond||0)>0).map(r=>{
    const o={dt:r.dt,bond:r.bond};
    SKEYS.forEach(k=>{o[k]=(r[k]||0)/r.bond*100;});
    return o;
  });
  const bondChart=bStyle.length?stackArea(bStyle,SKEYS,{h:320,colors:SC,names:SCN,refLine:100})
                              :`<div class="method-note">该基金无固定收益投资披露</div>`;
  const lastB=bStyle.length?bStyle[bStyle.length-1]:null;
  const structSummary=lastB?`<div style="margin-top:auto;padding-top:14px">
      <div class="metric-grid-in" style="grid-template-columns:repeat(4,1fr)">
        ${SKEYS.filter(k=>k!=="other").map(k=>
          `<div class="rmetric"><span>${SCN[k]}</span><strong>${NN(lastB[k],1)}%</strong></div>`).join("")}
      </div>
      ${(lastB.other||0)>0.5?`<div class="method-note" style="margin-top:10px">⚠ 本期"未明细"为 ${NN(lastB.other,1)}%，说明该报告期未把券种明细披露完整。</div>`:""}
    </div>`:"";
  const bonds=d.bonds||[];const last=bonds.length?bonds[bonds.length-1]:null;
  let holdHtml=`<div class="method-note">无持仓数据</div>`;
  if(last){
    const opts=bonds.map((b,i)=>`<option value="${i}"${i===bonds.length-1?" selected":""}>${b.dt}（${b.n}只，合计${NN(b.wt_sum,1)}%）</option>`).join("");
    holdHtml=`<select class="period" id="bondPeriod" data-pb-onchange="switchBondPeriod(this.value)">${opts}</select><div id="bondTbl" style="margin-top:12px">${bondTable(last)}</div>`;
  }
  let concHtml=`<div class="method-note">无数据</div>`,turnHtml=`<div class="method-note">无数据</div>`;
  if(bonds.length){
    concHtml=lineChart([{name:"前五大合计占净值",color:"var(--teal)",points:bonds.map(b=>[b.dt,b.wt_sum/100]),fill:"var(--teal)",sw:2.6}],{h:190,pctY:true,dp:1})+
      `<div class="method-note">前五大债券市值合计占基金净值比例，数值越高说明持仓越集中于少数债券。</div>`;
    turnHtml=turnoverChart(bonds)+
      `<div class="method-note">按报告期统计重仓债券（前五大）中新进/加仓/减仓的只数，以及上期在列、本期消失的疑似清仓只数；反映基金经理每期的调仓活跃度（仅覆盖前五大重仓券，非全部持仓）。</div>`;
  }
  return `<p class="tab-lead">券种分布 · 重仓债券（前五大）· 持仓集中度 · 换手率</p>`+
    `<div class="two-column">
      ${sub("券种分布","八券种占固定收益投资市值（季度）· 合计=100%",bondChart+structSummary)}
      ${sub("重仓债券","按报告期切换 · 前五大",holdHtml)}
    </div>
    <div class="two-column">
      ${sub("持仓集中度趋势","前五大债券市值占净值比例（季度）",concHtml)}
      ${sub("换手率统计","新进/加仓/减仓/清仓 只数（季度）",turnHtml)}
    </div>`;
}
function turnoverChart(bonds){
  const rows=bonds.map(b=>{
    let neu=0,add=0,cut=0;
    (b.bonds||[]).forEach(x=>{
      if(!x.chg)return;
      if(x.chg.includes("新进"))neu++;
      else if(x.chg==="加仓")add++;
      else if(x.chg==="减仓")cut++;
    });
    return {dt:b.dt,neu,add,cut,clr:(b.cleared||[]).length};
  });
  return lineChart([
    {name:"新进",color:"var(--f-curve)",points:rows.map(r=>[r.dt,r.neu])},
    {name:"加仓",color:"var(--f-level)",points:rows.map(r=>[r.dt,r.add])},
    {name:"减仓",color:"var(--f-slope)",points:rows.map(r=>[r.dt,r.cut])},
    {name:"清仓",color:"var(--f-default)",points:rows.map(r=>[r.dt,r.clr])}
  ],{h:190,dp:0,floor:0});
}
function bondTable(period){
  // 评级带来源角标:发行人评级与债项评级口径不同(主体信用 vs 债项信用),不标来源会误导
  const rat=b=>{
    if(!b.rating) return "—";
    const s=b.rating_src==="债项"?`<span style="color:var(--muted);font-size:10px" title="该券无发行人评级，回落显示债项评级">债项</span>`:"";
    return `${esc(b.rating)} ${s}`;
  };
  // 主体类型:企业性质为主,城投/次级另加小标签
  const nat=b=>{
    if(!b.nature&&!b.muni) return "—";
    let t=b.nature?esc(b.nature):"—";
    if(b.muni==="是") t+=`<span class="btag" style="background:#f6e7c9;color:#8a6412">城投</span>`;
    if(b.sub==="是")  t+=`<span class="btag" style="background:#e7ddf3;color:#5b3f8a">次级</span>`;
    return t;
  };
  let h=`<div class="rt-wrap"><table class="rt"><thead><tr><th>债券代码</th><th>债券名称</th><th>券种</th>`+
    `<th>剩余期限</th><th>评级</th><th>主体类型</th><th>发行人</th><th>市值占净值</th><th>环比</th></tr></thead><tbody>`;
  period.bonds.forEach(b=>{
    h+=`<tr><td style="font-family:ui-monospace,Consolas">${esc(b.code)}</td>`+
      `<td>${esc(b.name||"—")}</td>`+
      `<td>${esc(b.btype||b.sectype||"—")}</td>`+
      `<td>${b.ptm==null?"—":NN(b.ptm,2)+" 年"}</td>`+
      `<td>${rat(b)}</td>`+
      `<td style="font-size:11px">${nat(b)}</td>`+
      `<td style="font-size:11px;color:var(--muted)">${esc(b.issuer||"—")}</td>`+
      `<td><b>${NN(b.wt,2)}%</b></td>`+
      `<td style="color:var(--muted);font-size:11px">${esc(b.chg||"—")}</td></tr>`;
  });
  const miss=period.attr_miss?`<b>本页有 ${period.attr_miss} 条持仓未匹配到个券属性</b>（属性列显示「—」）；全样本命中率：持仓行 99.82%、按权重 99.85%，未命中集中在 2024 年后新券。`:"";
  h+=`</tbody></table></div>`+(miss?`<div class="method-note">${miss}</div>`:"");
  return h;
}

const CWL={"1m":"近1月","2m":"近2月","3m":"近3月","6m":"近6月","ytd":"今年以来","1y":"近1年","3y":"近3年","5y":"近5年","all":"成立以来"};
function renderCorr(d){
  let fundHtml=`<div class="method-note">无相关性数据</div>`;
  const CO=getCorr(d);
  // ★2026-08-08 修复(多agent验证发现,我自己的浏览器实测漏掉了——只测了有数据的基金):
  //   原来只处理 ok=true,ok=false 时什么都不写,占位文案就【永久停在"加载中"】。
  //   实测受影响 197 只(2457-2260),合计规模 8953 亿,其中 179 只是定开/持有期/封闭基金。
  //   这些基金【本来就该没有相关性数据】——净值披露稀疏,重叠观测数过不了 min_obs 门槛
  //   (build_panel.py:182 `if len(valid) < CORR_TOP_N: continue`,整只不落表),
  //   是正确的数据判断;错的是前端把"没有数据"显示成了"正在加载"。
  //   注:只坏左栏,右栏"与其他指数相关性"数据在基金 js 里、一直正常 —— 半边有数据反而
  //   让人更容易把左边当成"还在转",所以必须给明确文案而不是静默。
  if(!CO&&d.code&&window.__CORR_MISS!==d.code){
    setTimeout(()=>ensureCorrShard(d.code,ok=>{
      const panel=document.querySelector('.fund-tab-panel[data-panel="corr"]');
      if(!panel||!CURRENT||CURRENT.code!==d.code)return;
      if(!ok)window.__CORR_MISS=d.code;        // 标记已知缺失,重渲染时不再进异步分支
      panel.innerHTML=renderCorr(CURRENT);     // ★成功失败都要重渲染
    }),0);
    fundHtml=`<div class="loading-state">加载相关性数据 …</div>`;
  }else if(!CO){
    fundHtml=`<div class="method-note">
      <b>本基金无同类相关性数据。</b>该模块要求候选基金与本基金在窗口内有足够的<b>重叠交易日</b>
      （不低于窗口交易日数的 60%），且有效候选不少于 15 只，否则不出榜单。<br>
      <b>常见原因</b>：定期开放 / 持有期 / 封闭式基金的净值<b>披露稀疏</b>，与全市场日频基金的重叠观测天然不足。
      全池 2457 只中有 <b>197 只</b>属于此类（其中 179 只名称含定开/持有/封闭字样）。<br>
      这是<b>样本不足时不出结果</b>的设计，不是数据缺失或加载失败。右侧「与其他指数相关性」不受影响。
    </div>`;
  }
  if(CO&&CO.windows){
    const wins=Object.keys(CO.windows).filter(k=>CO.windows[k].pos&&CO.windows[k].pos.length);
    const def=wins.includes("3y")?"3y":wins[wins.length-1];
    const opts=wins.map(k=>`<option value="${k}"${k===def?" selected":""}>${CWL[k]||k}</option>`).join("");
    // ★2026-08-07:补口径说明。这个榜单原来会被同一产品的多个份额刷屏(实测近1年负相关top15里
    // 某只纯债的A/C/E三个份额同时占榜,15个席位实际只有约7个产品),现已按产品口径去重。
    fundHtml=`<select class="period" id="corrWin" data-pb-onchange="switchCorrWin(this.value)">${opts}</select><div id="corrTbl" style="margin-top:12px">${corrTable(CO.windows[def])}</div>`
      +`<div class="method-note">
        <b>候选池</b>：全市场公募基金（不限于纯债），按<b>产品口径</b>去重——同一产品的 A/C/D/E 等份额只保留 Wind 初始份额
        （<code>F_INFO_ISINITIAL=1</code>）。不去重的话榜单会被同一只基金的多个份额占满：
        它们持仓完全相同、相关系数几乎一样，排在一起没有任何增量信息。<br>
        <b>本基金自身的其他份额</b>也已剔除（按全称 <code>F_INFO_FULLNAME</code> 匹配）。<br>
        <b>观测要求</b>：需覆盖该窗口 60% 以上的交易日才纳入，避免用几十天的重叠期算出高相关的假象。
      </div>`;
  }
  let idxHtml=`<div class="method-note">无相关性数据</div>`;
  if(d.index_corr){
    const wins=Object.keys(d.index_corr).filter(k=>d.index_corr[k].pos&&d.index_corr[k].pos.length);
    const def=wins.includes("3y")?"3y":wins[wins.length-1];
    const opts=wins.map(k=>`<option value="${k}"${k===def?" selected":""}>${CWL[k]||k}</option>`).join("");
    idxHtml=`<select class="period" id="indexCorrWin" data-pb-onchange="switchIndexCorrWin(this.value)">${opts}</select><div id="indexCorrTbl" style="margin-top:12px">${indexCorrTable(d.index_corr[def])}</div>`;
  }
  return `<p class="tab-lead">与其他基金相关性 · 与其他指数相关性</p>`+
    `<div class="two-column">
      ${sub("与其他基金相关性","日收益率相关 · 正相关 TOP",fundHtml)}
      ${sub("与其他指数相关性","vs 各类中债指数 · 正相关 TOP",idxHtml)}
    </div>`;
}
function corrTable(win){
  if(!win||!win.pos)return `<div class="method-note">该窗口无数据</div>`;
  let h=`<div class="rt-wrap"><table class="rt"><thead><tr><th>代码</th><th>名称</th><th>管理人</th><th>相关系数</th></tr></thead><tbody>`;
  win.pos.slice(0,12).forEach(r=>{h+=`<tr><td style="font-family:ui-monospace,Consolas">${esc(r.code)}</td><td>${esc(r.nm)}</td><td style="color:var(--muted)">${esc(r.corp)}</td><td><b>${NN(r.corr,3)}</b></td></tr>`;});
  h+=`</tbody></table></div><div class="method-note">窗口有效样本 ${win.n_valid||"—"} 只，重叠观测门槛 ${win.min_obs||"—"}。</div>`;
  return h;
}
function indexCorrTable(win){
  if(!win||!win.pos)return `<div class="method-note">该窗口无数据</div>`;
  let h=`<div class="rt-wrap"><table class="rt"><thead><tr><th>代码</th><th>名称</th><th>口径</th><th>相关系数</th></tr></thead><tbody>`;
  win.pos.slice(0,12).forEach(r=>{h+=`<tr><td style="font-family:ui-monospace,Consolas">${esc(r.code)}</td><td>${esc(r.nm)}</td><td style="color:var(--muted)">${esc(r.koujing)}</td><td><b>${NN(r.corr,3)}</b></td></tr>`;});
  h+=`</tbody></table></div><div class="method-note">窗口有效样本 ${win.n_valid||"—"} 只，重叠观测门槛 ${win.min_obs||"—"}。口径：财富/全价指数（不含净价）。</div>`;
  return h;
}

/* 瀑布图(收益贡献分解) —— 照抄深度页 因子正交化版/index.html::waterfall() 的设计,
   利率/斜率/凸度/信用/违约/Alpha 逐项累加,末尾"合计"柱单独显示总和。
   ★2026-07-30用户要求删掉"残差"柱(理论上恒等于0,OLS回归带常数项时残差和必为0,
   参见对话里已验证过的解释)——"合计"柱直接取自contrib.total,不依赖是否画出残差柱,删掉不影响合计数值的正确性。 */
function waterfallChart(contrib,opt={}){
  const w=opt.w||700,h=opt.h||220,pl=44,pr=14,pt=16,pb=30,pw=w-pl-pr,ph=h-pt-pb;
  const comps=[["利率",contrib.level,"var(--f-level)"],["斜率",contrib.slope,"var(--f-slope)"],
    ["凸度",contrib.curve,"var(--f-curve)"],["信用",contrib.credit,"var(--f-credit)"],
    ["违约",contrib.default,"var(--f-default)"],["Alpha",contrib.alpha,"var(--muted)"]];
  let cum=0;const steps=[];
  comps.forEach(([n,v,col])=>{v=v||0;steps.push({n,v,col,f:cum,t:cum+v});cum+=v;});
  steps.push({n:"合计",v:contrib.total,col:"var(--navy)",f:0,t:contrib.total,tot:true});
  const all=steps.flatMap(s=>[s.f,s.t]).concat(0);
  let ymin=Math.min(...all),ymax=Math.max(...all);const pad=(ymax-ymin)*0.15||0.01;ymax+=pad;ymin-=pad;
  const Y=v=>pt+ph-(v-ymin)/(ymax-ymin)*ph,bw=Math.max(pw/steps.length*0.62,4);
  const X=i=>pl+(i+0.5)/steps.length*pw;
  let svg=`<svg viewBox="0 0 ${w} ${h}">`;
  for(let i=0;i<=4;i++){const v=ymin+(ymax-ymin)*i/4,y=Y(v);svg+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="#e1e8ec"/><text x="${pl-5}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="11" fill="#7b8a98">${P(v,1)}</text>`;}
  const yz=Y(0);svg+=`<line x1="${pl}" y1="${yz}" x2="${w-pr}" y2="${yz}" stroke="#aeb9c2"/>`;
  steps.forEach((st,i)=>{const yt=Y(Math.max(st.f,st.t)),yb=Y(Math.min(st.f,st.t));
    svg+=`<rect x="${(X(i)-bw/2).toFixed(1)}" y="${yt.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,yb-yt).toFixed(1)}" fill="${st.col}" opacity="${st.tot?1:0.9}" rx="2"/>`;
    svg+=`<text x="${X(i).toFixed(1)}" y="${(st.v>=0?yt-4:yb+13).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="var(--ink)">${(st.v*100).toFixed(2)}</text>`;
    svg+=`<text x="${X(i).toFixed(1)}" y="${h-8}" text-anchor="middle" font-size="10.5" fill="#7b8a98">${st.n}</text>`;
  });
  svg+=`</svg>`;return `<div class="chart-wrap">${svg}</div>`;
}
/* 同类百分位定位条 —— 照抄深度页 distStrip() 设计,横轴=该因子在同类中的取值区间,
   阴影带=P25~P75,竖线=P50,圆点=本基金所处位置,右侧数字=百分位 */
function distStrip(key,fac){
  if(!fac||fac.pctl==null)return `<div class="pctl-row"><div class="pctl-head"><span>${FACN[key]}</span><b style="color:var(--muted)">数据不足</b></div></div>`;
  const pos=Math.max(1,Math.min(99,fac.pctl*100));
  return `<div class="pctl-row">
    <div class="pctl-head"><span>${FACN[key]} <span style="color:var(--muted)">β=${NN(fac.fund,4)}</span></span><b style="color:var(--f-${key})">第${(fac.pctl*100).toFixed(0)}百分位</b></div>
    <div class="pctl-track">
      <div class="base-line"></div>
      ${fac.p10!=null?`<div class="iqr-band outer" style="left:10%;width:80%;background:var(--f-${key})"></div>`:""}
      <div class="iqr-band" style="left:25%;width:50%;background:var(--f-${key})"></div>
      <div class="p50-mark"></div>
      <div class="fund-mark" style="left:${pos.toFixed(1)}%;background:var(--f-${key})"></div>
    </div>
    <div class="pctl-scale">${fac.p10!=null?`<span>P10 ${NN(fac.p10,4)}</span>`:""}<span>P25 ${NN(fac.p25,4)}</span><span>P50 ${NN(fac.p50,4)}</span><span>P75 ${NN(fac.p75,4)}</span>${fac.p90!=null?`<span>P90 ${NN(fac.p90,4)}</span>`:""}</div>
  </div>`;
}
/* ===== 同类百分位定位 · 日频版(★2026-08-07用户需求) =====
   数据 campisi.peer_beta_ts 从"季末行式数组"改成"日频列式对象",结构:
     {freq:"daily", roll:60, dt:[...T], n:[...T], f:{level:{p25:[],p50:[],p75:[],fund:[],pctl:[]}, ...}}
   列式是为了压体积——3227个锚点如果还用 {dt,n,level:{...},...} 的行式对象,光重复的key名
   就占一大半(实测行式562字节/条 → 列式约230字节/条,fund js从预估2MB降到751KB)。
   peerAt() 负责把列式还原成老的行式记录,这样 distStrip()/peerPctlSentence() 一行都不用改。 */
const FAC_KEYS=["level","slope","curve","credit","default"];
// 逐字段还原,不写死字段名:_peerbeta.py 的 EXPORT_FIELDS 以后再增减(如这次加 p10/p90),
// 这里不用跟着改——之前写死成 p25/p50/p75 导致加了 p10/p90 后分位条读不到,是个真实踩过的坑。
/* ★2026-08-07 体积优化:p10~p90 是【全池共用】的分位带,所有基金一模一样。
   过去每只基金的 js 里各存一份(单只980KB里占567KB),2461只就重复2461遍=2.26GB。
   现在拆成共用文件 data/peer_dist_{sector}.js(0.6MB,挂 window.PEER_DIST),
   本基金 js 只留 fund/pctl。这里按日期把两边接回原来的结构,
   所以 distStrip()/peerBetaChart()/peerPctlSentence() 全都不用改。
   共用文件没加载时自动降级:只画分位线(图①)和本基金β线,分布带缺失但不报错。 */
function peerDistFor(ts){
  if(!ts)return null;
  if(ts.__dist!==undefined)return ts.__dist;          // 只对齐一次,缓存
  const store=window.PEER_DIST;
  const d=store&&ts.sector?store[ts.sector]:null;
  if(!d){ts.__dist=null;return null;}
  const pos={};d.dt.forEach((s,j)=>pos[s]=j);
  ts.__dist={d,map:ts.dt.map(s=>pos[s]!==undefined?pos[s]:-1)};
  return ts.__dist;
}
function peerAt(ts,i){
  if(!ts||!ts.dt||i==null||i<0||i>=ts.dt.length)return null;
  const rec={dt:ts.dt[i],n:ts.n[i]};
  const D=peerDistFor(ts), j=D?D.map[i]:-1;
  FAC_KEYS.forEach(k=>{
    const c=ts.f[k],o={};
    for(const q in c)o[q]=c[q][i];                     // fund / pctl(+单文件导出时的分位)
    if(j>=0){const dc=D.d.f[k];for(const q in dc)if(o[q]===undefined)o[q]=dc[q][j];}
    rec[k]=o;
  });
  return rec;
}
/* 给图②取整条分位序列(与 ts.dt 对齐,缺失处为 null) */
function peerDistSeries(ts,key,q){
  const D=peerDistFor(ts);
  if(D&&D.d.f[key]&&D.d.f[key][q])return D.map.map(j=>j>=0?D.d.f[key][q][j]:null);
  const c=ts.f[key];
  return c[q]?c[q]:null;                               // 自包含单文件导出时分位就在本地
}
/* 图1 分位视角:5个因子的同类百分位各一条线。回答"这只基金在同类里的相对位置怎么变"。
   ★2026-08-07用户需求:5条线同框太挤(尤其几条线分位接近时纠缠在一起分不开),
   上方加一排因子开关,勾哪些画哪些。y轴量程恒定夹在0~100%(floor/ceil),
   所以增删曲线时纵轴不会跳,不同勾选组合之间可以直接对比高低。 */
function peerPctlChart(ts){
  const on=FAC_KEYS.filter(k=>peerPctlOn[k]);
  if(!on.length)return `<div class="method-note">已全部取消勾选——请至少选一个因子。</div>`;
  const series=on.map(k=>({name:FACN[k],color:`var(--f-${k})`,sw:1.6,
    points:ts.dt.map((d,i)=>[d,ts.f[k].pctl[i]])}));
  return lineChart(series,{h:250,w:780,pctY:true,dp:0,floor:0,ceil:1,
    refLine:0.5,refLineColor:"#9aa7b2"});
}
function peerPctlChips(){
  return FAC_KEYS.map(k=>`<button type="button" class="fac-chip${peerPctlOn[k]?" on":""}" data-fac="${k}"
    style="--chip:var(--f-${k})" data-pb-onclick="togglePeerPctlFac('${k}')"><i></i>${FACN[k]}</button>`).join("")
    +`<button type="button" class="fac-chip chip-all" data-pb-onclick="togglePeerPctlFac('*')">全选</button>`;
}
function togglePeerPctlFac(k){
  if(k==="*"){const allOn=FAC_KEYS.every(x=>peerPctlOn[x]);FAC_KEYS.forEach(x=>peerPctlOn[x]=!allOn);}
  else peerPctlOn[k]=!peerPctlOn[k];
  const wrap=document.getElementById("peerPctlWrap"),chips=document.getElementById("peerPctlChips");
  if(!wrap||!CURRENT)return;
  const ts=CURRENT.campisi.peer_beta_ts;
  if(chips)chips.innerHTML=peerPctlChips();
  const before=lineChart.lastId;
  wrap.innerHTML=peerPctlChart(ts);
  const id=lineChart.lastId;
  if(id===before)return;              // 一条没勾,只渲染了提示文字,没有新图可挂
  peerChartIds[0]=id;
  setTimeout(()=>{
    wirePeerCursor([id],ts);
    if(peerChartIds[1]!=null)linkChartsMulti([id,peerChartIds[1]]);
  },0);
}
/* 图2 绝对值视角:选中因子的 β 本身。本基金实线 + 同类P25~P75分布带 + P50中位虚线。
   这幅图是日频改造最大的增量——季末快照只能看到"分位从30%升到70%",分不清是本基金
   自己下沉了、还是整个同类集体上移把它衬托出来了;有了同类分布带就一眼能分。 */
function peerBetaChart(ts,key){
  const c=ts.f[key];
  const series=[
    {name:"本基金 β",color:`var(--f-${key})`,sw:2.2,points:ts.dt.map((d,i)=>[d,c.fund[i]])},
  ];
  // 分位序列可能来自共用文件(peerDistSeries 负责),不再假定 c 里一定有 p10~p90
  const S=q=>peerDistSeries(ts,key,q);
  const p50=S("p50");
  if(p50)series.unshift({name:"同类中位(P50)",color:"#8a99a8",sw:1.4,points:ts.dt.map((d,i)=>[d,p50[i]])});
  const seg=(a,b)=>{const lo=S(a),hi=S(b);
    return lo&&hi?{lo:ts.dt.map((d,i)=>[d,lo[i]]),hi:ts.dt.map((d,i)=>[d,hi[i]])}:null;};
  // ★2026-08-07 双层带:外层P10~P90(同类中间80%) + 内层P25~P75(中间50%)。
  // 同色叠加,内层因为两层重叠自然更深,不用额外调色。粗线穿出【外】带才算真极端。
  // (为什么不用 min~max:见 _peerbeta.py 顶部的长注释——极值带宽被同类只数撑大,且尾部是
  //  低频披露基金炸出来的伪值,会把y轴撑到 -7~13 让整幅图作废。)
  // seg() 在共用分位文件缺失时返回 null,必须过滤掉——展开 null 会得到没有 lo/hi 的对象,
  // lineChart 里 b.lo.filter 直接抛错(共用文件没加载时整个 tab 白屏)。
  const bands=[[seg("p10","p90"),"同类P10~P90（中间80%）",0.10],
               [seg("p25","p75"),"同类P25~P75（中间50%）",0.16]]
    .filter(x=>x[0])
    .map(([sg,nm,op])=>({...sg,name:nm,color:`var(--f-${key})`,opacity:op}));
  return lineChart(series,{h:250,w:780,dp:3,zero:true,bands:bands});
}
/* 光标定位:在任意一幅图上移动鼠标 → 解析出最近的锚点下标 → 重画下方5根分位条+评价语。
   用 rAF 节流,且下标没变就不重画(日频下相邻像素常落在同一天)。 */
function wirePeerCursor(ids,ts){
  const T=ts.dt.length;
  const tsNum=ts.dt.map(d=>+new Date(d));
  let pending=false,queued=null;
  const apply=()=>{
    pending=false;
    if(queued==null||queued===curPeerIdx)return;
    curPeerIdx=queued;renderPeerCursor(ts);
  };
  ids.forEach(id=>{
    const hit=document.getElementById("hit_"+id),g=CHART_GEOM[id];
    if(!hit||!g)return;
    hit.addEventListener("mousemove",ev=>{
      const r=hit.getBoundingClientRect();
      const f=Math.max(0,Math.min(1,r.width?(ev.clientX-r.left)/r.width:0));
      const t=g.x0+f*(g.x1-g.x0);
      let lo=0,hi=T-1;                       // 日期已排序,二分找最近点
      while(lo<hi){const m=(lo+hi)>>1;if(tsNum[m]<t)lo=m+1;else hi=m;}
      if(lo>0&&Math.abs(tsNum[lo-1]-t)<Math.abs(tsNum[lo]-t))lo--;
      queued=lo;
      if(!pending){pending=true;requestAnimationFrame(apply);}
    });
  });
}
function renderPeerCursor(ts){
  const cur=peerAt(ts,curPeerIdx);
  if(!cur)return;
  const rows=document.getElementById("pctlRows");
  const lab=document.getElementById("peerCursorLabel");
  const sen=document.getElementById("peerSentence");
  if(rows)rows.innerHTML=FAC_KEYS.map(k=>distStrip(k,cur[k])).join("");
  if(lab)lab.innerHTML=`定位到 <b>${esc(cur.dt)}</b>（当日同类 <b>n=${cur.n}</b> · 产品口径）`;
  if(sen)sen.textContent=peerPctlSentence(cur.dt,cur);
}
function switchPeerFac(k){
  curPeerFac=k;
  const wrap=document.getElementById("peerBetaWrap");
  if(!wrap||!CURRENT)return;
  const ts=CURRENT.campisi.peer_beta_ts;
  wrap.innerHTML=peerBetaChart(ts,k);
  const id=lineChart.lastId;
  setTimeout(()=>{wirePeerCursor([id],ts);if(peerChartIds[0]!=null)linkChartsMulti([peerChartIds[0],id]);peerChartIds[1]=id;},0);
}
let peerChartIds=[null,null];
const FAC_WIN_LABEL={ytd:"今年以来","1y":"近1年","3y":"近3年","5y":"近5年",all:"成立以来"};
function renderCampisi(d){
  const c=d.campisi;
  if(!c||!c.full)return `<p class="tab-lead">五因子净值归因（Campisi / RBA）</p>`+
    sub("Campisi 归因","净值回归",`<div class="data-boundary"><p class="eyebrow">历史不足</p><h3>净值历史过短</h3><p>该基金净值有效观测 &lt;120，五因子回归不稳定，暂不展示。</p></div>`);
  const regWin=c.reg_win||{};
  const availWins=Object.keys(FAC_WIN_LABEL).filter(k=>regWin[k]);
  if(!curFacWin||!regWin[curFacWin])curFacWin=availWins.includes("ytd")?"ytd":availWins[0];
  const fr=regWin[curFacWin]||c.full;
  const winOpts=Object.keys(FAC_WIN_LABEL).map(k=>`<option value="${k}"${!regWin[k]?" disabled":""}${k===curFacWin?" selected":""}>${FAC_WIN_LABEL[k]}${!regWin[k]?"（历史不足）":""}</option>`).join("");

  // ⑬收益贡献分解(照抄深度页设计,窗口切换瀑布图)
  // ★2026-07-29用户追问:"合计"这个数字跟"业绩表现"tab看到的年化收益不是一回事,必须写清楚区别
  const stageMatch=(d.perf.stage||[]).find(s=>s.stage===FAC_WIN_LABEL[curFacWin]);
  const realAnn=stageMatch?stageMatch.ann:null;
  const realCum=stageMatch?stageMatch.cum:null;
  const arithAnn=fr.contrib?fr.contrib.total:null;
  const isAnnualized=fr.annualized!==false;
  // ★2026-07-30用户需求:"今年以来"窗口不再年化外推,后端直接给未年化真实拆分(Σ日收益率,
  // 不除以年数),此处"合计"应等于窗口内真实累计收益,可与"业绩表现"tab的cum直接对照
  // (两者天数略有出入——回归窗口需与因子数据交集,起始日略晚于自然年1月1日,故不完全相等)。
  const capNote=arithAnn==null?"":!isAnnualized
    ?`<div class="method-note" style="margin-top:10px">
        <b>本窗口未年化</b>：「${esc(FAC_WIN_LABEL[curFacWin])}」不满整年，这里的"合计"是<b>今年以来实际已经赚到的真实收益</b>
        （未做年化处理），各分项直接相加=合计。
        ${realCum!=null
          ?`可以直接与「业绩表现」→「阶段表现」→「${esc(FAC_WIN_LABEL[curFacWin])}」行的累计收益对照：此处 <b>${P(arithAnn,2)}</b> vs 业绩表现tab <b>${P(realCum,2)}</b>——两者概念一致、数值高度吻合，仅差${Math.abs(arithAnn-realCum)>=0.0001?(Math.abs(arithAnn-realCum)*100).toFixed(2):"0.00"}个百分点，属于模型拆解的正常误差范围，不影响作为收益来源构成的参考。`
          :""}
      </div>`
    :`<div class="method-note" style="margin-top:10px">
        <b>「合计」≠「业绩表现」tab的年化收益</b>：瀑布图"合计"是<b>算术年化</b>(每日收益率直接求和/年数)，
        不是<b>复利年化</b>(CAGR，真实年化收益率要看"业绩表现"→"阶段表现"里的对应行)。
        ${realAnn!=null
          ?`本窗口两者对比：算术年化 <b>${P(arithAnn,2)}</b> vs 真实复利年化 <b>${P(realAnn,2)}</b>——数值接近但不相等，差额是"复利 vs 算术"的数学差异（波动率损耗），纯债基金波动小所以差得不多。`
          :`「${esc(FAC_WIN_LABEL[curFacWin])}」不满整年，业绩表现tab不对其做真实年化（显示"—"），故此处无法给出数字对比，仅提示口径差异本身存在。`}
        用算术年化是因为只有它能被五因子β<b>线性拆解</b>（分项相加=合计）；复利收益涉及交叉项，拆不了。
      </div>`;
  // ★2026-07-30用户要求:窗口选择器从"收益贡献分解"卡片内挪到整个tab最上方(基金画像自动总结之上),
  // 因为这个选择器同时控制画像总结句/瀑布图两处联动,放在tab顶部更符合"先选窗口再看结果"的操作顺序。
  const winSelectorBlock=`<div class="fac-win-bar"><span>选择窗口</span><select class="period" data-pb-onchange="switchFacWin(this.value)">${winOpts}</select></div>`;
  const contribBlock=sub("收益贡献分解",`${isAnnualized?"年化":"未年化·实际累计"} · β×Σ因子 · ${fr.start}→${fr.end}（${fr.years||""}年,n=${fr.n},R²=${NN(fr.r2,3)}）`,
    `<div>${waterfallChart(fr.contrib,{w:700,h:220})}</div>`+capNote);

  // 自动生成的画像总结句
  const sentence=(c.profile_sentences&&c.profile_sentences[curFacWin])||null;
  const profileBlock=sentence
    ?`<div class="data-boundary" style="background:var(--navy)"><p class="eyebrow">基金画像自动总结</p><h3 style="font-size:17px">${esc(sentence)}</h3><p>基于「${FAC_WIN_LABEL[curFacWin]}」窗口的五因子${isAnnualized?"年化":"未年化·实际"}贡献分解自动生成，随上方窗口切换同步更新。</p></div>`
    :`<div class="method-note">该窗口贡献数据不足，无法生成画像总结。</div>`;
  // ★2026-07-30用户要求:五因子含义说明改分段展示(每个因子独立一行,不再挤在一段话里),
  // 字体从method-note默认的11.5px放大,跟"基金画像自动总结"的字号呼应,视觉权重更接近。
  // ★2026-08-05用户要求:五因子说明改成表格,补「多头/空头」两列,原释义挪到第四列。
  // 多空腿照抄实现代码 因子库/bond_five_factor.py 的 FACTOR_LEGS / CURVE_WINGS / CURVE_BELLY,
  // 不是照抄设计稿——注意同工作区还有个旧的 取数脚本/02_固化五因子配置.py,里面凸度腿写的是
  // 「多CBA00611(1年以下)+CBA00651 / 空CBA00631+CBA00641」,那是已被推翻的早期方案:
  // CBA00611在Choice没有INDEXCR/久期数据(bond_five_factor.py第48行注明),短翼实际改用了1-3年。
  // 以 bond_five_factor.py 为准。
  const factorGlossary=sub("五因子含义说明","多空腿取自 因子库/bond_five_factor.py",`<div class="rt-wrap"><table class="rt rt-text">
      <thead><tr><th>因子</th><th>多头</th><th>空头</th><th>含义</th></tr></thead>
      <tbody>
        <tr><td>利率水平 level</td><td>国债总 <span class="fg-code">CBA00601</span></td><td>—（不做空）</td><td>收益率曲线<b>平行移动</b>的变化，反映久期的暴露</td></tr>
        <tr><td>斜率 slope</td><td>国债1-3年 <span class="fg-code">CBA00621</span></td><td>国债7-10年 <span class="fg-code">CBA00651</span></td><td>长端与短端利率的<b>相对</b>变化，反映曲线陡峭化/平坦化的暴露</td></tr>
        <tr><td>凸度 curve</td><td>蝶式两翼（各50%）：国债1-3年 <span class="fg-code">CBA00621</span> ＋ 国债10年以上 <span class="fg-code">CBA00661</span></td><td>腹部：国债5-7年 <span class="fg-code">CBA00641</span></td><td>中段利率相对两端利率的变化，反映哑铃型/子弹型配置的(蝶式)暴露</td></tr>
        <tr><td>信用 credit</td><td>AAA企业债 <span class="fg-code">CBA04201</span></td><td>国债总 <span class="fg-code">CBA00601</span></td><td>对「AAA企业债－国债」<b>信用利差</b>的暴露，反映信用下沉暴露</td></tr>
        <tr><td>违约 default</td><td>高收益企业债 <span class="fg-code">CBA03801</span></td><td>AAA企业债 <span class="fg-code">CBA04201</span></td><td>对「高收益债－AAA企业债」<b>违约利差</b>的暴露，反映深度信用下沉暴露</td></tr>
      </tbody></table></div>
    <div class="method-note">除利率水平直接取多头收益外，其余四个因子都是<b>久期中性</b>多空：空头腿按久期比缩放后再相减（r<sub>多</sub> － D<sub>多</sub>/D<sub>空</sub> × r<sub>空</sub>），不是1:1对冲。全部为中债财富(总值)指数口径。</div>`);

  // ★2026-08-05用户要求:五因子说明之后补α说明。
  // ★2026-08-05用户要求删除末尾的「怎么读·三个常见误读」折叠块,只保留定义/参照系/费用口径三行。
  const alphaGlossary=sub("α（阿尔法）含义说明","",`<div class="factor-glossary">
      <div class="fg-row"><b>定义</b><span>回归的<b>常数项</b>——五因子解释完后剩下的日均收益；页面值＝日α×252（简单年化）</span></div>
      <div class="fg-row"><b>参照系</b><span>相对「按水平因子β倍持有国债总财富指数＋四个久期中性多空」的<b>复制组合</b>，非现金、非业绩比较基准</span></div>
      <div class="fg-row"><b>费用口径</b><span>净值已扣管理费/托管费/销售服务费，α为<b>扣费后</b>口径</span></div>
    </div>`);

  // 同类百分位定位(★2026-08-07改日频:原来是"季末下拉框选一期",3227个日频锚点没法做下拉,
  // 改成"两幅时间序列图 + 鼠标在图上定位到任意一天,下方分位条跟着走")
  const ts=c.peer_beta_ts;
  let pctlBlock;
  if(!ts||!ts.dt||!ts.dt.length){
    pctlBlock=sub("同类百分位定位","",`<div class="method-note">同类数据不足，无法定位分位（或数据仍是旧版季末结构，需重跑 build.py）。</div>`);
  }else{
    const T=ts.dt.length;
    if(curPeerIdx==null||curPeerIdx<0||curPeerIdx>=T)curPeerIdx=T-1;   // 默认停在最新净值日
    if(!curPeerFac)curPeerFac="credit";   // 默认看信用——纯债基金里最能体现主动风格差异的因子
    const cur=peerAt(ts,curPeerIdx);
    const facOpts=FAC_KEYS.map(k=>`<option value="${k}"${k===curPeerFac?" selected":""}>${FACN[k]}因子 β</option>`).join("");
    const c1=peerPctlChart(ts);const id1=lineChart.lastId;
    const c2=peerBetaChart(ts,curPeerFac);const id2=lineChart.lastId;
    peerChartIds=[id1,id2];
    setTimeout(()=>{wirePeerCursor([id1,id2],ts);linkChartsMulti([id1,id2]);},0);
    pctlBlock=sub("同类百分位定位",
      `日频 · 60交易日滚动窗 · vs 中长期纯债同类（${esc(ts.dt[0])} ~ ${esc(ts.dt[T-1])}，共 ${T} 个交易日锚点）`,
      `<div class="subpanel-note">① 分位视角：五个因子的同类百分位怎么随时间变
        <span class="fac-chips" id="peerPctlChips">${peerPctlChips()}</span></div>`+
      `<div id="peerPctlWrap">${c1}</div>`+
      `<div class="subpanel-note" style="margin-top:18px">② 绝对值视角：是<b>它自己变了</b>，还是<b>整个同类都在变</b>
        <select class="period" id="peerFacSel" style="margin-left:10px" data-pb-onchange="switchPeerFac(this.value)">${facOpts}</select></div>`+
      `<div id="peerBetaWrap">${c2}</div>`+
      `<div class="peer-cursor" id="peerCursorLabel">定位到 <b>${esc(cur.dt)}</b>（当日同类 <b>n=${cur.n}</b> · 产品口径）</div>`+
      `<div class="auto-note" id="peerSentence">${esc(peerPctlSentence(cur.dt,cur))}</div>`+
      `<div class="pctl-rows" id="pctlRows" style="margin-top:12px">${FAC_KEYS.map(k=>distStrip(k,cur[k])).join("")}</div>`+
      `<div class="method-note">
        <b>怎么看</b>：分位越高＝该因子β数值在同类分布中越大（未反转风险方向）；不直接等于信用下沉、收益贡献或管理能力更强；
        越低＝相对越保守。50分位＝与同类中位打平。图①灰虚线就是50分位。<br>
        <b>图②为什么要单独画一幅</b>：分位是相对量，只看图①分不清"分位上升"是本基金自己加了暴露、
        还是同类集体降暴露把它衬托上去了。图②画了<b>双层分布带</b>——深色＝同类P25~P75（中间50%）、
        浅色＝同类P10~P90（中间80%），灰线＝同类中位，粗线＝本基金。
        带子整体上移就是全行业在动，粗线穿出<b>外</b>带才算这只基金真的走极端。<br>
        <b>为什么用分位而不是极值[最小,最大]</b>：极值带宽会被<b>同类只数</b>机械撑大（同类池从2013年的124只长到现在的3566只，
        抽到极端值的概率必然上升），跟"同类分歧变大"没关系，正好废掉这幅图的用途；
        且尾部多是<b>低频披露基金</b>（定开/摊余成本法，净值非逐日真实变动）在60天窗口回归下炸出的伪值
        （实测2026-07-14同类信用β最大值13.48，而P99才2.52），会把纵轴撑到看不成图。<br>
        <b>下方分位条</b>：在任意一幅图上移动鼠标，会定位到那一天并重画这5根条（深色块＝P25~P75，浅色块＝P10~P90，竖线＝P50，圆点＝本基金位置）。默认停在最新净值日。<br>
        <b>频率与口径</b>：<b>日频</b>（每个交易日一个锚点），β 由该日往前 <b>60 个交易日</b>的净值日收益对五因子回归得到；
        同类池按 PIT 逐日判定（当日属于中长期纯债、且窗口内 60 天净值齐全），故 n 会逐日小幅变动；并按<b>产品口径</b>去重——同一产品的 A/C/D/E 只算一票，取 Wind 初始份额为代表（<b>为什么必须去重</b>：A/C 是同一个组合，β 几乎相同，重复计票等于给多份额的大厂主力产品更高权重，而这类产品风格系统性更保守，会把整个分布往下拽）。
        本模块<b>完全不使用季报持仓数据</b>，输入只有全池复权净值日收益和债券指数日收益。<br>
        <b>必须注意</b>：相邻两天的 β 共享 60 天窗口里的 59 天数据，序列自相关约 98%——
        <b>曲线平滑是滚动窗构造出来的，不代表基金每天在调仓</b>；有意义的是趋势和穿越分布带的时刻，不是日间的小抖动。
        另外同类池成分逐日变化，也会给曲线带来与 β 无关的轻微抖动。
      </div>`);
  }

  setTimeout(wireCmpBox,0);
  return `<p class="tab-lead">五因子净值归因 · 画像总结 / 五因子含义 / 收益贡献分解 / 同类百分位定位 / 基金对比</p>`+
    winSelectorBlock+profileBlock+factorGlossary+alphaGlossary+contribBlock+pctlBlock+comparePanel(d);
}

/* ===== 基金对比 · 五因子 β(★2026-08-08用户需求) =====
   只比 5 个因子 β,不比收益/持仓(用户决议)。
   ★不另建数据层:对比基金的 js 里本来就带着它自己完整的日频 β(peer_beta_ts.f[k].fund),
     动态 <script src> 加载即可,B2窗口快照和C日频曲线两样一起白送。
   ★β 与同类池无关——β 是本基金对五因子回归的结果,只有"分位"才需要池子。
     所以对比不涉及池子口径,两只基金即使不同子类也能比 β(但要标注分类)。 */
let CMP=null;                      // 对比基金的 payload
function comparePanel(d){
  const opts=(typeof FUNDS_LIST!=="undefined"?FUNDS_LIST:[]).length;
  // ★2026-08-08 用户反馈:原来必须先敲一只基金才有东西看,不友好。
  //   改成【进来就画本基金自己的雷达图】,对比基金是可选叠加。
  //   选择器给两条路:①文本框(可打代码或名称,带 datalist 联想) ②下拉滚动选择。
  //   两者都【懒加载】—— 2457 个 option 一次性建会拖慢首屏,首次聚焦/展开时才填充。
  setTimeout(()=>{renderCompare();},0);
  return sub("基金对比",`本基金五因子 β 雷达图；可叠加任意一只纯债基金对比（可选池 ${opts} 只）`,
    `<div class="cmp-bar">
       <input id="cmpBox" class="cmp-input" list="cmpList" placeholder="输入代码或名称对比，如 110037 / 易方达纯债"
              autocomplete="off" data-pb-onfocus="fillCmpOptions()" data-pb-onkeydown="if(event.key==='Enter')doCompare()">
       <datalist id="cmpList"></datalist>
       <select id="cmpSel" class="cmp-select" data-pb-onfocus="fillCmpOptions()" data-pb-onchange="if(this.value){document.getElementById('cmpBox').value=this.value;doCompare();}">
         <option value="">▼ 滚动选择…</option>
       </select>
       <button type="button" class="cmp-btn" data-pb-onclick="doCompare()">对比</button>
       <button type="button" class="cmp-btn cmp-clear" data-pb-onclick="clearCompare()">清除对比</button>
     </div>
     <div id="cmpWrap"></div>`);
}
/* 懒填充选择器(2457项)。只填一次。 */
let cmpOptionsFilled=false;
function fillCmpOptions(){
  if(cmpOptionsFilled)return;
  cmpOptionsFilled=true;
  const L=(typeof FUNDS_LIST!=="undefined"?FUNDS_LIST:[]);
  const dl=document.getElementById("cmpList"), sel=document.getElementById("cmpSel");
  const self=CURRENT?CURRENT.code:null;
  const html=L.filter(f=>f.code!==self).map(f=>
    `<option value="${f.code}">${esc(f.name||"")}${f.scale!=null?"  "+NN(f.scale,1)+"亿":""}</option>`).join("");
  if(dl)dl.innerHTML=html;
  if(sel)sel.innerHTML=`<option value="">▼ 滚动选择…</option>`+html;
}
function cmpCandidates(q){
  const L=(typeof FUNDS_LIST!=="undefined"?FUNDS_LIST:[]);
  if(!q)return L.slice(0,12);
  const s=q.trim().toLowerCase();
  return L.filter(f=>f.code.toLowerCase().includes(s)||(f.name||"").toLowerCase().includes(s)).slice(0,12);
}
function clearCompare(){
  CMP=null;
  const box=document.getElementById("cmpBox"), sel=document.getElementById("cmpSel");
  if(box)box.value=""; if(sel)sel.value="";
  renderCompare();                     // ★回到"只看本基金"的雷达图,不是一句空提示
}
/* 对比搜索框的补全下拉。renderCampisi 每次重绘都要重新挂,故用事件委托挂在 document 上一次。 */
function wireCmpBox(){
  if(wireCmpBox.done)return; wireCmpBox.done=true;
  document.addEventListener("input",e=>{
    if(e.target.id!=="cmpBox")return;
    const dd=document.getElementById("cmpDD");if(!dd)return;
    const list=cmpCandidates(e.target.value);
    dd.innerHTML=list.map(f=>`<div class="item" data-code="${f.code}"><span>${esc(f.name||f.code)}</span><code>${f.code}</code></div>`).join("")
      ||`<div class="item" style="color:var(--muted)">无匹配</div>`;
    dd.classList.add("show");
  });
  document.addEventListener("click",e=>{
    const dd=document.getElementById("cmpDD");if(!dd)return;
    const it=e.target.closest("#cmpDD .item[data-code]");
    if(it){document.getElementById("cmpBox").value=it.dataset.code;dd.classList.remove("show");doCompare();return;}
    if(!e.target.closest(".cmp-bar"))dd.classList.remove("show");
  });
}
function doCompare(){
  const box=document.getElementById("cmpBox");
  if(!box)return;
  const raw=box.value.trim();
  const hit=cmpCandidates(raw)[0];
  const code=(raw.match(/^\d{6}\.[A-Z]{2}$/)?raw:(hit?hit.code:null));
  const w=document.getElementById("cmpWrap");
  if(!code){w.innerHTML=`<div class="method-note">没找到匹配的基金，请输入 6 位代码（如 110037.OF）或名称关键词。</div>`;return;}
  if(CURRENT&&code===CURRENT.code){w.innerHTML=`<div class="method-note">不能和自己对比。</div>`;return;}
  w.innerHTML=`<div class="loading-state">加载 ${esc(code)} …</div>`;
  loadCompareFund(code,p=>{CMP=p;renderCompare();});
}
/* ★2026-08-08 五因子 β 雷达图(用户需求:一张图里两只基金)。
   ⚠ 难点:β 有负值(实测凸度 -0.053/-0.092、违约 -0.259),普通雷达图画不了负数。
   解法:【不做归一化,把 0 画成一个显式的虚线圈】——
     · 半径量程取 [min(所有β,0)*1.15 , max*1.15],圆心是负的下界而非 0
     · 在 β=0 处画一圈加粗虚线,落在圈内=负暴露,圈外=正暴露
   这样既保住了负值的可读性,又不用把数据归一化失真(归一化会让"谁更高"变成看不懂的相对量)。
   |t|<2 的点画成【空心】,与表格里的标灰一致 —— 不显著就别比大小。 */
function betaRadar(A,B,ra,rb){
  const W=560,H=380,cx=W/2,cy=H/2+6,R=126;
  const vals=[];
  FAC_KEYS.forEach(k=>{[ra,rb].forEach(r=>{const v=r&&r.betas?r.betas[k]:null;if(v!=null)vals.push(v);});});
  // ★B 可为 null(只画本基金)
  if(!vals.length)return `<div class="method-note">无可比 β 数据。</div>`;
  const vmax=Math.max(...vals,0)*1.15||1, vmin=Math.min(...vals,0)*1.15;
  const rad=v=>R*(v-vmin)/(vmax-vmin);
  const ang=i=>-Math.PI/2+i*2*Math.PI/FAC_KEYS.length;
  const pt=(i,v)=>[cx+rad(v)*Math.cos(ang(i)),cy+rad(v)*Math.sin(ang(i))];
  let s=`<svg viewBox="0 0 ${W} ${H}" class="radar-svg">`;
  // 同心网格
  for(let g=1;g<=4;g++){
    const rr=R*g/4;
    s+=`<polygon points="${FAC_KEYS.map((_,i)=>[cx+rr*Math.cos(ang(i)),cy+rr*Math.sin(ang(i))].map(x=>x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#e1e8ec" stroke-width="1"/>`;
  }
  // 轴线 + 因子标签
  FAC_KEYS.forEach((k,i)=>{
    const e=[cx+R*Math.cos(ang(i)),cy+R*Math.sin(ang(i))];
    s+=`<line x1="${cx}" y1="${cy}" x2="${e[0].toFixed(1)}" y2="${e[1].toFixed(1)}" stroke="#dbe3e8"/>`;
    const L=[cx+(R+26)*Math.cos(ang(i)),cy+(R+26)*Math.sin(ang(i))];
    s+=`<text x="${L[0].toFixed(1)}" y="${(L[1]+4).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--f-${k})">${FACN[k]}</text>`;
  });
  // ★β=0 的参考圈(负值落在圈内)
  const r0=rad(0);
  if(r0>2){
    s+=`<polygon points="${FAC_KEYS.map((_,i)=>[cx+r0*Math.cos(ang(i)),cy+r0*Math.sin(ang(i))].map(x=>x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#8a99a8" stroke-width="1.8" stroke-dasharray="5,4"/>`;
    s+=`<text x="${(cx+r0*Math.cos(ang(0))+4).toFixed(1)}" y="${(cy+r0*Math.sin(ang(0))-6).toFixed(1)}" font-size="11" fill="#8a99a8">β=0</text>`;
  }
  // 两只基金的多边形
  [[ra,'var(--navy)'],[rb,'#c06a58']].forEach(([r,col])=>{
    if(!r||!r.betas)return;
    const pts=FAC_KEYS.map((k,i)=>pt(i,r.betas[k]!=null?r.betas[k]:vmin));
    s+=`<polygon points="${pts.map(p=>p.map(x=>x.toFixed(1)).join(',')).join(' ')}" fill="${col}" fill-opacity="0.13" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>`;
    FAC_KEYS.forEach((k,i)=>{
      const t=r.tstat?r.tstat[k]:null, sig=t!=null&&Math.abs(t)>=2;
      const p=pts[i];
      // 不显著 -> 空心点(与表格标灰一致)
      s+=`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.2" fill="${sig?col:'#fff'}" stroke="${col}" stroke-width="1.8"/>`;
    });
  });
  s+=`</svg>`;
  const lg=`<div class="chart-legend">
    <span><i class="sw" style="background:var(--navy)"></i>${esc(A.head.name||A.code)}</span>`+
    (B?`<span><i class="sw" style="background:#c06a58"></i>${esc(B.head.name||B.code)}</span>`:"")+`
    <span><i class="sw" style="background:#fff;border:1.8px solid #8a99a8;height:9px;border-radius:50%;width:9px"></i>空心＝|t|&lt;2 不显著</span>
    <span style="color:var(--muted)">虚线圈＝β&thinsp;=&thinsp;0，圈内为负暴露</span>
  </div>`;
  return `<div class="radar-wrap">${s}</div>${lg}`;
}

/* 两只基金五因子 β 对比。三件事:①雷达图+窗口快照并排+差值 ②日频β演变叠加 ③陷阱提示 */
window.cmpWin="1y";window.cmpFac="credit";
function renderCompare(){
  const w=document.getElementById("cmpWrap");
  if(!w||!CURRENT)return;
  const A=CURRENT,B=CMP;                       // ★B 可以为 null:只画本基金
  const ra=(A.campisi.reg_win||{})[cmpWin],rb=B?(B.campisi.reg_win||{})[cmpWin]:null;
  const winOpts=Object.keys(FAC_WIN_LABEL).map(k=>{
    const ok=(A.campisi.reg_win||{})[k]&&(!B||(B.campisi.reg_win||{})[k]);
    return `<option value="${k}"${!ok?" disabled":""}${k===cmpWin?" selected":""}>${FAC_WIN_LABEL[k]}${!ok?"（一方历史不足）":""}</option>`;
  }).join("");
  const facOpts=FAC_KEYS.map(k=>`<option value="${k}"${k===cmpFac?" selected":""}>${FACN[k]}因子</option>`).join("");

  let head=`<div class="cmp-head">
      <span class="cmp-tag cmp-a">${esc(A.head.name||A.code)} <small>${A.code}</small></span>`+
      (B?`<span class="cmp-vs">vs</span><span class="cmp-tag cmp-b">${esc(B.head.name||B.code)} <small>${B.code}</small></span>`:
          `<span class="cmp-hint">未选对比基金 · 当前只看本基金</span>`)+
      `<select class="period" data-pb-onchange="cmpWin=this.value;renderCompare()">${winOpts}</select>
    </div>`;

  // ---- ① 窗口快照:并排 + 差值 ----
  let tbl=`<div class="method-note">该窗口数据不足，换个窗口。</div>`;
  let warn="";
  if(ra&&!B){
    // ★单只模式:只列本基金的 β 与 t 值,没有差值列
    tbl=`<div class="rt-wrap"><table class="rt"><thead><tr>
        <th>因子</th><th>β</th><th>t 值</th><th>显著性</th></tr></thead><tbody>`;
    FAC_KEYS.forEach(k=>{
      const b=ra.betas?ra.betas[k]:null, t=ra.tstat?ra.tstat[k]:null;
      const sig=t!=null&&Math.abs(t)>=2;
      tbl+=`<tr><td><b style="color:var(--f-${k})">${FACN[k]}</b></td>
        <td${sig?"":' class="cmp-dim"'}>${b!=null?NN(b,3):"—"}</td>
        <td${sig?"":' class="cmp-dim"'}>${t!=null?NN(t,1):"—"}</td>
        <td>${t==null?"—":(sig?"<b>显著</b>":"<span class=\"cmp-dim\">不显著</span>")}</td></tr>`;
    });
    tbl+=`</tbody></table></div>`;
    warn=`<div class="cmp-range">区间 <b>${esc(ra.start)} ~ ${esc(ra.end)}</b> · R² ${NN(ra.r2,2)} · n ${ra.n}</div>`;
  }else if(ra&&rb){
    // ★共同区间:两只基金成立日不同,必须取交集并显著标注,否则等于拿不同期间的β在比
    const s=(ra.start>rb.start?ra.start:rb.start), e=(ra.end<rb.end?ra.end:rb.end);
    const mismatch=(ra.start!==rb.start);
    tbl=`<div class="rt-wrap"><table class="rt"><thead><tr>
        <th>因子</th><th>${esc(A.head.name||A.code)}</th><th>${esc(B.head.name||B.code)}</th><th>差值 Δβ</th><th>谁更高</th></tr></thead><tbody>`;
    FAC_KEYS.forEach(k=>{
      const ba=ra.betas?ra.betas[k]:null, bb=rb.betas?rb.betas[k]:null;
      const ta=ra.tstat?ra.tstat[k]:null, tb=rb.tstat?rb.tstat[k]:null;
      // |t|<2 的 β 不显著,标灰——拿噪声比大小没有意义
      const dim=v=>v!=null&&Math.abs(v)<2?' class="cmp-dim" title="|t|<2，该因子暴露不显著"':'';
      const dv=(ba!=null&&bb!=null)?ba-bb:null;
      tbl+=`<tr><td><b style="color:var(--f-${k})">${FACN[k]}</b></td>
        <td${dim(ta)}>${ba!=null?NN(ba,3):"—"}<small class="cmp-t">t=${ta!=null?NN(ta,1):"—"}</small></td>
        <td${dim(tb)}>${bb!=null?NN(bb,3):"—"}<small class="cmp-t">t=${tb!=null?NN(tb,1):"—"}</small></td>
        <td class="${dv==null?"":(dv>0?"value-positive":"value-negative")}"><b>${dv!=null?(dv>0?"+":"")+NN(dv,3):"—"}</b></td>
        <td>${dv==null?"—":(Math.abs(dv)<0.05?"接近":(dv>0?esc(A.head.name||A.code):esc(B.head.name||B.code)))}</td></tr>`;
    });
    tbl+=`</tbody></table></div>`;
    warn=`<div class="cmp-range">对比区间 <b>${esc(s)} ~ ${esc(e)}</b>`+
      (mismatch?` · <span class="cmp-warn">⚠ 两只基金该窗口起点不同（${esc(ra.start)} vs ${esc(rb.start)}），β 来自各自区间，非严格同期</span>`:``)+
      ` · R² ${NN(ra.r2,2)} / ${NN(rb.r2,2)} · n ${ra.n} / ${rb.n}</div>`;
  }

  // ---- ② 日频 β 演变叠加 ----
  const ta=A.campisi.peer_beta_ts, tb2=B?B.campisi.peer_beta_ts:null;
  let chart=`<div class="method-note">缺日频 β 序列。</div>`;
  if(ta&&ta.f){
    const series=[{name:esc(A.head.name||A.code),color:`var(--f-${cmpFac})`,sw:2.0,
                   points:ta.dt.map((s,i)=>[s,ta.f[cmpFac].fund[i]])}];
    if(tb2&&tb2.f){
      const mb={};tb2.dt.forEach((s,i)=>mb[s]=i);
      series.push({name:esc(B.head.name||B.code),color:"#c06a58",sw:2.0,
                   points:ta.dt.map(s=>[s,mb[s]!==undefined?tb2.f[cmpFac].fund[mb[s]]:null])});
    }
    chart=lineChart(series,{h:250,w:780,dp:3,zero:true});
  }
  const sameSec=(!B)||(ta&&tb2&&ta.sector===tb2.sector);
  const secNote=sameSec?"":`<span class="cmp-warn">⚠ 两只基金不属于同一子类（中长期纯债 / 短期纯债），久期定位本就不同，β 差异有相当部分来自子类而非主动风格</span>`;

  // ★雷达图看"形状差异",表格看"精确数值+t值",两者互补不重复
  const radar=ra?betaRadar(A,B,ra,rb):"";
  w.innerHTML=head+radar+tbl+warn+
    `<div class="subpanel-note" style="margin-top:16px">β 演变${B?"对比":""}
       <select class="period" style="margin-left:8px" data-pb-onchange="cmpFac=this.value;renderCompare()">${facOpts}</select></div>`+
    chart+
    `<div class="method-note">
      <b>只比 β，不比收益</b>。β 是各自净值对五因子回归的结果，<b>与同类池无关</b>——只有"分位"才需要池子，所以两只基金即使子类不同也能比 β。<br>
      <b>灰色数字</b>＝该因子 |t|&lt;2，暴露不显著，拿它比大小没有意义。<br>
      ${secNote?secNote+"<br>":""}
      <b>对比范围仅限纯债</b>（中长期+短期）。一级/二级债基、可转债、被动指数债基不在预生成范围内，也不应与纯债直接比 β——资产类别不同，差异主要来自类别而非主动风格。<br>
      <b>低频披露基金要当心</b>：定开/摊余成本法基金净值非逐日真实变动，60 日窗口回归会炸出伪值（实测同类信用 β 最大到 13.48 而 P99 仅 2.52）。若某只基金 β 异常大，先看它是不是这类产品。
    </div>`;
}
function loadCompareFund(code,cb){
  if(fundData(code)){cb(fundData(code));return;}
  let sc=document.querySelector(`script[data-fund="${code}"]`);
  if(!sc){
    sc=document.createElement("script");
    sc.src="https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/pb_funds/"+code+".js?v="+Date.now();
    sc.dataset.fund=code;
    sc.onerror=()=>{sc.dataset.failed="1";};
    document.head.appendChild(sc);
  }
  let n=0;
  (function poll(){
    if(fundData(code)){cb(fundData(code));return;}
    if(sc.dataset.failed||++n>200){
      document.getElementById("cmpWrap").innerHTML=
        `<div class="method-note">${esc(code)} 的数据文件不存在。当前只预生成了纯债基金（中长期+短期），其他类型暂不可比。</div>`;
      return;
    }
    setTimeout(poll,40);
  })();
}
/* 同类百分位定位的自动评价语(★2026-07-30新增,2026-08-07改日频后仍原样复用):
   把光标定位到的那一天、5个因子各自的同类分位翻译成一句话,
   直接读distStrip已经在用的cur[k].pctl,纯前端拼句子,不需要额外数据。 */
function peerPctlSentence(dt,cur){
  const keys=["level","slope","curve","credit","default"];
  const parts=keys.map(k=>{
    const pctl=cur[k]&&cur[k].pctl!=null?cur[k].pctl:null;
    if(pctl==null)return `${FACN[k]}缺数据`;
    const tag=pctl>=0.75?"同类较高":pctl>=0.6?"偏高":pctl<=0.25?"同类较低":pctl<=0.4?"偏低":"中性";
    return `${FACN[k]}${tag}(${Math.round(pctl*100)}%)`;
  });
  return `${dt}期，该基金五因子同类定位：${parts.join("、")}。`;
}

/* ===== 交互 ===== */
let CURRENT=null;
// ★2026-08-07:curPeerDt(季末下拉的选中日期)已废弃,改成 curPeerIdx(日频锚点下标)+curPeerFac(图②看哪个因子)
let curFacWin=null,curPeerIdx=null,curPeerFac=null;
// ★2026-08-07:图①(分位视角)的因子开关,默认5个全开
let peerPctlOn={level:true,slope:true,curve:true,credit:true,default:true};
function switchFacWin(k){
  curFacWin=k;
  const panel=document.querySelector('.fund-tab-panel[data-panel="campisi"]');
  if(CURRENT&&panel)panel.innerHTML=renderCampisi(CURRENT);
}
function switchBondPeriod(i){CURRENT&&(document.getElementById("bondTbl").innerHTML=bondTable(CURRENT.bonds[+i]));}
function switchCorrWin(k){const CO=CURRENT&&getCorr(CURRENT);CO&&(document.getElementById("corrTbl").innerHTML=corrTable(CO.windows[k]));}
function switchIndexCorrWin(k){CURRENT&&(document.getElementById("indexCorrTbl").innerHTML=indexCorrTable(CURRENT.index_corr[k]));}
function switchIndexBucket(code){
  if(!CURRENT)return;
  idxZoom=null;   // 切换对比指数时重置缩放,避免旧区间跟新指数的数据范围对不上
  const wrap=document.getElementById("idxCompareWrap");
  if(wrap)wrap.innerHTML=idxCompareChart(CURRENT,code);
  const note=document.getElementById("idxCompareNote");
  if(note){
    const durLast=(CURRENT.alloc.duration||[]).slice(-1)[0]||{};
    note.innerHTML=idxNoteText(durLast.dur,code);
  }
}

/* ===== 加载 ===== */
const TABS=[
  {k:"perf",label:"业绩表现",fn:renderPerf},
  {k:"alloc",label:"资产配置",fn:renderAlloc},
  {k:"bond",label:"券种结构",fn:renderBondStruct},
  {k:"corr",label:"相关性分析",fn:renderCorr},
  {k:"campisi",label:"业绩归因",fn:renderCampisi},
];
function render(d){
  CURRENT=d;
  idxZoom=null;   // 切换基金时重置指数对比图的缩放区间
  navZoom=null;   // 切换基金时重置净值走势图的缩放区间
  let html=renderHead(d);
  html+=`<nav class="fund-tab-nav">`+TABS.map((t,i)=>
    `<button data-tab="${t.k}"${i===0?' class="active"':''} data-pb-onclick="switchTab('${t.k}')">${t.label}</button>`).join("")+`</nav>`;
  html+=`<div class="fund-tab-content">`+TABS.map((t,i)=>
    `<div class="fund-tab-panel" data-panel="${t.k}"${i===0?'':' hidden'}>${t.fn(d)}</div>`).join("")+`</div>`;
  document.getElementById("app").innerHTML=html;
  window.scrollTo(0,0);
  // 久期日频拟合分片按需加载(每只约20KB),到位后只重绘 #durkfWrap,不重渲整页
  ensureDurKF(d.code,()=>{if(CURRENT&&CURRENT.code===d.code)refreshDurKF();});
}
function switchTab(k){
  document.querySelectorAll(".fund-tab-nav button").forEach(b=>b.classList.toggle("active",b.dataset.tab===k));
  document.querySelectorAll(".fund-tab-panel").forEach(p=>p.hidden=(p.dataset.panel!==k));
}
function fundData(code){return (window.FUND_STORE||{})[code];}
function loadFund(code){
  document.getElementById("app").innerHTML=`<div class="loading-state">加载 ${esc(code)} …</div>`;
  if(fundData(code)){render(fundData(code));return;}
  let sc=document.querySelector(`script[data-fund="${code}"]`);
  if(!sc){
    sc=document.createElement("script");
    sc.src="https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/pb_funds/"+code+".js?v="+Date.now();
    sc.dataset.fund=code;
    sc.onerror=()=>{sc.dataset.failed="1";};
    document.head.appendChild(sc);
  }
  let tries=0;
  (function poll(){
    if(fundData(code)){render(fundData(code));return;}
    if(sc.dataset.failed){showMissing(code);return;}
    if(++tries>200){showMissing(code);return;}
    setTimeout(poll,40);
  })();
}
function showMissing(code){
  document.getElementById("app").innerHTML=`<section class="fund-page"><div class="data-boundary"><p class="eyebrow">数据未生成</p><h3>${esc(code)}</h3><p>当前为模板演示版，仅预生成了部分基金数据。批量 ETL 后所有在册纯债基金均可查看。</p></div></section>`;
}


window.__PB={renderHead:renderHead,setCompareWindow:function(v){cmpWin=v;renderCompare();},setCompareFactor:function(v){cmpFac=v;renderCompare();},renderPerf:renderPerf,renderAlloc:renderAlloc,renderBondStruct:renderBondStruct,renderCorr:renderCorr,renderCampisi:renderCampisi,ensureDurKF:ensureDurKF,ensureCorrShard:ensureCorrShard,refreshDurKF:refreshDurKF,setCurrent:function(d){CURRENT=d;idxZoom=null;navZoom=null;}};
window.setNavRange=setNavRange;window.togglePeerPctlFac=togglePeerPctlFac;window.resetNavZoom=resetNavZoom;window.resetIdxZoom=resetIdxZoom;window.switchIndexBucket=switchIndexBucket;window.switchBondPeriod=switchBondPeriod;window.switchCorrWin=switchCorrWin;window.switchIndexCorrWin=switchIndexCorrWin;window.switchFacWin=switchFacWin;window.switchPeerFac=switchPeerFac;window.doCompare=doCompare;window.clearCompare=clearCompare;window.switchTab=switchTab;window.fillCmpOptions=fillCmpOptions;window.renderCompare=renderCompare;
})();
