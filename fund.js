const page = document.querySelector("#fund-page");
const query = new URLSearchParams(window.location.search);
const rawFundId = query.get("id");
const rawFundCode = String(query.get("code") || "").toUpperCase();
const fundId = /^[A-Za-z0-9_-]{1,64}$/.test(String(rawFundId || "")) ? rawFundId : null;
const fundCode = /^\d{6}\.(?:OF|SH|SZ)$/.test(rawFundCode) ? rawFundCode : null;
const DEEP_SAMPLE_CODES = new Set(["005827.OF", "000628.OF", "000001.OF"]);
let correlationMetricsPromise = null;
const dashboardAssetPromises = new Map();

const DASHBOARD_GLOBAL_ASSETS = {
  "stock_classification.js": "FUND_STOCK_CLASSIFICATION",
  "bond_holdings.js": "FUND_BOND_HOLDINGS",
  "bond_characteristics.js": "FUND_BOND_CHARACTERISTICS",
  "index_enhanced_metrics.js": "INDEX_ENHANCED_METRICS",
  "convertible_characteristics.js": "FUND_CONVERTIBLE_CHARACTERISTICS",
  "index_constituents.js": "FUND_INDEX_CONSTITUENTS",
  "index_industry_history.js": "FUND_INDEX_INDUSTRY_HISTORY",
};

function loadDashboardAsset(filename) {
  const globalName = DASHBOARD_GLOBAL_ASSETS[filename];
  if (!globalName) return Promise.reject(new Error(`不允许加载未知公共对象：${filename}`));
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (dashboardAssetPromises.has(filename)) return dashboardAssetPromises.get(filename);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/${filename}`;
    script.onload = () => window[globalName]
      ? resolve(window[globalName])
      : reject(new Error(`${filename} 未生成有效内容`));
    script.onerror = () => reject(new Error(`${filename} 加载失败`));
    document.head.appendChild(script);
  }).catch((error) => {
    dashboardAssetPromises.delete(filename);
    throw error;
  });
  dashboardAssetPromises.set(filename, promise);
  return promise;
}

function loadCategoryAssets(category) {
  const files = {
    "index-enhanced": ["index_enhanced_metrics.js", "index_constituents.js", "index_industry_history.js"],
    "pure-bond": ["bond_holdings.js", "bond_characteristics.js"],
    "hybrid-bond": ["bond_holdings.js", "bond_characteristics.js"],
    "convertible-bond": ["bond_holdings.js", "bond_characteristics.js", "convertible_characteristics.js"],
  }[category] || [];
  return Promise.all(files.map(loadDashboardAsset));
}

const TAB_ITEMS = [
  ["performance", "业绩表现"],
  ["assets", "资产配置"],
  ["industries", "行业分析"],
  ["holdings", "持股分析"],
  ["rebalancing", "调仓跟踪"],
  ["correlation", "相关性分析"],
  ["attribution", "业绩归因"],
  ["documents", "公告原文"],
];

function escapeHTML(value) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeDocumentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.hostname !== "pdf.dfcfw.com") return null;
    if (!/^\/pdf\/[A-Za-z0-9_%-]+\.pdf$/i.test(url.pathname)) return null;
    return url.href;
  } catch (_error) {
    return null;
  }
}

function pct(value, digits = 1, signed = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const number = Number(value) * 100;
  return `${signed && number > 0 ? "+" : ""}${number.toFixed(digits)}%`;
}

function num(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(digits);
}

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const absolute = Math.abs(Number(value));
  if (absolute >= 1e8) return `${(Number(value) / 1e8).toFixed(1)}亿元`;
  if (absolute >= 1e4) return `${(Number(value) / 1e4).toFixed(1)}万元`;
  return `${Number(value).toFixed(0)}元`;
}

function shares(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const absolute = Math.abs(Number(value));
  if (absolute >= 1e8) return `${(Number(value) / 1e8).toFixed(2)}亿份`;
  if (absolute >= 1e4) return `${(Number(value) / 1e4).toFixed(1)}万份`;
  return `${Number(value).toFixed(0)}份`;
}

function metric(label, value, note = "") {
  return `<div class="research-metric"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong>${note ? `<small>${escapeHTML(note)}</small>` : ""}</div>`;
}

function comparableSecurityCode(value) {
  const code = String(value || "").trim().toUpperCase();
  const match = code.match(/^(\d+)\.HK$/);
  return match ? `${String(Number(match[1])).padStart(4, "0")}.HK` : code;
}

function currentManagerTenureStart(managers = []) {
  const starts = managers
    .map((manager) => manager.start_date)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    .sort();
  // 多人共管时，以当前团队最后一位成员加入日作为当前管理组合的形成日。
  return starts.at(-1) || null;
}

function renderTable(headers, rows, extraClass = "") {
  return `
    <div class="research-table-wrap ${extraClass}">
      <table class="research-table">
        <thead><tr>${headers.map((header) => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function chartTickIndexes(length, maxTicks = 7) {
  if (!Number.isFinite(length) || length <= 0) return [];
  if (length <= maxTicks) return Array.from({ length }, (_, index) => index);
  return [...new Set(Array.from(
    { length: maxTicks },
    (_, index) => Math.round(index * (length - 1) / (maxTicks - 1)),
  ))];
}

function performanceStats(points) {
  if (!points || points.length < 2) return null;
  const levels = points.map((point) => Number(point.fund));
  if (levels.some((value) => !Number.isFinite(value)) || levels[0] <= 0) return null;
  const returns = levels.slice(1).map((value, index) => value / levels[index] - 1);
  const years = Math.max((new Date(points.at(-1).date) - new Date(points[0].date)) / (365.25 * 86400000), 1 / 252);
  const cumulative = levels.at(-1) / levels[0] - 1;
  const annualizedReturn = (1 + cumulative) ** (1 / years) - 1;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.length > 1
    ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1)
    : 0;
  // 按实际观察频率年化，兼容少数非每日估值的基金。
  const observationsPerYear = Math.min(252, Math.max(1, returns.length / years));
  const volatility = Math.sqrt(variance) * Math.sqrt(observationsPerYear);
  let peakValue = levels[0];
  let peakIndex = 0;
  let maxDrawdown = 0;
  let maxPeakIndex = 0;
  let troughIndex = 0;
  levels.forEach((value, index) => {
    if (value > peakValue) {
      peakValue = value;
      peakIndex = index;
    }
    const drawdown = value / peakValue - 1;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      maxPeakIndex = peakIndex;
      troughIndex = index;
    }
  });
  const recoveryIndex = levels.findIndex((value, index) => index > troughIndex && value >= levels[maxPeakIndex]);
  return {
    cumulative,
    annualizedReturn,
    volatility,
    maxDrawdown,
    sharpe: volatility > 0 ? annualizedReturn / volatility : null,
    calmar: maxDrawdown < 0 ? annualizedReturn / Math.abs(maxDrawdown) : null,
    drawdownStart: points[maxPeakIndex].date,
    drawdownEnd: points[troughIndex].date,
    recoveryDate: recoveryIndex >= 0 ? points[recoveryIndex].date : null,
    recoveryDays: recoveryIndex >= 0
      ? Math.round((new Date(points[recoveryIndex].date) - new Date(points[maxPeakIndex].date)) / 86400000)
      : null,
  };
}

const PERFORMANCE_RANGE_LABELS = {
  ytd: "今年以来",
  "12": "近1年",
  "36": "近3年",
  "60": "近5年",
  manager: "现任经理任期",
  all: "成立以来",
};

function performanceRangeLabel(range) {
  return PERFORMANCE_RANGE_LABELS[String(range)] || "所选区间";
}

function selectPerformanceRange(points, range, managerStart = null) {
  if (!points?.length || range === "all") return points || [];
  const endDate = new Date(points.at(-1).date);
  let start = null;
  if (range === "manager") start = managerStart;
  else if (range === "ytd") start = `${endDate.getFullYear()}-01-01`;
  else {
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - Number(range));
    start = startDate.toISOString().slice(0, 10);
  }
  return navPointsFromStart(points, start);
}

function relativePerformanceStats(points) {
  const aligned = (points || []).filter((point) =>
    Number.isFinite(Number(point.fund)) && point.benchmark !== null && Number.isFinite(Number(point.benchmark))
    && Number(point.fund) > 0 && Number(point.benchmark) > 0
  );
  if (aligned.length < 2) return null;
  const fundStats = performanceStats(aligned);
  const benchmarkStats = performanceStats(aligned.map((point) => ({ ...point, fund: point.benchmark })));
  if (!fundStats || !benchmarkStats) return null;
  const excessReturns = aligned.slice(1).map((point, index) => {
    const previous = aligned[index];
    return Number(point.fund) / Number(previous.fund) - Number(point.benchmark) / Number(previous.benchmark);
  });
  const years = Math.max((new Date(aligned.at(-1).date) - new Date(aligned[0].date)) / (365.25 * 86400000), 1 / 252);
  const mean = excessReturns.reduce((sum, value) => sum + value, 0) / excessReturns.length;
  const variance = excessReturns.length > 1
    ? excessReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (excessReturns.length - 1)
    : 0;
  const observationsPerYear = Math.min(252, Math.max(1, excessReturns.length / years));
  const trackingError = Math.sqrt(variance) * Math.sqrt(observationsPerYear);
  const annualizedExcess = fundStats.annualizedReturn - benchmarkStats.annualizedReturn;
  return {
    annualizedExcess,
    trackingError,
    informationRatio: trackingError > 0 ? annualizedExcess / trackingError : null,
  };
}

function renderPerformanceMetricCards(range, points, includeRelative = false, relativePoints = points) {
  const label = performanceRangeLabel(range);
  const stats = performanceStats(points);
  const relative = includeRelative ? relativePerformanceStats(relativePoints) : null;
  const dateNote = points?.length ? `${points[0].date}—${points.at(-1).date}` : "";
  const primary = [
    metric(`${label}累计收益`, stats ? pct(stats.cumulative, 1, true) : "—", dateNote),
    metric("年化收益", stats ? pct(stats.annualizedReturn, 1, true) : "—"),
    metric("年化波动", stats ? pct(stats.volatility, 1) : "—"),
    metric("最大回撤", stats ? pct(stats.maxDrawdown, 1) : "—"),
    metric("Sharpe", stats ? num(stats.sharpe, 2) : "—", "无风险利率0"),
    metric("Calmar", stats ? num(stats.calmar, 2) : "—"),
  ];
  if (includeRelative) {
    primary.push(
      metric("年化超额", relative ? pct(relative.annualizedExcess, 1, true) : "—"),
      metric("信息比率", relative ? num(relative.informationRatio, 2) : "—"),
    );
  }
  return primary.join("");
}

function renderNavChart(points, fundName, benchmarkName) {
  if (!points || points.length < 2) return '<p class="empty-copy">净值序列不足。</p>';
  const width = 920;
  const height = 330;
  const margin = { top: 28, right: 54, bottom: 42, left: 58 };
  const values = points.flatMap((point) => [point.fund, point.benchmark]).filter((value) => value !== null && Number.isFinite(Number(value)));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max((rawMax - rawMin) * 0.1, 0.03);
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const x = (index) => margin.left + (index / (points.length - 1)) * (width - margin.left - margin.right);
  const y = (value) => margin.top + ((max - value) / Math.max(max - min, 0.01)) * (height - margin.top - margin.bottom);
  const lines = (key, className) => {
    const segments = [];
    let current = [];
    points.forEach((point, index) => {
      const rawValue = point[key];
      const value = Number(rawValue);
      if (rawValue !== null && Number.isFinite(value)) current.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`);
      else if (current.length) {
        segments.push(current);
        current = [];
      }
    });
    if (current.length) segments.push(current);
    return segments.filter((segment) => segment.length >= 2).map((segment) => `<polyline points="${segment.join(" ")}" class="${className}"/>`).join("");
  };
  const ticks = Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4).reverse();
  let peak = -Infinity;
  const drawdowns = points.map((point) => {
    peak = Math.max(peak, point.fund);
    return point.fund / peak - 1;
  });
  const minDrawdown = Math.min(...drawdowns, -0.01);
  const shadowY = (value) => margin.top + (Math.abs(value) / Math.abs(minDrawdown)) * (height - margin.top - margin.bottom);
  const drawdownTicks = Array.from({ length: 5 }, (_, index) => minDrawdown * index / 4);
  const shadow = [
    `${x(0).toFixed(1)},${margin.top}`,
    ...drawdowns.map((value, index) => `${x(index).toFixed(1)},${shadowY(value).toFixed(1)}`),
    `${x(points.length - 1).toFixed(1)},${margin.top}`,
  ].join(" ");
  const dateIndexes = [...new Set(Array.from({ length: 7 }, (_, index) => Math.round(index * (points.length - 1) / 6)))];
  return `
    <div class="chart-legend"><span class="legend-fund">${escapeHTML(fundName)}</span><span class="legend-benchmark">${escapeHTML(benchmarkName)}</span><span class="legend-drawdown">基金回撤阴影</span></div>
    <div class="nav-chart-wrap performance-chart-wrap">
      <svg class="nav-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(fundName)}与${escapeHTML(benchmarkName)}日频归一化净值及回撤阴影">
        ${ticks.map((tick) => `<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" class="chart-grid-line"/><text x="${margin.left - 10}" y="${y(tick) + 4}" class="chart-axis-label" text-anchor="end">${tick.toFixed(2)}</text>`).join("")}
        ${drawdownTicks.map((tick) => `<text x="${width - margin.right + 9}" y="${shadowY(tick) + 4}" class="chart-axis-label">${pct(tick, 0)}</text>`).join("")}
        ${dateIndexes.map((index) => `<text x="${x(index)}" y="${height - 13}" class="chart-axis-label" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}">${points[index].date.slice(0, 7)}</text>`).join("")}
        <polygon points="${shadow}" class="drawdown-shadow"/>
        ${lines("benchmark", "chart-line chart-line-benchmark")}
        ${lines("fund", "chart-line chart-line-fund")}
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" class="performance-crosshair" hidden/>
        <circle r="4.5" class="performance-hover-dot performance-hover-fund" hidden/>
        <circle r="4.5" class="performance-hover-dot performance-hover-benchmark" hidden/>
        <circle r="4" class="performance-hover-dot performance-hover-drawdown" hidden/>
        <rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${height - margin.top - margin.bottom}" class="performance-hover-target"/>
      </svg>
      <div class="performance-hover-card" hidden></div>
    </div>
    <div class="chart-end-values"><span>${escapeHTML(fundName)}：<strong>${Number(points.at(-1).fund).toFixed(2)}</strong> <small>${escapeHTML(points.at(-1).date)}</small></span>${(() => { const latest = points.slice().reverse().find((point) => point.benchmark !== null && Number.isFinite(Number(point.benchmark))); return latest ? `<span>${escapeHTML(benchmarkName)}：<strong>${Number(latest.benchmark).toFixed(2)}</strong> <small>${escapeHTML(latest.date)}</small></span>` : ""; })()}</div>`;
}

function renderZoomableNavChart(points, fundName, benchmarkName) {
  if (!points || points.length < 2) return '<p class="empty-copy">净值序列不足。</p>';
  const lastIndex = points.length - 1;
  const startDate = points[0].date;
  const endDate = points[lastIndex].date;
  return `
    <div class="nav-zoom-shell">
      <div class="nav-zoom-plot">${renderNavChart(rebaseNavPoints(points), fundName, benchmarkName)}</div>
      <div class="nav-zoom-heading nav-zoom-single-heading"><div><strong>图表缩放</strong><span>拖动横条中段可平移，拖动两端可缩放</span></div><button type="button" class="nav-zoom-reset">重置全部</button></div>
      <div class="dual-range-control nav-dual-range" style="--range-start:0%;--range-end:100%" aria-label="净值图缩放区间">
        <div class="dual-range-track"><span></span></div>
        <input class="nav-zoom-start dual-range-start" type="range" min="0" max="${lastIndex}" value="0" step="1" aria-label="净值图起始日期">
        <input class="nav-zoom-end dual-range-end" type="range" min="0" max="${lastIndex}" value="${lastIndex}" step="1" aria-label="净值图结束日期">
        <div class="dual-range-labels"><span class="nav-zoom-start-date">${escapeHTML(startDate)}</span><small>拖动横条中段可平移，拖动两端可缩放</small><span class="nav-zoom-end-date">${escapeHTML(endDate)}</span></div>
      </div>
    </div>`;
}

function bindNavChartZoom(points, fundName, benchmarkName, root = document) {
  const shell = root.querySelector(".nav-zoom-shell");
  const plot = shell?.querySelector(".nav-zoom-plot");
  const startInput = shell?.querySelector(".nav-zoom-start");
  const endInput = shell?.querySelector(".nav-zoom-end");
  const startDate = shell?.querySelector(".nav-zoom-start-date");
  const endDate = shell?.querySelector(".nav-zoom-end-date");
  const reset = shell?.querySelector(".nav-zoom-reset");
  const range = shell?.querySelector(".nav-dual-range");
  const selectedTrack = range?.querySelector(".dual-range-track span");
  if (!shell || !plot || !startInput || !endInput || points.length < 2) return;
  const minimumSpan = Math.min(4, points.length - 1);
  const draw = (changed = "") => {
    let start = Number(startInput.value);
    let end = Number(endInput.value);
    if (end - start < minimumSpan) {
      if (changed === "start") start = Math.max(0, end - minimumSpan);
      else end = Math.min(points.length - 1, start + minimumSpan);
    }
    startInput.value = String(start);
    endInput.value = String(end);
    if (range) {
      const max = Math.max(points.length - 1, 1);
      range.style.setProperty("--range-start", `${start / max * 100}%`);
      range.style.setProperty("--range-end", `${end / max * 100}%`);
    }
    const selected = points.slice(start, end + 1);
    plot.innerHTML = renderNavChart(rebaseNavPoints(selected), fundName, benchmarkName);
    if (startDate) startDate.textContent = points[start].date;
    if (endDate) endDate.textContent = points[end].date;
    bindPerformanceChartHover(rebaseNavPoints(selected), fundName, benchmarkName, plot);
  };
  startInput.addEventListener("input", () => draw("start"));
  endInput.addEventListener("input", () => draw("end"));
  selectedTrack?.addEventListener("pointerdown", (event) => {
    const bounds = range.querySelector(".dual-range-track").getBoundingClientRect();
    const initialX = event.clientX;
    const initialStart = Number(startInput.value);
    const initialEnd = Number(endInput.value);
    const width = initialEnd - initialStart;
    const max = Number(endInput.max);
    selectedTrack.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const shift = Math.round((moveEvent.clientX - initialX) / Math.max(bounds.width, 1) * max);
      const nextStart = Math.max(0, Math.min(max - width, initialStart + shift));
      startInput.value = String(nextStart);
      endInput.value = String(nextStart + width);
      draw();
    };
    const stop = () => {
      selectedTrack.removeEventListener("pointermove", move);
      selectedTrack.removeEventListener("pointerup", stop);
      selectedTrack.removeEventListener("pointercancel", stop);
    };
    selectedTrack.addEventListener("pointermove", move);
    selectedTrack.addEventListener("pointerup", stop);
    selectedTrack.addEventListener("pointercancel", stop);
  });
  reset?.addEventListener("click", () => {
    startInput.value = "0";
    endInput.value = String(points.length - 1);
    draw();
  });
  draw();
}

function bindPerformanceChartHover(points, fundName, benchmarkName, root = document) {
  const wrap = root.querySelector(".performance-chart-wrap");
  const svg = wrap?.querySelector(".nav-chart");
  const target = svg?.querySelector(".performance-hover-target");
  const crosshair = svg?.querySelector(".performance-crosshair");
  const fundDot = svg?.querySelector(".performance-hover-fund");
  const benchmarkDot = svg?.querySelector(".performance-hover-benchmark");
  const drawdownDot = svg?.querySelector(".performance-hover-drawdown");
  const card = wrap?.querySelector(".performance-hover-card");
  if (!svg || !target || !crosshair || !fundDot || !benchmarkDot || !drawdownDot || !card || points.length < 2) return;
  const width = 920;
  const height = 330;
  const margin = { top: 28, right: 54, bottom: 42, left: 58 };
  const values = points.flatMap((point) => [point.fund, point.benchmark]).filter((value) => value !== null && Number.isFinite(Number(value)));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max((rawMax - rawMin) * 0.1, 0.03);
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const x = (index) => margin.left + (index / (points.length - 1)) * (width - margin.left - margin.right);
  const y = (value) => margin.top + ((max - value) / Math.max(max - min, 0.01)) * (height - margin.top - margin.bottom);
  let peak = -Infinity;
  const drawdowns = points.map((point) => {
    peak = Math.max(peak, point.fund);
    return point.fund / peak - 1;
  });
  const minDrawdown = Math.min(...drawdowns, -0.01);
  const shadowY = (value) => margin.top + (Math.abs(value) / Math.abs(minDrawdown)) * (height - margin.top - margin.bottom);
  const setVisible = (visible) => {
    [crosshair, fundDot, benchmarkDot, drawdownDot, card].forEach((item) => {
      if (visible) item.removeAttribute("hidden");
      else item.setAttribute("hidden", "");
    });
  };
  const update = (event) => {
    const bounds = svg.getBoundingClientRect();
    const rawX = Math.min(width - margin.right, Math.max(margin.left, ((event.clientX - bounds.left) / bounds.width) * width));
    const index = Math.max(0, Math.min(points.length - 1, Math.round((rawX - margin.left) / (width - margin.left - margin.right) * (points.length - 1))));
    const point = points[index];
    const exactX = x(index);
    setVisible(true);
    crosshair.setAttribute("x1", exactX);
    crosshair.setAttribute("x2", exactX);
    fundDot.setAttribute("cx", exactX);
    fundDot.setAttribute("cy", y(point.fund));
    const hasBenchmark = point.benchmark !== null && Number.isFinite(Number(point.benchmark));
    if (hasBenchmark) {
      benchmarkDot.removeAttribute("hidden");
      benchmarkDot.setAttribute("cx", exactX);
      benchmarkDot.setAttribute("cy", y(Number(point.benchmark)));
    } else benchmarkDot.setAttribute("hidden", "");
    drawdownDot.setAttribute("cx", exactX);
    drawdownDot.setAttribute("cy", shadowY(drawdowns[index]));
    card.innerHTML = `<strong>${escapeHTML(point.date)}</strong><span>${escapeHTML(fundName)}：${Number(point.fund).toFixed(4)}</span><span>${escapeHTML(benchmarkName)}：${hasBenchmark ? Number(point.benchmark).toFixed(4) : "—（该日无基准数据）"}</span><span>基金回撤：${pct(drawdowns[index], 2)}</span>`;
    card.style.left = `${Math.min(Math.max((exactX / width) * 100, 18), 82)}%`;
  };
  target.addEventListener("pointermove", update);
  target.addEventListener("pointerdown", update);
  target.addEventListener("pointerleave", () => setVisible(false));
}

function rebaseNavPoints(points) {
  if (!points?.length) return [];
  const fundBase = Number(points.find((point) => Number.isFinite(Number(point.fund)) && Number(point.fund) > 0)?.fund);
  const benchmarkBase = Number(points.find((point) => point.benchmark !== null && Number.isFinite(Number(point.benchmark)) && Number(point.benchmark) > 0)?.benchmark);
  if (!Number.isFinite(fundBase) || fundBase <= 0) return points;
  return points.map((point) => ({
    ...point,
    fund: Number(point.fund) / fundBase,
    benchmark: point.benchmark !== null && Number.isFinite(Number(point.benchmark)) && Number.isFinite(benchmarkBase) && benchmarkBase > 0
      ? Number(point.benchmark) / benchmarkBase
      : null,
  }));
}

function renderDrawdownChart(points) {
  if (!points || points.length < 2) return '<p class="empty-copy">回撤序列不足。</p>';
  let peak = -Infinity;
  const series = points.map((point) => {
    peak = Math.max(peak, point.fund);
    return { date: point.date, value: point.fund / peak - 1 };
  });
  const width = 920;
  const height = 210;
  const margin = { top: 18, right: 24, bottom: 38, left: 58 };
  const min = Math.min(...series.map((item) => item.value), -0.01);
  const x = (index) => margin.left + (index / (series.length - 1)) * (width - margin.left - margin.right);
  const y = (value) => margin.top + ((0 - value) / (0 - min)) * (height - margin.top - margin.bottom);
  const pointsString = series.map((item, index) => `${x(index).toFixed(1)},${y(item.value).toFixed(1)}`).join(" ");
  const ticks = [0, min / 2, min];
  return `
    <div class="nav-chart-wrap">
      <svg class="nav-chart drawdown-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="区间回撤走势">
        ${ticks.map((tick) => `<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" class="chart-grid-line"/><text x="${margin.left - 10}" y="${y(tick) + 4}" class="chart-axis-label" text-anchor="end">${pct(tick, 0)}</text>`).join("")}
        <polyline points="${pointsString}" class="chart-line chart-line-drawdown"/>
        <text x="${margin.left}" y="${height - 10}" class="chart-axis-label">${series[0].date.slice(0, 7)}</text>
        <text x="${width - margin.right}" y="${height - 10}" class="chart-axis-label" text-anchor="end">${series.at(-1).date.slice(0, 7)}</text>
      </svg>
    </div>`;
}

const INDEX_COLORS = {
  fund: "#c9352b",
  "000300.SH": "#1565c0",
  "000905.SH": "#ef6c00",
  "000906.SH": "#6a1b9a",
  "399370.SZ": "#00897b",
  "399371.SZ": "#5d4037",
};

function renderMonthlyReturnHeatmap(items = [], navPoints = []) {
  if (!items.length) return '<p class="empty-copy">月度收益数据不足。</p>';
  const years = [...new Set(items.map((item) => item.year))].sort((a, b) => b - a);
  const lookup = new Map(items.map((item) => [`${item.year}-${item.month}`, item.return]));
  const rows = years.map((year) => {
    const values = Array.from({ length: 12 }, (_, index) => lookup.get(`${year}-${index + 1}`));
    const available = values.filter(Number.isFinite);
    const annual = available.length ? available.reduce((value, item) => value * (1 + item), 1) - 1 : null;
    const stats = performanceStats(navPoints.filter((point) => point.date.startsWith(String(year))));
    return [
      `<strong>${year}</strong>`,
      ...values.map((value) => Number.isFinite(value)
        ? `<span class="${value >= 0 ? "value-positive" : "value-negative"}">${pct(value, 1, true)}</span>`
        : "—"),
      Number.isFinite(annual) ? `<strong class="${annual >= 0 ? "value-positive" : "value-negative"}">${pct(annual, 1, true)}</strong>` : "—",
      stats ? pct(stats.maxDrawdown, 1) : "—",
      stats ? `${stats.drawdownStart.slice(5)} → ${stats.drawdownEnd.slice(5)}` : "—",
      stats ? (stats.recoveryDate ? `${stats.recoveryDate.slice(5)} / ${stats.recoveryDays}天` : "未修复") : "—",
    ];
  });
  return renderTable(["年度", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "合计", "最大回撤", "峰值→低点", "修复日/天数"], rows, "monthly-return-heatmap");
}

function monthlyReturnsFromNav(navPoints = []) {
  const monthEnds = [];
  navPoints.forEach((point) => {
    const month = point.date.slice(0, 7);
    const previous = monthEnds.at(-1);
    if (previous?.month === month) monthEnds[monthEnds.length - 1] = { month, point };
    else monthEnds.push({ month, point });
  });
  return monthEnds.slice(1).map((item, index) => ({
    year: Number(item.month.slice(0, 4)),
    month: Number(item.month.slice(5, 7)),
    return: Number(item.point.fund) / Number(monthEnds[index].point.fund) - 1,
  })).filter((item) => Number.isFinite(item.return));
}

function availableComparisonIndexes(analysis) {
  const points = analysis?.comparison_points || [];
  return Object.entries(analysis?.index_names || {}).filter(([key]) =>
    points.filter((point) => Number.isFinite(Number(point[key]))).length >= 2
  );
}

function renderMultiIndexPlot(analysis, fundName, selectedKey) {
  const points = analysis?.comparison_points || [];
  if (points.length < 2) return '<p class="empty-copy">多指数比较数据不足。</p>';
  const names = analysis.index_names || {};
  const selectedLabel = names[selectedKey];
  if (!selectedLabel) return '<p class="empty-copy">所选指数暂无可用行情。</p>';
  const series = [{ key: "fund", label: fundName }, { key: selectedKey, label: selectedLabel }];
  const width = 920;
  const height = 340;
  const margin = { top: 26, right: 24, bottom: 42, left: 58 };
  const values = points.flatMap((point) => series.map((item) => Number(point[item.key])).filter(Number.isFinite));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max((rawMax - rawMin) * 0.08, 0.03);
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const x = (index) => margin.left + (index / (points.length - 1)) * (width - margin.left - margin.right);
  const y = (value) => margin.top + ((max - value) / Math.max(max - min, 0.01)) * (height - margin.top - margin.bottom);
  const ticks = Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4).reverse();
  const dateIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return `
    <div class="mini-chart-legend">${series.map((item) => `<span style="--line-color:${INDEX_COLORS[item.key]}">${escapeHTML(item.label)}</span>`).join("")}</div>
    <div class="nav-chart-wrap multi-index-plot-wrap"><svg class="nav-chart multi-index-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(fundName)}与${escapeHTML(selectedLabel)}近五年归一化走势" data-min="${min}" data-max="${max}" data-labels="${escapeHTML(series.map((item) => item.label).join("|"))}">
      ${ticks.map((tick) => `<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" class="chart-grid-line"/><text x="${margin.left - 10}" y="${y(tick) + 4}" class="chart-axis-label" text-anchor="end">${tick.toFixed(2)}</text>`).join("")}
      ${dateIndexes.map((index) => `<text x="${x(index)}" y="${height - 13}" class="chart-axis-label" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}">${points[index].date.slice(0, 7)}</text>`).join("")}
      ${series.map((item) => `<polyline points="${points.map((point, index) => `${x(index).toFixed(1)},${y(Number(point[item.key])).toFixed(1)}`).join(" ")}" class="chart-line" style="stroke:${INDEX_COLORS[item.key]};stroke-width:${item.key === "fund" ? 3.2 : 2}"/>`).join("")}
      ${points.map((point, index) => `<g class="multi-index-data" data-date="${escapeHTML(point.date)}" data-values="${series.map((item) => Number(point[item.key])).join("|")}" data-x="${x(index).toFixed(2)}"></g>`).join("")}
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" class="mini-line-crosshair" hidden/>
      ${series.map((item) => `<circle r="4" class="mini-line-hover-dot" style="stroke:${INDEX_COLORS[item.key]}" hidden/>`).join("")}
      <rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${height - margin.top - margin.bottom}" class="mini-line-hover-target"/>
    </svg><div class="mini-line-hover-card multi-index-hover-card" hidden></div></div>`;
}

function renderMultiIndexChart(analysis, fundName) {
  const indexes = availableComparisonIndexes(analysis);
  if (!indexes.length) return '<p class="empty-copy">多指数比较数据不足。</p>';
  const selectedKey = indexes.some(([key]) => key === "000906.SH") ? "000906.SH" : indexes[0][0];
  return `
    <div class="multi-index-chart-module">
      <div class="multi-index-chart-control">
        <label><span>对比指数</span><select class="multi-index-select">${indexes.map(([key, label]) => `<option value="${escapeHTML(key)}" ${key === selectedKey ? "selected" : ""}>${escapeHTML(label)} · ${escapeHTML(key)}</option>`).join("")}</select></label>
        <small>仅展示本地已有连续行情的指数；曲线共同起点归一化为1。</small>
      </div>
      <div class="multi-index-chart-output">${renderMultiIndexPlot(analysis, fundName, selectedKey)}</div>
    </div>`;
}

function renderBarList(entries, total = 1) {
  if (!entries.length) return '<p class="empty-copy">暂无数据。</p>';
  const max = Math.max(...entries.map(([, value]) => Number(value)), Number(total) || 1);
  return `<div class="bar-list">${entries.map(([label, value]) => `
    <div class="bar-row">
      <div><span>${escapeHTML(label)}</span><strong>${pct(value, 1)}</strong></div>
      <div class="bar-track"><span style="width:${Math.min((Number(value) / max) * 100, 100).toFixed(1)}%"></span></div>
    </div>`).join("")}</div>`;
}

function miniLineValue(value, format = "percent") {
  if (!Number.isFinite(Number(value))) return "—";
  if (format === "number") return num(value, 2);
  if (format === "years") return `${num(value, 2)}年`;
  if (format === "percent-point") return `${num(value, 2)}%`;
  return pct(value, 2);
}

function renderMiniLineChart(series, lines, ariaLabel) {
  if (!series || series.length < 2) return '<p class="empty-copy">趋势数据不足。</p>';
  const width = 900;
  const height = 250;
  const margin = { top: 24, right: 24, bottom: 42, left: 54 };
  const values = series.flatMap((item) => lines.map((line) => Number(item[line.key])).filter(Number.isFinite));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max((rawMax - rawMin) * 0.12, 0.01);
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const x = (index) => margin.left + (index / (series.length - 1)) * (width - margin.left - margin.right);
  const y = (value) => margin.top + ((max - value) / Math.max(max - min, 0.01)) * (height - margin.top - margin.bottom);
  const ticks = Array.from({ length: 4 }, (_, index) => min + ((max - min) * index) / 3).reverse();
  const dateIndexes = chartTickIndexes(series.length, 7);
  const formats = lines.map((line) => line.format || "percent");
  return `
    <div class="mini-chart-legend">${lines.map((line) => `<span style="--line-color:${line.color}">${escapeHTML(line.label)}</span>`).join("")}</div>
    <div class="nav-chart-wrap mini-line-chart-wrap"><svg class="nav-chart mini-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(ariaLabel)}" data-min="${min}" data-max="${max}" data-labels="${escapeHTML(lines.map((line) => line.label).join("|"))}">
      ${ticks.map((tick) => `<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" class="chart-grid-line"/><text x="${margin.left - 9}" y="${y(tick) + 4}" class="chart-axis-label" text-anchor="end">${miniLineValue(tick, formats[0])}</text>`).join("")}
      ${lines.map((line) => `<polyline points="${series.map((item, index) => `${x(index).toFixed(1)},${y(Number(item[line.key])).toFixed(1)}`).join(" ")}" class="chart-line" style="stroke:${line.color};stroke-width:${line.width || 2.5}"/>`).join("")}
      ${dateIndexes.map((index) => `<text x="${x(index)}" y="${height - 13}" class="chart-axis-label chart-axis-date" text-anchor="${index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"}">${escapeHTML(series[index].report_date.slice(0, 7))}</text>`).join("")}
      ${series.map((item, index) => `<g class="mini-line-data" data-date="${escapeHTML(item.report_date)}" data-values="${lines.map((line) => Number(item[line.key])).join("|")}" data-x="${x(index).toFixed(2)}"></g>`).join("")}
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" class="mini-line-crosshair" hidden/>
      ${lines.map((line) => `<circle r="4" class="mini-line-hover-dot" style="stroke:${line.color}" hidden/>`).join("")}
      <rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${height - margin.top - margin.bottom}" class="mini-line-hover-target"/>
    </svg><div class="mini-line-hover-card" data-formats="${escapeHTML(formats.join("|"))}" hidden></div></div>`;
}

function bindMiniLineCharts() {
  document.querySelectorAll(".mini-line-chart-wrap").forEach((wrap) => {
    if (wrap.dataset.hoverBound === "true") return;
    const svg = wrap.querySelector(".mini-line-chart");
    const target = svg?.querySelector(".mini-line-hover-target");
    const crosshair = svg?.querySelector(".mini-line-crosshair");
    const dots = [...(svg?.querySelectorAll(".mini-line-hover-dot") || [])];
    const card = wrap.querySelector(".mini-line-hover-card");
    const data = [...(svg?.querySelectorAll(".mini-line-data") || [])].map((item) => ({
      date: item.dataset.date,
      values: item.dataset.values.split("|").map(Number),
      x: Number(item.dataset.x),
    }));
    if (!svg || !target || !crosshair || !card || data.length < 2) return;
    const width = 900;
    const height = 250;
    const margin = { top: 24, right: 24, bottom: 42, left: 54 };
    const min = Number(svg.dataset.min);
    const max = Number(svg.dataset.max);
    const labels = (svg.dataset.labels || "").split("|");
    const formats = (card.dataset.formats || "").split("|");
    const y = (value) => margin.top + ((max - value) / Math.max(max - min, 0.01)) * (height - margin.top - margin.bottom);
    const setVisible = (visible) => {
      [crosshair, card, ...dots].forEach((item) => {
        if (visible) item.removeAttribute("hidden");
        else item.setAttribute("hidden", "");
      });
    };
    const update = (event) => {
      const bounds = svg.getBoundingClientRect();
      const rawX = Math.min(width - margin.right, Math.max(margin.left, (event.clientX - bounds.left) / bounds.width * width));
      const index = Math.max(0, Math.min(data.length - 1, Math.round((rawX - margin.left) / (width - margin.left - margin.right) * (data.length - 1))));
      const point = data[index];
      crosshair.setAttribute("x1", point.x);
      crosshair.setAttribute("x2", point.x);
      dots.forEach((dot, lineIndex) => {
        dot.setAttribute("cx", point.x);
        dot.setAttribute("cy", y(point.values[lineIndex]));
      });
      card.innerHTML = `<strong>${escapeHTML(point.date)}</strong>${point.values.map((value, lineIndex) => `<span>${escapeHTML(labels[lineIndex] || `序列${lineIndex + 1}`)}：${miniLineValue(value, formats[lineIndex])}</span>`).join("")}`;
      card.style.left = `${Math.min(Math.max(point.x / width * 100, 16), 84)}%`;
      setVisible(true);
    };
    target.addEventListener("pointermove", update);
    target.addEventListener("pointerdown", update);
    target.addEventListener("pointerleave", () => setVisible(false));
    wrap.dataset.hoverBound = "true";
  });
}

function bindMultiIndexPlotHover(root = document) {
  root.querySelectorAll(".multi-index-plot-wrap").forEach((wrap) => {
    const svg = wrap.querySelector(".multi-index-chart");
    const target = svg?.querySelector(".mini-line-hover-target");
    const crosshair = svg?.querySelector(".mini-line-crosshair");
    const dots = [...(svg?.querySelectorAll(".mini-line-hover-dot") || [])];
    const card = wrap.querySelector(".multi-index-hover-card");
    const data = [...(svg?.querySelectorAll(".multi-index-data") || [])].map((item) => ({
      date: item.dataset.date,
      values: item.dataset.values.split("|").map(Number),
      x: Number(item.dataset.x),
    }));
    if (!svg || !target || !crosshair || !card || data.length < 2) return;
    const width = 920;
    const height = 340;
    const margin = { top: 26, right: 24, bottom: 42, left: 58 };
    const min = Number(svg.dataset.min);
    const max = Number(svg.dataset.max);
    const labels = (svg.dataset.labels || "").split("|");
    const y = (value) => margin.top + ((max - value) / Math.max(max - min, 0.01)) * (height - margin.top - margin.bottom);
    const setVisible = (visible) => [crosshair, card, ...dots].forEach((item) => {
      if (visible) item.removeAttribute("hidden");
      else item.setAttribute("hidden", "");
    });
    const update = (event) => {
      const bounds = svg.getBoundingClientRect();
      const rawX = Math.min(width - margin.right, Math.max(margin.left, (event.clientX - bounds.left) / bounds.width * width));
      const index = Math.max(0, Math.min(data.length - 1, Math.round((rawX - margin.left) / (width - margin.left - margin.right) * (data.length - 1))));
      const point = data[index];
      crosshair.setAttribute("x1", point.x);
      crosshair.setAttribute("x2", point.x);
      dots.forEach((dot, lineIndex) => {
        const value = point.values[lineIndex];
        if (Number.isFinite(value)) {
          dot.setAttribute("cx", point.x);
          dot.setAttribute("cy", y(value));
          dot.removeAttribute("hidden");
        } else {
          dot.setAttribute("hidden", "");
        }
      });
      card.innerHTML = `<strong>${escapeHTML(point.date)}</strong>${point.values.map((value, lineIndex) => Number.isFinite(value) ? `<span>${escapeHTML(labels[lineIndex] || `序列${lineIndex + 1}`)}：${num(value, 3)}</span>` : "").join("")}`;
      card.style.left = `${Math.min(Math.max(point.x / width * 100, 18), 82)}%`;
      crosshair.removeAttribute("hidden");
      card.removeAttribute("hidden");
    };
    target.addEventListener("pointermove", update);
    target.addEventListener("pointerdown", update);
    target.addEventListener("pointerleave", () => setVisible(false));
  });
}

function bindMultiIndexChart(analysis, fundName, root = document) {
  root.querySelectorAll(".multi-index-chart-module").forEach((module) => {
    const select = module.querySelector(".multi-index-select");
    const output = module.querySelector(".multi-index-chart-output");
    if (!select || !output) return;
    const draw = () => {
      output.innerHTML = renderMultiIndexPlot(analysis, fundName, select.value);
      bindMultiIndexPlotHover(output);
    };
    select.addEventListener("change", draw);
    bindMultiIndexPlotHover(output);
  });
}

function renderQuarterlyUpdate(update) {
  if (!update) return "";
  const changeClass = (value) => value > 0 ? "value-positive" : value < 0 ? "value-negative" : "";
  return `
    <article class="quarterly-update-card">
      <div class="quarterly-update-heading"><div><span>LATEST QUARTER</span><h3>${escapeHTML(update.from_date)} → ${escapeHTML(update.to_date)}</h3></div><small>公告：${escapeHTML(update.announcement_date)}</small></div>
      <p>${escapeHTML(update.summary)}</p>
      <div class="quarterly-change-grid">
        <div><span>股票仓位</span><strong class="${changeClass(update.stock_allocation.change)}">${pct(update.stock_allocation.previous, 1)} → ${pct(update.stock_allocation.latest, 1)}</strong><small>${pct(update.stock_allocation.change, 1, true)}</small></div>
        <div><span>前十大集中度</span><strong class="${changeClass(update.top10_concentration.change)}">${pct(update.top10_concentration.previous, 1)} → ${pct(update.top10_concentration.latest, 1)}</strong><small>${pct(update.top10_concentration.change, 1, true)}</small></div>
        <div><span>净资产变化</span><strong class="${changeClass(update.net_asset.change)}">${money(update.net_asset.latest)}</strong><small>${pct(update.net_asset.change, 1, true)}</small></div>
        <div><span>核心名单重合</span><strong>${pct(update.jaccard, 1)}</strong><small>新进${update.entered.length}只 / 退出${update.exited.length}只</small></div>
      </div>
      <div class="holding-change-pills"><div><span>新进</span>${update.entered.length ? update.entered.map((name) => `<b>${escapeHTML(name)}</b>`).join("") : "<em>无</em>"}</div><div><span>退出</span>${update.exited.length ? update.exited.map((name) => `<b>${escapeHTML(name)}</b>`).join("") : "<em>无</em>"}</div></div>
    </article>`;
}

function renderRecentResearchUpdate(update) {
  if (!update?.items?.length) return "";
  return `
    <article class="subpanel recent-research-update">
      <div class="subpanel-heading"><div><h3>${escapeHTML(update.title)}</h3><span>截至${escapeHTML(update.as_of)} · 月度表现、风格相关性、大小盘与核心估值</span></div></div>
      <div class="recent-update-grid">${update.items.map((item) => `
        <div class="recent-update-item">
          <span>${escapeHTML(item.dimension)}</span>
          <h4>${escapeHTML(item.title)}</h4>
          <p>${escapeHTML(item.summary)}</p>
        </div>`).join("")}</div>
      <p class="method-note">${escapeHTML(update.note)}</p>
    </article>`;
}

function renderManagerProfile(profile) {
  if (!profile) return "";
  const tagBlock = (label, tags, className) => `<div><span>${label}</span><p>${tags.map((tag) => `<b class="profile-tag ${className}">${escapeHTML(tag)}</b>`).join("")}</p></div>`;
  return `
    <article class="subpanel manager-profile-panel">
      <div class="subpanel-heading"><h3>动态经理画像</h3><span>截至${escapeHTML(profile.as_of)}，稳定特征与阶段变化分开展示</span></div>
      <div class="profile-tag-groups">${tagBlock("稳定标签", profile.stable_tags, "stable")}${tagBlock("本期标签", profile.current_tags, "current")}${tagBlock("风险标签", profile.risk_tags, "risk")}</div>
      <div class="profile-copy-grid"><div><span>长期方法</span><p>${escapeHTML(profile.long_term)}</p></div><div><span>本期变化</span><p>${escapeHTML(profile.current)}</p></div><div><span>主要风险</span><p>${escapeHTML(profile.risk)}</p></div></div>
    </article>`;
}

function renderTagHistory(history) {
  if (!history?.length) return "";
  return `<article class="subpanel"><div class="subpanel-heading"><h3>标签演化</h3><span>标签来自季度持仓与仓位变化，不是固定评级</span></div><div class="tag-history">${history.map((item) => `<div><time>${escapeHTML(item.report_date)}</time><strong>${escapeHTML(item.tag)}</strong><p>${escapeHTML(item.reason)}</p></div>`).join("")}</div></article>`;
}

function renderConsistencyTimeline(timeline) {
  if (!timeline?.length) return '<p class="empty-copy">暂无可结构化的披露时间线。</p>';
  return `<div class="consistency-timeline">${timeline.slice().reverse().map((period, index) => `
    <article class="consistency-period${index === 0 ? " latest" : ""}">
      <div class="consistency-period-head"><span>${escapeHTML(period.period)}</span><small>公告：${escapeHTML(period.announcement_date)}</small></div>
      <p class="consistency-summary">${escapeHTML(period.summary)}</p>
      ${period.items.length ? `<div class="consistency-evidence-list">${period.items.map((item) => `<div><b>${escapeHTML(item.action_tag)}</b><strong>${escapeHTML(item.statement)}</strong><p>${escapeHTML(item.evidence)}</p><em>${escapeHTML(item.judgement)}</em></div>`).join("")}</div>` : '<p class="period-empty">该期原文已收录，暂无单独结构化核验项。</p>'}
    </article>`).join("")}</div>`;
}

function renderHoldingHeatmap(history) {
  if (!history?.length) return '<p class="empty-copy">暂无历史持仓数据。</p>';
  const stockMap = new Map();
  history.forEach((period) => period.holdings.forEach((holding) => {
    const current = stockMap.get(holding.code) || { code: holding.code, name: holding.name, max: 0, count: 0 };
    current.max = Math.max(current.max, holding.weight);
    current.count += 1;
    stockMap.set(holding.code, current);
  }));
  const stocks = [...stockMap.values()].sort((a, b) => b.count - a.count || b.max - a.max).slice(0, 14);
  const weightAt = (period, code) => period.holdings.find((holding) => holding.code === code)?.weight || 0;
  const rows = stocks.map((stock) => [
    `<strong>${escapeHTML(stock.name)}</strong><small class="heatmap-code">${escapeHTML(stock.code)}</small>`,
    ...history.map((period) => {
      const weight = weightAt(period, stock.code);
      const intensity = Math.min(weight / Math.max(stock.max, 0.001), 1);
      return weight ? `<span class="heat-cell" style="--heat:${(0.12 + intensity * 0.72).toFixed(2)}">${pct(weight, 1)}</span>` : '<span class="heat-cell empty">—</span>';
    }),
  ]);
  return renderTable(["核心持仓", ...history.map((item) => item.report_date.slice(0, 7))], rows, "holding-heatmap-wrap");
}

function panel(id, content, active = false) {
  return `<section class="fund-tab-panel${active ? " active" : ""}" id="panel-${id}" data-panel="${id}" role="tabpanel" ${active ? "" : "hidden"}>${content}</section>`;
}

function renderOverview(fund, analysis, data) {
  const managers = analysis.current_managers || [];
  const shareClass = analysis.share_classes;
  const managerRows = managers.map((manager) => [
    `<strong>${escapeHTML(manager.name)}</strong>`,
    escapeHTML(manager.start_date),
    `<span class="value-positive">${pct(manager.return_since_start, 1, true)}</span>`,
    pct(manager.max_drawdown_since_start, 1),
  ]);
  return `
    <div class="panel-intro"><div><p class="eyebrow">RESEARCH OVERVIEW</p><h2>研究结论与关键事实</h2></div><p>先呈现结论，再用后续板块逐项核验业绩、持仓行为和披露信息。</p></div>
    ${renderQuarterlyUpdate(analysis.quarterly_update)}
    ${renderRecentResearchUpdate(analysis.recent_research_update)}
    <div class="conclusion-grid">
      <article class="conclusion-card conclusion-primary"><span>当前画像</span><h3>${escapeHTML(fund.summary)}</h3><p>${escapeHTML(fund.note)}</p></article>
      <article class="conclusion-card"><span>后续观察</span><p>${escapeHTML(fund.watch)}</p></article>
    </div>
    <div class="overview-split">
      <article class="subpanel"><h3>主要发现</h3><ol class="page-finding-list">${fund.findings.map((finding) => `<li>${escapeHTML(finding)}</li>`).join("")}</ol></article>
      <article class="subpanel"><h3>份额与基本信息</h3>
        <div class="class-code-row"><span class="class-code active">A ${escapeHTML(shareClass?.a_code || fund.code)}</span>${shareClass?.c_code ? `<span class="class-code">C ${escapeHTML(shareClass.c_code)}</span>` : '<span class="class-code muted">暂无对应C类</span>'}</div>
        <dl class="fact-list">
          <div><dt>最新净资产</dt><dd>${money(analysis.latest_net_asset)}</dd></div>
          <div><dt>最新持仓报告期</dt><dd>${escapeHTML(analysis.latest_top10.report_date)}</dd></div>
          <div><dt>持仓公告日</dt><dd>${escapeHTML(analysis.latest_top10.announcement_date)}</dd></div>
          <div><dt>净值截止日</dt><dd>${escapeHTML(data.navAsOf)}</dd></div>
        </dl>
        ${shareClass ? `<div class="ac-summary"><strong>A/C年化差：${pct(shareClass.annualized_gap, 2)}</strong><p>C类销售服务费率：${pct(shareClass.c_sales_service_rate, 2)}/年；比较期${escapeHTML(shareClass.start_date)}至${escapeHTML(shareClass.end_date)}。</p></div>` : ""}
      </article>
    </div>
    <article class="subpanel"><div class="subpanel-heading"><h3>现任基金经理</h3><span>任职收益不能与五年全周期业绩混同</span></div>${renderTable(["经理", "任职起点", "任职以来收益", "任职以来最大回撤"], managerRows)}</article>
    ${renderManagerProfile(analysis.manager_profile)}
    ${renderTagHistory(analysis.tag_history)}`;
}

function renderPerformance(fund, analysis, detailData) {
  const p = analysis.performance;
  const benchmark = detailData.benchmark;
  const managerStart = currentManagerTenureStart(analysis.current_managers);
  const comparisonNote = benchmark.starts_at_inception
    ? `基金与中证800自成立日 ${benchmark.fund_inception_date} 起同时归一化为1.00。`
    : `基金成立于 ${benchmark.fund_inception_date}；中证800历史始于 ${benchmark.comparison_start_date}，双方自首个共同可比日归一化为1.00。`;
  const contractBenchmark = benchmark.contract_text
    ? `${benchmark.contract_text}${benchmark.contract_code ? `（${benchmark.contract_code}）` : ""}`
    : "现有基金描述与Choice字段未记录合同业绩比较基准";
  const nav = detailData.fund_nav || detailData.nav || [];
  const comparisonNav = detailData.nav || [];
  const latestDate = new Date(nav.at(-1)?.date);
  const periodStart = (months) => {
    const date = new Date(latestDate);
    date.setMonth(date.getMonth() - months);
    return date.toISOString().slice(0, 10);
  };
  const statsRow = (label, stats) => [
    escapeHTML(label),
    stats ? `<strong class="${stats.cumulative >= 0 ? "value-positive" : "value-negative"}">${pct(stats.cumulative, 1, true)}</strong>` : "—",
    stats ? pct(stats.annualizedReturn, 1, true) : "—",
    stats ? pct(stats.volatility, 1) : "—",
    stats ? pct(stats.maxDrawdown, 1) : "—",
    stats ? num(stats.sharpe, 2) : "—",
    stats ? num(stats.calmar, 2) : "—",
  ];
  const horizons = [["近1月", 1], ["近3月", 3], ["近6月", 6], ["今年以来", "ytd"], ["近1年", 12], ["近3年", 36], ["近5年", 60], ["成立以来", "all"]];
  const horizonRows = horizons.map(([label, range]) => {
    const start = range === "all" ? null : range === "ytd" ? `${latestDate.getFullYear()}-01-01` : periodStart(range);
    return statsRow(label, performanceStats(start ? nav.filter((point) => point.date >= start) : nav));
  });
  const years = [...new Set(nav.map((point) => point.date.slice(0, 4)))].sort((a, b) => b - a);
  const calendarRows = years.map((year) => statsRow(year, performanceStats(nav.filter((point) => point.date.startsWith(year)))));
  const scenarioLabels = { market_up: "市场上涨月", market_down: "市场下跌月", stress_quartile: "基准最弱25%月份" };
  const scenarioRows = Object.entries(analysis.scenarios || {}).map(([key, item]) => [escapeHTML(scenarioLabels[key] || key), `${item.months}个月`, pct(item.fund_average_return, 2, true), pct(item.benchmark_average_return, 2, true), pct(item.excess_win_rate, 1)]);
  return `
    <div class="panel-intro"><div><p class="eyebrow">PERFORMANCE & DRAWDOWN</p><h2>业绩、超额与回撤</h2></div><div class="chart-controls" aria-label="净值区间"><button data-nav-range="ytd">今年以来</button><button data-nav-range="12">1年</button><button data-nav-range="36">3年</button><button data-nav-range="60">5年</button>${managerStart ? `<button data-nav-range="manager" data-range-start="${escapeHTML(managerStart)}" title="现任团队自${escapeHTML(managerStart)}形成">现任经理</button>` : ""}<button data-nav-range="all" class="active">成立以来</button></div></div>
    <div class="research-metric-grid metric-four" id="performance-range-metrics" aria-live="polite">${renderPerformanceMetricCards("all", nav, true, comparisonNav)}</div>
    <article class="subpanel chart-subpanel"><div class="subpanel-heading"><h3>日频归一化净值与回撤阴影</h3><span>${escapeHTML(comparisonNote)}</span></div><div id="nav-chart-output"></div><p class="method-note">回撤阴影叠加在上半区净值绘图区内；切换区间后，基金与中证800在首个共同观察日重新归一化为1.00，回撤同步重算。合同业绩比较基准：${escapeHTML(contractBenchmark)}；图中用中证800作为统一研究基准。</p></article>
    <div class="performance-table-stack">
      <article class="subpanel performance-table-panel"><h3>分期限风险收益</h3>${renderTable(["区间", "累计收益", "年化收益", "年化波动", "最大回撤", "Sharpe", "Calmar"], horizonRows)}</article>
      <article class="subpanel performance-table-panel"><h3>全部自然年度风险收益</h3>${renderTable(["年度", "年度收益", "年化收益", "年化波动", "最大回撤", "Sharpe", "Calmar"], calendarRows)}</article>
    </div>
    <p class="method-note">Sharpe按无风险利率0计算；Calmar＝年化收益/最大回撤绝对值。短于一年的年化指标仅用于统一比较。</p>
    <article class="subpanel"><div class="subpanel-heading"><h3>月度收益、年度回撤与修复</h3><span>红色为上涨、绿色为下跌；当年合计按已有月份复合</span></div>${renderMonthlyReturnHeatmap(analysis.multi_index_analysis?.monthly_returns, nav)}</article>
    <article class="subpanel"><div class="subpanel-heading"><h3>超额、捕获与市场情景</h3><span>近五年月度收益 · 中证800横向研究代理</span></div><section class="research-metric-grid metric-six">${metric("跟踪误差", pct(p.tracking_error, 1))}${metric("月度超额胜率", pct(p.monthly_excess_win_rate, 1))}${metric("上涨捕获", pct(p.up_capture, 1))}${metric("下跌捕获", pct(p.down_capture, 1))}${metric("下行波动率", pct(p.downside_volatility, 1))}${metric("Sortino", num(p.sortino_zero_rf, 2), "无风险利率0")}</section>${scenarioRows.length ? renderTable(["情景", "样本", "基金月均", "基准月均", "超额胜率"], scenarioRows) : '<p class="empty-copy">市场情景共同样本不足。</p>'}<p class="method-note">横向研究基准不替代基金合同业绩比较基准；上下行捕获按基准正负收益月份计算。</p></article>`;
}

function renderConsistency(code, analysis, allData) {
  const evidence = allData.consistencyEvidence.filter((item) => item.fund_code === code);
  const evidenceRows = evidence.map((item) => [escapeHTML(item.statement), escapeHTML(item.evidence), `<strong>${escapeHTML(item.judgement)}</strong>`]);
  const comments = (analysis.latest_comments || []).map((item) => `
    <article class="commentary-card">
      <div><span>${escapeHTML(item.start_date)} — ${escapeHTML(item.end_date)}</span><small>公告：${escapeHTML(item.announcement_date)}</small></div>
      <p>${escapeHTML(item.text.length > 700 ? `${item.text.slice(0, 700)}…` : item.text)}</p>
    </article>`).join("");
  return `
    <div class="panel-intro"><div><p class="eyebrow">WORDS × ACTIONS</p><h2>基金经理言行一致性</h2></div><p>将定期报告中的可验证陈述，与仓位、完整持仓和前十大变化逐项对照。</p></div>
    <article class="subpanel"><div class="subpanel-heading"><h3>按披露期查看言行证据</h3><span>最新一期在前；结论随新报告滚动更新</span></div>${renderConsistencyTimeline(analysis.consistency_timeline)}</article>
    <details class="subpanel evidence-details"><summary>展开全部结构化证据（${evidenceRows.length}条）</summary>${evidenceRows.length ? renderTable(["经理陈述", "数据证据", "研究判断"], evidenceRows) : '<p class="empty-copy">当前披露文本中暂无可稳定量化核验的陈述。</p>'}</details>
    <article class="subpanel"><div class="subpanel-heading"><h3>最新定期报告原文摘录</h3><span>仅截取与投资方法、仓位及调仓相关的披露</span></div><div class="commentary-list">${comments || '<p class="empty-copy">暂无报告摘录。</p>'}</div></article>
    <p class="method-note">言行一致只表示披露陈述与可观察行为相符，不等同于未来业绩承诺，也不构成主观诚信评价。</p>`;
}

function normalizedAssetAllocation(item) {
  const stock = Math.max(0, Number(item.stock_to_nav) || 0);
  const bond = Math.max(0, Number(item.bond_to_nav) || 0);
  const cash = Math.max(0, Number(item.cash_to_nav) || 0);
  const fund = Math.max(0, Number(item.fund_to_nav ?? item.fund) || 0);
  const other = Math.max(0, Number(item.other_to_nav) || 0);
  const disclosed = stock + bond + cash + fund + other;
  const undisclosed = Math.max(0, 1 - disclosed);
  const total = Math.max(disclosed + undisclosed, 1e-12);
  return {
    report_date: item.report_date,
    stock: stock / total,
    bond: bond / total,
    cash: cash / total,
    fund: fund / total,
    other: other / total,
    undisclosed: undisclosed / total,
  };
}

function renderAssetAllocationAreaChart(history = []) {
  if (history.length < 2) return '<p class="empty-copy">资产配置历史不足。</p>';
  const data = history.map(normalizedAssetAllocation);
  const width = 920;
  const height = 350;
  const margin = { top: 28, right: 28, bottom: 48, left: 58 };
  const plotBottom = height - margin.bottom;
  const x = (index) => margin.left + index / (data.length - 1) * (width - margin.left - margin.right);
  const y = (value) => margin.top + (1 - value) * (plotBottom - margin.top);
  const layers = [
    { key: "stock", label: "股票", className: "asset-area-stock" },
    { key: "bond", label: "债券", className: "asset-area-bond" },
    { key: "fund", label: "基金投资", className: "asset-area-fund" },
    { key: "cash", label: "现金", className: "asset-area-cash" },
    { key: "other", label: "已披露其他", className: "asset-area-other" },
    { key: "undisclosed", label: "未披露分项", className: "asset-area-undisclosed" },
  ];
  let lower = data.map(() => 0);
  const areas = layers.map((layer) => {
    const upper = data.map((item, index) => lower[index] + item[layer.key]);
    const points = [
      ...upper.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`),
      ...lower.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).reverse(),
    ].join(" ");
    lower = upper;
    return `<polygon points="${points}" class="asset-allocation-area ${layer.className}"/>`;
  }).join("");
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const dateIndexes = chartTickIndexes(data.length, 7);
  return `
    <div class="asset-allocation-legend">${layers.map((layer) => `<span class="${layer.className}">${layer.label}</span>`).join("")}</div>
    <div class="asset-allocation-chart-wrap">
      <svg class="asset-allocation-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="季度资产配置百分之百堆叠面积图">
        ${ticks.map((tick) => `<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" class="chart-grid-line"/><text x="${margin.left - 10}" y="${y(tick) + 4}" class="chart-axis-label" text-anchor="end">${pct(tick, 0)}</text>`).join("")}
        ${areas}
        ${dateIndexes.map((index) => `<text x="${x(index)}" y="${height - 15}" class="chart-axis-label chart-axis-date" text-anchor="${index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}">${escapeHTML(data[index].report_date.slice(0, 7))}</text>`).join("")}
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${plotBottom}" class="asset-allocation-crosshair" hidden/>
        <rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${plotBottom - margin.top}" class="asset-allocation-hover-target"/>
      </svg>
      <div class="asset-allocation-hover-card" hidden></div>
    </div>
    <p class="method-note">港股属于股票资产的组成部分，不重复堆叠；基金投资使用披露字段，不用差额反推。已披露分项不足100%时单列“未披露分项”；超过100%时按已知资产同比例归一化。</p>`;
}

function bindAssetAllocationChart(history = []) {
  const wrap = document.querySelector(".asset-allocation-chart-wrap");
  const svg = wrap?.querySelector(".asset-allocation-chart");
  const target = svg?.querySelector(".asset-allocation-hover-target");
  const crosshair = svg?.querySelector(".asset-allocation-crosshair");
  const card = wrap?.querySelector(".asset-allocation-hover-card");
  if (!svg || !target || !crosshair || !card || history.length < 2) return;
  const data = history.map(normalizedAssetAllocation);
  const width = 920;
  const margin = { left: 58, right: 28 };
  const setVisible = (visible) => {
    [crosshair, card].forEach((item) => {
      if (visible) item.removeAttribute("hidden");
      else item.setAttribute("hidden", "");
    });
  };
  const update = (event) => {
    const bounds = svg.getBoundingClientRect();
    const rawX = Math.min(width - margin.right, Math.max(margin.left, (event.clientX - bounds.left) / bounds.width * width));
    const index = Math.max(0, Math.min(data.length - 1, Math.round((rawX - margin.left) / (width - margin.left - margin.right) * (data.length - 1))));
    const item = data[index];
    const exactX = margin.left + index / (data.length - 1) * (width - margin.left - margin.right);
    crosshair.setAttribute("x1", exactX);
    crosshair.setAttribute("x2", exactX);
    card.innerHTML = `<strong>${escapeHTML(item.report_date)}</strong><span>股票：${pct(item.stock, 1)}</span><span>债券：${pct(item.bond, 1)}</span><span>基金投资：${pct(item.fund, 1)}</span><span>现金：${pct(item.cash, 1)}</span><span>已披露其他：${pct(item.other, 1)}</span><span>未披露分项：${pct(item.undisclosed, 1)}</span><span>合计：100.0%</span>`;
    card.style.left = `${Math.min(Math.max(exactX / width * 100, 16), 84)}%`;
    setVisible(true);
  };
  target.addEventListener("pointermove", update);
  target.addEventListener("pointerdown", update);
  target.addEventListener("pointerleave", () => setVisible(false));
}

function renderAssets(analysis) {
  const latest = analysis.assets.latest;
  const concentrationHistory = analysis.holding_history || [];
  const latestTop10 = analysis.latest_top10?.summary?.top10_weight;
  const fullSummary = analysis.full_holdings.summary;
  const assetRows = analysis.assets.history.slice().reverse().map((item) => [
    escapeHTML(item.report_date), money(item.net_asset), pct(item.stock_to_nav, 1), pct(item.hk_stock_to_nav, 1), pct(item.bond_to_nav, 1), pct(item.cash_to_nav, 1), escapeHTML(item.announcement_date),
  ]);
  return `
    <div class="panel-intro"><div><p class="eyebrow">ASSET ALLOCATION</p><h2>资产配置</h2></div><p>观察资产分布、股票仓位与持股集中度；资产配置使用季度报告口径。</p></div>
    <div class="research-metric-grid metric-five">
      ${metric("最新规模", money(latest.net_asset))}${metric("股票仓位", pct(latest.stock_to_nav, 1))}${metric("港股仓位", pct(latest.hk_stock_to_nav, 1))}${metric("债券仓位", pct(latest.bond_to_nav, 1))}${metric("现金仓位", pct(latest.cash_to_nav, 1))}
    </div>
    <article class="subpanel chart-subpanel"><div class="subpanel-heading"><h3>资产分布与仓位变化</h3><span>季度报告期口径 · 纵向合计始终为100%</span></div>${renderAssetAllocationAreaChart(analysis.assets.history)}</article>
    <article class="subpanel"><div class="subpanel-heading"><h3>持股重仓集中度</h3><span>两套披露口径分别展示</span></div>
        <div class="research-metric-grid metric-two">${metric("最新季度前十大", pct(latestTop10, 1))}${metric("完整持仓前十大", pct(fullSummary.top10_weight, 1))}${metric("完整持仓前二十", pct(fullSummary.top20_weight, 1))}${metric("前二十以外长尾", pct(fullSummary.tail_beyond_top20_weight, 1))}</div>
        <p class="method-note">季度前十大用于高频观察；完整持仓集中度仅使用半年报/年报全部持仓计算，两者不混合拼接。</p>
    </article>
    <article class="subpanel chart-subpanel"><div class="subpanel-heading"><h3>季度前十大集中度趋势</h3><span>占基金净值</span></div>${renderMiniLineChart(concentrationHistory, [{ key: "top10_concentration", label: "前十大集中度", color: "#0b7774", width: 3 }], "季度前十大持仓集中度变化")}</article>
    <article class="subpanel"><div class="subpanel-heading"><h3>季度资产配置轨迹</h3><span>报告期与公告日分开展示，避免前视</span></div>${renderTable(["报告期", "净资产", "股票", "港股", "债券", "现金", "公告日"], assetRows)}</article>`;
}

function renderIndustryDistribution(period, dimension, selectedIndustry, sortDirection = "desc") {
  const entries = Object.entries(period?.weights?.[dimension] || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((left, right) => (Number(left[1]) - Number(right[1])) * (sortDirection === "asc" ? 1 : -1));
  if (!entries.length) return '<p class="empty-copy">该报告期暂无可展示的行业权重。</p>';
  const max = Math.max(...entries.map(([, value]) => Number(value)), 0.01);
  const total = entries.reduce((sum, [, value]) => sum + Number(value), 0);
  const hhi = total > 0 ? entries.reduce((sum, [, value]) => sum + (Number(value) / total) ** 2, 0) : null;
  return `<div class="research-metric-grid metric-three industry-concentration-summary">${metric("行业集中度 HHI", num(hhi, 3), "披露股票内部归一化")}${metric("等效行业数", Number.isFinite(hhi) && hhi > 0 ? num(1 / hhi, 1) : "—", "1 / HHI")}${metric("披露权重合计", pct(total, 1), period?.report_date || "")}</div><div class="industry-distribution-list">${entries.map(([name, value]) => `
    <button class="industry-distribution-row${name === selectedIndustry ? " active" : ""}" data-industry-name="${escapeHTML(name)}">
      <span>${escapeHTML(name)}</span>
      <i><b style="width:${Math.min(Number(value) / max * 100, 100).toFixed(1)}%"></b></i>
      <strong>${pct(value, 1)}</strong>
    </button>`).join("")}</div>`;
}

function renderIndustryTrendChart(periods, dimension, industryName) {
  if (!periods?.length || !industryName) return '<p class="empty-copy">请选择一个行业查看连续变化。</p>';
  const values = periods.map((period) => ({
    report_date: period.report_date,
    value: Number(period.weights?.[dimension]?.[industryName] || 0),
  }));
  const width = Math.max(920, values.length * 68);
  const height = 380;
  const margin = { top: 28, right: 28, bottom: 88, left: 58 };
  const plotBottom = height - margin.bottom;
  const max = Math.max(...values.map((item) => item.value), 0.01) * 1.12;
  const x = (index) => margin.left + index / Math.max(values.length - 1, 1) * (width - margin.left - margin.right);
  const y = (value) => margin.top + (max - value) / max * (plotBottom - margin.top);
  const ticks = Array.from({ length: 5 }, (_, index) => max * (4 - index) / 4);
  return `
    <div class="industry-trend-chart-wrap">
      <svg class="industry-trend-chart" viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="img" aria-label="${escapeHTML(industryName)}披露权重连续变化">
        ${ticks.map((tick) => `<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" class="chart-grid-line"/><text x="${margin.left - 10}" y="${y(tick) + 4}" class="chart-axis-label" text-anchor="end">${pct(tick, 0)}</text>`).join("")}
        <polyline points="${values.map((item, index) => `${x(index).toFixed(1)},${y(item.value).toFixed(1)}`).join(" ")}" class="chart-line industry-trend-line"/>
        ${values.map((item, index) => `<circle cx="${x(index)}" cy="${y(item.value)}" r="3.2" class="industry-trend-point"/>`).join("")}
        ${values.map((item, index) => `<line x1="${x(index)}" y1="${plotBottom}" x2="${x(index)}" y2="${plotBottom + 5}" class="chart-report-tick"/><text x="${x(index)}" y="${plotBottom + 17}" class="industry-trend-date-label" text-anchor="end" transform="rotate(-45 ${x(index)} ${plotBottom + 17})">${escapeHTML(item.report_date)}</text>`).join("")}
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${plotBottom}" class="industry-trend-crosshair" hidden/>
        <circle r="4.5" class="industry-trend-hover-dot" hidden/>
        <rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${plotBottom - margin.top}" class="industry-trend-hover-target"/>
      </svg>
      <div class="industry-trend-hover-card" hidden></div>
    </div>`;
}

function bindIndustryTrendHover(periods, dimension, industryName) {
  const wrap = document.querySelector(".industry-trend-chart-wrap");
  const svg = wrap?.querySelector(".industry-trend-chart");
  const target = svg?.querySelector(".industry-trend-hover-target");
  const crosshair = svg?.querySelector(".industry-trend-crosshair");
  const dot = svg?.querySelector(".industry-trend-hover-dot");
  const card = wrap?.querySelector(".industry-trend-hover-card");
  if (!svg || !target || !crosshair || !dot || !card || !periods.length) return;
  const values = periods.map((period) => ({
    report_date: period.report_date,
    value: Number(period.weights?.[dimension]?.[industryName] || 0),
  }));
  const width = Math.max(920, values.length * 68);
  const height = 380;
  const margin = { top: 28, right: 28, bottom: 88, left: 58 };
  const max = Math.max(...values.map((item) => item.value), 0.01) * 1.12;
  const x = (index) => margin.left + index / Math.max(values.length - 1, 1) * (width - margin.left - margin.right);
  const y = (value) => margin.top + (max - value) / max * (height - margin.bottom - margin.top);
  const setVisible = (visible) => {
    [crosshair, dot, card].forEach((item) => {
      if (visible) item.removeAttribute("hidden");
      else item.setAttribute("hidden", "");
    });
  };
  const update = (event) => {
    const bounds = svg.getBoundingClientRect();
    const rawX = Math.min(width - margin.right, Math.max(margin.left, (event.clientX - bounds.left) / bounds.width * width));
    const index = Math.max(0, Math.min(values.length - 1, Math.round((rawX - margin.left) / (width - margin.left - margin.right) * (values.length - 1))));
    const item = values[index];
    const exactX = x(index);
    crosshair.setAttribute("x1", exactX);
    crosshair.setAttribute("x2", exactX);
    dot.setAttribute("cx", exactX);
    dot.setAttribute("cy", y(item.value));
    card.innerHTML = `<strong>${escapeHTML(item.report_date)}</strong><span>${escapeHTML(industryName)}：${pct(item.value, 2)}</span><span>占基金净值</span>`;
    card.style.left = `${Math.min(Math.max(exactX / width * 100, 16), 84)}%`;
    setVisible(true);
  };
  target.addEventListener("pointermove", update);
  target.addEventListener("pointerdown", update);
  target.addEventListener("pointerleave", () => setVisible(false));
}

function renderIndustryChanges(periods, dimension, selectedIndex) {
  if (selectedIndex < 1) return '<p class="empty-copy">请选择第二个或更晚的报告期查看相邻期变化。</p>';
  const previous = periods[selectedIndex - 1];
  const current = periods[selectedIndex];
  const previousWeights = previous.weights?.[dimension] || {};
  const currentWeights = current.weights?.[dimension] || {};
  const names = [...new Set([...Object.keys(previousWeights), ...Object.keys(currentWeights)])];
  const rows = names.map((name) => {
    const before = Number(previousWeights[name] || 0);
    const after = Number(currentWeights[name] || 0);
    return { name, before, after, change: after - before };
  }).filter((item) => Math.abs(item.change) > 0.000001)
    .sort((left, right) => Math.abs(right.change) - Math.abs(left.change))
    .map((item) => [
      `<button class="industry-change-link" data-industry-name="${escapeHTML(item.name)}">${escapeHTML(item.name)}</button>`,
      pct(item.before, 2),
      pct(item.after, 2),
      `<span class="${item.change >= 0 ? "value-positive" : "value-negative"}">${pct(item.change, 2, true)}</span>`,
    ]);
  return rows.length
    ? renderTable(["行业/板块", previous.report_date, current.report_date, "权重变化"], rows, "industry-change-table")
    : '<p class="empty-copy">相邻两期无非零行业变化。</p>';
}

function renderTimelineHeatmap(periods, dimension, options = {}) {
  if (!periods?.length) return '<p class="empty-copy">暂无可连续比较的披露期。</p>';
  const rowLimit = options.rowLimit || 18;
  const names = [...new Set(periods.flatMap((period) => Object.keys(period.weights?.[dimension] || {})))];
  const ranked = names.map((name) => {
    const values = periods.map((period) => Number(period.weights?.[dimension]?.[name] || 0));
    return { name, values, max: Math.max(...values, 0), average: values.reduce((sum, value) => sum + value, 0) / values.length };
  }).filter((item) => item.max >= 0.0005)
    .sort((left, right) => right.max - left.max || right.average - left.average)
    .slice(0, rowLimit);
  if (!ranked.length) return '<p class="empty-copy">该层级没有非零行业权重。</p>';
  const scale = Math.max(...ranked.flatMap((item) => item.values), 0.01);
  const cells = ranked.map((item) => {
    const values = item.values.map((value, index) => {
      if (value < 0.0005) return '<td class="timeline-heatmap-empty" title="该期未披露或权重低于0.05%">—</td>';
      const intensity = Math.min(value / scale, 1);
      const alpha = 0.12 + intensity * 0.76;
      const foreground = intensity > 0.58 ? "#ffffff" : "#102c45";
      return `<td style="background:rgba(11,119,116,${alpha.toFixed(3)});color:${foreground}" title="${escapeHTML(periods[index].report_date)} · ${escapeHTML(item.name)} · ${pct(value, 2)}">${pct(value, 1)}</td>`;
    }).join("");
    return `<tr><th scope="row"><button class="timeline-heatmap-row-link" data-industry-name="${escapeHTML(item.name)}">${escapeHTML(item.name)}</button></th>${values}</tr>`;
  }).join("");
  return `<div class="timeline-heatmap-wrap"><table class="timeline-heatmap"><thead><tr><th>${escapeHTML(options.firstColumn || "行业")}</th>${periods.map((period) => `<th>${escapeHTML(period.report_date.slice(2, 7))}</th>`).join("")}</tr></thead><tbody>${cells}</tbody></table></div><p class="method-note">按历史最高权重展示前${ranked.length}项；色深表示占基金净值权重，横向滚动可查看全部披露期。空白表示权重低于0.05%或该口径未披露。</p>`;
}

function bindIndustryAnalysis(analysis) {
  const history = analysis.industry_history;
  const root = document.querySelector("#industry-analysis-interactive");
  if (!history || !root) return;
  const initialScope = history.full?.length ? "full" : "quarterly";
  const state = { dimension: "sector", scope: initialScope, periodIndex: (history[initialScope] || []).length - 1, industry: null, sortDirection: "desc" };
  const dimensionButtons = [...root.querySelectorAll("[data-industry-dimension]")];
  const scopeButtons = [...root.querySelectorAll("[data-industry-scope]")];
  const periodSelect = root.querySelector("#industry-period-select");
  const distributionOutput = root.querySelector("#industry-distribution-output");
  const changeOutput = root.querySelector("#industry-change-output");
  const trendOutput = root.querySelector("#industry-trend-output");
  const scopeNote = root.querySelector("#industry-scope-note");
  const sortDirection = root.querySelector("#industry-sort-direction");
  const periods = () => history[state.scope] || [];
  const allIndustries = () => [...new Set(periods().flatMap((period) => Object.keys(period.weights?.[state.dimension] || {})))]
    .sort((left, right) => {
      const leftMax = Math.max(...periods().map((period) => Number(period.weights?.[state.dimension]?.[left] || 0)));
      const rightMax = Math.max(...periods().map((period) => Number(period.weights?.[state.dimension]?.[right] || 0)));
      return rightMax - leftMax;
    });
  const bindIndustryLinks = () => {
    root.querySelectorAll("[data-industry-name]").forEach((button) => button.addEventListener("click", () => {
      state.industry = button.dataset.industryName;
      draw();
    }));
  };
  const draw = () => {
    const currentPeriods = periods();
    state.periodIndex = Math.max(0, Math.min(state.periodIndex, currentPeriods.length - 1));
    const current = currentPeriods[state.periodIndex];
    const industries = allIndustries();
    if (!state.industry || !industries.includes(state.industry)) state.industry = industries[0] || null;
    dimensionButtons.forEach((button) => button.classList.toggle("active", button.dataset.industryDimension === state.dimension));
    scopeButtons.forEach((button) => button.classList.toggle("active", button.dataset.industryScope === state.scope));
    periodSelect.innerHTML = currentPeriods.slice().reverse().map((period, reverseIndex) => {
      const index = currentPeriods.length - 1 - reverseIndex;
      return `<option value="${index}" ${index === state.periodIndex ? "selected" : ""}>${escapeHTML(period.report_date)}</option>`;
    }).join("");
    scopeNote.textContent = state.scope === "quarterly"
      ? "季度口径仅汇总当期真实前十大，不代表完整组合。"
      : "完整口径仅使用半年报和年报全部披露股票。";
    distributionOutput.innerHTML = renderIndustryDistribution(current, state.dimension, state.industry, state.sortDirection);
    changeOutput.innerHTML = renderIndustryChanges(currentPeriods, state.dimension, state.periodIndex);
    trendOutput.innerHTML = renderTimelineHeatmap(currentPeriods, state.dimension, { firstColumn: holdingDimensionName(history, state.dimension) });
    bindIndustryLinks();
  };
  dimensionButtons.forEach((button) => button.addEventListener("click", () => {
    state.dimension = button.dataset.industryDimension;
    state.industry = null;
    draw();
  }));
  scopeButtons.forEach((button) => button.addEventListener("click", () => {
    state.scope = button.dataset.industryScope;
    state.periodIndex = periods().length - 1;
    state.industry = null;
    draw();
  }));
  periodSelect.addEventListener("change", () => {
    state.periodIndex = Number(periodSelect.value);
    draw();
  });
  sortDirection?.addEventListener("change", () => {
    state.sortDirection = sortDirection.value;
    draw();
  });
  draw();
}

function renderIndustries(analysis) {
  const history = analysis.industry_history;
  if (!history) return '<p class="empty-copy">行业历史数据尚未生成。</p>';
  return `
    <div class="panel-intro"><div><p class="eyebrow">INDUSTRY ANALYSIS</p><h2>行业与板块分析</h2></div><p>板块、中信一/二/三级均按历史报告期映射；季度前十大与半年报/年报完整持仓严格分开。</p></div>
    <div id="industry-analysis-interactive">
      <div class="industry-analysis-toolbar">
        <div class="industry-toggle-group" aria-label="行业层级">
          <button class="active" data-industry-dimension="sector">板块</button>
          <button data-industry-dimension="level1">中信一级</button>
          <button data-industry-dimension="level2">中信二级</button>
          <button data-industry-dimension="level3">中信三级</button>
        </div>
        <div class="industry-toggle-group" aria-label="披露口径">
          <button data-industry-scope="quarterly">季度前十大</button>
          <button class="active" data-industry-scope="full">半年报/年报完整持仓</button>
        </div>
      </div>
      <article class="subpanel">
        <div class="subpanel-heading industry-period-control"><div><h3>行业权重分布</h3><span id="industry-scope-note"></span></div><div class="industry-heading-controls"><label><span>权重排序</span><select id="industry-sort-direction"><option value="desc">从高到低</option><option value="asc">从低到高</option></select></label><label><span>报告期</span><select id="industry-period-select"></select></label></div></div>
        <div id="industry-distribution-output"></div>
      </article>
      <article class="subpanel">
        <div class="subpanel-heading industry-trend-control"><div><h3>行业配置时间轴（热力图）</h3><span>连续展示历次披露权重；横向滚动查看完整历史</span></div></div>
        <div id="industry-trend-output"></div>
      </article>
      <article class="subpanel"><div class="subpanel-heading"><h3>相邻披露期行业变化</h3><span>展示全部非零变化，并按变化绝对值排序；点击行业可查看连续走势</span></div><div id="industry-change-output"></div></article>
    </div>
    <div class="calibration-note"><strong>历史口径</strong><p>近五年季度序列每期仅使用真实前十大；完整序列每年仅使用中报和年报全部股票。行业成员关系按报告期入退日期匹配，港股单列，不用最新分类回填历史。</p></div>`;
}

function renderHeavyStockTrendChart(stock) {
  if (!stock?.prices?.length) return '<p class="empty-copy">该股票缺少可用行情。</p>';
  const width = 940;
  const height = 460;
  const margin = { left: 62, right: 66, top: 34, bottom: 42 };
  const priceTop = margin.top;
  const priceBottom = 270;
  const weightTop = 318;
  const weightBottom = height - margin.bottom;
  const toTime = (date) => Date.parse(`${date}T00:00:00Z`);
  const allDates = [
    ...stock.prices.map((item) => toTime(item.date)),
    ...stock.holdings.map((item) => toTime(item.report_date)),
  ].filter(Number.isFinite);
  const minTime = Math.min(...allDates);
  const maxTime = Math.max(...allDates);
  const priceValues = stock.prices.map((item) => Number(item.value)).filter(Number.isFinite);
  const rawMinPrice = Math.min(...priceValues);
  const rawMaxPrice = Math.max(...priceValues);
  const pricePadding = Math.max((rawMaxPrice - rawMinPrice) * 0.1, 0.04);
  const minPrice = Math.max(0, rawMinPrice - pricePadding);
  const maxPrice = rawMaxPrice + pricePadding;
  const disclosed = stock.holdings.filter((item) => Number(item.weight) > 0);
  const maxWeight = Math.max(...disclosed.map((item) => Number(item.weight)), 0.01) * 1.18;
  const x = (date) => margin.left + ((toTime(date) - minTime) / Math.max(maxTime - minTime, 1)) * (width - margin.left - margin.right);
  const yPrice = (value) => priceTop + ((maxPrice - value) / Math.max(maxPrice - minPrice, 0.01)) * (priceBottom - priceTop);
  const yWeight = (value) => weightBottom - (value / maxWeight) * (weightBottom - weightTop);
  const priceLine = stock.prices.map((item) => `${x(item.date).toFixed(1)},${yPrice(Number(item.value)).toFixed(1)}`).join(" ");
  const priceTicks = Array.from({ length: 4 }, (_, index) => minPrice + ((maxPrice - minPrice) * index) / 3).reverse();
  const weightTicks = [maxWeight, maxWeight / 2, 0];
  const timeTicks = [minTime, minTime + (maxTime - minTime) / 2, maxTime];
  const bars = disclosed.map((item) => {
    const barX = x(item.report_date);
    const barY = yWeight(Number(item.weight));
    const barHeight = weightBottom - barY;
    const className = item.coverage === "full" ? "holding-bar-full" : "holding-bar-top10";
    const reportLabel = item.coverage === "full" ? "半年报/年报完整持仓" : "季度前十大";
    return `<rect x="${(barX - 5).toFixed(1)}" y="${barY.toFixed(1)}" width="10" height="${Math.max(barHeight, 1).toFixed(1)}" rx="2" class="holding-bar ${className}"><title>${escapeHTML(item.report_date)} · ${reportLabel} · 占基金净值${pct(item.weight, 2)} · ${escapeHTML(item.action_label)}${item.announcement_date ? ` · 公告${escapeHTML(item.announcement_date)}` : ""}</title></rect>`;
  }).join("");
  const eventMarkers = stock.holdings.map((item) => {
    const eventX = x(item.report_date);
    if (["entry", "first_seen", "first_full"].includes(item.action) && Number(item.weight) > 0) {
      const eventY = yWeight(Number(item.weight));
      const label = item.action === "entry" ? "进入" : "首次披露";
      return `<circle cx="${eventX.toFixed(1)}" cy="${eventY.toFixed(1)}" r="4.5" class="holding-event-entry"><title>${escapeHTML(item.report_date)} · ${escapeHTML(item.action_label)}</title></circle><text x="${eventX.toFixed(1)}" y="${Math.max(eventY - 9, weightTop + 8).toFixed(1)}" class="holding-event-label holding-event-label-entry" text-anchor="middle">${label}</text>`;
    }
    if (item.action === "exit") {
      return `<line x1="${eventX.toFixed(1)}" y1="${weightTop}" x2="${eventX.toFixed(1)}" y2="${weightBottom}" class="holding-exit-line"><title>${escapeHTML(item.report_date)} · 完整持仓未见，按披露口径标记退出</title></line><circle cx="${eventX.toFixed(1)}" cy="${weightBottom}" r="4.5" class="holding-event-exit"/><text x="${eventX.toFixed(1)}" y="${weightTop - 8}" class="holding-event-label holding-event-label-exit" text-anchor="middle">退出</text>`;
    }
    return "";
  }).join("");
  const top10Markers = stock.holdings.map((item) => {
    if (!["entered", "exited"].includes(item.top10_change)) return "";
    if (["entry", "first_seen", "first_full", "exit"].includes(item.action)) return "";
    const eventX = x(item.report_date);
    const eventY = Number(item.weight) > 0 ? yWeight(Number(item.weight)) : weightBottom;
    return `<circle cx="${eventX.toFixed(1)}" cy="${eventY.toFixed(1)}" r="3.5" class="holding-event-top10"><title>${escapeHTML(item.report_date)} · ${escapeHTML(item.top10_change_label)}</title></circle>`;
  }).join("");
  const top10Changes = stock.holdings
    .filter((item) => ["entered", "exited"].includes(item.top10_change))
    .slice(-10)
    .map((item) => `<span class="top10-change-pill ${item.top10_change}"><b>${escapeHTML(item.report_date)}</b>${escapeHTML(item.top10_change_label)}</span>`)
    .join("");
  const formatMonth = (time) => new Date(time).toISOString().slice(0, 7);
  return `
    <div class="heavy-stock-chart-summary">
      ${metric("首次披露持有", stock.first_disclosed_date)}${metric("最后披露持有", stock.last_disclosed_date)}${metric("历史最高权重", pct(stock.max_weight, 2))}${metric("披露出现次数", `${stock.appearance_count}期`)}${metric("前十进入/退出", `${stock.top10_entry_count} / ${stock.top10_exit_count}`)}
    </div>
    <div class="heavy-stock-legend"><span class="legend-price">后复权股价</span><span class="legend-full">完整持仓比例</span><span class="legend-top10">季度前十大比例</span><span class="legend-entry">完整持仓进入/首次披露</span><span class="legend-exit">完整持仓退出</span><span class="legend-top10-change">前十变化点（日期见下方）</span></div>
    <div class="heavy-stock-chart-wrap">
      <svg class="heavy-stock-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(stock.name)}后复权股价与报告期持仓比例">
        <text x="${margin.left}" y="18" class="chart-section-label">后复权股价（元）</text>
        ${priceTicks.map((tick) => `<line x1="${margin.left}" y1="${yPrice(tick)}" x2="${width - margin.right}" y2="${yPrice(tick)}" class="chart-grid-line"/><text x="${margin.left - 10}" y="${yPrice(tick) + 4}" class="chart-axis-label" text-anchor="end">${tick >= 100 ? tick.toFixed(0) : tick.toFixed(2)}</text>`).join("")}
        <polyline points="${priceLine}" class="chart-line heavy-stock-price-line"/>
        <line x1="${margin.left}" y1="${weightBottom}" x2="${width - margin.right}" y2="${weightBottom}" class="chart-grid-line"/>
        <text x="${margin.left}" y="${weightTop - 14}" class="chart-section-label">报告期占基金净值比例</text>
        ${weightTicks.map((tick) => `<line x1="${margin.left}" y1="${yWeight(tick)}" x2="${width - margin.right}" y2="${yWeight(tick)}" class="chart-grid-line chart-grid-line-light"/><text x="${width - margin.right + 9}" y="${yWeight(tick) + 4}" class="chart-axis-label">${pct(tick, 1)}</text>`).join("")}
        ${bars}${eventMarkers}${top10Markers}
        ${timeTicks.map((tick, index) => `<text x="${(margin.left + (index / 2) * (width - margin.left - margin.right)).toFixed(1)}" y="${height - 12}" class="chart-axis-label" text-anchor="${index === 0 ? "start" : index === 2 ? "end" : "middle"}">${formatMonth(tick)}</text>`).join("")}
      </svg>
    </div>
    ${top10Changes ? `<div class="top10-change-list"><strong>最近前十大变化</strong>${top10Changes}</div>` : ""}
    <p class="method-note">股价使用WDS后复权收盘价，不再归一化。每个报告期均按披露权重重新识别前十大；季度未进前十大不等于持仓为零。完整持仓“进入/退出”和前十大“进/出”均为报告期披露判断，不代表真实成交日期。</p>`;
}

function heavyStockComparableSeries(stock, selectedStart = null, selectedEnd = null) {
  const toTime = (date) => Date.parse(`${date}T00:00:00Z`);
  const firstPrice = toTime(stock.prices[0].date);
  const firstNav = toTime(stock.nav[0].date);
  const lastPrice = toTime(stock.prices.at(-1).date);
  const lastNav = toTime(stock.nav.at(-1).date);
  const intervalStart = toTime(stock.interval_start);
  const absoluteMinTime = Math.max(firstPrice, firstNav);
  const absoluteMaxTime = Math.min(lastPrice, lastNav);
  const entryTime = Number.isFinite(intervalStart) ? intervalStart : absoluteMinTime;
  const defaultStart = new Date(entryTime);
  defaultStart.setUTCMonth(defaultStart.getUTCMonth() - 6);
  const defaultMinTime = Math.max(absoluteMinTime, defaultStart.getTime());
  const minTime = Math.max(absoluteMinTime, Number.isFinite(Number(selectedStart)) ? Number(selectedStart) : defaultMinTime);
  const maxTime = Math.min(absoluteMaxTime, Number.isFinite(Number(selectedEnd)) ? Number(selectedEnd) : absoluteMaxTime);
  return {
    toTime,
    minTime,
    maxTime,
    absoluteMinTime,
    absoluteMaxTime,
    defaultMinTime,
    prices: stock.prices.filter((item) => {
      const time = toTime(item.date);
      return time >= minTime && time <= maxTime;
    }),
    nav: stock.nav.filter((item) => {
      const time = toTime(item.date);
      return time >= minTime && time <= maxTime;
    }),
    holdings: stock.holdings.filter((item) => {
      const time = toTime(item.report_date);
      return time >= minTime && time <= maxTime;
    }),
  };
}

function heavyStockChartGeometry(comparable) {
  const visibleBars = comparable.holdings.filter((item) => Number(item.weight) > 0).length;
  return {
    width: Math.max(940, visibleBars * 58 + 124),
    height: 466,
    margin: { left: 62, right: 62, top: 34, bottom: 78 },
  };
}

function heavyStockRelationshipStats(comparable) {
  const { toTime, prices, nav } = comparable;
  if (prices.length < 2 || nav.length < 2) return null;
  const navByDate = new Map(nav.map((item) => [item.date, item]));
  const paired = prices.filter((price) => navByDate.has(price.date)).map((price) => ({
    price: Number(price.value),
    nav: Number(navByDate.get(price.date).value),
  })).filter((item) => Number.isFinite(item.price) && item.price > 0 && Number.isFinite(item.nav) && item.nav > 0);
  if (paired.length < 2) return null;
  const stockReturns = [];
  const fundReturns = [];
  for (let index = 1; index < paired.length; index += 1) {
    stockReturns.push(paired[index].price / paired[index - 1].price - 1);
    fundReturns.push(paired[index].nav / paired[index - 1].nav - 1);
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const stockMean = mean(stockReturns);
  const fundMean = mean(fundReturns);
  const covariance = stockReturns.reduce(
    (sum, value, index) => sum + (value - stockMean) * (fundReturns[index] - fundMean),
    0,
  );
  const stockVariance = stockReturns.reduce((sum, value) => sum + (value - stockMean) ** 2, 0);
  const fundVariance = fundReturns.reduce((sum, value) => sum + (value - fundMean) ** 2, 0);
  const denominator = Math.sqrt(stockVariance * fundVariance);
  return {
    stockReturn: paired.at(-1).price / paired[0].price - 1,
    fundReturn: paired.at(-1).nav / paired[0].nav - 1,
    correlation: denominator > 0 ? covariance / denominator : null,
    observations: paired.length,
  };
}

function renderHeavyStockTrendChartV2(stock, selectedStart = null, selectedEnd = null) {
  if (!stock?.prices?.length || !stock?.nav?.length) return '<p class="empty-copy">该股票缺少可用行情或基金净值。</p>';
  const comparable = heavyStockComparableSeries(stock, selectedStart, selectedEnd);
  const { width, height, margin } = heavyStockChartGeometry(comparable);
  const plotTop = margin.top;
  const plotBottom = height - margin.bottom;
  const { toTime, minTime, maxTime, prices, nav, holdings } = comparable;
  if (!prices.length || !nav.length || maxTime <= minTime) return '<p class="empty-copy">该股票与基金净值缺少共同可比区间。</p>';
  const priceValues = prices.map((item) => Number(item.value)).filter(Number.isFinite);
  const navValues = nav.map((item) => Number(item.value)).filter(Number.isFinite);
  const paddedRange = (values, minimumPadding) => {
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = Math.max((rawMax - rawMin) * 0.1, minimumPadding);
    return [Math.max(0, rawMin - padding), rawMax + padding];
  };
  const [minPrice, maxPrice] = paddedRange(priceValues, 0.04);
  const [minNav, maxNav] = paddedRange(navValues, 0.01);
  const disclosed = holdings.filter((item) => Number(item.weight) > 0);
  const maxWeight = Math.max(...disclosed.map((item) => Number(item.weight)), 0.01);
  const x = (date) => margin.left + ((toTime(date) - minTime) / Math.max(maxTime - minTime, 1)) * (width - margin.left - margin.right);
  const yPrice = (value) => plotTop + ((maxPrice - value) / Math.max(maxPrice - minPrice, 0.01)) * (plotBottom - plotTop);
  const yNav = (value) => plotTop + ((maxNav - value) / Math.max(maxNav - minNav, 0.01)) * (plotBottom - plotTop);
  const yWeight = (value) => plotBottom - (value / maxWeight) * (plotBottom - plotTop) * 0.45;
  const priceLine = prices.map((item) => `${x(item.date).toFixed(1)},${yPrice(Number(item.value)).toFixed(1)}`).join(" ");
  const navLine = nav.map((item) => `${x(item.date).toFixed(1)},${yNav(Number(item.value)).toFixed(1)}`).join(" ");
  const priceTicks = Array.from({ length: 4 }, (_, index) => minPrice + ((maxPrice - minPrice) * index) / 3).reverse();
  const navTicks = Array.from({ length: 4 }, (_, index) => minNav + ((maxNav - minNav) * index) / 3).reverse();
  const firstYear = new Date(minTime).getUTCFullYear();
  const lastYear = new Date(maxTime).getUTCFullYear();
  const yearTicks = Array.from(
    { length: Math.max(lastYear - firstYear - 1, 0) },
    (_, index) => Date.UTC(firstYear + index + 1, 0, 1),
  ).filter((time) => time > minTime && time < maxTime);
  const timeTicks = [
    minTime,
    ...yearTicks,
    maxTime,
  ];
  const reportLabel = (date) => {
    const [year, month] = date.split("-");
    return {
      "03": `${year}Q1`,
      "06": `${year}中报`,
      "09": `${year}Q3`,
      "12": `${year}年报`,
    }[month] || date.slice(0, 7);
  };
  const bars = disclosed.map((item) => {
    const barX = x(item.report_date);
    const barY = yWeight(Number(item.weight));
    const barHeight = plotBottom - barY;
    const className = item.coverage === "full" ? "holding-bar-full" : "holding-bar-top10";
    return `<rect x="${(barX - 7).toFixed(1)}" y="${barY.toFixed(1)}" width="14" height="${Math.max(barHeight, 2).toFixed(1)}" rx="2" class="holding-bar ${className}"><title>报告期：${escapeHTML(item.report_date)} · 披露类型：${escapeHTML(item.disclosure_label)} · 真实持仓比例：${pct(item.weight, 2)}</title></rect>`;
  }).join("");
  const formatMonth = (time) => new Date(time).toISOString().slice(0, 7);
  const relationship = heavyStockRelationshipStats(comparable);
  const inferredFrequency = (() => {
    if (stock.price_frequency) return stock.price_frequency;
    const times = prices.map((item) => toTime(item.date)).sort((a, b) => a - b);
    const gaps = times.slice(1).map((time, index) => (time - times[index]) / 86400000).sort((a, b) => a - b);
    const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : Infinity;
    return medianGap <= 7 ? "daily" : medianGap >= 20 ? "monthly" : "mixed";
  })();
  const isDailyPrice = inferredFrequency === "daily";
  const priceFrequencyLabel = {
    daily: "日频",
    monthly: "月末频率（本地暂无完整历史日频）",
    mixed: "混合频率（部分区间为日频）",
    sparse: "稀疏频率",
  }[inferredFrequency] || "实际可得频率";
  const relationshipLabel = isDailyPrice ? "日频收益相关性" : "共同日期收益相关性";
  return `
    <div class="heavy-stock-chart-summary">
      ${metric("本轮持有展示区间", `${prices[0].date} 至 ${new Date(maxTime).toISOString().slice(0, 10)}`)}${metric("股票区间涨跌", relationship ? pct(relationship.stockReturn, 1, true) : "—")}${metric("同期基金收益", relationship ? pct(relationship.fundReturn, 1, true) : "—")}${metric(relationshipLabel, relationship?.correlation === null || relationship?.correlation === undefined ? "—" : num(relationship.correlation, 2), relationship ? `${relationship.observations}个共同日期` : "")}
    </div>
    <div class="heavy-stock-legend"><span class="legend-price">股票后复权价格（左轴）</span><span class="legend-nav">基金复权净值（右轴）</span><span class="legend-full">完整持仓比例</span><span class="legend-top10">季度前十大比例</span></div>
    <div class="heavy-stock-chart-wrap">
      <svg class="heavy-stock-chart" viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="img" aria-label="${escapeHTML(stock.name)}后复权股价、基金复权净值与报告期持仓比例">
        <text x="${margin.left}" y="18" class="chart-section-label">股票后复权价格（左轴）</text>
        <text x="${width - margin.right}" y="18" class="chart-section-label" text-anchor="end">基金复权净值（右轴）</text>
        ${priceTicks.map((tick) => `<line x1="${margin.left}" y1="${yPrice(tick)}" x2="${width - margin.right}" y2="${yPrice(tick)}" class="chart-grid-line"/><text x="${margin.left - 10}" y="${yPrice(tick) + 4}" class="chart-axis-label" text-anchor="end">${tick >= 100 ? tick.toFixed(0) : tick.toFixed(2)}</text>`).join("")}
        ${navTicks.map((tick) => `<text x="${width - margin.right + 9}" y="${yNav(tick) + 4}" class="chart-axis-label">${tick.toFixed(3)}</text>`).join("")}
        ${bars}
        <polyline points="${priceLine}" class="chart-line heavy-stock-price-line"/>
        <polyline points="${navLine}" class="chart-line heavy-stock-nav-line"/>
        <line x1="${margin.left}" y1="${plotTop}" x2="${margin.left}" y2="${plotBottom}" class="heavy-stock-crosshair" hidden/>
        <circle r="4.5" class="heavy-stock-hover-dot heavy-stock-hover-price" hidden/>
        <circle r="4.5" class="heavy-stock-hover-dot heavy-stock-hover-nav" hidden/>
        <rect x="${margin.left}" y="${plotTop}" width="${width - margin.left - margin.right}" height="${plotBottom - plotTop}" class="heavy-stock-hover-target"/>
        <line x1="${margin.left}" y1="${plotBottom}" x2="${width - margin.right}" y2="${plotBottom}" class="chart-grid-line"/>
        ${disclosed.map((item) => `<line x1="${x(item.report_date).toFixed(1)}" y1="${plotBottom}" x2="${x(item.report_date).toFixed(1)}" y2="${plotBottom + 5}" class="chart-report-tick"/><text x="${x(item.report_date).toFixed(1)}" y="${plotBottom + 17}" class="chart-report-label" text-anchor="middle">${reportLabel(item.report_date)}</text>`).join("")}
        ${timeTicks.map((tick, index) => `<text x="${x(new Date(tick).toISOString().slice(0, 10)).toFixed(1)}" y="${height - 10}" class="chart-year-label" text-anchor="${index === 0 ? "start" : index === timeTicks.length - 1 ? "end" : "middle"}">${new Date(tick).getUTCFullYear()}</text>`).join("")}
      </svg>
      <div class="heavy-stock-hover-card" hidden></div>
    </div>
    <p class="method-note">默认从首次确认持仓日前6个月展示，用于观察买入前基金净值与股价；首次披露日期不是实际成交日。股票为${stock.code.endsWith(".HK") ? "Choice" : "WDS"}${priceFrequencyLabel}未归一化后复权价格，基金为日频F_NAV_ADJUSTED原始值；半年报/年报完整持仓为0才确认退出，季度未列入前十大仍按未知处理。相关性按双方共同日期收益计算。</p>`;
}

function bindHeavyStockChartHover(stock, root = document, selectedStart = null, selectedEnd = null) {
  const svg = root.querySelector(".heavy-stock-chart");
  const target = svg?.querySelector(".heavy-stock-hover-target");
  const crosshair = svg?.querySelector(".heavy-stock-crosshair");
  const priceDot = svg?.querySelector(".heavy-stock-hover-price");
  const navDot = svg?.querySelector(".heavy-stock-hover-nav");
  const card = root.querySelector(".heavy-stock-hover-card");
  if (!svg || !target || !crosshair || !priceDot || !navDot || !card) return;
  const comparable = heavyStockComparableSeries(stock, selectedStart, selectedEnd);
  const { toTime, minTime, maxTime, prices, nav, holdings } = comparable;
  const { width, height, margin } = heavyStockChartGeometry(comparable);
  const plotBottom = height - margin.bottom;
  const nearest = (items, time, field = "date") => items.reduce(
    (best, item) => Math.abs(toTime(item[field]) - time) < Math.abs(toTime(best[field]) - time) ? item : best,
  );
  const range = (items) => {
    const values = items.map((item) => Number(item.value));
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = Math.max((rawMax - rawMin) * 0.1, items === prices ? 0.04 : 0.01);
    return [Math.max(0, rawMin - padding), rawMax + padding];
  };
  const [minPrice, maxPrice] = range(prices);
  const [minNav, maxNav] = range(nav);
  const y = (value, min, max) => margin.top + ((max - value) / Math.max(max - min, 0.01)) * (plotBottom - margin.top);
  const setHoverVisible = (visible) => {
    [crosshair, priceDot, navDot, card].forEach((item) => {
      if (visible) item.removeAttribute("hidden");
      else item.setAttribute("hidden", "");
    });
  };
  const update = (event) => {
    const bounds = svg.getBoundingClientRect();
    const svgX = Math.min(width - margin.right, Math.max(margin.left, ((event.clientX - bounds.left) / bounds.width) * width));
    const time = minTime + ((svgX - margin.left) / (width - margin.left - margin.right)) * (maxTime - minTime);
    const price = nearest(prices, time);
    const navPoint = nearest(nav, toTime(price.date));
    const disclosed = holdings.filter((item) => Number(item.weight) > 0 && toTime(item.report_date) <= toTime(price.date));
    const latestHolding = disclosed.at(-1);
    const exactX = margin.left + ((toTime(price.date) - minTime) / (maxTime - minTime)) * (width - margin.left - margin.right);
    crosshair.setAttribute("x1", exactX);
    crosshair.setAttribute("x2", exactX);
    priceDot.setAttribute("cx", exactX);
    priceDot.setAttribute("cy", y(Number(price.value), minPrice, maxPrice));
    navDot.setAttribute("cx", exactX);
    navDot.setAttribute("cy", y(Number(navPoint.value), minNav, maxNav));
    setHoverVisible(true);
    card.innerHTML = `<strong>${escapeHTML(price.date)}</strong><span>股票后复权价：${Number(price.value).toFixed(2)}</span><span>基金复权净值：${Number(navPoint.value).toFixed(4)}（${escapeHTML(navPoint.date)}）</span>${latestHolding ? `<span>最近披露持仓：${pct(latestHolding.weight, 2)} · ${escapeHTML(latestHolding.report_date)} · ${escapeHTML(latestHolding.disclosure_label)}</span>` : "<span>此前无可见持仓比例</span>"}`;
    card.style.left = `${Math.min(Math.max((exactX / width) * 100, 18), 82)}%`;
  };
  target.addEventListener("pointermove", update);
  target.addEventListener("pointerdown", update);
  target.addEventListener("pointerleave", () => setHoverVisible(false));
}

function heavyStockRangeDates(stock) {
  const comparable = heavyStockComparableSeries(stock);
  return stock.prices.map((item) => item.date).filter((date) => {
    const time = comparable.toTime(date);
    return time >= comparable.absoluteMinTime && time <= comparable.absoluteMaxTime;
  });
}

function renderHeavyStockTrendModule(stock) {
  const dates = heavyStockRangeDates(stock);
  if (dates.length < 2) return renderHeavyStockTrendChartV2(stock);
  const comparable = heavyStockComparableSeries(stock);
  const defaultIndex = Math.max(0, dates.findIndex((date) => comparable.toTime(date) >= comparable.defaultMinTime));
  const startIndex = defaultIndex < 0 ? 0 : defaultIndex;
  const endIndex = dates.length - 1;
  return `<div class="heavy-stock-range-shell" data-default-start="${startIndex}">
    <div class="heavy-stock-range-plot">${renderHeavyStockTrendChartV2(stock, comparable.toTime(dates[startIndex]), comparable.toTime(dates[endIndex]))}</div>
    <div class="nav-zoom-heading nav-zoom-single-heading"><div><strong>观察区间</strong><span>默认首次确认持仓日前6个月；拖动两端可调整</span></div><button type="button" class="heavy-stock-range-reset nav-zoom-reset">恢复默认</button></div>
    <div class="dual-range-control heavy-stock-dual-range" style="--range-start:${(startIndex / endIndex * 100).toFixed(2)}%;--range-end:100%">
      <div class="dual-range-track"><span></span></div>
      <input class="heavy-stock-range-start dual-range-start" type="range" min="0" max="${endIndex}" value="${startIndex}" step="1" aria-label="个股观察起始日期">
      <input class="heavy-stock-range-end dual-range-end" type="range" min="0" max="${endIndex}" value="${endIndex}" step="1" aria-label="个股观察结束日期">
      <div class="dual-range-labels"><span class="heavy-stock-range-start-date">${escapeHTML(dates[startIndex])}</span><small>首次确认持仓日前6个月至最新为默认区间</small><span class="heavy-stock-range-end-date">${escapeHTML(dates[endIndex])}</span></div>
    </div>
  </div>`;
}

function bindHeavyStockRange(stock, root) {
  const shell = root.querySelector(".heavy-stock-range-shell");
  const plot = shell?.querySelector(".heavy-stock-range-plot");
  const range = shell?.querySelector(".heavy-stock-dual-range");
  const startInput = shell?.querySelector(".heavy-stock-range-start");
  const endInput = shell?.querySelector(".heavy-stock-range-end");
  const startLabel = shell?.querySelector(".heavy-stock-range-start-date");
  const endLabel = shell?.querySelector(".heavy-stock-range-end-date");
  const reset = shell?.querySelector(".heavy-stock-range-reset");
  const dates = heavyStockRangeDates(stock);
  if (!shell || !plot || !range || !startInput || !endInput || dates.length < 2) {
    bindHeavyStockChartHover(stock, root);
    return;
  }
  const toTime = (date) => Date.parse(`${date}T00:00:00Z`);
  const lastIndex = dates.length - 1;
  const draw = (source = null) => {
    let start = Number(startInput.value);
    let end = Number(endInput.value);
    if (end - start < 2) {
      if (source === startInput) start = Math.max(0, end - 2);
      else end = Math.min(lastIndex, start + 2);
      startInput.value = String(start);
      endInput.value = String(end);
    }
    range.style.setProperty("--range-start", `${(start / lastIndex * 100).toFixed(2)}%`);
    range.style.setProperty("--range-end", `${(end / lastIndex * 100).toFixed(2)}%`);
    startLabel.textContent = dates[start];
    endLabel.textContent = dates[end];
    plot.innerHTML = renderHeavyStockTrendChartV2(stock, toTime(dates[start]), toTime(dates[end]));
    bindHeavyStockChartHover(stock, plot, toTime(dates[start]), toTime(dates[end]));
  };
  startInput.addEventListener("input", () => draw(startInput));
  endInput.addEventListener("input", () => draw(endInput));
  reset?.addEventListener("click", () => {
    startInput.value = shell.dataset.defaultStart || "0";
    endInput.value = String(lastIndex);
    draw();
  });
  draw();
}

function renderHeavyStockTrendSection(trends) {
  if (!trends?.stocks?.length) return `
    <article class="subpanel heavy-stock-trend-panel">
      <div class="subpanel-heading heavy-stock-trend-control"><div><h3>最新披露前十大：股价、基金净值与持仓</h3><span>本模块统一限定最新报告期真实前十大，不使用后续名次或示例行情补足</span></div></div>
      <p class="empty-copy">该基金最新前十大为空、证券代码暂不可定价，或股价与基金净值没有足够的共同历史，因此暂不绘制关系图；其他历史持仓仍可在下方查看持仓轨迹。</p>
    </article>`;
  const tabs = trends.stocks.map((stock, index) => `<button class="heavy-stock-tab ${index === 0 ? "active" : ""}" type="button" role="tab" aria-selected="${index === 0}" data-heavy-stock-code="${escapeHTML(stock.code)}"><small>${String(index + 1).padStart(2, "0")}</small><strong>${escapeHTML(stock.name)}</strong><span>${escapeHTML(stock.code)}</span></button>`).join("");
  return `
    <article class="subpanel heavy-stock-trend-panel">
      <div class="subpanel-heading heavy-stock-trend-control"><div><h3>最新披露前十大：股价、基金净值与持仓</h3><span>点击下方股票标签切换；关系图严格限定最新报告期真实前十大，其他历史持仓只在下方展示持仓轨迹</span></div></div>
      <div class="heavy-stock-tabs" role="tablist" aria-label="切换最新披露前十大股票">${tabs}</div>
      <div id="heavy-stock-chart-output" aria-live="polite">${renderHeavyStockTrendChartV2(trends.stocks[0])}</div>
    </article>`;
}

function renderHoldings(analysis, fund) {
  const latest = analysis.latest_top10;
  const history = analysis.holding_history || [];
  const fullComparison = analysis.full_holdings_comparison || { history: [], transitions: [] };
  const latestFull = fullComparison.history?.at(-1);
  const fullSummary = analysis.full_holdings.summary;
  const fullHoldings = analysis.full_holdings.holdings || [];
  const sizeStyle = analysis.size_index_style;
  const valuation = analysis.core_valuation;
  const latestFullTransition = fullComparison.transitions?.at(-1);
  const holdingRows = latest.holdings.map((holding, index) => [
    String(index + 1).padStart(2, "0"),
    `<strong>${escapeHTML(holding.name)}</strong>`,
    escapeHTML(holding.code),
    escapeHTML(holding.industry),
    `<span class="holding-weight">${pct(holding.weight, 2)}</span>`,
    money(holding.characteristics?.market_value),
    num(holding.characteristics?.pe_ttm, 1),
    num(holding.characteristics?.pb_mrq, 1),
    holding.characteristics?.roe_ttm === null || holding.characteristics?.roe_ttm === undefined ? "—" : `${num(holding.characteristics.roe_ttm, 1)}%`,
    holding.characteristics?.growth_ttm_pit === null || holding.characteristics?.growth_ttm_pit === undefined ? "—" : `${num(holding.characteristics.growth_ttm_pit, 1)}%`,
  ]);
  const transitionRows = analysis.rebalancing.transitions.slice().reverse().map((item) => [
    `${escapeHTML(item.from_date)} → ${escapeHTML(item.to_date)}`, pct(item.jaccard, 1), `${item.common_count}只`, escapeHTML(item.entered_codes.join("、") || "—"), escapeHTML(item.exited_codes.join("、") || "—"), pct(item.disclosed_weight_change_proxy, 1),
  ]);
  const fullHistoryRows = (fullComparison.history || []).slice().reverse().map((item) => [
    escapeHTML(item.report_date), `${item.holding_count}只`, pct(item.total_weight, 1), pct(item.top10_weight, 1), pct(item.top20_weight, 1), pct(item.tail_beyond_top20_weight, 1), num(item.effective_holding_count, 1), escapeHTML(item.largest_industry), pct(item.largest_industry_weight, 1), escapeHTML(item.announcement_date),
  ]);
  const fullTransitionRows = (fullComparison.transitions || []).slice().reverse().map((item) => {
    const increase = item.top_industry_increase ? `${item.top_industry_increase.industry} ${pct(item.top_industry_increase.change, 1, true)}` : "—";
    const decrease = item.top_industry_decrease ? `${item.top_industry_decrease.industry} ${pct(item.top_industry_decrease.change, 1, true)}` : "—";
    const entered = item.entered?.map((holding) => holding.name).join("、") || "—";
    const exited = item.exited?.map((holding) => holding.name).join("、") || "—";
    return [
      `${escapeHTML(item.from_date)} → ${escapeHTML(item.to_date)}`,
      `${item.previous_holding_count} → ${item.current_holding_count}`,
      pct(item.jaccard, 1),
      pct(item.retained_weight_rate, 1),
      pct(item.disclosed_weight_change_proxy, 1),
      pct(item.industry_weight_change_proxy, 1),
      escapeHTML(increase),
      escapeHTML(decrease),
      escapeHTML(entered),
      escapeHTML(exited),
    ];
  });
  const fullHoldingRows = fullHoldings.map((holding) => [
    String(holding.rank).padStart(2, "0"), `<strong>${escapeHTML(holding.name)}</strong>`, escapeHTML(holding.code), escapeHTML(holding.industry), `<span class="holding-weight">${pct(holding.weight, 2)}</span>`, money(holding.characteristics?.market_value), num(holding.characteristics?.pe_ttm, 1), num(holding.characteristics?.pb_mrq, 1), holding.characteristics?.roe_ttm === null || holding.characteristics?.roe_ttm === undefined ? "—" : `${num(holding.characteristics.roe_ttm, 1)}%`, holding.characteristics?.growth_ttm_pit === null || holding.characteristics?.growth_ttm_pit === undefined ? "—" : `${num(holding.characteristics.growth_ttm_pit, 1)}%`,
  ]);
  const fullChangeRows = (items, direction) => (items || []).map((item) => [
    `<strong>${escapeHTML(item.name)}</strong>`, escapeHTML(item.code), pct(item.change, 2, true), pct(direction === "increase" ? item.current_weight : item.previous_weight, 2),
  ]);
  const fullEntryRows = (items, label) => (items || []).map((item) => [
    `<strong>${escapeHTML(item.name)}</strong>`, escapeHTML(item.code), label, pct(item.weight, 2),
  ]);
  const industryChangeRows = [
    ...(latestFullTransition?.industry_increases || []).map((item) => [escapeHTML(item.industry), "增配", `<span class="value-positive">${pct(item.change, 2, true)}</span>`]),
    ...(latestFullTransition?.industry_decreases || []).map((item) => [escapeHTML(item.industry), "减配", `<span class="value-negative">${pct(item.change, 2, true)}</span>`]),
  ];
  const sizeStyleRows = (sizeStyle?.buckets || []).map((item) => [
    escapeHTML(item.name), `${item.count}只`, pct(item.weight, 1),
  ]);
  const sizeStyleEntries = (sizeStyle?.buckets || [])
    .filter((item) => item.weight > 0)
    .map((item) => [item.name, item.weight]);
  return `
    <div class="panel-intro"><div><p class="eyebrow">HOLDINGS & REBALANCING</p><h2>完整持仓与调仓跟踪</h2></div><p>半年报/年报完整持仓是主分析口径；季度前十大仅用于更高频地跟踪核心观点。</p></div>
    ${renderHeavyStockTrendSection(analysis.heavy_stock_trends)}
    <article class="subpanel core-valuation-panel">
      <div class="subpanel-heading"><div><h3>核心持仓估值特征</h3><span>${escapeHTML(valuation?.scope)} · ${escapeHTML(valuation?.report_date)} · Choice同日截面</span></div><strong class="valuation-label">${escapeHTML(valuation?.label)}</strong></div>
      <div class="research-metric-grid metric-six">
        ${metric("加权PE(TTM)", num(valuation?.weighted_pe_ttm, 1))}
        ${metric("调和PE(TTM)", num(valuation?.harmonic_pe_ttm, 1))}
        ${metric("100倍封顶PE", num(valuation?.capped_weighted_pe_ttm, 1))}
        ${metric("PE中位数", num(valuation?.median_pe_ttm, 1))}
        ${metric("加权PB(MRQ)", num(valuation?.weighted_pb_mrq, 1))}
        ${metric("有效覆盖", pct(valuation?.coverage_of_top10, 1), `${valuation?.valid_count || 0}/${valuation?.total_count || 0}只`)}
      </div>
      <div class="two-column">
        <div class="valuation-reading"><h4>研究解读</h4><p>${escapeHTML(valuation?.interpretation)}</p></div>
        <dl class="fact-list"><div><dt>PE≤20权重</dt><dd>${pct(valuation?.low_pe_weight_share, 1)}</dd></div><div><dt>PE≥40权重</dt><dd>${pct(valuation?.high_pe_weight_share, 1)}</dd></div><div><dt>有效估值占基金净值</dt><dd>${pct(valuation?.valid_weight_to_nav, 1)}</dd></div></dl>
      </div>
      <p class="method-note">${escapeHTML(valuation?.calculation_note)} 本模块描述估值特征，不单独等同成长/价值风格。</p>
    </article>
    <div class="comparison-scope-heading comparison-scope-full"><span>主口径</span><div><h3>半年报/年报完整持仓</h3><p>使用全部披露股票分析集中度、长尾、行业结构、个股增减持和名单迁移，并为后续收益归因提供期初权重。</p></div></div>
    ${fullComparison.history?.length ? `
      <div class="research-metric-grid metric-six">
        ${metric("完整报告期", `${fullComparison.period_count}期`)}${metric("最新持股数", `${fullSummary.holding_count}只`)}${metric("披露股票权重", pct(fullSummary.total_weight, 1))}
        ${metric("前10/前20", `${pct(fullSummary.top10_weight, 1)} / ${pct(fullSummary.top20_weight, 1)}`)}${metric("前20以外长尾", pct(fullSummary.tail_beyond_top20_weight, 1))}${metric("有效持股数", num(fullSummary.effective_holding_count, 1))}
        ${metric("单股≥1%", `${fullSummary.holdings_above_1pct}只`)}${metric("权重中位数", pct(fullSummary.median_holding_weight, 2))}${metric("最大行业", fullSummary.largest_industry)}
      </div>
      <article class="subpanel"><div class="subpanel-heading"><h3>完整持仓大小盘归属</h3><span>${escapeHTML(sizeStyle?.report_date)}历史成分：沪深300=大盘、中证500=中盘、中证1000=小盘</span></div>
        <div class="two-column two-column-wide"><div>${renderBarList(sizeStyleEntries, Math.max(...sizeStyleEntries.map((item) => item[1]), 0.01))}</div><div>${renderTable(["归属", "持股数", "占基金净值"], sizeStyleRows)}</div></div>
        <p class="method-note">港股单列；未进入三个指数的A股归为“其他A股”，不直接等同微盘股。${escapeHTML(sizeStyle?.history_status || "")}</p>
      </article>
      <article class="subpanel"><div class="subpanel-heading"><h3>完整持仓结构轨迹</h3><span>同口径半年报/年报数据</span></div>${renderTable(["报告期", "持股数", "股票权重", "前10", "前20", "前20外", "有效持股", "最大行业", "行业权重", "公告日"], fullHistoryRows)}</article>
      <article class="subpanel"><div class="subpanel-heading"><h3>最新完整持仓明细</h3><span>报告期${escapeHTML(analysis.full_holdings.report_date)} · 共${fullSummary.holding_count}只 · 窗口内独立滚动</span></div>${renderTable(["排名", "股票", "代码", "行业", "基金净值占比", "总市值", "PE(TTM)", "PB(MRQ)", "ROE(TTM)", "G（净利TTM同比）"], fullHoldingRows, "holdings-table-wrap full-holdings-scroll")}</article>
      ${latestFullTransition ? `<div class="two-column two-column-wide">
        <article class="subpanel"><div class="subpanel-heading"><h3>个股披露权重变化</h3><span>${escapeHTML(latestFullTransition.from_date)} → ${escapeHTML(latestFullTransition.to_date)} · 升权${latestFullTransition.increased_count}只/降权${latestFullTransition.decreased_count}只</span></div>
          <h4>主要权重上升</h4>${renderTable(["股票", "代码", "权重变化", "期末权重"], fullChangeRows(latestFullTransition.increased, "increase"))}
          <h4>主要权重下降</h4>${renderTable(["股票", "代码", "权重变化", "期初权重"], fullChangeRows(latestFullTransition.decreased, "decrease"))}<p class="method-note">披露权重变化同时受买卖和股价涨跌影响，不直接等同真实增减持量。</p></article>
        <article class="subpanel"><div class="subpanel-heading"><h3>新进、退出与行业迁移</h3><span>完整持仓新进${latestFullTransition.entered_count}只/退出${latestFullTransition.exited_count}只，表中各展示前10</span></div>
          ${renderTable(["股票", "代码", "类型", "权重"], [...fullEntryRows(latestFullTransition.entered, "新进"), ...fullEntryRows(latestFullTransition.exited, "退出")])}
          <h4>行业权重变化</h4>${renderTable(["行业", "方向", "权重变化"], industryChangeRows)}</article>
      </div>` : ""}
      <article class="subpanel"><div class="subpanel-heading"><h3>完整持仓变化轨迹</h3><span>新增/退出按净值权重排序</span></div>${renderTable(["区间", "持股数", "名单重合", "原权重保留", "披露权重变化", "行业权重变化", "增配行业", "减配行业", "主要新增", "主要退出"], fullTransitionRows)}</article>
    ` : '<p class="empty-copy">暂无两个以上可比的半年报/年报完整持仓。</p>'}
    <div class="comparison-scope-heading"><span>跟踪口径</span><div><h3>季度前十大持仓</h3><p>每季只观察前十大，用于跟踪核心观点；不将其当成完整组合换手。</p></div></div>
    <div class="research-metric-grid metric-six">
      ${metric("调仓类型", fund.rebalancing.style)}${metric("平均名单重合", pct(analysis.rebalancing.average_jaccard, 1))}${metric("平均每季新进", `${num(analysis.rebalancing.average_new_count, 1)}只`)}
      ${metric("原核心权重保留", pct(analysis.rebalancing.average_retained_weight_rate, 1))}${metric("前十大起点", pct(analysis.rebalancing.top10_concentration_start, 1))}${metric("最新前十大", pct(latest.summary.top10_weight, 1))}
    </div>
    <div class="two-column two-column-wide">
      <article class="subpanel chart-subpanel"><div class="subpanel-heading"><h3>前十大集中度趋势</h3><span>占基金净值</span></div>${renderMiniLineChart(history, [{ key: "top10_concentration", label: "前十大集中度", color: "#0b7774", width: 3 }], "前十大持仓集中度季度变化")}</article>
      <article class="subpanel"><h3>最新季度名单变化</h3><dl class="fact-list"><div><dt>观察区间</dt><dd>${escapeHTML(analysis.quarterly_update?.from_date)} → ${escapeHTML(analysis.quarterly_update?.to_date)}</dd></div><div><dt>新进持仓</dt><dd>${escapeHTML(analysis.quarterly_update?.entered.join("、") || "无")}</dd></div><div><dt>退出持仓</dt><dd>${escapeHTML(analysis.quarterly_update?.exited.join("、") || "无")}</dd></div><div><dt>名单重合</dt><dd>${pct(analysis.quarterly_update?.jaccard, 1)}</dd></div></dl><p class="method-note">名称来自五期前十大持仓映射；未在观察窗出现的证券保留代码。</p></article>
    </div>
    <article class="subpanel"><div class="subpanel-heading"><h3>核心持仓迁移</h3><span>优先展示五期内出现频率高、权重大的14只股票</span></div>${renderHoldingHeatmap(history)}</article>
    <article class="subpanel"><div class="subpanel-heading"><h3>最新披露前十大持仓与基础特征</h3><span>持仓报告期${escapeHTML(latest.report_date)} · 市值/估值/G取同日Choice截面</span></div>${renderTable(["排名", "股票", "代码", "行业", "基金净值占比", "总市值", "PE(TTM)", "PB(MRQ)", "ROE(TTM)", "G（净利TTM同比）"], holdingRows, "holdings-table-wrap heavy-characteristics-table")}</article>
    <article class="subpanel"><div class="subpanel-heading"><h3>季度调仓轨迹</h3><span>权重变化为披露代理，不是真实换手率</span></div>${renderTable(["区间", "名单重合", "保留", "新进代码", "退出代码", "披露权重变化"], transitionRows)}</article>
    <div class="calibration-note"><strong>口径关系</strong><p>${escapeHTML(analysis.full_holdings.report_date)}完整持仓覆盖基金净值${pct(fullSummary.total_weight, 1)}，是结构和归因主口径；最新季度前十大只覆盖${pct(latest.summary.top10_weight, 1)}，仅作高频跟踪。</p></div>`;
}

function holdingDimensionName(history, dimension) {
  return history?.dimension_labels?.[dimension] || ({ sector: "板块", level1: "中信一级", level2: "中信二级", level3: "中信三级" })[dimension] || "行业";
}

function renderHoldingSnapshot(period, dimension, scope) {
  if (!period) return '<p class="empty-copy">该报告期暂无持仓明细。</p>';
  const entered = new Set((period.entered || []).map((item) => item.code));
  const rows = period.holdings.map((holding) => {
    const status = entered.has(holding.code)
      ? `<span class="holding-status-badge entered">${scope === "quarterly" ? "新进前十" : "新进持仓"}</span>`
      : '<span class="holding-status-badge retained">延续</span>';
    return [
      String(holding.rank).padStart(2, "0"),
      `<button class="holding-stock-link" data-holding-stock="${escapeHTML(holding.code)}"><strong>${escapeHTML(holding.name)}</strong></button>`,
      escapeHTML(holding.code),
      escapeHTML(holding.classifications?.[dimension] || "未映射"),
      status,
      `<span class="holding-weight">${pct(holding.weight, 2)}</span>`,
      money(holding.characteristics?.market_value),
      num(holding.characteristics?.pe_ttm, 1),
      num(holding.characteristics?.pb_mrq, 1),
      holding.characteristics?.roe_ttm === null || holding.characteristics?.roe_ttm === undefined ? "—" : `${num(holding.characteristics.roe_ttm, 1)}%`,
      holding.characteristics?.growth_ttm_pit === null || holding.characteristics?.growth_ttm_pit === undefined ? "—" : `${num(holding.characteristics.growth_ttm_pit, 1)}%`,
    ];
  });
  return renderTable(
    ["排名", "股票", "代码", "行业/板块", "本期状态", "基金净值占比", "总市值", "PE(TTM)", "PB(MRQ)", "ROE(TTM)", "G（净利TTM同比）"],
    rows,
    `holdings-table-wrap heavy-characteristics-table ${scope === "full" ? "full-holdings-scroll" : ""}`,
  );
}

function renderHoldingChanges(period, scope) {
  if (!period) return "";
  const pill = (item, kind) => `<button class="holding-change-stock ${kind}" data-holding-stock="${escapeHTML(item.code)}">${escapeHTML(item.name)}<small>${escapeHTML(item.code)}</small></button>`;
  return `<div class="holding-period-changes">
    <div><span>${scope === "quarterly" ? "新进前十" : "新进持仓"}</span><p>${period.entered?.length ? period.entered.map((item) => pill(item, "entered")).join("") : "<em>无</em>"}</p></div>
    <div><span>${scope === "quarterly" ? "退出前十" : "退出持仓"}</span><p>${period.exited?.length ? period.exited.map((item) => pill(item, "exited")).join("") : "<em>无</em>"}</p></div>
  </div>`;
}

function holdingTrajectoryValues(periods, stockCode, scope) {
  return periods.map((period) => {
    const holding = period.holdings.find((item) => item.code === stockCode);
    return {
      report_date: period.report_date,
      value: holding ? Number(holding.weight) : scope === "full" ? 0 : null,
      disclosed: Boolean(holding),
    };
  });
}

function renderHoldingTrajectoryChart(periods, stockCode, stockName, scope) {
  if (!periods?.length || !stockCode) return '<p class="empty-copy">请选择股票查看持仓轨迹。</p>';
  const values = holdingTrajectoryValues(periods, stockCode, scope);
  const width = Math.max(920, values.length * 68);
  const height = 380;
  const margin = { top: 28, right: 28, bottom: 88, left: 58 };
  const plotBottom = height - margin.bottom;
  const disclosedValues = values.filter((item) => item.value !== null).map((item) => item.value);
  const max = Math.max(...disclosedValues, 0.01) * 1.12;
  const x = (index) => margin.left + index / Math.max(values.length - 1, 1) * (width - margin.left - margin.right);
  const y = (value) => margin.top + (max - Number(value || 0)) / max * (plotBottom - margin.top);
  const ticks = Array.from({ length: 5 }, (_, index) => max * (4 - index) / 4);
  const segments = values.slice(0, -1).map((item, index) => {
    const next = values[index + 1];
    return item.value !== null && next.value !== null
      ? `<line x1="${x(index)}" y1="${y(item.value)}" x2="${x(index + 1)}" y2="${y(next.value)}" class="chart-line holding-trajectory-line"/>`
      : "";
  }).join("");
  return `<div class="holding-trajectory-chart-wrap">
    <svg class="holding-trajectory-chart" viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="img" aria-label="${escapeHTML(stockName)}持仓权重连续变化">
      ${ticks.map((tick) => `<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" class="chart-grid-line"/><text x="${margin.left - 10}" y="${y(tick) + 4}" class="chart-axis-label" text-anchor="end">${pct(tick, 0)}</text>`).join("")}
      ${segments}
      ${values.map((item, index) => item.value === null
        ? `<circle cx="${x(index)}" cy="${plotBottom}" r="3.5" class="holding-trajectory-missing"/>`
        : `<circle cx="${x(index)}" cy="${y(item.value)}" r="3.5" class="holding-trajectory-point"/>`).join("")}
      ${values.map((item, index) => `<line x1="${x(index)}" y1="${plotBottom}" x2="${x(index)}" y2="${plotBottom + 5}" class="chart-report-tick"/><text x="${x(index)}" y="${plotBottom + 17}" class="industry-trend-date-label" text-anchor="end" transform="rotate(-45 ${x(index)} ${plotBottom + 17})">${escapeHTML(item.report_date)}</text>`).join("")}
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${plotBottom}" class="holding-trajectory-crosshair" hidden/>
      <circle r="4.5" class="holding-trajectory-hover-dot" hidden/>
      <rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${plotBottom - margin.top}" class="holding-trajectory-hover-target"/>
    </svg>
    <div class="holding-trajectory-hover-card" hidden></div>
  </div>`;
}

function renderHoldingTrajectoryHeatmap(periods, scope, rowLimit = 20) {
  if (!periods?.length) return '<p class="empty-copy">暂无可连续比较的持仓披露期。</p>';
  const stocks = new Map();
  periods.forEach((period) => (period.holdings || []).forEach((holding) => {
    const current = stocks.get(holding.code) || { code: holding.code, name: holding.name, values: [], count: 0, max: 0 };
    current.count += 1;
    current.max = Math.max(current.max, Number(holding.weight || 0));
    stocks.set(holding.code, current);
  }));
  const ranked = [...stocks.values()].sort((left, right) => right.count - left.count || right.max - left.max).slice(0, rowLimit);
  const scale = Math.max(...ranked.map((item) => item.max), 0.01);
  const rows = ranked.map((stock) => {
    const cells = periods.map((period) => {
      const holding = period.holdings.find((item) => item.code === stock.code);
      if (!holding) {
        const note = scope === "quarterly" ? "未列前十大，不代表持仓为0" : "完整持仓未披露持有";
        return `<td class="timeline-heatmap-empty" title="${escapeHTML(period.report_date)} · ${note}">—</td>`;
      }
      const value = Number(holding.weight || 0);
      const intensity = Math.min(value / scale, 1);
      const alpha = 0.12 + intensity * 0.76;
      const foreground = intensity > 0.58 ? "#ffffff" : "#102c45";
      return `<td style="background:rgba(11,119,116,${alpha.toFixed(3)});color:${foreground}" title="${escapeHTML(period.report_date)} · ${escapeHTML(stock.name)} · ${pct(value, 2)}">${pct(value, 1)}</td>`;
    }).join("");
    return `<tr><th scope="row"><button class="timeline-heatmap-row-link" data-holding-stock="${escapeHTML(stock.code)}">${escapeHTML(stock.name)}<small>${escapeHTML(stock.code)}</small></button></th>${cells}</tr>`;
  }).join("");
  return `<div class="timeline-heatmap-wrap"><table class="timeline-heatmap holding-timeline-heatmap"><thead><tr><th>股票</th>${periods.map((period) => `<th>${escapeHTML(period.report_date.slice(2, 7))}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div><p class="method-note">按披露出现次数和历史最高权重展示前${ranked.length}只。季度空白仅表示未列前十大；完整持仓空白表示当期完整名单未披露持有。点击股票可联动上方股价与基金净值图。</p>`;
}

function bindHoldingTrajectoryHover(periods, stockCode, stockName, scope) {
  const wrap = document.querySelector(".holding-trajectory-chart-wrap");
  const svg = wrap?.querySelector(".holding-trajectory-chart");
  const target = svg?.querySelector(".holding-trajectory-hover-target");
  const crosshair = svg?.querySelector(".holding-trajectory-crosshair");
  const dot = svg?.querySelector(".holding-trajectory-hover-dot");
  const card = wrap?.querySelector(".holding-trajectory-hover-card");
  if (!svg || !target || !crosshair || !dot || !card || !periods.length) return;
  const values = holdingTrajectoryValues(periods, stockCode, scope);
  const width = Math.max(920, values.length * 68);
  const height = 380;
  const margin = { top: 28, right: 28, bottom: 88, left: 58 };
  const max = Math.max(...values.filter((item) => item.value !== null).map((item) => item.value), 0.01) * 1.12;
  const x = (index) => margin.left + index / Math.max(values.length - 1, 1) * (width - margin.left - margin.right);
  const y = (value) => margin.top + (max - Number(value || 0)) / max * (height - margin.bottom - margin.top);
  const setVisible = (visible) => [crosshair, dot, card].forEach((item) => visible ? item.removeAttribute("hidden") : item.setAttribute("hidden", ""));
  const update = (event) => {
    const bounds = svg.getBoundingClientRect();
    const rawX = Math.min(width - margin.right, Math.max(margin.left, (event.clientX - bounds.left) / bounds.width * width));
    const index = Math.max(0, Math.min(values.length - 1, Math.round((rawX - margin.left) / (width - margin.left - margin.right) * (values.length - 1))));
    const item = values[index];
    const exactX = x(index);
    crosshair.setAttribute("x1", exactX);
    crosshair.setAttribute("x2", exactX);
    dot.setAttribute("cx", exactX);
    dot.setAttribute("cy", y(item.value));
    dot.classList.toggle("missing", item.value === null);
    card.innerHTML = `<strong>${escapeHTML(item.report_date)}</strong><span>${escapeHTML(stockName)}：${item.value === null ? "未列前十（不代表0%）" : pct(item.value, 2)}</span><span>${scope === "quarterly" ? "季度前十大披露口径" : "半年报/年报完整持仓口径"}</span>`;
    card.style.left = `${Math.min(Math.max(exactX / width * 100, 16), 84)}%`;
    setVisible(true);
  };
  target.addEventListener("pointermove", update);
  target.addEventListener("pointerdown", update);
  target.addEventListener("pointerleave", () => setVisible(false));
}

function bindHoldingAnalysis(analysis) {
  const history = analysis.holding_analysis_history;
  const root = document.querySelector("#holding-analysis-interactive");
  if (!history || !root) return;
  const initialScope = history.quarterly?.length ? "quarterly" : "full";
  const state = { scope: initialScope, dimension: "sector", periodIndex: (history[initialScope] || []).length - 1, stockCode: null };
  const scopeButtons = [...root.querySelectorAll("[data-holding-scope]")];
  const dimensionButtons = [...root.querySelectorAll("[data-holding-dimension]")];
  const periodSelect = root.querySelector("#holding-period-select");
  const tableOutput = root.querySelector("#holding-table-output");
  const changesOutput = root.querySelector("#holding-changes-output");
  const trendOutput = root.querySelector("#holding-trajectory-output");
  const scopeNote = root.querySelector("#holding-scope-note");
  const periods = () => history[state.scope] || [];
  const stocks = () => {
    const map = new Map();
    periods().forEach((period) => period.holdings.forEach((holding) => {
      const current = map.get(holding.code) || { code: holding.code, name: holding.name, max: 0, count: 0 };
      current.max = Math.max(current.max, Number(holding.weight));
      current.count += 1;
      map.set(holding.code, current);
    }));
    return [...map.values()].sort((left, right) => right.count - left.count || right.max - left.max);
  };
  const bindStockLinks = () => root.querySelectorAll("[data-holding-stock]").forEach((button) => button.addEventListener("click", () => {
    state.stockCode = button.dataset.holdingStock;
    draw();
    window.dispatchEvent(new CustomEvent("fund-heavy-stock-select", { detail: { code: state.stockCode } }));
  }));
  const draw = () => {
    const currentPeriods = periods();
    state.periodIndex = Math.max(0, Math.min(state.periodIndex, currentPeriods.length - 1));
    const current = currentPeriods[state.periodIndex];
    const stockOptions = stocks();
    if (!state.stockCode || !stockOptions.some((item) => item.code === state.stockCode)) {
      state.stockCode = current?.holdings?.[0]?.code || stockOptions[0]?.code || null;
    }
    scopeButtons.forEach((button) => button.classList.toggle("active", button.dataset.holdingScope === state.scope));
    dimensionButtons.forEach((button) => button.classList.toggle("active", button.dataset.holdingDimension === state.dimension));
    periodSelect.innerHTML = currentPeriods.slice().reverse().map((period, reverseIndex) => {
      const index = currentPeriods.length - 1 - reverseIndex;
      return `<option value="${index}" ${index === state.periodIndex ? "selected" : ""}>${escapeHTML(period.report_date)}</option>`;
    }).join("");
    scopeNote.textContent = state.scope === "quarterly"
      ? "每季真实前十大；表中标注相对上期新进与退出。"
      : "仅使用半年报和年报全部披露股票。";
    tableOutput.innerHTML = renderHoldingSnapshot(current, state.dimension, state.scope);
    changesOutput.innerHTML = renderHoldingChanges(current, state.scope);
    trendOutput.innerHTML = renderHoldingTrajectoryHeatmap(currentPeriods, state.scope);
    bindStockLinks();
  };
  scopeButtons.forEach((button) => button.addEventListener("click", () => {
    state.scope = button.dataset.holdingScope;
    state.periodIndex = periods().length - 1;
    state.stockCode = null;
    draw();
  }));
  dimensionButtons.forEach((button) => button.addEventListener("click", () => {
    state.dimension = button.dataset.holdingDimension;
    draw();
  }));
  periodSelect.addEventListener("change", () => {
    state.periodIndex = Number(periodSelect.value);
    const current = periods()[state.periodIndex];
    loadHoldingCharacteristicDates([current?.report_date]).then(() => {
      hydrateHoldingPeriodCharacteristics(current);
      draw();
    });
  });
  draw();
}

function renderHoldingAnalysis(analysis) {
  const latest = analysis.latest_top10;
  const full = analysis.full_holdings;
  const valuation = analysis.core_valuation;
  const history = analysis.holding_analysis_history;
  if (!history) return '<p class="empty-copy">持股历史数据尚未生成。</p>';
  return `
    <div class="panel-intro"><div><p class="eyebrow">HOLDING ANALYSIS</p><h2>持股分析</h2></div><p>前十大和完整持仓均可切换报告期及板块/中信一二三级；估值、ROE与G使用对应报告期时点数据。</p></div>
    ${renderHeavyStockTrendSection(analysis.heavy_stock_trends)}
    <article class="subpanel core-valuation-panel">
      <div class="subpanel-heading"><div><h3>最新重仓股估值与盈利能力</h3><span>${escapeHTML(valuation?.scope)} · ${escapeHTML(valuation?.report_date)} · Choice报告期时点</span></div><strong class="valuation-label">${escapeHTML(valuation?.label)}</strong></div>
      <div class="research-metric-grid metric-six">
        ${metric("加权PE(TTM)", num(valuation?.weighted_pe_ttm, 1))}${metric("调和PE(TTM)", num(valuation?.harmonic_pe_ttm, 1))}${metric("100倍封顶PE", num(valuation?.capped_weighted_pe_ttm, 1))}
        ${metric("PE中位数", num(valuation?.median_pe_ttm, 1))}${metric("加权PB(MRQ)", num(valuation?.weighted_pb_mrq, 1))}${metric("加权ROE(TTM)", valuation?.weighted_roe_ttm === null || valuation?.weighted_roe_ttm === undefined ? "—" : `${num(valuation.weighted_roe_ttm, 1)}%`)}
      </div>
      <p class="method-note">PE为TTM；PB为报告期附近最近交易日的MRQ口径；ROE(TTM)按报告期当时已公告财务数据计算。季度前十大未披露股票不能据此判断持仓为0。</p>
    </article>
    <div id="holding-analysis-interactive">
      <div class="industry-analysis-toolbar holding-analysis-toolbar">
        <div class="industry-toggle-group" aria-label="持仓披露范围"><button class="active" data-holding-scope="quarterly">季度前十大</button><button data-holding-scope="full">完整持仓</button></div>
        <div class="industry-toggle-group" aria-label="行业层级"><button class="active" data-holding-dimension="sector">板块</button><button data-holding-dimension="level1">中信一级</button><button data-holding-dimension="level2">中信二级</button><button data-holding-dimension="level3">中信三级</button></div>
      </div>
      <article class="subpanel">
        <div class="subpanel-heading industry-period-control"><div><h3>披露持仓明细与特征</h3><span id="holding-scope-note"></span></div><label><span>报告期</span><select id="holding-period-select"></select></label></div>
        <div id="holding-changes-output"></div><div id="holding-table-output"></div>
      </article>
      <article class="subpanel chart-subpanel">
        <div class="subpanel-heading industry-trend-control"><div><h3>个股连续持仓矩阵</h3><span>连续展示历次披露权重；点击股票联动上方价格与净值</span></div></div>
        <div id="holding-trajectory-output"></div>
      </article>
    </div>
    <div class="calibration-note"><strong>口径关系</strong><p>最新完整持仓（${escapeHTML(full.report_date)}）覆盖基金净值${pct(full.summary.total_weight, 1)}；最新季度前十大（${escapeHTML(latest.report_date)}）覆盖${pct(latest.summary.top10_weight, 1)}。季度轨迹的空点表示未列前十，不代表卖出或持仓为零。</p></div>`;
}

function renderRebalancingTracking(analysis, fund) {
  const history = analysis.holding_history || [];
  const sizeStyle = analysis.size_index_style || {};
  const sizeEntries = (sizeStyle.buckets || []).filter((item) => item.weight > 0).map((item) => [item.name, item.weight]);
  const sizeRows = (sizeStyle.buckets || []).map((item) => [escapeHTML(item.name), `${item.count}只`, pct(item.weight, 1)]);
  const transitionRows = (analysis.rebalancing.transitions || []).slice().reverse().map((item) => [
    `${escapeHTML(item.from_date)} → ${escapeHTML(item.to_date)}`,
    pct(item.jaccard, 1),
    `${item.common_count}只`,
    escapeHTML(item.entered_codes.join("、") || "—"),
    escapeHTML(item.exited_codes.join("、") || "—"),
    pct(item.disclosed_weight_change_proxy, 1),
  ]);
  const multiIndex = analysis.multi_index_analysis || {};
  const styleRows = Object.entries(multiIndex.index_names || {})
    .filter(([, name]) => /成长|价值/.test(name))
    .map(([code, name]) => [escapeHTML(name), num(multiIndex.correlations?.["1y"]?.[code], 2), num(multiIndex.correlations?.["3y"]?.[code], 2), num(multiIndex.correlations?.["5y"]?.[code], 2)]);
  return `
    <div class="panel-intro"><div><p class="eyebrow">REBALANCING TRACKING</p><h2>调仓跟踪</h2></div><p>用净值、仓位、规模风格与成长价值指数观察组合变化，不把披露权重变化解释为真实成交。</p></div>
    <article class="subpanel chart-subpanel"><div class="subpanel-heading"><h3>净值与风格指数跟踪</h3><span>近5年日频有效观察，共同起点归一化为1</span></div>${renderMultiIndexChart(multiIndex, analysis.name)}</article>
    <div class="two-column two-column-wide">
      <article class="subpanel chart-subpanel"><div class="subpanel-heading"><h3>股票仓位监控</h3><span>季度报告期口径</span></div>${renderMiniLineChart(analysis.assets.history, [{ key: "stock_to_nav", label: "股票仓位", color: "#0b7774", width: 3 }, { key: "cash_to_nav", label: "现金仓位", color: "#c5913d", width: 2.5 }], "股票与现金仓位季度变化")}</article>
      <article class="subpanel chart-subpanel"><div class="subpanel-heading"><h3>季度前十大集中度</h3><span>占基金净值</span></div>${renderMiniLineChart(history, [{ key: "top10_concentration", label: "前十大集中度", color: "#0b7774", width: 3 }], "季度前十大集中度变化")}</article>
    </div>
    <article class="subpanel"><div class="subpanel-heading"><h3>大小盘风格</h3><span>${escapeHTML(sizeStyle.report_date)}完整持仓历史指数成分归属</span></div><div class="two-column two-column-wide"><div>${renderBarList(sizeEntries, Math.max(...sizeEntries.map((item) => item[1]), 0.01))}</div><div>${renderTable(["归属", "持股数", "占基金净值"], sizeRows)}</div></div><p class="method-note">沪深300、中证500和中证1000分别作为大盘、中盘和小盘代理；港股与其他A股单列。</p></article>
    <article class="subpanel"><div class="subpanel-heading"><h3>成长价值风格</h3><span>基金月度收益与成长/价值指数相关性</span></div>${styleRows.length ? renderTable(["风格指数", "近1年", "近3年", "近5年"], styleRows) : '<p class="empty-copy">暂无成长价值指数相关性数据。</p>'}</article>
    <article class="subpanel"><div class="subpanel-heading"><h3>季度调仓轨迹</h3><span>${escapeHTML(fund.rebalancing.style)} · 权重变化为披露代理</span></div>${renderTable(["区间", "名单重合", "共同持有", "新出现代码", "未列前十代码", "披露权重变化"], transitionRows)}</article>
    <p class="method-note">季度未进入前十大不代表卖出或持仓为0；“未列前十代码”只描述前十大名单变化。</p>`;
}

function renderFlows(analysis) {
  const flows = analysis.flows;
  const expenses = analysis.expenses;
  const flowRows = flows.quarters.slice().reverse().map((item) => [escapeHTML(item.end_date), shares(item.purchases), shares(item.redemptions), `<span class="${item.net_subscription_shares >= 0 ? "value-positive" : "value-negative"}">${shares(item.net_subscription_shares)}</span>`, pct(item.share_change, 1, true), shares(item.end_shares)]);
  const shareClass = analysis.share_classes;
  return `
    <div class="panel-intro"><div><p class="eyebrow">FLOWS, FEES & CAPACITY</p><h2>资金流、费用与容量观察</h2></div><p>份额申赎、规模和持股占流通股比例结合使用，观察资金压力与交易容量。</p></div>
    <div class="research-metric-grid metric-five">
      ${metric("最新季度净申赎", shares(flows.latest_net_subscription_shares))}${metric("最新份额变化", pct(flows.latest_share_change, 1, true))}${metric("六季度累计净申赎", shares(flows.six_quarter_net_subscription_shares))}${metric("最新净资产", money(analysis.latest_net_asset))}${metric("前十大最大流通股占比", pct(analysis.latest_top10.max_float_share_percent, 3))}
    </div>
    <article class="subpanel"><div class="subpanel-heading"><h3>季度申赎轨迹</h3><span>单位按份额自动换算</span></div>${renderTable(["报告期", "申购", "赎回", "净申赎", "份额变化", "期末份额"], flowRows)}</article>
    <div class="two-column">
      <article class="subpanel"><h3>费用代理</h3><dl class="fact-list"><div><dt>报告期</dt><dd>${escapeHTML(expenses.report_period)}</dd></div><div><dt>管理费支出</dt><dd>${money(expenses.management_expense)}</dd></div><div><dt>托管费支出</dt><dd>${money(expenses.custodian_expense)}</dd></div><div><dt>销售服务费支出</dt><dd>${money(expenses.selling_distribution_expense)}</dd></div><div><dt>总费用/平均净资产代理</dt><dd>${pct(expenses.total_expense_to_average_net_asset_proxy, 2)}</dd></div></dl></article>
      <article class="subpanel"><h3>A/C份额差异</h3>${shareClass ? `<dl class="fact-list"><div><dt>A类代码</dt><dd>${escapeHTML(shareClass.a_code)}</dd></div><div><dt>C类代码</dt><dd>${escapeHTML(shareClass.c_code)}</dd></div><div><dt>A类年化收益</dt><dd>${pct(shareClass.a_annualized_return, 2)}</dd></div><div><dt>C类年化收益</dt><dd>${pct(shareClass.c_annualized_return, 2)}</dd></div><div><dt>年化差</dt><dd>${pct(shareClass.annualized_gap, 2)}</dd></div><div><dt>C类销售服务费率</dt><dd>${pct(shareClass.c_sales_service_rate, 2)}/年</dd></div></dl><p class="method-note">A/C为不同基金代码，通过同一基金家族标识匹配；净值差主要反映份额费用，申购赎回费未纳入。</p>` : '<p class="empty-copy">当前数据未识别到同基金家族的C类份额。</p>'}</article>
    </div>`;
}

function effectCell(value) {
  const className = Number(value) >= 0 ? "value-positive" : "value-negative";
  return `<span class="${className}">${pct(value, 2, true)}</span>`;
}

const BRINSON_SECTOR_BY_LEVEL1 = {
  "石油石化": "周期", "煤炭": "周期", "有色金属": "周期", "电力及公用事业": "周期", "钢铁": "周期", "基础化工": "周期", "建筑": "周期", "建材": "周期", "交通运输": "周期",
  "轻工制造": "制造", "机械": "制造", "电力设备及新能源": "制造", "国防军工": "制造", "汽车": "制造",
  "商贸零售": "消费", "消费者服务": "消费", "家电": "消费", "纺织服装": "消费", "食品饮料": "消费", "农林牧渔": "消费",
  "医药": "医疗", "银行": "金融", "非银行金融": "金融", "房地产": "金融", "综合金融": "金融",
  "电子": "科技", "通信": "科技", "计算机": "科技", "传媒": "科技",
};

function brinsonCarinoCoefficient(portfolioReturn, benchmarkReturn) {
  const difference = Number(portfolioReturn) - Number(benchmarkReturn);
  if (Math.abs(difference) < 1e-12) return 1 / (1 + Number(portfolioReturn));
  return (Math.log1p(Number(portfolioReturn)) - Math.log1p(Number(benchmarkReturn))) / difference;
}

function brinsonRangeResult(brinson, startDate, endDate, dimension = "level1") {
  const periods = brinson.periods.filter((period) => period.period_start >= startDate && period.period_end <= endDate);
  if (!periods.length) return null;
  const portfolioReturn = periods.reduce((value, period) => value * (1 + Number(period.portfolio_a_share_return)), 1) - 1;
  const benchmarkReturn = periods.reduce((value, period) => value * (1 + Number(period.benchmark_return)), 1) - 1;
  const totalCoefficient = brinsonCarinoCoefficient(portfolioReturn, benchmarkReturn);
  const multipliers = new Map(periods.map((period) => [
    `${period.period_start}|${period.period_end}`,
    brinsonCarinoCoefficient(period.portfolio_a_share_return, period.benchmark_return) / totalCoefficient,
  ]));
  const grouped = new Map();
  const selectedKeys = new Set(multipliers.keys());
  brinson.period_industries.filter((item) => selectedKeys.has(`${item.period_start}|${item.period_end}`)).forEach((item) => {
    const level1 = String(item.industry || "未映射").replace(/\(中信\)$/u, "");
    const label = dimension === "sector" ? (BRINSON_SECTOR_BY_LEVEL1[level1] || "其他") : level1;
    const current = grouped.get(label) || { label, portfolioWeight: 0, benchmarkWeight: 0, allocation: 0, selection: 0, active: 0 };
    const multiplier = multipliers.get(`${item.period_start}|${item.period_end}`) || 1;
    current.portfolioWeight += Number(item.portfolio_weight || 0) / periods.length;
    current.benchmarkWeight += Number(item.benchmark_weight || 0) / periods.length;
    current.allocation += Number(item.allocation_effect || 0) * multiplier;
    current.selection += (Number(item.selection_effect || 0) + Number(item.interaction_effect || 0)) * multiplier;
    current.active += Number(item.active_effect || 0) * multiplier;
    grouped.set(label, current);
  });
  return {
    periods,
    portfolioReturn,
    benchmarkReturn,
    activeReturn: portfolioReturn - benchmarkReturn,
    allocation: periods.reduce((sum, period) => sum + Number(period.allocation_effect || 0) * (multipliers.get(`${period.period_start}|${period.period_end}`) || 1), 0),
    selection: periods.reduce((sum, period) => sum + Number(period.stock_selection_effect || 0) * (multipliers.get(`${period.period_start}|${period.period_end}`) || 1), 0),
    pricedWeight: periods.reduce((sum, period) => sum + Number(period.priced_a_share_weight || 0), 0) / periods.length,
    industries: [...grouped.values()].sort((left, right) => Math.abs(right.active) - Math.abs(left.active)),
  };
}

function renderBrinsonRange(brinson, startDate, endDate, dimension = "level1") {
  const result = brinsonRangeResult(brinson, startDate, endDate, dimension);
  if (!result) return '<p class="empty-copy">所选起止日期之间没有完整可归因区间。</p>';
  const rows = result.industries.map((item) => [
    escapeHTML(item.label), pct(item.portfolioWeight, 1), pct(item.benchmarkWeight, 1),
    effectCell(item.allocation), effectCell(item.selection), effectCell(item.active),
  ]);
  return `<div class="research-metric-grid metric-six brinson-period-metrics">
    ${metric("A股组合收益", pct(result.portfolioReturn, 2, true))}${metric("基准收益", pct(result.benchmarkReturn, 2, true))}${metric("累计主动差", pct(result.activeReturn, 2, true))}
    ${metric("期间配置贡献", pct(result.allocation, 2, true))}${metric("期间个股贡献", pct(result.selection, 2, true), "含交互")}${metric("平均A股定价权重", pct(result.pricedWeight, 1))}
  </div>
  <div class="subpanel-heading brinson-period-heading"><h4>${escapeHTML(result.periods[0].period_start)} → ${escapeHTML(result.periods.at(-1).period_end)}</h4><span>${result.periods.length}个半年期 · 期间经过Carino处理的收益归因</span></div>
  ${renderTable([dimension === "sector" ? "板块" : "中信一级", "平均期初基金权重", "平均期初基准权重", "期间配置贡献", "期间个股贡献", "主动贡献"], rows, "brinson-industry-scroll")}
  <p class="method-note">每个半年期使用期初半年报/年报完整持仓，不采用期初期末平均持仓；期内按静态持有估算，多个半年期再用Carino系数链接。季度前十大不参与完整组合归因。</p>`;
}

function renderBrinsonAttribution(brinson) {
  if (!brinson?.summary || !brinson.periods?.length) return "";
  const summary = brinson.summary;
  const first = brinson.periods[0];
  const latest = brinson.periods.at(-1);
  const startOptions = brinson.periods.map((period, index) => `<option value="${escapeHTML(period.period_start)}"${index === 0 ? " selected" : ""}>${escapeHTML(period.period_start)}</option>`).join("");
  const endOptions = brinson.periods.map((period, index) => `<option value="${escapeHTML(period.period_end)}"${index === brinson.periods.length - 1 ? " selected" : ""}>${escapeHTML(period.period_end)}</option>`).join("");
  return `<div class="panel-intro"><div><p class="eyebrow">MANAGER-TENURE BRINSON</p><h2>现任经理任期股票归因</h2></div><p>${escapeHTML(summary.manager_names)}自${escapeHTML(summary.manager_start)}任职；受完整持仓披露限制，归因自${escapeHTML(summary.attribution_start)}开始。</p></div>
    <div class="calibration-note"><strong>归因边界</strong><p>起点权重只来自半年报/年报完整持仓；2026-06-30季报前十大用于跟踪，不冒充完整组合。最新完整持仓尚未披露时，最后一期可用最近完整持仓静态估算至区间末日，并在下方标注。</p></div>
    <article class="subpanel brinson-period-panel">
      <div class="subpanel-heading brinson-range-heading"><div><h3>可选期间收益归因</h3><span>两个日期分别控制起点与终点</span></div><div class="brinson-range-controls"><label><span>起点</span><select id="brinson-range-start">${startOptions}</select></label><span class="brinson-range-arrow">→</span><label><span>终点</span><select id="brinson-range-end">${endOptions}</select></label></div></div>
      <div class="industry-toggle-group brinson-dimension-toggle"><button class="active" data-brinson-dimension="level1">中信一级</button><button data-brinson-dimension="sector">板块</button><button disabled title="当前归因底层只生成中信一级，不能用名称拆分伪造二三级结果">中信二级/三级待底层扩展</button></div>
      <div id="brinson-range-output">${renderBrinsonRange(brinson, first.period_start, latest.period_end, "level1")}</div>
    </article>`;
}

function renderAttribution(analysis) {
  const brinsonSection = renderBrinsonAttribution(analysis.brinson_manager_tenure);
  return `${brinsonSection}<div class="calibration-note"><strong>个股贡献口径</strong><p>不再把“最新完整持仓静态贡献”作为第二套归因并列展示，避免与Brinson重复且误导为真实交易归因。个股层面仍可在持股分析中观察买入前后股价、基金净值和披露权重；待逐日持仓不可得时，不输出伪精确的个股交易贡献。</p></div>`;
}

function bindTabs(onActivate = null) {
  const buttons = [...document.querySelectorAll("[data-tab]")];
  const panels = [...document.querySelectorAll("[data-panel]")];
  buttons.forEach((button) => button.addEventListener("click", () => {
    const target = button.dataset.tab;
    buttons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    panels.forEach((item) => {
      const active = item.dataset.panel === target;
      item.classList.toggle("active", active);
      item.hidden = !active;
    });
    if (onActivate) void onActivate(target);
    document.querySelector(".fund-tab-nav")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

function bindPerformanceCharts(detailData, analysis, fundName, benchmarkName) {
  const buttons = [...document.querySelectorAll("[data-nav-range]")];
  if (!buttons.length) return;
  const managerStart = currentManagerTenureStart(analysis.current_managers);
  const performanceNav = detailData.fund_nav || detailData.nav || [];
  const chartNav = detailData.nav || performanceNav;
  const draw = (range) => {
    const selectedPerformance = selectPerformanceRange(performanceNav, range, managerStart);
    const selectedChart = selectPerformanceRange(chartNav, range, managerStart);
    const points = rebaseNavPoints(selectedChart);
    const output = document.querySelector("#nav-chart-output");
    const metrics = document.querySelector("#performance-range-metrics");
    output.innerHTML = renderZoomableNavChart(points, fundName, benchmarkName);
    if (metrics) metrics.innerHTML = renderPerformanceMetricCards(range, selectedPerformance, true, selectedChart);
    bindNavChartZoom(points, fundName, benchmarkName, output);
  };
  buttons.forEach((button) => button.addEventListener("click", () => {
    buttons.forEach((item) => item.classList.toggle("active", item === button));
    draw(button.dataset.navRange);
  }));
  draw("all");
}

function bindBrinsonRange(brinson) {
  const startSelect = document.querySelector("#brinson-range-start");
  const endSelect = document.querySelector("#brinson-range-end");
  const output = document.querySelector("#brinson-range-output");
  const buttons = [...document.querySelectorAll("[data-brinson-dimension]")];
  if (!startSelect || !endSelect || !output || !brinson?.periods?.length || startSelect.dataset.bound === "true") return;
  let dimension = "level1";
  const draw = (source = null) => {
    let startIndex = brinson.periods.findIndex((period) => period.period_start === startSelect.value);
    let endIndex = brinson.periods.findIndex((period) => period.period_end === endSelect.value);
    if (startIndex > endIndex) {
      if (source === startSelect) {
        endIndex = startIndex;
        endSelect.value = brinson.periods[endIndex].period_end;
      } else {
        startIndex = endIndex;
        startSelect.value = brinson.periods[startIndex].period_start;
      }
    }
    [...startSelect.options].forEach((option, index) => { option.disabled = index > endIndex; });
    [...endSelect.options].forEach((option, index) => { option.disabled = index < startIndex; });
    buttons.forEach((button) => button.classList.toggle("active", button.dataset.brinsonDimension === dimension));
    output.innerHTML = renderBrinsonRange(brinson, startSelect.value, endSelect.value, dimension);
  };
  startSelect.addEventListener("change", () => draw(startSelect));
  endSelect.addEventListener("change", () => draw(endSelect));
  buttons.forEach((button) => button.addEventListener("click", () => { dimension = button.dataset.brinsonDimension; draw(); }));
  startSelect.dataset.bound = "true";
  draw();
}

function bindBrinsonPeriods(analysis) {
  bindBrinsonRange(analysis.brinson_manager_tenure);
}

function bindHeavyStockTrend(analysis) {
  const panel = document.querySelector(".heavy-stock-trend-panel");
  const output = panel?.querySelector("#heavy-stock-chart-output");
  const buttons = [...(panel?.querySelectorAll("[data-heavy-stock-code]") || [])];
  const trends = analysis.heavy_stock_trends;
  if (!panel || !output || !buttons.length || !trends?.stocks?.length) return;
  const draw = (code) => {
    const comparableCode = comparableSecurityCode(code);
    const stock = trends.stocks.find((item) => comparableSecurityCode(item.code) === comparableCode);
    if (!stock) return false;
    buttons.forEach((button) => {
      const active = button.dataset.heavyStockCode === stock.code;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    output.innerHTML = renderHeavyStockTrendModule(stock);
    bindHeavyStockRange(stock, output);
    return true;
  };
  buttons.forEach((button) => button.addEventListener("click", () => draw(button.dataset.heavyStockCode)));
  window.addEventListener("fund-heavy-stock-select", (event) => draw(event.detail?.code));
  draw(trends.stocks[0].code);
}

function renderFund(fund, summaryData, detailData, analysisData, analysis, fundDocuments) {
  document.title = `${fund.name}详细分析 · 财富产品部-基金研究系统看板`;
  const managerNames = analysis.current_managers.map((item) => item.name).join("、");
  const catalogFund = (window.FUND_DASHBOARD_CATALOG?.funds || []).find((item) => item.code === fund.code)
    || { code: fund.code, category: "active-equity", name: fund.name };
  page.innerHTML = `
    <a class="back-link" href="index.html#samples">← 返回基金列表</a>
    <section class="fund-page-hero">
      <div>
        <p class="eyebrow">${escapeHTML(fund.code)} · ${escapeHTML(fund.category)}</p>
        <h1>${escapeHTML(fund.name)}</h1>
        <p class="fund-page-summary">${escapeHTML(fund.summary)}</p>
        <div class="tag-row">${fund.tags.map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`).join("")}</div>
      </div>
      <dl class="hero-facts"><div><dt>现任经理</dt><dd>${escapeHTML(managerNames)}</dd></div><div><dt>最新规模</dt><dd>${money(analysis.latest_net_asset)}</dd></div><div><dt>数据更新</dt><dd>${escapeHTML(analysisData.analysisDate)}</dd></div></dl>
    </section>
    <section class="fund-page-metrics" aria-label="核心指标">
      ${metric("近1年收益", pct(analysis.period_returns["1y"], 1, true))}${metric("近5年收益", pct(analysis.period_returns["5y"], 1, true))}${metric("五年最大回撤", pct(analysis.performance.max_drawdown, 1))}${metric("最新股票仓位", pct(analysis.assets.latest.stock_to_nav, 1))}${metric("最新前十大集中度", pct(analysis.latest_top10.summary.top10_weight, 1))}
    </section>
    <nav class="fund-tab-nav" aria-label="基金分析板块" role="tablist">${TAB_ITEMS.map(([id, label], index) => `<button class="${index === 0 ? "active" : ""}" data-tab="${id}" role="tab" aria-selected="${index === 0}">${label}</button>`).join("")}</nav>
    <div class="fund-tab-content">
      ${panel("performance", renderPerformance(fund, analysis, detailData), true)}
      ${panel("assets", renderAssets(analysis))}
      ${panel("industries", renderIndustries(analysis))}
      ${panel("holdings", renderHoldingAnalysis(analysis))}
      ${panel("rebalancing", renderRebalancingTracking(analysis, fund))}
      ${panel("correlation", genericCorrelationLoadingPanel())}
      ${panel("attribution", renderAttribution(analysis))}
      ${panel("documents", genericDocumentsPanel(fund, fundDocuments))}
    </div>
    <section class="data-boundary">
      <div><p class="eyebrow">DATA BOUNDARY</p><h2>数据口径</h2></div>
      <ul>
        <li>净值截止${escapeHTML(analysisData.navAsOf)}；最新前十大报告期${escapeHTML(analysis.latest_top10.report_date)}，公告日${escapeHTML(analysis.latest_top10.announcement_date)}。</li>
        <li>行业和完整持仓统计来自${escapeHTML(analysis.full_holdings.report_date)}年报/半年报，公告日${escapeHTML(analysis.full_holdings.announcement_date)}。</li>
        <li>归一化净值曲线统一与中证800价格指数比较；合同业绩比较基准在业绩页单独列示。</li>
        <li>季度前十大与半年报/年报完整持仓分别纵向比较；均不能识别报告期内全部交易。</li>
        <li>披露持仓归因是静态估算，不是完整业绩归因。</li>
        <li>研究结果不构成基金评级或投资建议。</li>
      </ul>
    </section>`;
  bindTabs(bindLazyCorrelation(catalogFund));
  bindPerformanceCharts(detailData, analysis, fund.name, detailData.benchmark.comparison_name);
  bindAssetAllocationChart(analysis.assets.history);
  bindIndustryAnalysis(analysis);
  bindHoldingAnalysis(analysis);
  bindBrinsonPeriods(analysis);
  bindHeavyStockTrend(analysis);
  bindMultiIndexChart(analysis.multi_index_analysis, fund.name);
  bindMiniLineCharts();
}

const GENERIC_TABS = {
  "active-equity": [["performance", "业绩表现"], ["assets", "资产配置"], ["industries", "行业分析"], ["holdings", "持股分析"], ["rebalancing", "调仓跟踪"], ["correlation", "相关性分析"], ["attribution", "业绩归因"], ["documents", "公告原文"]],
  "index-enhanced": [["performance", "业绩表现"], ["industries", "行业分析（相比基准）"], ["holdings", "持股分析（相比基准）"], ["rebalancing", "调仓跟踪"], ["correlation", "相关性分析"], ["attribution", "Barra归因"], ["documents", "公告原文"]],
  "pure-bond": [["performance", "业绩表现"], ["assets", "资产配置"], ["bonds", "券种结构"], ["correlation", "相关性分析"], ["attribution", "Campisi归因"], ["documents", "公告原文"]],
  "hybrid-bond": [["performance", "业绩表现"], ["evaluation", "五维评价"], ["assets", "资产配置"], ["bonds", "券种结构"], ["industries", "行业分析"], ["holdings", "持股分析"], ["rebalancing", "调仓跟踪"], ["correlation", "相关性分析"], ["attribution", "业绩归因"], ["documents", "公告原文"]],
  "convertible-bond": [["performance", "业绩表现"], ["assets", "资产配置"], ["industries", "行业分析"], ["holdings", "持股与转债分析"], ["rebalancing", "调仓跟踪"], ["correlation", "相关性分析"], ["attribution", "业绩归因"], ["documents", "公告原文"]],
};

function genericPeriodRows(fund) {
  const labels = { "1m": "近1月", "3m": "近3月", "6m": "近6月", "1y": "近1年", "3y": "近3年", "5y": "近5年", ytd: "今年以来" };
  const performance = fund.performance || {};
  return Object.entries(labels).map(([key, label]) => [
    escapeHTML(label),
    `<strong class="${Number(performance.returns?.[key]) < 0 ? "value-negative" : "value-positive"}">${pct(performance.returns?.[key], 2, true)}</strong>`,
    pct(performance.drawdowns?.[key], 2),
  ]);
}

function genericFundNavPoints(detail) {
  return (detail?.nav || []).map(([date, value]) => ({ date, fund: Number(value) }))
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.fund) && point.fund > 0);
}

function navPointsFromStart(points, start) {
  if (!start) return points;
  const prior = points.filter((point) => point.date < start).at(-1);
  const selected = points.filter((point) => point.date >= start);
  return prior ? [prior, ...selected] : selected;
}

function genericRiskStatsRows(navPoints) {
  if (navPoints.length < 2) return [];
  const latestDate = new Date(navPoints.at(-1).date);
  const periodStart = (months) => {
    const date = new Date(latestDate);
    date.setMonth(date.getMonth() - months);
    return date.toISOString().slice(0, 10);
  };
  const row = (label, points) => {
    const stats = performanceStats(points);
    return [
      escapeHTML(label),
      stats ? `<strong class="${stats.cumulative >= 0 ? "value-positive" : "value-negative"}">${pct(stats.cumulative, 2, true)}</strong>` : "—",
      stats ? pct(stats.annualizedReturn, 2, true) : "—",
      stats ? pct(stats.volatility, 2) : "—",
      stats ? pct(stats.maxDrawdown, 2) : "—",
      stats ? num(stats.sharpe, 2) : "—",
      stats ? num(stats.calmar, 2) : "—",
    ];
  };
  return [["近1月", 1], ["近3月", 3], ["近6月", 6], ["今年以来", "ytd"], ["近1年", 12], ["近3年", 36], ["近5年", 60], ["成立以来", "all"]].map(([label, range]) => {
    const start = range === "all" ? null : range === "ytd" ? `${latestDate.getFullYear()}-01-01` : periodStart(range);
    return row(label, navPointsFromStart(navPoints, start));
  });
}

function genericCalendarRiskRows(navPoints) {
  const years = [...new Set(navPoints.map((point) => point.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  return years.map((year) => {
    const points = navPoints.filter((point) => point.date.startsWith(year));
    const prior = navPoints.filter((point) => point.date < `${year}-01-01`).at(-1);
    const stats = performanceStats(prior ? [prior, ...points] : points);
    return [
      escapeHTML(year),
      stats ? `<strong class="${stats.cumulative >= 0 ? "value-positive" : "value-negative"}">${pct(stats.cumulative, 2, true)}</strong>` : "—",
      stats ? pct(stats.annualizedReturn, 2, true) : "—",
      stats ? pct(stats.volatility, 2) : "—",
      stats ? pct(stats.maxDrawdown, 2) : "—",
      stats ? num(stats.sharpe, 2) : "—",
      stats ? num(stats.calmar, 2) : "—",
    ];
  });
}

const SECONDARY_BOND_RESEARCH_BENCHMARK = "SECONDARY_BOND_80BOND_20EQUITY";

function weightedResearchBenchmark(bondSeries, equitySeries, bondWeight = 0.8) {
  const equityMap = new Map((equitySeries || []).map(([date, value]) => [date, Number(value)]));
  const rows = (bondSeries || [])
    .map(([date, value]) => ({ date, bond: Number(value), equity: equityMap.get(date) }))
    .filter((row) => Number.isFinite(row.bond) && row.bond > 0 && Number.isFinite(row.equity) && row.equity > 0);
  if (rows.length < 2) return [];
  let wealth = 1;
  const output = [[rows[0].date, wealth]];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const intervalReturn = bondWeight * (current.bond / previous.bond - 1)
      + (1 - bondWeight) * (current.equity / previous.equity - 1);
    wealth *= 1 + intervalReturn;
    output.push([current.date, wealth]);
  }
  return output;
}

function genericBenchmark(fund, detail) {
  if (detail?.benchmark_code === SECONDARY_BOND_RESEARCH_BENCHMARK) {
    const benchmarks = window.FUND_COMMON_BENCHMARKS?.benchmarks || {};
    return {
      name: "80%中债新综合财富(总值)+20%中证800",
      series: weightedResearchBenchmark(benchmarks["CBA00101.CS"]?.series, benchmarks["000906.SH"]?.series),
    };
  }
  const common = window.FUND_COMMON_BENCHMARKS?.benchmarks?.[detail?.benchmark_code];
  const series = detail?.benchmark?.length ? detail.benchmark : common?.series || [];
  const name = fund.category === "index-enhanced" ? `跟踪指数 ${fund.tracking_index || detail?.benchmark_code || ""}` : common?.name || detail?.benchmark_code || "比较基准";
  return { name, series };
}

function genericBenchmarkRole(fund) {
  if (fund.category === "index-enhanced") return "跟踪指数";
  if (fund.category === "active-equity") return "统一权益研究基准（非合同基准）";
  if (fund.category === "convertible-bond") return "转债统一研究基准（非合同基准）";
  if (fund.category === "pure-bond" || fund.internal_category === "primary_bond") return "久期匹配债券研究基准（非合同基准）";
  if (fund.internal_category === "secondary_bond") return "固收+统一研究代理（非合同基准）";
  return "研究比较基准（非合同基准）";
}

function activeEquityPerformance(detail) {
  const fundPoints = genericFundNavPoints(detail);
  const benchmark = window.FUND_COMMON_BENCHMARKS?.benchmarks?.["000906.SH"];
  if (fundPoints.length < 2 || !benchmark?.series?.length) return null;
  const monthlyLast = (points, valueKey) => {
    const map = new Map();
    points.forEach((item) => {
      const date = Array.isArray(item) ? item[0] : item.date;
      const value = Number(Array.isArray(item) ? item[1] : item[valueKey]);
      if (date && Number.isFinite(value) && value > 0) map.set(date.slice(0, 7), { date, value });
    });
    return map;
  };
  const fundMonthly = monthlyLast(fundPoints, "fund");
  const benchmarkMonthly = monthlyLast(benchmark.series);
  const months = [...fundMonthly.keys()].filter((month) => benchmarkMonthly.has(month)).sort().slice(-61);
  if (months.length < 13) return null;
  const fundReturns = [];
  const benchmarkReturns = [];
  for (let index = 1; index < months.length; index += 1) {
    const current = months[index];
    const previous = months[index - 1];
    fundReturns.push(fundMonthly.get(current).value / fundMonthly.get(previous).value - 1);
    benchmarkReturns.push(benchmarkMonthly.get(current).value / benchmarkMonthly.get(previous).value - 1);
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const stdev = (values) => {
    if (values.length < 2) return null;
    const average = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
  };
  const cumulative = (values) => values.reduce((wealth, value) => wealth * (1 + value), 1) - 1;
  const years = fundReturns.length / 12;
  const annualized = (values) => (1 + cumulative(values)) ** (1 / years) - 1;
  const excess = fundReturns.map((value, index) => value - benchmarkReturns[index]);
  const negative = fundReturns.filter((value) => value < 0);
  const annualizedReturn = annualized(fundReturns);
  const volatility = stdev(fundReturns) * Math.sqrt(12);
  const downside = negative.length ? Math.sqrt(mean(negative.map((value) => value ** 2))) * Math.sqrt(12) : null;
  const trackingError = stdev(excess) * Math.sqrt(12);
  const upFund = fundReturns.filter((_, index) => benchmarkReturns[index] > 0);
  const upBenchmark = benchmarkReturns.filter((value) => value > 0);
  const downFund = fundReturns.filter((_, index) => benchmarkReturns[index] < 0);
  const downBenchmark = benchmarkReturns.filter((value) => value < 0);
  const scenarios = [
    ["市场上涨月", upFund, upBenchmark],
    ["市场下跌月", downFund, downBenchmark],
    ["基准最弱25%月份", [], []],
  ];
  const sortedBenchmark = benchmarkReturns.slice().sort((left, right) => left - right);
  const cutoff = sortedBenchmark[Math.max(0, Math.ceil(sortedBenchmark.length * 0.25) - 1)];
  benchmarkReturns.forEach((value, index) => {
    if (value <= cutoff) { scenarios[2][1].push(fundReturns[index]); scenarios[2][2].push(value); }
  });
  return {
    observations: fundReturns.length,
    annualizedReturn,
    annualizedExcess: annualized(fundReturns) - annualized(benchmarkReturns),
    volatility,
    downside,
    sharpe: volatility > 0 ? annualizedReturn / volatility : null,
    sortino: downside > 0 ? annualizedReturn / downside : null,
    trackingError,
    informationRatio: trackingError > 0 ? (annualized(fundReturns) - annualized(benchmarkReturns)) / trackingError : null,
    winRate: excess.filter((value) => value > 0).length / excess.length,
    upCapture: mean(upBenchmark) ? mean(upFund) / mean(upBenchmark) : null,
    downCapture: mean(downBenchmark) ? mean(downFund) / mean(downBenchmark) : null,
    scenarios: scenarios.map(([label, fundValues, benchmarkValues]) => [
      label, `${fundValues.length}个月`, pct(mean(fundValues), 2, true), pct(mean(benchmarkValues), 2, true),
      pct(fundValues.filter((value, index) => value > benchmarkValues[index]).length / Math.max(fundValues.length, 1), 1),
    ]),
  };
}

function hybridBondEvaluationSeries(detail, years) {
  const fundPoints = genericFundNavPoints(detail);
  const benchmarks = window.FUND_COMMON_BENCHMARKS?.benchmarks || {};
  const bondSeries = benchmarks["CBA00101.CS"]?.series || [];
  const equitySeries = benchmarks["000906.SH"]?.series || [];
  const bondMap = new Map(bondSeries.map(([date, value]) => [date, Number(value)]));
  const equityMap = new Map(equitySeries.map(([date, value]) => [date, Number(value)]));
  let rows = fundPoints.map((point) => ({
    date: point.date,
    fund: Number(point.fund),
    bond: bondMap.get(point.date),
    equity: equityMap.get(point.date),
  })).filter((row) => [row.fund, row.bond, row.equity].every((value) => Number.isFinite(value) && value > 0));
  if (rows.length < 3) return null;
  const endDate = new Date(rows.at(-1).date);
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - years);
  const start = startDate.toISOString().slice(0, 10);
  const prior = rows.filter((row) => row.date < start).at(-1);
  rows = rows.filter((row) => row.date >= start);
  if (prior) rows = [prior, ...rows];
  if (rows.length < 3) return null;
  const returns = rows.slice(1).map((row, index) => {
    const previous = rows[index];
    const fund = row.fund / previous.fund - 1;
    const bond = row.bond / previous.bond - 1;
    const equity = row.equity / previous.equity - 1;
    return { date: row.date, fund, bond, equity, proxy: 0.8 * bond + 0.2 * equity };
  });
  return { rows, returns };
}

function hybridBondFiveDimensionMetrics(detail, holdingHistory, years = 3) {
  const series = hybridBondEvaluationSeries(detail, years);
  if (!series || series.returns.length < 12) return null;
  const values = series.returns;
  const mean = (items) => items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : null;
  const stdev = (items) => {
    if (items.length < 2) return null;
    const average = mean(items);
    return Math.sqrt(items.reduce((sum, value) => sum + (value - average) ** 2, 0) / (items.length - 1));
  };
  const betaOf = (items) => {
    if (items.length < 3) return null;
    const fundMean = mean(items.map((item) => item.fund));
    const marketMean = mean(items.map((item) => item.equity));
    const covariance = items.reduce((sum, item) => sum + (item.fund - fundMean) * (item.equity - marketMean), 0) / (items.length - 1);
    const variance = items.reduce((sum, item) => sum + (item.equity - marketMean) ** 2, 0) / (items.length - 1);
    return variance > 0 ? covariance / variance : null;
  };
  const fundReturns = values.map((item) => item.fund);
  const proxyReturns = values.map((item) => item.proxy);
  const excessReturns = values.map((item) => item.fund - item.proxy);
  const equityBeta = betaOf(values);
  const alphaWeekly = Number.isFinite(equityBeta) ? mean(fundReturns) - equityBeta * mean(values.map((item) => item.equity)) : null;
  const trackingError = stdev(excessReturns);
  const rollingWindow = Math.min(52, Math.max(13, Math.round(values.length / Math.max(years, 1))));
  let rollingWins = 0;
  let rollingSamples = 0;
  for (let end = rollingWindow; end <= values.length; end += 1) {
    const window = values.slice(end - rollingWindow, end);
    const fundWealth = window.reduce((wealth, item) => wealth * (1 + item.fund), 1);
    const proxyWealth = window.reduce((wealth, item) => wealth * (1 + item.proxy), 1);
    rollingWins += fundWealth > proxyWealth ? 1 : 0;
    rollingSamples += 1;
  }
  const rollingBetas = [];
  for (let end = 26; end <= values.length; end += 1) {
    const beta = betaOf(values.slice(end - 26, end));
    if (Number.isFinite(beta)) rollingBetas.push(beta);
  }
  const geometricMean = (items, key) => items.length
    ? items.reduce((wealth, item) => wealth * (1 + item[key]), 1) ** (1 / items.length) - 1
    : null;
  const capture = (items) => {
    const fund = geometricMean(items, "fund");
    const market = geometricMean(items, "equity");
    return Number.isFinite(fund) && Number.isFinite(market) && Math.abs(market) > 1e-12 ? fund / market : null;
  };
  const upCapture = capture(values.filter((item) => item.equity > 0));
  const downCapture = capture(values.filter((item) => item.equity < 0));
  const latestTop10 = holdingHistory?.quarterly?.at(-1);
  const hhi = latestTop10?.holdings?.length
    ? latestTop10.holdings.slice(0, 10).reduce((sum, item) => sum + Number(item.weight || 0) ** 2, 0)
    : null;
  const stats = performanceStats(series.rows.map((row) => ({ date: row.date, fund: row.fund })));
  const downside = Math.sqrt(mean(fundReturns.map((value) => Math.min(value, 0) ** 2))) * Math.sqrt(52);
  return {
    start: series.rows[0].date,
    end: series.rows.at(-1).date,
    observations: values.length,
    rollingWinRate: rollingSamples ? rollingWins / rollingSamples : null,
    rollingSamples,
    jensenAlpha: Number.isFinite(alphaWeekly) ? alphaWeekly * 52 : null,
    informationRatio: trackingError > 0 ? mean(excessReturns) * 52 / (trackingError * Math.sqrt(52)) : null,
    maxDrawdown: stats?.maxDrawdown,
    downsideDeviation: downside,
    recoveryDays: stats?.recoveryDays,
    recoveryDate: stats?.recoveryDate,
    equityBeta,
    betaVolatility: stdev(rollingBetas),
    betaSamples: rollingBetas.length,
    hhi,
    hhiDate: latestTop10?.report_date,
    upCapture,
    downCapture,
    captureRatio: Number.isFinite(upCapture) && Number.isFinite(downCapture) && Math.abs(downCapture) > 1e-12 ? upCapture / downCapture : null,
  };
}

function renderHybridBondEvaluationWindow(fund, detail, holdingHistory, years) {
  const value = hybridBondFiveDimensionMetrics(detail, holdingHistory, years);
  if (!value) return '<article class="subpanel"><p class="empty-copy">所选窗口内基金、债券指数与中证800共同样本不足，暂不输出评价指标。</p></article>';
  const recovered = Number.isFinite(value.recoveryDays) ? `${value.recoveryDays}天` : "尚未修复";
  const dimensions = [
    ["01", "收益能力", "关注主动收益的持续性和效率", [
      metric("滚动胜率", pct(value.rollingWinRate, 1), `${value.rollingSamples}个滚动窗口`),
      metric("Jensen's Alpha", pct(value.jensenAlpha, 2, true), "中证800 · 年化"),
      metric("信息比率", num(value.informationRatio, 2), "相对80/20透明代理"),
    ]],
    ["02", "风控能力", "同时观察损失深度、下行波动与修复效率", [
      metric("最大回撤", pct(value.maxDrawdown, 2), `${value.start}—${value.end}`),
      metric("下行标准差", pct(value.downsideDeviation, 2), "周频年化"),
      metric("修复天数", recovered, value.recoveryDate ? `修复于${value.recoveryDate}` : "截至窗口终点"),
    ]],
    ["03", "策略稳定性", "识别权益风险暴露、漂移与集中度", [
      metric("权益Beta", num(value.equityBeta, 3), "相对中证800"),
      metric("Beta波动率", num(value.betaVolatility, 3), `${value.betaSamples}个26周窗口`),
      metric("前十大持股HHI", num(value.hhi, 4), value.hhiDate || "暂无披露"),
    ]],
    ["04", "市场适应性", "衡量上涨参与、下跌防御和非线性收益效率", [
      metric("上涨捕获率", pct(value.upCapture, 1), "中证800上涨周"),
      metric("下跌捕获率", pct(value.downCapture, 1), "中证800下跌周"),
      metric("捕获比率", num(value.captureRatio, 2), "上涨捕获/下跌捕获"),
    ]],
  ];
  const managerChecks = [
    ["核心人物 · 从业年限", (fund.manager || []).join("、") || "经理姓名缺失", "需补履历与从业起点"],
    ["核心人物 · 产品评价", "已有基金历史业绩", "仍需同策略产品与决策归属证据"],
    ["团队与协作 · 团队稳定性", "待尽调", "需成员、变更和分工记录"],
    ["团队与协作 · 协作模式", "待尽调", "需投委会、风控与流程材料"],
    ["公司平台 · 实力与文化", fund.fund_company || "公司字段缺失", "公司名称不等于平台能力结论"],
    ["公司平台 · 产品与资源倾斜", "待尽调", "需产品定位与资源投入证据"],
  ].map(([item, status, boundary]) => [escapeHTML(item), `<strong>${escapeHTML(status)}</strong>`, escapeHTML(boundary)]);
  return `
    <div class="evaluation-audit-strip"><span>评价区间 ${escapeHTML(value.start)}—${escapeHTML(value.end)}</span><span>${value.observations}个周频共同观测</span><span>12项量化指标中 ${[value.rollingWinRate, value.jensenAlpha, value.informationRatio, value.maxDrawdown, value.downsideDeviation, value.equityBeta, value.betaVolatility, value.hhi, value.upCapture, value.downCapture, value.captureRatio].filter(Number.isFinite).length + (value.recoveryDate || !Number.isFinite(value.recoveryDays) ? 1 : 0)} 项可解释</span></div>
    <div class="evaluation-dimension-grid">${dimensions.map(([index, name, summary, metrics]) => `<article class="evaluation-dimension-card"><div><span>${index}</span><h3>${name}</h3><p>${summary}</p></div><section class="research-metric-grid metric-three">${metrics.join("")}</section></article>`).join("")}</div>
    <article class="subpanel evaluation-management"><div class="subpanel-heading"><div><h3>05 · 管理能力（定性尽调）</h3><span>不从收益、规模或公司名称反推能力，不计入量化总分</span></div></div>${renderTable(["观察项", "当前可见信息", "仍需证据"], managerChecks)}</article>
    <article class="subpanel"><div class="subpanel-heading"><div><h3>方法与代理口径</h3><span>复现指标框架，不照搬对方页面结论</span></div></div><div class="evaluation-method-grid"><p><strong>同类代理</strong><span>80%中债新综合财富(总值)指数 + 20%中证800，按周收益合成；用于滚动胜率和信息比率。</span></p><p><strong>权益市场因子</strong><span>中证800，用于Jensen's Alpha、权益Beta及上下行捕获。</span></p><p><strong>持仓集中度</strong><span>最新季度真实前十大持股占基金净值权重平方和；季度披露并不代表实时组合。</span></p><p><strong>不做综合打分</strong><span>研报本篇只给出指标选取，没有统一权重；页面因此保留原始指标，不制造总分或排名。</span></p></div></article>`;
}

function genericHybridBondEvaluationPanel(fund, detail, holdingHistory) {
  return `
    <div class="panel-intro"><div><p class="eyebrow">FIVE-DIMENSION PROFILE</p><h2>固收+五维评价</h2></div><div class="evaluation-window-control"><label for="hybrid-evaluation-window">评价窗口</label><select id="hybrid-evaluation-window"><option value="1">近1年</option><option value="3" selected>近3年</option><option value="5">近5年</option></select></div></div>
    <p class="method-note evaluation-lead">参考“收益能力—风控能力—策略稳定性—市场适应性—管理能力”框架。量化部分直接使用本基金真实净值、公共指数与披露持仓；管理能力保留尽调边界。</p>
    <div id="hybrid-evaluation-output">${renderHybridBondEvaluationWindow(fund, detail, holdingHistory, 3)}</div>`;
}

function bindHybridBondEvaluation(fund, detail, holdingHistory) {
  const select = document.querySelector("#hybrid-evaluation-window");
  const output = document.querySelector("#hybrid-evaluation-output");
  if (!select || !output) return;
  select.addEventListener("change", () => {
    output.innerHTML = renderHybridBondEvaluationWindow(fund, detail, holdingHistory, Number(select.value));
  });
}

function holdingValuation(period) {
  const holdings = period?.holdings || [];
  const valid = holdings.filter((item) => Number(item.weight) > 0 && item.characteristics);
  const weighted = (key, predicate = (value) => Number.isFinite(value)) => {
    const rows = valid.map((item) => [Number(item.weight), Number(item.characteristics?.[key])]).filter(([, value]) => predicate(value));
    const total = rows.reduce((sum, [weight]) => sum + weight, 0);
    return total > 0 ? rows.reduce((sum, [weight, value]) => sum + weight * value, 0) / total : null;
  };
  const peRows = valid.map((item) => [Number(item.weight), Number(item.characteristics?.pe_ttm)]).filter(([, value]) => Number.isFinite(value) && value > 0);
  const peWeight = peRows.reduce((sum, [weight]) => sum + weight, 0);
  const peValues = peRows.map(([, value]) => value).sort((left, right) => left - right);
  return {
    reportDate: period?.report_date,
    valid: peRows.length,
    total: holdings.length,
    weightedPe: peWeight ? peRows.reduce((sum, [weight, value]) => sum + weight * value, 0) / peWeight : null,
    harmonicPe: peWeight ? peWeight / peRows.reduce((sum, [weight, value]) => sum + weight / value, 0) : null,
    cappedPe: peWeight ? peRows.reduce((sum, [weight, value]) => sum + weight * Math.min(value, 100), 0) / peWeight : null,
    medianPe: peValues.length ? peValues[Math.floor(peValues.length / 2)] : null,
    weightedPb: weighted("pb_mrq", (value) => Number.isFinite(value) && value > 0),
    weightedRoe: weighted("roe_ttm"),
  };
}

function holdingConcentration(period) {
  const weights = (period?.holdings || []).map((item) => Number(item.weight) || 0).sort((left, right) => right - left);
  const sum = (count) => weights.slice(0, count).reduce((total, value) => total + value, 0);
  return { top10: sum(10), top20: sum(20), total: sum(weights.length), count: weights.length };
}

const PURE_BOND_DURATION_BENCHMARKS = [
  ["CBA00101.CS", "总值"],
  ["CBA00111.CS", "1年以下"],
  ["CBA00121.CS", "1-3年"],
  ["CBA00131.CS", "3-5年"],
  ["CBA00141.CS", "5-7年"],
  ["CBA00151.CS", "7-10年"],
  ["CBA00161.CS", "10年以上"],
];

const HYBRID_BOND_EQUITY_BENCHMARKS = [
  ["000300.SH", "沪深300"],
  ["000905.SH", "中证500"],
  ["000906.SH", "中证800"],
];

function matchedPureBondBenchmark(duration) {
  if (!Number.isFinite(Number(duration))) return "CBA00101.CS";
  if (duration < 1) return "CBA00111.CS";
  if (duration < 3) return "CBA00121.CS";
  if (duration < 5) return "CBA00131.CS";
  if (duration < 7) return "CBA00141.CS";
  if (duration < 10) return "CBA00151.CS";
  return "CBA00161.CS";
}

function pureBondComparisonPoints(detail, benchmarkCode) {
  const fundPoints = genericFundNavPoints(detail);
  const benchmark = window.FUND_COMMON_BENCHMARKS?.benchmarks?.[benchmarkCode];
  if (fundPoints.length < 2 || !benchmark?.series?.length) return [];
  const benchmarkMap = new Map(benchmark.series.map(([date, value]) => [date, Number(value)]));
  let aligned = fundPoints
    .filter((point) => Number.isFinite(benchmarkMap.get(point.date)))
    .map((point) => ({ date: point.date, fund: point.fund, benchmark: benchmarkMap.get(point.date) }));
  if (aligned.length < 2) {
    const monthlyFund = new Map();
    const monthlyBenchmark = new Map();
    fundPoints.forEach((point) => monthlyFund.set(point.date.slice(0, 7), point));
    benchmark.series.forEach(([date, value]) => monthlyBenchmark.set(date.slice(0, 7), { date, value: Number(value) }));
    aligned = [...monthlyFund].filter(([month]) => monthlyBenchmark.has(month)).map(([month, point]) => ({
      date: point.date,
      fund: point.fund,
      benchmark: monthlyBenchmark.get(month).value,
    }));
  }
  return rebaseNavPoints(aligned);
}

function renderPureBondComparisonChart(points, fundName, benchmarkName) {
  const series = (points || []).map((point) => ({
    report_date: point.date,
    fund_return: Number(point.fund) - 1,
    benchmark_return: Number(point.benchmark) - 1,
  }));
  return renderMiniLineChart(series, [
    { key: "fund_return", label: `${fundName}累计收益`, color: "#0a7c78", width: 3.2 },
    { key: "benchmark_return", label: benchmarkName, color: "#c69a4b", width: 2.5 },
  ], `${fundName}与${benchmarkName}累计收益对比`);
}

function genericPureBondIndexComparison(fund, detail) {
  const duration = detail?.duration_history?.at(-1)?.duration ?? fund.duration?.value;
  const selected = matchedPureBondBenchmark(duration);
  const benchmarkCandidates = fund.category === "hybrid-bond"
    ? [...PURE_BOND_DURATION_BENCHMARKS, ...HYBRID_BOND_EQUITY_BENCHMARKS]
    : PURE_BOND_DURATION_BENCHMARKS;
  const available = benchmarkCandidates.filter(([code]) => window.FUND_COMMON_BENCHMARKS?.benchmarks?.[code]);
  if (!available.length) return "";
  const benchmark = window.FUND_COMMON_BENCHMARKS.benchmarks[selected] || window.FUND_COMMON_BENCHMARKS.benchmarks[available[0][0]];
  const code = window.FUND_COMMON_BENCHMARKS.benchmarks[selected] ? selected : available[0][0];
  const points = pureBondComparisonPoints(detail, code);
  const maxIndex = Math.max(points.length - 1, 1);
  return `
    <article class="subpanel chart-subpanel pure-bond-index-panel">
      <div class="subpanel-heading"><div><h3>指数对比</h3><span>${fund.category === "hybrid-bond" ? "债券期限指数 + 权益宽基（可切换）" : "vs 中债新综合财富指数（按久期匹配期限档）"}</span></div><button type="button" class="text-button" id="pure-bond-index-reset">重置缩放</button></div>
      <label class="pure-bond-index-select"><span class="sr-only">期限档</span><select id="pure-bond-index-select">${available.map(([value, label]) => `<option value="${value}"${value === code ? " selected" : ""}>${escapeHTML(label)}</option>`).join("")}</select></label>
      <div id="pure-bond-index-output">${points.length ? renderPureBondComparisonChart(points, fund.name, benchmark.name) : '<p class="empty-copy">基金与期限指数共同日期不足。</p>'}</div>
      <div class="dual-range-control" id="pure-bond-index-range" style="--range-start:0%;--range-end:100%">
        <div class="dual-range-track"><span></span></div>
        <input type="range" class="dual-range-start" min="0" max="${maxIndex}" value="0" aria-label="指数对比起始日期">
        <input type="range" class="dual-range-end" min="0" max="${maxIndex}" value="${maxIndex}" aria-label="指数对比结束日期">
        <div class="dual-range-labels"><span>${escapeHTML(points[0]?.date || "—")}</span><small>拖动横条中段可平移，拖动两端可缩放</small><span>${escapeHTML(points.at(-1)?.date || "—")}</span></div>
      </div>
      <p id="pure-bond-index-note" class="method-note">默认按最新久期${Number.isFinite(Number(duration)) ? `（${num(duration, 2)}年）` : "缺失时使用总值"}匹配债券期限档；${fund.category === "hybrid-bond" ? "可切换权益宽基观察含权风险，" : ""}基金与指数在共同起点归一化，债券财富指数包含票息再投资。</p>
    </article>`;
}

function bindPureBondIndexComparison(fund, detail) {
  const select = document.querySelector("#pure-bond-index-select");
  const output = document.querySelector("#pure-bond-index-output");
  const range = document.querySelector("#pure-bond-index-range");
  const startInput = range?.querySelector(".dual-range-start");
  const endInput = range?.querySelector(".dual-range-end");
  const selectedTrack = range?.querySelector(".dual-range-track span");
  const labels = range?.querySelectorAll(".dual-range-labels > span");
  const reset = document.querySelector("#pure-bond-index-reset");
  const note = document.querySelector("#pure-bond-index-note");
  if (!select || !output || !range || !startInput || !endInput) return;
  let points = [];
  let benchmarkName = "";
  const updateRangeStyle = () => {
    const max = Math.max(Number(endInput.max), 1);
    range.style.setProperty("--range-start", `${Number(startInput.value) / max * 100}%`);
    range.style.setProperty("--range-end", `${Number(endInput.value) / max * 100}%`);
    if (labels?.length === 2 && points.length) {
      labels[0].textContent = points[Number(startInput.value)]?.date || "—";
      labels[1].textContent = points[Number(endInput.value)]?.date || "—";
    }
  };
  const drawWindow = () => {
    if (!points.length) {
      output.innerHTML = '<p class="empty-copy">基金与该指数共同日期不足。</p>';
      return;
    }
    const start = Math.min(Number(startInput.value), points.length - 2);
    const end = Math.max(Number(endInput.value), start + 1);
    const selected = points.slice(start, end + 1);
    output.innerHTML = renderPureBondComparisonChart(selected, fund.name, benchmarkName);
    updateRangeStyle();
    bindMiniLineCharts();
  };
  const resetRange = () => {
    const max = Math.max(points.length - 1, 1);
    startInput.max = max;
    endInput.max = max;
    startInput.value = 0;
    endInput.value = max;
    drawWindow();
  };
  const loadIndex = () => {
    const benchmark = window.FUND_COMMON_BENCHMARKS?.benchmarks?.[select.value];
    points = pureBondComparisonPoints(detail, select.value);
    benchmarkName = benchmark?.name || select.value;
    if (note) note.textContent = `默认按基金最新久期自动匹配期限档；当前显示「${select.options[select.selectedIndex]?.text || select.value}」。指数累计收益已按基金成立日重新起算基期。`;
    resetRange();
  };
  startInput.addEventListener("input", () => {
    if (Number(startInput.value) >= Number(endInput.value)) startInput.value = Math.max(0, Number(endInput.value) - 1);
    drawWindow();
  });
  endInput.addEventListener("input", () => {
    if (Number(endInput.value) <= Number(startInput.value)) endInput.value = Math.min(Number(endInput.max), Number(startInput.value) + 1);
    drawWindow();
  });
  selectedTrack?.addEventListener("pointerdown", (event) => {
    const bounds = range.querySelector(".dual-range-track").getBoundingClientRect();
    const initialX = event.clientX;
    const initialStart = Number(startInput.value);
    const initialEnd = Number(endInput.value);
    const width = initialEnd - initialStart;
    const max = Number(endInput.max);
    selectedTrack.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const shift = Math.round((moveEvent.clientX - initialX) / Math.max(bounds.width, 1) * max);
      const nextStart = Math.max(0, Math.min(max - width, initialStart + shift));
      startInput.value = nextStart;
      endInput.value = nextStart + width;
      drawWindow();
    };
    const stop = () => {
      selectedTrack.removeEventListener("pointermove", move);
      selectedTrack.removeEventListener("pointerup", stop);
      selectedTrack.removeEventListener("pointercancel", stop);
    };
    selectedTrack.addEventListener("pointermove", move);
    selectedTrack.addEventListener("pointerup", stop);
    selectedTrack.addEventListener("pointercancel", stop);
  });
  select.addEventListener("change", loadIndex);
  reset?.addEventListener("click", resetRange);
  loadIndex();
}

function chartExtent(values, reference = null) {
  const finiteValues = values.map(Number).filter(Number.isFinite);
  if (Number.isFinite(Number(reference))) finiteValues.push(Number(reference));
  if (!finiteValues.length) return [0, 1];
  const rawMin = Math.min(...finiteValues);
  const rawMax = Math.max(...finiteValues);
  const padding = Math.max((rawMax - rawMin) * 0.12, Math.abs(rawMax || 1) * 0.03, 0.01);
  return [rawMin - padding, rawMax + padding];
}

function renderPureBondTripleAxisChart(leverageHistory, durationHistory, yieldHistory) {
  const series = [
    { id: "leverage", label: "杠杆率", color: "#102c45", format: "leverage", values: leverageHistory, key: "leverage" },
    { id: "duration", label: "修正久期", color: "#c69a4b", format: "years", values: durationHistory, key: "duration" },
    { id: "yield", label: "10年期国债到期收益率", color: "#0a7c78", format: "percent-point", values: yieldHistory, key: "yield10" },
  ].filter((item) => item.values?.length);
  if (series.length < 2) return '<p class="empty-copy">杠杆、久期与国债收益率共同历史不足。</p>';
  const allDates = series.flatMap((item) => item.values.map((value) => value.report_date)).sort();
  const minTime = new Date(allDates[0]).getTime();
  const maxTime = new Date(allDates.at(-1)).getTime();
  if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || minTime === maxTime) return '<p class="empty-copy">时间序列不足。</p>';
  const width = 1040;
  const height = 390;
  const margin = { top: 34, right: 170, bottom: 52, left: 70 };
  const plotRight = width - margin.right;
  const plotBottom = height - margin.bottom;
  const x = (date) => margin.left + (new Date(date).getTime() - minTime) / (maxTime - minTime) * (plotRight - margin.left);
  const ranges = {
    leverage: chartExtent(leverageHistory.map((item) => item.leverage), 1),
    duration: chartExtent(durationHistory.map((item) => item.duration)),
    yield: chartExtent(yieldHistory.map((item) => item.yield10)),
  };
  const y = (id, value) => margin.top + (ranges[id][1] - Number(value)) / Math.max(ranges[id][1] - ranges[id][0], 0.0001) * (plotBottom - margin.top);
  const ticks = Array.from({ length: 5 }, (_, index) => index / 4);
  const axisValue = (id, ratio) => ranges[id][1] - ratio * (ranges[id][1] - ranges[id][0]);
  const tickLabel = (id, value) => id === "leverage" ? `${num(value, 2)}x` : id === "duration" ? `${num(value, 2)}年` : `${num(value, 2)}%`;
  const timeTicks = Array.from({ length: 7 }, (_, index) => minTime + index / 6 * (maxTime - minTime));
  const pointGroups = series.flatMap((item) => item.values.map((value) => {
    const px = x(value.report_date);
    const py = y(item.id, value[item.key]);
    return `<g class="triple-axis-point" data-series="${item.id}" data-label="${escapeHTML(item.label)}" data-format="${item.format}" data-date="${escapeHTML(value.report_date)}" data-value="${Number(value[item.key])}" data-x="${px.toFixed(2)}" data-y="${py.toFixed(2)}"></g>`;
  })).join("");
  return `
    <div class="mini-chart-legend triple-axis-legend">${series.map((item) => `<span style="--line-color:${item.color}">${escapeHTML(item.label)}</span>`).join("")}</div>
    <div class="triple-axis-chart-wrap">
      <svg class="triple-axis-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="杠杆、久期与10年期国债到期收益率三轴联合图">
        ${ticks.map((ratio) => {
          const py = margin.top + ratio * (plotBottom - margin.top);
          return `<line x1="${margin.left}" y1="${py}" x2="${plotRight}" y2="${py}" class="chart-grid-line"/><text x="${margin.left - 10}" y="${py + 4}" class="chart-axis-label triple-axis-leverage-label" text-anchor="end">${tickLabel("leverage", axisValue("leverage", ratio))}</text>${durationHistory.length ? `<text x="${plotRight + 12}" y="${py + 4}" class="chart-axis-label triple-axis-duration-label">${tickLabel("duration", axisValue("duration", ratio))}</text>` : ""}<text x="${width - 8}" y="${py + 4}" class="chart-axis-label triple-axis-yield-label" text-anchor="end">${tickLabel("yield", axisValue("yield", ratio))}</text>`;
        }).join("")}
        ${ranges.leverage[0] <= 1 && ranges.leverage[1] >= 1 ? `<line x1="${margin.left}" y1="${y("leverage", 1)}" x2="${plotRight}" y2="${y("leverage", 1)}" class="triple-axis-reference"/>` : ""}
        ${series.map((item) => `<polyline points="${item.values.map((value) => `${x(value.report_date).toFixed(1)},${y(item.id, value[item.key]).toFixed(1)}`).join(" ")}" class="chart-line" style="stroke:${item.color};stroke-width:${item.id === "yield" ? 2.7 : 3}"/>`).join("")}
        ${timeTicks.map((time, index) => `<text x="${margin.left + index / 6 * (plotRight - margin.left)}" y="${height - 15}" class="chart-axis-label" text-anchor="${index === 0 ? "start" : index === 6 ? "end" : "middle"}">${new Date(time).getUTCFullYear()}</text>`).join("")}
        ${pointGroups}
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${plotBottom}" class="triple-axis-crosshair" hidden/>
        ${series.map((item) => `<circle r="4.5" class="triple-axis-hover-dot" data-series="${item.id}" style="stroke:${item.color}" hidden/>`).join("")}
        <rect x="${margin.left}" y="${margin.top}" width="${plotRight - margin.left}" height="${plotBottom - margin.top}" class="triple-axis-hover-target"/>
      </svg>
      <div class="triple-axis-hover-card" hidden></div>
    </div>`;
}

function bindPureBondTripleAxisCharts() {
  document.querySelectorAll(".triple-axis-chart-wrap").forEach((wrap) => {
    if (wrap.dataset.hoverBound === "true") return;
    const svg = wrap.querySelector(".triple-axis-chart");
    const target = svg?.querySelector(".triple-axis-hover-target");
    const crosshair = svg?.querySelector(".triple-axis-crosshair");
    const dots = [...(svg?.querySelectorAll(".triple-axis-hover-dot") || [])];
    const card = wrap.querySelector(".triple-axis-hover-card");
    const points = [...(svg?.querySelectorAll(".triple-axis-point") || [])].map((point) => ({
      series: point.dataset.series,
      label: point.dataset.label,
      format: point.dataset.format,
      date: point.dataset.date,
      value: Number(point.dataset.value),
      x: Number(point.dataset.x),
      y: Number(point.dataset.y),
    }));
    if (!svg || !target || !crosshair || !card || !points.length) return;
    const width = 1040;
    const margin = { left: 70, right: 170 };
    const setVisible = (visible) => [crosshair, card, ...dots].forEach((item) => visible ? item.removeAttribute("hidden") : item.setAttribute("hidden", ""));
    const update = (event) => {
      const bounds = svg.getBoundingClientRect();
      const rawX = Math.min(width - margin.right, Math.max(margin.left, (event.clientX - bounds.left) / bounds.width * width));
      const nearest = [...new Set(points.map((point) => point.series))].map((seriesId) => points.filter((point) => point.series === seriesId).reduce((best, point) => Math.abs(point.x - rawX) < Math.abs(best.x - rawX) ? point : best));
      crosshair.setAttribute("x1", rawX);
      crosshair.setAttribute("x2", rawX);
      dots.forEach((dot) => {
        const point = nearest.find((item) => item.series === dot.dataset.series);
        if (!point) return dot.setAttribute("hidden", "");
        dot.removeAttribute("hidden");
        dot.setAttribute("cx", point.x);
        dot.setAttribute("cy", point.y);
      });
      const formatValue = (point) => point.format === "leverage" ? `${num(point.value, 2)}x` : miniLineValue(point.value, point.format);
      card.innerHTML = nearest.map((point, index) => `${index === 0 ? `<strong>${escapeHTML(new Date((points.reduce((best, item) => Math.abs(item.x - rawX) < Math.abs(best.x - rawX) ? item : best)).date).toISOString().slice(0, 10))}</strong>` : ""}<span>${escapeHTML(point.label)}：${formatValue(point)} <small>${escapeHTML(point.date)}</small></span>`).join("");
      card.style.left = `${Math.min(Math.max(rawX / width * 100, 18), 82)}%`;
      setVisible(true);
    };
    target.addEventListener("pointermove", update);
    target.addEventListener("pointerdown", update);
    target.addEventListener("pointerleave", () => setVisible(false));
    wrap.dataset.hoverBound = "true";
  });
}

function pureBondChangeSummary(label, series, key, valueFormat, description) {
  const latest = series.at(-1);
  const previous = series.at(-2);
  if (!latest) return `<p><strong>${escapeHTML(label)}</strong><span>${escapeHTML(description)} · 暂无可用历史</span></p>`;
  const value = Number(latest[key]);
  const change = previous ? value - Number(previous[key]) : null;
  const formattedValue = valueFormat === "leverage" ? `${num(value, 2)}x` : `${num(value, 2)}年`;
  const formattedChange = change === null ? "" : ` <b class="${change >= 0 ? "value-positive" : "value-negative"}">${change >= 0 ? "▲" : "▼"}${valueFormat === "leverage" ? `${num(Math.abs(change), 2)}x` : `${num(Math.abs(change), 2)}年`}</b> <small>（较${escapeHTML(previous.report_date)}）</small>`;
  return `<p><strong>${escapeHTML(label)}</strong><span>${escapeHTML(description)} · ${escapeHTML(label)} ${formattedValue}${formattedChange}</span></p>`;
}

function genericNavChartPoints(fund, detail) {
  if (!detail?.nav?.length) return [];
  const benchmark = genericBenchmark(fund, detail);
  const benchmarkMap = new Map((benchmark.series || []).map(([date, value]) => [date, Number(value)]));
  const rows = detail.nav
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0)
    .map(([date, value]) => ({
      date,
      fund: Number(value),
      benchmark: Number.isFinite(benchmarkMap.get(date)) ? benchmarkMap.get(date) : null,
    }));
  const firstCommonIndex = rows.findIndex((item) => Number.isFinite(Number(item.benchmark)) && Number(item.benchmark) > 0);
  return firstCommonIndex >= 0 ? rows.slice(firstCommonIndex) : [];
}

function genericPerformancePanel(fund, detail, brinson) {
  const performance = fund.performance || {};
  const navPoints = genericFundNavPoints(detail);
  const horizonRows = genericRiskStatsRows(navPoints);
  const calendarRows = genericCalendarRiskRows(navPoints);
  const relative = fund.category === "index-enhanced";
  const chartPoints = genericNavChartPoints(fund, detail);
  const benchmark = genericBenchmark(fund, detail);
  const relativeMetrics = window.INDEX_ENHANCED_METRICS?.funds?.[fund.code] || fund.relative_metrics || {};
  const relativeRows = Object.entries({ "1m": "近1月", "3m": "近3月", "6m": "近6月", "1y": "近1年", "3y": "近3年", "5y": "近5年", ytd: "今年以来" }).map(([key, label]) => [
    escapeHTML(label),
    pct(relativeMetrics.fund_returns?.[key], 2, true),
    pct(relativeMetrics.benchmark_returns?.[key], 2, true),
    `<strong class="${Number(relativeMetrics.excess_returns?.[key]) < 0 ? "value-negative" : "value-positive"}">${pct(relativeMetrics.excess_returns?.[key], 2, true)}</strong>`,
    pct(relativeMetrics.excess_drawdowns?.[key], 2),
  ]);
  const excessPoints = chartPoints
    .filter((point) => point.benchmark !== null && Number.isFinite(Number(point.benchmark)) && Number(point.benchmark) > 0)
    .map((point) => ({ date: point.date, fund: point.fund / point.benchmark }));
  const excessCalendarRows = genericCalendarRiskRows(excessPoints).map((row) => row.slice(0, 5));
  const activeMetrics = fund.category === "active-equity" ? activeEquityPerformance(detail) : null;
  const managerStart = brinson?.summary?.manager_start;
  const benchmarkLatest = (benchmark.series || []).filter(([, value]) => Number.isFinite(Number(value))).at(-1)?.[0] || "—";
  const contractBenchmark = fund.benchmark || "现有目录未记录";
  return `
    <div class="panel-intro"><div><p class="eyebrow">PERFORMANCE & DRAWDOWN</p><h2>${relative ? "基金表现与超额表现" : "业绩、风险与回撤"}</h2></div><div class="chart-controls" aria-label="净值区间"><button data-generic-nav-range="ytd">今年以来</button><button data-generic-nav-range="12">1年</button><button data-generic-nav-range="36">3年</button><button data-generic-nav-range="60">5年</button>${managerStart ? `<button data-generic-nav-range="manager" data-manager-start="${escapeHTML(managerStart)}">现任经理</button>` : ""}<button data-generic-nav-range="all" class="active">成立以来</button></div></div>
    <div class="calibration-note"><strong>基准口径</strong><p>基金合同业绩比较基准：${escapeHTML(contractBenchmark)}。<br>图中采用${escapeHTML(genericBenchmarkRole(fund))}：${escapeHTML(benchmark.name)}；用于横向研究与风险比较，不替代合同基准。</p></div>
    <div class="research-metric-grid metric-six" id="generic-performance-range-metrics" aria-live="polite">${renderPerformanceMetricCards("all", navPoints)}</div>
    <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>复权净值与回撤</h3><span>基金净值截至 ${escapeHTML(navPoints.at(-1)?.date || "—")} · 研究基准截至 ${escapeHTML(benchmarkLatest)}</span></div></div><div id="generic-nav-chart-output">${chartPoints.length ? renderZoomableNavChart(chartPoints, fund.name, benchmark.name) : '<p class="empty-copy">比较基准序列不足，暂显示下方收益回撤表。</p>'}</div><p class="method-note">两条序列从首个共同有效日分别归一化；若研究基准暂未更新到基金最新净值日，基金曲线仍继续展示，基准线停在自身最新日期。定开、暂停估值或源数据未披露的自然日不伪造数值。</p></article>
    <div class="performance-table-stack">
      <article class="subpanel performance-table-panel"><div class="subpanel-heading"><div><h3>分期限风险收益</h3><span>累计收益、波动、回撤与风险调整指标</span></div></div>${horizonRows.length ? renderTable(["区间", "累计收益", "年化收益", "年化波动", "最大回撤", "Sharpe", "Calmar"], horizonRows) : '<p class="empty-copy">净值历史不足，暂无法计算风险收益指标。</p>'}</article>
      <article class="subpanel performance-table-panel"><div class="subpanel-heading"><div><h3>全部自然年度风险收益</h3><span>按自然年度统计，最新年度为年初至今</span></div></div>${calendarRows.length ? renderTable(["年度", "年度收益", "年化收益", "年化波动", "最大回撤", "Sharpe", "Calmar"], calendarRows) : '<p class="empty-copy">年度净值历史不足。</p>'}</article>
    </div>
    <p class="method-note">Sharpe按无风险利率0计算；Calmar＝年化收益/最大回撤绝对值。全量详情使用日频有效净值估算波动和风险调整指标，频率按实际观察数年化。</p>
    <article class="subpanel"><div class="subpanel-heading"><div><h3>月度收益、年度回撤与修复</h3><span>红色为上涨、绿色为下跌；当年合计按已有月份复合</span></div></div>${renderMonthlyReturnHeatmap(monthlyReturnsFromNav(navPoints), navPoints)}</article>
    ${activeMetrics ? `<article class="subpanel"><div class="subpanel-heading"><div><h3>超额与风险调整指标</h3><span>近五年月度收益 · 统一以中证800为横向研究代理</span></div></div><section class="research-metric-grid metric-six">${metric("年化超额", pct(activeMetrics.annualizedExcess, 1, true))}${metric("跟踪误差", pct(activeMetrics.trackingError, 1))}${metric("信息比率", num(activeMetrics.informationRatio, 2))}${metric("月度超额胜率", pct(activeMetrics.winRate, 1))}${metric("上涨捕获", pct(activeMetrics.upCapture, 1))}${metric("下跌捕获", pct(activeMetrics.downCapture, 1))}${metric("年化波动率", pct(activeMetrics.volatility, 1))}${metric("下行波动率", pct(activeMetrics.downside, 1))}${metric("Sharpe", num(activeMetrics.sharpe, 2))}${metric("Sortino", num(activeMetrics.sortino, 2))}</section>${renderTable(["情景", "样本", "基金月均", "基准月均", "超额胜率"], activeMetrics.scenarios)}</article><p class="method-note">横向研究基准不替代基金合同业绩比较基准；上涨/下跌捕获以基准正负收益月份的平均收益比计算。</p>` : ""}
    ${["pure-bond", "hybrid-bond"].includes(fund.category) ? genericPureBondIndexComparison(fund, detail) : ""}
    ${relative ? `<article class="subpanel"><div class="subpanel-heading"><div><h3>相对跟踪指数表现</h3><span>${escapeHTML(fund.tracking_index || "待确认")} · 对齐日收益</span></div></div><section class="research-metric-grid metric-four">${metric("跟踪误差", pct(relativeMetrics.tracking_error, 2), "近1年日频年化")}${metric("信息比率", Number.isFinite(Number(relativeMetrics.information_ratio)) ? num(relativeMetrics.information_ratio, 2) : "—")}${metric("共同样本", relativeMetrics.observations || "—")}${metric("数据状态", relativeMetrics.status || "待补")}</section>${renderTable(["区间", "基金收益", "指数收益", "超额收益", "超额最大回撤"], relativeRows)}${excessCalendarRows.length ? `<div class="subpanel-heading relative-calendar-heading"><div><h3>自然年度超额风险</h3><span>基金/跟踪指数相对财富曲线</span></div></div>${renderTable(["年度", "超额收益", "年化超额", "相对波动", "超额最大回撤"], excessCalendarRows)}` : ""}</article><p class="method-note">超额收益为基金区间收益减跟踪指数区间收益；超额回撤为基金/指数相对财富曲线最大回撤。Barra仍等待正式因子风险模型，不以本表替代。</p>` : ""}`;
}

function bindGenericPerformanceChart(points, fundName, benchmarkName, performancePoints = points) {
  const buttons = [...document.querySelectorAll("[data-generic-nav-range]")];
  const output = document.querySelector("#generic-nav-chart-output");
  if (!buttons.length || !output || performancePoints.length < 2) return;
  const draw = (range) => {
    const managerStart = buttons.find((button) => button.dataset.genericNavRange === "manager")?.dataset.managerStart;
    const selected = rebaseNavPoints(selectPerformanceRange(points, range, managerStart));
    const selectedPerformance = selectPerformanceRange(performancePoints, range, managerStart);
    const metrics = document.querySelector("#generic-performance-range-metrics");
    if (selected.length >= 2) output.innerHTML = renderZoomableNavChart(selected, fundName, benchmarkName);
    if (metrics) metrics.innerHTML = renderPerformanceMetricCards(range, selectedPerformance);
    if (selected.length >= 2) bindNavChartZoom(selected, fundName, benchmarkName, output);
  };
  buttons.forEach((button) => button.addEventListener("click", () => {
    buttons.forEach((item) => item.classList.toggle("active", item === button));
    draw(button.dataset.genericNavRange);
  }));
  draw("all");
}

function genericAssetPanel(fund, detail, holdingHistory) {
  const asset = fund.asset || {};
  const history = (detail?.asset_history || []).map((item) => ({
    report_date: item.date,
    announcement_date: item.announcement_date,
    net_asset: item.net_asset,
    stock_to_nav: item.stock,
    bond_to_nav: item.bond,
    cash_to_nav: item.cash,
    hk_stock_to_nav: item.hk_stock,
    fund_to_nav: item.fund,
    other_to_nav: item.other,
    leverage: item.leverage,
    convertible_bond_to_nav: item.convertible_bond,
  }));
  const allocation = [
    ["股票", asset.stock_weight],
    ["债券", asset.bond_weight],
    ["基金投资", asset.fund_weight],
    ["现金", asset.cash_weight],
    ["已披露其他", asset.other_weight],
  ].filter(([, value]) => Number.isFinite(Number(value)));
  const disclosedLatest = allocation.reduce((sum, [, value]) => sum + Number(value || 0), 0)
    + (Number(asset.buyback_sale_weight) || 0);
  const undisclosedLatest = Number.isFinite(Number(asset.leverage))
    ? Math.max(0, Number(asset.leverage) - disclosedLatest)
    : null;
  if (Number.isFinite(undisclosedLatest) && undisclosedLatest > 0.005) {
    allocation.push(["未披露/未分类分项", undisclosedLatest]);
  }
  const leverageHistory = history.filter((item) => Number.isFinite(Number(item.leverage)));
  const durationHistory = (detail?.duration_history || []).filter((item) => Number.isFinite(Number(item.duration))).map((item) => ({ report_date: item.date, duration: item.duration }));
  const firstReport = history[0]?.report_date;
  const yieldHistory = (window.FUND_COMMON_BENCHMARKS?.benchmarks?.["CGB10Y.YTM"]?.series || [])
    .filter(([date, value]) => (!firstReport || date >= firstReport) && Number.isFinite(Number(value)))
    .map(([date, value]) => ({ report_date: date, yield10: value }));
  const active = fund.category === "active-equity";
  const leverageDisclosure = asset.leverage_status === "extreme_reconciled"
    ? `<p class="method-note"><strong>特殊报告期：</strong>${escapeHTML(asset.leverage_note || "总资产/净资产显著放大，已完成基金级口径复核。")}</p>`
    : "";
  const allocationDisclosure = asset.allocation_status === "incomplete_components"
    ? `<p class="method-note"><strong>资产分项未闭合：</strong>已披露分项与总资产/净资产口径相差 ${pct(asset.allocation_gap, 1)}；差额只标为未披露/未分类分项，不模拟成基金投资。基金投资字段仅在源端明确披露时展示。</p>`
    : "";
  const disclosure = fund.asset_disclosure || {};
  const sourceDisclosure = disclosure.display_status === "stale_fallback"
    ? `<p class="method-note"><strong>资产数据日期：</strong>${escapeHTML(disclosure.target_report_date || "最新季度")}源端未返回有效基金级分项，当前沿用 ${escapeHTML(disclosure.current_report_date || asset.report_date || "旧报告期")} 的已披露数据。</p>`
    : disclosure.display_status === "missing"
    ? `<p class="method-note"><strong>资产数据缺失：</strong>${escapeHTML(disclosure.target_report_date || "最新季度")}源端未披露有效基金级资产数据，不以代表份额或差额伪造。</p>`
    : "";
  const quarterlyConcentration = (holdingHistory?.quarterly || []).map((period) => ({ report_date: period.report_date, top10_concentration: holdingConcentration(period).top10 }));
  const latestQuarterly = holdingConcentration(holdingHistory?.quarterly?.at(-1));
  const latestFull = holdingConcentration(holdingHistory?.full?.at(-1));
  return `
    <div class="panel-intro"><div><p class="eyebrow">ASSET ALLOCATION</p><h2>${active ? "资产配置与持股集中度" : "资产配置、杠杆与久期"}</h2></div><p>${active ? "观察季度资产分布、股票仓位及前十大/完整持仓两套集中度口径。" : "配置为报告期披露快照；杠杆按总资产/净资产计算，久期来自利率敏感性披露。"}</p></div>
    <section class="fund-page-metrics">${metric("配置报告期", asset.report_date || "—")}${metric("基金规模", money(asset.net_asset))}${active ? `${metric("股票仓位", pct(asset.stock_weight, 1))}${metric("港股仓位", pct(history.at(-1)?.hk_stock_to_nav, 1))}${metric("债券仓位", pct(asset.bond_weight, 1))}${metric("现金仓位", pct(asset.cash_weight, 1))}` : `${metric("杠杆", Number.isFinite(Number(asset.leverage)) ? `${num(asset.leverage, 2)}x` : "—", asset.leverage_status === "extreme_reconciled" ? "特殊报告期" : "总资产/净资产")}${metric("久期", Number.isFinite(Number(fund.duration?.value)) ? `${num(fund.duration.value, 2)}年` : "—", fund.duration?.report_date || "")}`}</section>
    ${leverageDisclosure}
    ${allocationDisclosure}${sourceDisclosure}
    <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>资产分布连续变化</h3><span>100%堆叠面积 · 每一期披露日期</span></div></div>${renderAssetAllocationAreaChart(history)}</article>
    ${fund.category === "pure-bond" ? `<article class="subpanel chart-subpanel pure-bond-triple-axis-panel">
      <div class="subpanel-heading"><div><h3>杠杆 · 久期 · 10年期国债到期收益率</h3></div></div>
      ${renderPureBondTripleAxisChart(leverageHistory, durationHistory, yieldHistory)}
      <div class="pure-bond-context-summary">
        ${pureBondChangeSummary("杠杆", leverageHistory, "leverage", "leverage", "总资产/净资产")}
        ${durationHistory.length ? pureBondChangeSummary("久期", durationHistory, "duration", "years", "利率冲击反推") : '<p><strong>久期</strong><span>该基金无利率敏感性数据，久期序列缺失</span></p>'}
        <p><strong>国债收益率</strong><span>宏观利率环境背景代理变量</span></p>
      </div>
    </article>` : ""}
    ${fund.category === "hybrid-bond" ? `<div class="research-grid two-column-grid hybrid-bond-asset-trends">
      <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>持股重仓集中度</h3><span>季度前十大合计占净值</span></div></div>${quarterlyConcentration.length ? renderMiniLineChart(quarterlyConcentration, [{ key: "top10_concentration", label: "前十大集中度", color: "#0b7774", width: 3 }], "季度前十大持股集中度") : '<p class="empty-copy">暂无季度股票持仓历史。</p>'}</article>
      <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>杠杆演变</h3><span>总资产 / 净资产</span></div></div>${leverageHistory.length ? renderMiniLineChart(leverageHistory, [{ key: "leverage", label: "杠杆率", color: "#17324d", width: 3 }], "基金杠杆率历史") : '<p class="empty-copy">暂无杠杆历史。</p>'}</article>
      <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>股票仓位演变</h3><span>占基金净值</span></div></div>${history.length ? renderMiniLineChart(history, [{ key: "stock_to_nav", label: "股票仓位", color: "#c5913d", width: 3 }], "股票仓位历史") : '<p class="empty-copy">暂无股票仓位历史。</p>'}</article>
      <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>久期时间序列</h3><span>利率敏感性披露反推</span></div></div>${durationHistory.length ? renderMiniLineChart(durationHistory, [{ key: "duration", label: "修正久期", color: "#6f7790", width: 3 }], "组合修正久期历史") : '<p class="empty-copy">暂无久期历史。</p>'}</article>
    </div>` : ""}
    ${active && holdingHistory ? `<article class="subpanel"><div class="subpanel-heading"><div><h3>持股重仓集中度</h3><span>季度前十大与半年报/年报完整持仓分别计算</span></div></div><section class="research-metric-grid metric-four">${metric("最新季度前十大", pct(latestQuarterly.top10, 1))}${metric("完整持仓前十大", pct(latestFull.top10, 1))}${metric("完整持仓前二十", pct(latestFull.top20, 1))}${metric("前二十以外长尾", pct(Math.max(0, latestFull.total - latestFull.top20), 1))}</section><p class="method-note">季度前十大用于高频跟踪；完整持仓只使用半年报/年报全部披露股票，两者不拼接。</p></article><article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>季度前十大集中度趋势</h3><span>占基金净值</span></div></div>${quarterlyConcentration.length ? renderMiniLineChart(quarterlyConcentration, [{ key: "top10_concentration", label: "前十大集中度", color: "#0b7774", width: 3 }], "季度前十大持仓集中度变化") : '<p class="empty-copy">暂无持仓集中度历史。</p>'}</article>` : ""}
    <article class="subpanel"><div class="subpanel-heading"><div><h3>最新资产分布</h3><span>按净资产比例；超过100%可能来自杠杆</span></div></div>${renderBarList(allocation)}</article>
    <article class="subpanel"><div class="subpanel-heading"><div><h3>${active ? "季度资产配置轨迹" : "历史配置、杠杆与久期"}</h3><span>最近二十个报告期</span></div></div>${active ? renderTable(["报告期", "规模", "股票", "港股", "债券", "基金投资", "现金", "公告日"], history.slice(-20).reverse().map((item) => [item.report_date, money(item.net_asset), pct(item.stock_to_nav, 1), pct(item.hk_stock_to_nav, 1), pct(item.bond_to_nav, 1), pct(item.fund_to_nav, 1), pct(item.cash_to_nav, 1), item.announcement_date || "—"])) : renderTable(["报告期", "规模", "股票", "债券", "基金投资", "现金", "转债", "杠杆", "久期"], history.slice(-20).reverse().map((item) => { const duration = (detail?.duration_history || []).find((value) => value.date === item.report_date); return [item.report_date, money(item.net_asset), pct(item.stock_to_nav, 1), pct(item.bond_to_nav, 1), pct(item.fund_to_nav, 1), pct(item.cash_to_nav, 1), pct(item.convertible_bond_to_nav, 1), Number.isFinite(Number(item.leverage)) ? `${num(item.leverage, 2)}x` : "—", Number.isFinite(Number(duration?.duration)) ? `${num(duration.duration, 2)}年` : "—"]; }))}</article>`;
}

function genericBondHistoryTable(period, compact = false) {
  if (!period?.holdings?.length) return '<p class="empty-copy">该报告期暂无重仓债券披露。</p>';
  if (compact) {
    const rows = period.holdings.map((holding) => [
      `<strong>${escapeHTML(holding.code)}</strong><small>${escapeHTML(holding.name)}</small>`,
      `<strong>${pct(holding.weight, 2)}</strong>`,
      holding.change === "新进" ? '<span class="status-pill entered">疑似新进</span>'
        : holding.change === "加仓" ? '<span class="status-pill added">加仓</span>'
        : holding.change === "减仓" ? '<span class="status-pill reduced">减仓</span>'
        : '<span class="status-pill unchanged">持平</span>',
    ]);
    const exited = (period.exited || []).map((item) => item.name).join("、");
    return `${renderTable(["债券代码", "市值占净值", "环比"], rows, "pure-bond-heavy-table")}${exited ? `<div class="bond-exit-note"><strong>本期退出披露：</strong>${escapeHTML(exited)}</div>` : ""}<p class="method-note">公告日 ${escapeHTML(period.announcement_date || "—")}；“疑似新进”仅表示上期重仓债券披露未见，不等于此前完全未持有。</p>`;
  }
  const rows = period.holdings.map((holding, index) => { const characteristic = window.FUND_BOND_CHARACTERISTICS?.bonds?.[holding.code] || {}; return [
    String(index + 1),
    `<strong>${escapeHTML(holding.name)}</strong><small>${escapeHTML(holding.code)}</small>`,
    money(holding.market_value),
    pct(holding.weight, 2),
    escapeHTML(characteristic.bond_rating || characteristic.issuer_rating || "—"),
    Number.isFinite(Number(characteristic.remaining_years)) ? `${num(characteristic.remaining_years, 2)}年` : "—",
    Number.isFinite(Number(characteristic.modified_duration)) ? num(characteristic.modified_duration, 2) : "—",
    holding.change === "新进" ? '<span class="status-pill entered">新进</span>'
      : holding.change === "加仓" ? '<span class="status-pill added">加仓</span>'
      : holding.change === "减仓" ? '<span class="status-pill reduced">减仓</span>'
      : '<span class="status-pill unchanged">持平</span>',
  ]; });
  const exited = (period.exited || []).map((item) => item.name).join("、");
  return `${renderTable(["序号", "债券", "市值", "占净值", "最新评级", "剩余期限", "修正久期", "相对上期"], rows, "holdings-table-wrap full-holdings-scroll")}${exited ? `<div class="bond-exit-note"><strong>退出本期披露：</strong>${escapeHTML(exited)}</div>` : ""}<p class="method-note">公告日 ${escapeHTML(period.announcement_date || "—")}；加减仓按占净值比例较上期变化判断。评级、剩余期限和修正久期为最新Choice快照，并非历史报告期回溯值；退出仅表示本期不再列入重仓债券披露。</p>`;
}

function bondStructurePoint(item) {
  const government = Math.max(0, Number(item.government_bond) || 0);
  const financial = Math.max(0, Number(item.financial_bond) || 0);
  const corporate = Math.max(0, Number(item.corporate_bond) || 0);
  const convertible = Math.max(0, Number(item.convertible_bond) || 0);
  const total = Math.max(0, Number(item.bond_total) || government + financial + corporate + convertible + (Number(item.abs) || 0));
  const other = Math.max(0, total - government - financial - corporate - convertible);
  return { report_date: item.report_date, government, financial, corporate, convertible, other };
}

function renderBondStructureAreaChart(history = []) {
  if (history.length < 2) return '<p class="empty-copy">券种结构历史不足。</p>';
  const data = history.map(bondStructurePoint);
  const layers = [
    { key: "government", label: "国债及政府债", color: "#102c45", className: "bond-area-government" },
    { key: "financial", label: "金融债", color: "#0a7c78", className: "bond-area-financial" },
    { key: "corporate", label: "企业债", color: "#c69a4b", className: "bond-area-corporate" },
    { key: "convertible", label: "可转债", color: "#78a99e", className: "bond-area-convertible" },
    { key: "other", label: "其他券种", color: "#b7c0c5", className: "bond-area-other" },
  ];
  const totals = data.map((item) => layers.reduce((sum, layer) => sum + item[layer.key], 0));
  const max = Math.max(...totals, 1) * 1.06;
  const width = 900;
  const height = 300;
  const margin = { top: 24, right: 24, bottom: 42, left: 54 };
  const plotBottom = height - margin.bottom;
  const x = (index) => margin.left + index / Math.max(data.length - 1, 1) * (width - margin.left - margin.right);
  const y = (value) => margin.top + (max - value) / max * (plotBottom - margin.top);
  let lower = data.map(() => 0);
  const areas = layers.map((layer) => {
    const upper = data.map((item, index) => lower[index] + item[layer.key]);
    const polygon = [...upper.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`), ...lower.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).reverse()].join(" ");
    lower = upper;
    return `<polygon points="${polygon}" class="bond-structure-area ${layer.className}"/>`;
  }).join("");
  const ticks = Array.from({ length: 5 }, (_, index) => max * (4 - index) / 4);
  const dateIndexes = chartTickIndexes(data.length, 7);
  const latest = data.at(-1);
  return `
    <div class="mini-chart-legend">${layers.map((layer) => `<span style="--line-color:${layer.color}">${layer.label}</span>`).join("")}</div>
    <div class="nav-chart-wrap mini-line-chart-wrap bond-structure-chart-wrap"><svg class="nav-chart mini-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="券种分布连续变化" data-min="0" data-max="${max}" data-labels="${layers.map((layer) => layer.label).join("|")}">
      ${ticks.map((tick) => `<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" class="chart-grid-line"/><text x="${margin.left - 9}" y="${y(tick) + 4}" class="chart-axis-label" text-anchor="end">${pct(tick, 0)}</text>`).join("")}
      ${areas}
      ${dateIndexes.map((index) => `<text x="${x(index)}" y="${height - 13}" class="chart-axis-label chart-axis-date" text-anchor="${index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}">${escapeHTML(data[index].report_date.slice(0, 7))}</text>`).join("")}
      ${data.map((item, index) => `<g class="mini-line-data" data-date="${escapeHTML(item.report_date)}" data-values="${layers.map((layer) => item[layer.key]).join("|")}" data-x="${x(index).toFixed(2)}"></g>`).join("")}
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${plotBottom}" class="mini-line-crosshair" hidden/>
      ${layers.map((layer) => `<circle r="4" class="mini-line-hover-dot" style="stroke:${layer.color}" hidden/>`).join("")}
      <rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${plotBottom - margin.top}" class="mini-line-hover-target"/>
    </svg><div class="mini-line-hover-card" data-formats="percent|percent|percent|percent|percent" hidden></div></div>
    <div class="bond-structure-summary">${layers.map((layer) => metric(layer.label, pct(latest[layer.key], 1))).join("")}</div>
    <p class="method-note">最新一期 ${escapeHTML(latest.report_date)}，券种结构按占净值比例展示；其他券种为债券合计减去已单列券种的反推补项。</p>`;
}

function genericBondPanel(fund, bondHistory, detail) {
  const structure = fund.asset?.bond_structure || {};
  const holdings = window.FUND_BOND_HOLDINGS?.funds?.[fund.code];
  const rows = [
    ["国债及政府债", structure.government],
    ["金融债", structure.financial],
    ["企业债", structure.corporate],
    ["可转换债券", structure.convertible],
    ["资产支持证券", structure.abs],
    ["其他债券", structure.other],
  ].filter(([, value]) => Number.isFinite(Number(value))).map(([label, value]) => [escapeHTML(label), pct(value, 2)]);
  const holdingRows = (holdings?.top_holdings || []).map((holding, index) => { const characteristic = window.FUND_BOND_CHARACTERISTICS?.bonds?.[holding.code] || {}; return [
    String(index + 1),
    `<strong>${escapeHTML(holding.name)}</strong><small>${escapeHTML(holding.code)}</small>`,
    money(holding.market_value),
    pct(holding.weight, 2),
    escapeHTML(characteristic.chinabond_level2 || characteristic.chinabond_level1 || characteristic.choice_level2 || characteristic.choice_level1 || "—"),
    escapeHTML(characteristic.bond_rating || characteristic.issuer_rating || "—"),
    Number.isFinite(Number(characteristic.remaining_years)) ? `${num(characteristic.remaining_years, 2)}年` : "—",
    Number.isFinite(Number(characteristic.modified_duration)) ? num(characteristic.modified_duration, 2) : "—",
  ]; });
  const convertible = window.FUND_CONVERTIBLE_CHARACTERISTICS?.funds?.[fund.code] || [];
  const convertibleRows = convertible.map((item, index) => [
    String(index + 1),
    `<strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.code)}</small>`,
    pct(item.weight, 2),
    `<strong>${escapeHTML(item.underlying_name)}</strong><small>${escapeHTML(item.underlying_code)}</small>`,
    item.conversion_price === null ? "—" : num(item.conversion_price, 2),
    item.conversion_premium_ratio === null ? "—" : `${num(item.conversion_premium_ratio, 1)}%`,
    item.bond_premium_ratio === null ? "—" : `${num(item.bond_premium_ratio, 1)}%`,
    num(item.underlying_pe_ttm, 1),
    num(item.underlying_pb_mrq, 1),
    item.underlying_volatility_12m === null ? "—" : `${num(item.underlying_volatility_12m, 1)}%`,
  ]);
  const convertibleWeighted = (key) => {
    const values = convertible.map((item) => [Number(item.weight), Number(item[key])]).filter(([weight, value]) => weight > 0 && Number.isFinite(value));
    const weight = values.reduce((sum, item) => sum + item[0], 0);
    return weight > 0 ? values.reduce((sum, item) => sum + item[0] * item[1], 0) / weight : null;
  };
  const structureHistory = (detail?.asset_history || []).map((item) => ({
    report_date: item.date,
    bond_total: item.bond,
    government_bond: item.government_bond,
    financial_bond: item.financial_bond,
    corporate_bond: item.corporate_bond,
    convertible_bond: item.convertible_bond,
    abs: item.abs,
  })).filter((item) => ["government_bond", "financial_bond", "corporate_bond", "convertible_bond", "abs"].some((key) => Number.isFinite(Number(item[key]))));
  const concentrationHistory = (bondHistory || []).map((period) => ({
    report_date: period.report_date,
    concentration: (period.holdings || []).slice(0, 5).reduce((sum, item) => sum + (Number(item.weight) || 0), 0),
  }));
  const turnoverRows = (bondHistory || []).slice().reverse().map((period) => [
    escapeHTML(period.report_date),
    String((period.holdings || []).filter((item) => item.change === "新进").length),
    String((period.holdings || []).filter((item) => item.change === "加仓").length),
    String((period.holdings || []).filter((item) => item.change === "减仓").length),
    String((period.exited || []).length),
  ]);
  const turnoverHistory = (bondHistory || []).map((period) => ({
    report_date: period.report_date,
    entered: (period.holdings || []).filter((item) => item.change === "新进").length,
    added: (period.holdings || []).filter((item) => item.change === "加仓").length,
    reduced: (period.holdings || []).filter((item) => item.change === "减仓").length,
    exited: (period.exited || []).length,
  }));
  const turnoverProxyHistory = (bondHistory || []).filter((period) =>
    period.turnover_proxy !== null && period.turnover_proxy !== undefined
    && period.rolling_4q_turnover_proxy !== null && period.rolling_4q_turnover_proxy !== undefined
    && Number.isFinite(Number(period.turnover_proxy))
    && Number.isFinite(Number(period.rolling_4q_turnover_proxy))
  ).map((period) => ({
    report_date: period.report_date,
    single: period.turnover_proxy,
    rolling4q: period.rolling_4q_turnover_proxy,
  }));
  const convertibleTurnoverHistory = (bondHistory || []).filter((period) =>
    period.convertible_turnover_proxy !== null && period.convertible_turnover_proxy !== undefined
    && period.convertible_rolling_4q_turnover_proxy !== null && period.convertible_rolling_4q_turnover_proxy !== undefined
    && Number.isFinite(Number(period.convertible_turnover_proxy))
    && Number.isFinite(Number(period.convertible_rolling_4q_turnover_proxy))
  ).map((period) => ({
    report_date: period.report_date,
    single: period.convertible_turnover_proxy,
    rolling4q: period.convertible_rolling_4q_turnover_proxy,
  }));
  const turnoverProxyChart = (series, label) => series.length > 1 ? renderMiniLineChart(series, [
    { key: "single", label: `单期${label}`, color: "#a66f69", width: 2.5 },
    { key: "rolling4q", label: `滚动4Q${label}`, color: "#102c45", width: 2.8 },
  ], `${label}变化`) : '<p class="empty-copy">需要至少五期连续债券披露才能计算滚动4Q代理。</p>';
  if (fund.category === "pure-bond") {
    const latestPeriod = bondHistory?.at(-1);
    return `
      <div class="panel-intro"><div><p class="eyebrow">BOND STRUCTURE</p><h2>券种结构与重仓债券</h2></div><p>结构来自资产配置官方汇总；重仓债券仅覆盖披露前列，不能代替完整组合结构。</p></div>
      <div class="research-grid two-column-grid pure-bond-bond-grid">
        <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>券种分布</h3><span>国债/金融债/企业债/可转债/其他 · 季度</span></div></div>${renderBondStructureAreaChart(structureHistory)}</article>
        <article class="subpanel pure-bond-heavy-panel"><div class="subpanel-heading industry-period-control"><div><h3>重仓债券</h3><span>按报告期切换 · 前列披露</span></div>${bondHistory?.length ? `<label><span class="sr-only">报告期</span><select id="generic-bond-period">${bondHistory.slice().reverse().map((period, reverseIndex) => `<option value="${bondHistory.length - 1 - reverseIndex}">${escapeHTML(period.report_date)}（${period.holdings?.length || 0}只）</option>`).join("")}</select></label>` : ""}</div><div id="generic-bond-history-output">${latestPeriod ? genericBondHistoryTable(latestPeriod, true) : '<p class="empty-copy">暂无重仓债券披露。</p>'}</div></article>
        <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>持仓集中度趋势</h3><span>前五大债券市值占净值比例</span></div></div>${renderMiniLineChart(concentrationHistory, [{ key: "concentration", label: "前五大集中度", color: "#0a7c78", width: 3 }], "前五大债券集中度变化")}</article>
        <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>披露持仓换手代理</h3><span>单期 / 滚动4Q · 统一前五大口径</span></div></div>${turnoverProxyChart(turnoverProxyHistory, "换手代理")}</article>
      </div>
      <p class="method-note">换手代理 = 0.5 × Σ|本期前五大权重 − 上期前五大权重|；滚动4Q为近四个单期代理之和。它同时受交易、价格、申赎和榜单进出影响，不是真实成交换手率。</p>`;
  }
  return `
    <div class="panel-intro"><div><p class="eyebrow">BOND STRUCTURE</p><h2>券种结构与重仓债券</h2></div><p>结构来自资产配置官方汇总；重仓债券不能代替完整组合结构。</p></div>
      <div class="research-grid two-column-grid"><article class="subpanel"><div class="subpanel-heading"><div><h3>最新券种结构</h3><span>${escapeHTML(fund.asset?.report_date || "无报告期")}</span></div></div>${renderTable(["券种", "占净值"], rows)}</article><article class="subpanel"><div class="subpanel-heading industry-period-control"><div><h3>重仓债券历史</h3><span>${bondHistory?.length ? "近五年逐期披露" : `${escapeHTML(holdings?.report_date || "无披露")} · 最新一期`}</span></div>${bondHistory?.length ? `<label><span>报告期</span><select id="generic-bond-period">${bondHistory.slice().reverse().map((period, reverseIndex) => `<option value="${bondHistory.length - 1 - reverseIndex}">${escapeHTML(period.report_date)}</option>`).join("")}</select></label>` : ""}</div><div id="generic-bond-history-output">${bondHistory?.length ? genericBondHistoryTable(bondHistory.at(-1)) : holdingRows.length ? renderTable(["序号", "债券", "市值", "占净值", "券种", "最新评级", "剩余期限", "修正久期"], holdingRows, "holdings-table-wrap full-holdings-scroll") : '<p class="empty-copy">暂无重仓债券披露。</p>'}</div></article></div>
      <div class="research-grid two-column-grid">
        <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>券种结构连续变化</h3><span>占基金净资产 · 可超过100%</span></div></div>${renderMiniLineChart(structureHistory, [
          { key: "government_bond", label: "国债及政府债", color: "#0a7c78", width: 2.5 },
          { key: "financial_bond", label: "金融债", color: "#4d79a7", width: 2.5 },
          { key: "corporate_bond", label: "企业债", color: "#c69a4b", width: 2.5 },
          { key: "convertible_bond", label: "可转债", color: "#a06b8b", width: 2 },
          { key: "abs", label: "资产支持证券", color: "#788891", width: 2 },
        ], "券种结构连续变化")}</article>
        <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>前五大债券集中度</h3><span>重仓债券合计占净值</span></div></div>${renderMiniLineChart(concentrationHistory, [{ key: "concentration", label: "前五大集中度", color: "#0a7c78", width: 3 }], "前五大债券集中度变化")}</article>
      </div>
      <article class="subpanel"><div class="subpanel-heading"><div><h3>重仓债券换手跟踪</h3><span>仅覆盖披露重仓券，不等于完整组合换手率</span></div></div>${turnoverRows.length ? renderTable(["报告期", "新进", "加仓", "减仓", "退出披露"], turnoverRows) : '<p class="empty-copy">暂无连续重仓债券披露。</p>'}</article>
      <div class="research-grid two-column-grid">
        <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>披露持仓换手代理</h3><span>单期 / 滚动4Q · 统一前五大口径</span></div></div>${turnoverProxyChart(turnoverProxyHistory, "换手代理")}</article>
        <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>可转债换手代理</h3><span>前五大中可转债 · 单期 / 滚动4Q</span></div></div>${turnoverProxyChart(convertibleTurnoverHistory, "转债换手代理")}</article>
      </div>
      <p class="method-note">换手代理 = 0.5 × Σ|本期前五大权重 − 上期前五大权重|，滚动4Q为近四期之和；转债由本地Wind证券类型表识别。这是披露持仓变化代理，不是真实成交换手率。</p>
      ${["convertible-bond", "hybrid-bond"].includes(fund.category) ? `<article class="subpanel"><div class="subpanel-heading"><div><h3>转债持仓与正股特征</h3><span>持仓 ${escapeHTML(holdings?.report_date || "—")} · 特征 ${escapeHTML(convertible[0]?.as_of || "无可用日期")} · MRQ PB</span></div></div>${convertibleRows.length ? `<section class="research-metric-grid metric-six">${metric("特征覆盖转债", `${convertibleRows.length}只`)}${metric("加权转股溢价率", `${num(convertibleWeighted("conversion_premium_ratio"), 1)}%`)}${metric("加权纯债溢价率", `${num(convertibleWeighted("bond_premium_ratio"), 1)}%`)}${metric("正股加权PE(TTM)", num(convertibleWeighted("underlying_pe_ttm"), 1))}${metric("正股加权PB(MRQ)", num(convertibleWeighted("underlying_pb_mrq"), 1))}${metric("正股加权12月波动", `${num(convertibleWeighted("underlying_volatility_12m"), 1)}%`)}</section>${renderTable(["序号", "转债", "占净值", "正股", "转股价", "转股溢价率", "纯债溢价率", "正股PE(TTM)", "正股PB(MRQ)", "正股12月波动率"], convertibleRows, "holdings-table-wrap full-holdings-scroll")}` : '<p class="empty-copy">当前缓存尚未覆盖本基金披露转债；自动更新会按转债代码段增量补取，不用普通债券近似。</p>'}<p class="method-note">权重来自最近一期基金披露，转债与正股特征为表头所示Choice日期；两者日期可能不同。汇总仅在字段有效样本内按披露净值权重重标，不用缺失值补零。</p></article>` : ""}`;
}

function bindGenericBondHistory(bondHistory, compact = false) {
  const select = document.querySelector("#generic-bond-period");
  const output = document.querySelector("#generic-bond-history-output");
  if (!select || !output || !bondHistory?.length) return;
  select.addEventListener("change", () => { output.innerHTML = genericBondHistoryTable(bondHistory[Number(select.value)], compact); });
}

function genericIndustryContent(classification, level, direction = "desc") {
  const source = level === "sector" ? classification?.sector_weights : classification?.industry_weights?.[level];
  const labels = { sector: "板块", level1: "中信一级行业", level2: "中信二级行业", level3: "中信三级行业" };
  const entries = Object.entries(source || {}).sort((left, right) => (Number(left[1]) - Number(right[1])) * (direction === "asc" ? 1 : -1));
  return `<div class="subpanel-heading"><div><h3>${labels[level]}</h3><span>${escapeHTML(classification?.report_date || "无完整持仓报告期")} · 披露持仓权重合计 ${pct(classification?.disclosed_stock_weight, 1)}</span></div></div>${renderBarList(entries)}`;
}

function genericIndexSnapshot(fund) {
  const snapshots = window.FUND_INDEX_CONSTITUENTS?.snapshots || {};
  return snapshots[fund.tracking_index] || snapshots[String(fund.tracking_index || "").toUpperCase()] || null;
}

function genericIndexIndustrySnapshot(fund, reportDate) {
  const histories = window.FUND_INDEX_INDUSTRY_HISTORY?.histories || {};
  const values = histories[fund.tracking_index] || histories[String(fund.tracking_index || "").toUpperCase()] || [];
  return values.find((item) => item.request_date === reportDate) || null;
}

function genericRelativeIndustryContent(fund, holdingHistory, level, reportDate = null) {
  const fundPeriod = reportDate ? holdingHistory?.full?.find((item) => item.report_date === reportDate) : holdingHistory?.full?.at(-1);
  const latestBenchmark = genericIndexSnapshot(fund);
  const benchmark = genericIndexIndustrySnapshot(fund, fundPeriod?.report_date)
    || (latestBenchmark?.request_date === fundPeriod?.report_date ? latestBenchmark : null);
  if (!fundPeriod || !benchmark) return '<p class="empty-copy">该跟踪指数当前没有可用成分权重快照。</p>';
  const fundWeights = fundPeriod.weights?.[level] || {};
  const benchmarkWeights = benchmark.industry_weights?.[level] || {};
  const labels = new Set([...Object.keys(fundWeights), ...Object.keys(benchmarkWeights)]);
  const rows = [...labels].map((label) => ({ label, fund: Number(fundWeights[label] || 0), benchmark: Number(benchmarkWeights[label] || 0) }))
    .map((item) => ({ ...item, active: item.fund - item.benchmark }))
    .sort((left, right) => Math.abs(right.active) - Math.abs(left.active))
    .map((item) => [escapeHTML(item.label), pct(item.fund, 2), pct(item.benchmark, 2), `<strong class="${item.active < 0 ? "value-negative" : "value-positive"}">${pct(item.active, 2, true)}</strong>`]);
  return `<div class="subpanel-heading"><div><h3>相对跟踪指数行业偏离</h3><span>基金 ${escapeHTML(fundPeriod.report_date)} · 指数请求 ${escapeHTML(benchmark.request_date)} / 实际 ${escapeHTML(benchmark.trade_date)}</span></div></div>${renderTable(["行业/板块", "基金权重", "基准权重", "主动偏离"], rows, "industry-change-table")}`;
}

function genericRelativeHoldingsContent(fund, holdingHistory) {
  const fundPeriod = holdingHistory?.full?.at(-1);
  const benchmark = genericIndexSnapshot(fund);
  if (!fundPeriod || !benchmark) return "";
  const fundMap = new Map(fundPeriod.holdings.map((item) => [item.code, item]));
  const benchmarkMap = new Map((benchmark.constituents || []).map((item) => [item.code, item]));
  const codes = new Set([...fundMap.keys(), ...benchmarkMap.keys()]);
  const rows = [...codes].map((code) => {
    const holding = fundMap.get(code);
    const constituent = benchmarkMap.get(code);
    const fundWeight = Number(holding?.weight || 0);
    const benchmarkWeight = Number(constituent?.weight || 0);
    return { code, name: holding?.name || constituent?.name || code, fundWeight, benchmarkWeight, active: fundWeight - benchmarkWeight };
  }).sort((left, right) => Math.abs(right.active) - Math.abs(left.active)).slice(0, 30).map((item) => [
    `<strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.code)}</small>`,
    pct(item.fundWeight, 2), pct(item.benchmarkWeight, 2),
    `<strong class="${item.active < 0 ? "value-negative" : "value-positive"}">${pct(item.active, 2, true)}</strong>`,
  ]);
  return `<article class="subpanel"><div class="subpanel-heading"><div><h3>相对跟踪指数个股偏离</h3><span>按主动权重绝对值展示前30</span></div></div>${renderTable(["股票", "基金权重", "基准权重", "主动偏离"], rows, "holdings-table-wrap full-holdings-scroll")}<p class="method-note">仅使用与指数快照日期相同的最新半年报/年报完整持仓；季度前十大不用于全组合相对权重计算。</p></article>`;
}

function genericIndustryPanel(fund, holdingHistory) {
  if (holdingHistory?.quarterly?.length || holdingHistory?.full?.length) {
    const relativeNote = fund.category === "index-enhanced"
      ? "基金侧近五年历史已生成；相对基准表按相同完整持仓报告期匹配指数成分行业权重，未缓存的历史报告期保留明确空值。"
      : "季度前十大与半年报/年报完整持仓分开，支持板块及中信一、二、三级行业切换。";
    return `${renderIndustries({ industry_history: holdingHistory })}<p class="method-note">${escapeHTML(relativeNote)}</p>`
      + (fund.category === "index-enhanced" ? `<div class="toolbar"><label>相对基准层级<select id="generic-relative-industry-level"><option value="sector">板块</option><option value="level1">中信一级</option><option value="level2">中信二级</option><option value="level3">中信三级</option></select></label><label>完整持仓报告期<select id="generic-relative-industry-period">${(holdingHistory.full || []).slice().reverse().map((period) => `<option value="${escapeHTML(period.report_date)}">${escapeHTML(period.report_date)}</option>`).join("")}</select></label></div><article id="generic-relative-industry-output" class="subpanel">${genericRelativeIndustryContent(fund, holdingHistory, "sector")}</article>` : "");
  }
  const classification = window.FUND_STOCK_CLASSIFICATION?.funds?.[fund.code];
  if (!classification?.holding_count) return genericPendingPanel(fund, "industries");
  return `
    <div class="panel-intro"><div><p class="eyebrow">INDUSTRY ANALYSIS</p><h2>板块与中信一、二、三级行业</h2></div><p>按最新半年报/年报完整持仓重建；季度前十大与同日其余完整持仓合并后再分类。</p></div>
    <div class="toolbar"><label>分类层级<select id="generic-industry-level"><option value="sector">板块</option><option value="level1">中信一级</option><option value="level2">中信二级</option><option value="level3">中信三级</option></select></label><label>权重排序<select id="generic-industry-sort"><option value="desc">从高到低</option><option value="asc">从低到高</option></select></label></div>
    <article id="generic-industry-output" class="subpanel">${genericIndustryContent(classification, "sector")}</article>
    <p class="method-note">A股按报告期时点行业成员表映射；港股与未映射持仓单列。A股一级行业映射覆盖率 ${pct(classification.ashare_level1_coverage, 1)}。</p>`;
}

function genericHoldingsPanel(fund, holdingHistory, heavyStockTrends) {
  if (holdingHistory?.quarterly?.length || holdingHistory?.full?.length) {
    const full = holdingHistory.full?.at(-1);
    const quarterly = holdingHistory.quarterly?.at(-1);
    const valuationPeriod = quarterly || full;
    const valuation = holdingValuation(valuationPeriod);
    return `
      <div class="panel-intro"><div><p class="eyebrow">HOLDING ANALYSIS</p><h2>${fund.category === "convertible-bond" ? "股票持仓与转债正股" : "持股分析"}</h2></div><p>近五年每一期真实披露可切换；季度仅表示前十大，半年报/年报使用完整股票持仓。</p></div>
      ${fund.category === "active-equity" ? renderHeavyStockTrendSection(heavyStockTrends) : ""}
      <div class="calibration-note"><strong>PE/G字段口径</strong><p>PE(TTM)、PB(MRQ)与ROE(TTM)按对应报告期的Choice截面匹配；G为A股在该报告期交易日可得的归母净利润TTM同比增长（PIT），不使用事后财报回填。港股暂无同口径PIT字段时留空，不用0替代。</p></div>
      <article class="subpanel core-valuation-panel"><div class="subpanel-heading"><div><h3>最新重仓股估值与盈利能力</h3><span>${escapeHTML(valuation.reportDate || "—")} · ${valuation.valid}/${valuation.total}只PE有效</span></div></div><section class="research-metric-grid metric-six">${metric("加权PE(TTM)", num(valuation.weightedPe, 1))}${metric("调和PE(TTM)", num(valuation.harmonicPe, 1))}${metric("100倍封顶PE", num(valuation.cappedPe, 1))}${metric("PE中位数", num(valuation.medianPe, 1))}${metric("加权PB(MRQ)", num(valuation.weightedPb, 1))}${metric("加权ROE(TTM)", Number.isFinite(valuation.weightedRoe) ? `${num(valuation.weightedRoe, 1)}%` : "—")}</section><p class="method-note">算术加权PE容易受极高估值股票影响，同时提供调和PE和100倍封顶PE；所有汇总均按披露持仓净值权重在有效样本内重标。</p></article>
      <div id="holding-analysis-interactive">
        <div class="industry-analysis-toolbar holding-analysis-toolbar">
          <div class="industry-toggle-group" aria-label="持仓披露范围"><button class="active" data-holding-scope="quarterly">季度前十大</button><button data-holding-scope="full">完整持仓</button></div>
          <div class="industry-toggle-group" aria-label="行业层级"><button class="active" data-holding-dimension="sector">板块</button><button data-holding-dimension="level1">中信一级</button><button data-holding-dimension="level2">中信二级</button><button data-holding-dimension="level3">中信三级</button></div>
        </div>
        <article class="subpanel"><div class="subpanel-heading industry-period-control"><div><h3>披露持仓明细与特征</h3><span id="holding-scope-note"></span></div><label><span>报告期</span><select id="holding-period-select"></select></label></div><div id="holding-changes-output"></div><div id="holding-table-output"></div></article>
        <article class="subpanel chart-subpanel"><div class="subpanel-heading industry-trend-control"><div><h3>个股连续持仓矩阵</h3><span>连续展示历次披露权重；点击股票联动上方价格与净值</span></div></div><div id="holding-trajectory-output"></div></article>
      </div>
      ${fund.category === "index-enhanced" ? genericRelativeHoldingsContent(fund, holdingHistory) : ""}
      <p class="method-note">最新完整持仓：${escapeHTML(full?.report_date || "—")}，${full?.holding_count || 0}只；最新季度前十大：${escapeHTML(quarterly?.report_date || "—")}。季度空点只表示未列前十，不代表持仓为零。</p>`;
  }
  const classification = window.FUND_STOCK_CLASSIFICATION?.funds?.[fund.code];
  if (!classification?.top_holdings?.length) return genericPendingPanel(fund, "holdings");
  const rows = classification.top_holdings.map((holding, index) => [
    String(index + 1),
    `<strong>${escapeHTML(holding.name)}</strong><small>${escapeHTML(holding.code)}</small>`,
    pct(holding.weight, 2),
  ]);
  return `
    <div class="panel-intro"><div><p class="eyebrow">HOLDING ANALYSIS</p><h2>${fund.category === "convertible-bond" ? "股票持仓与转债正股" : "重仓股及持仓特征"}</h2></div><p>当前先展示最新完整持仓前二十；估值特征、报告期切换和连续轨迹将从分基金明细数据加载。</p></div>
    <article class="subpanel"><div class="subpanel-heading"><div><h3>最新完整持仓前二十</h3><span>${escapeHTML(classification.report_date)} · 共 ${classification.holding_count} 只披露股票</span></div></div>${renderTable(["序号", "股票", "占净值"], rows)}</article>`;
}

function genericMultiIndexAnalysis(fund, detail) {
  if (!["active-equity", "index-enhanced", "hybrid-bond", "convertible-bond"].includes(fund.category)) return null;
  const indexCodes = ["000300.SH", "000905.SH", "000906.SH", "399370.SZ", "399371.SZ"];
  const benchmarks = window.FUND_COMMON_BENCHMARKS?.benchmarks || {};
  const fundDaily = new Map();
  genericFundNavPoints(detail).forEach((point) => fundDaily.set(point.date, point));
  const indexDaily = new Map();
  const indexNames = {};
  indexCodes.forEach((code) => {
    const benchmark = benchmarks[code];
    if (!benchmark?.series?.length) return;
    const daily = new Map();
    benchmark.series.forEach(([date, value]) => {
      const number = Number(value);
      if (date && Number.isFinite(number) && number > 0) daily.set(date, { date, value: number });
    });
    if (daily.size >= 2) {
      indexDaily.set(code, daily);
      indexNames[code] = benchmark.name || code;
    }
  });
  const availableCodes = Object.keys(indexNames);
  if (fundDaily.size < 2 || !availableCodes.length) return null;
  const allDates = [...fundDaily.keys()].filter((date) => availableCodes.every((code) => indexDaily.get(code).has(date))).sort();
  if (allDates.length < 2) return null;
  const cutoff = new Date(`${allDates.at(-1)}T00:00:00Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
  const dates = allDates.filter((date) => Date.parse(`${date}T00:00:00Z`) >= cutoff.getTime());
  if (dates.length < 2) return null;
  const firstDate = dates[0];
  const fundBase = Number(fundDaily.get(firstDate).fund);
  const indexBases = Object.fromEntries(availableCodes.map((code) => [code, indexDaily.get(code).get(firstDate).value]));
  const comparisonPoints = dates.map((date) => {
    const point = { date, fund: Number(fundDaily.get(date).fund) / fundBase };
    availableCodes.forEach((code) => { point[code] = indexDaily.get(code).get(date).value / indexBases[code]; });
    return point;
  });
  return { index_names: indexNames, comparison_points: comparisonPoints };
}

function genericRebalancingPanel(fund, detail, holdingHistory, multiIndexAnalysis) {
  const assetHistory = (detail?.asset_history || []).map((item) => ({
    report_date: item.date,
    stock_to_nav: item.stock,
    cash_to_nav: item.cash,
  }));
  const transitions = (holdingHistory?.quarterly || []).slice(-20).reverse().map((period) => [
    escapeHTML(period.report_date),
    `${period.holding_count || period.holdings?.length || 0}只`,
    pct(period.total_weight ?? period.holdings?.reduce((sum, item) => sum + Number(item.weight || 0), 0), 1),
    escapeHTML((period.entered || []).map((item) => item.name).slice(0, 5).join("、") || "—"),
    escapeHTML((period.exited || []).map((item) => item.name).slice(0, 5).join("、") || "—"),
  ]);
  const quarterly = holdingHistory?.quarterly || [];
  const concentrationHistory = quarterly.map((period) => ({ report_date: period.report_date, top10_concentration: holdingConcentration(period).top10 }));
  const stability = quarterly.slice(1).map((period, index) => {
    const previous = quarterly[index];
    const left = new Set((previous.holdings || []).map((item) => item.code));
    const right = new Set((period.holdings || []).map((item) => item.code));
    const common = [...left].filter((code) => right.has(code)).length;
    const union = new Set([...left, ...right]).size;
    const weightChange = [...new Set([...left, ...right])].reduce((sum, code) => {
      const oldWeight = Number(previous.holdings?.find((item) => item.code === code)?.weight || 0);
      const newWeight = Number(period.holdings?.find((item) => item.code === code)?.weight || 0);
      return sum + Math.abs(newWeight - oldWeight);
    }, 0) / 2;
    return { from: previous.report_date, to: period.report_date, jaccard: union ? common / union : null, common, weightChange };
  });
  const averageJaccard = stability.length ? stability.reduce((sum, item) => sum + item.jaccard, 0) / stability.length : null;
  const latestStability = stability.at(-1);
  return `
    <div class="panel-intro"><div><p class="eyebrow">REBALANCING TRACKING</p><h2>调仓跟踪</h2></div><p>用资产仓位和季度前十大名单变化观察组合调整；披露变化不等同于真实交易。</p></div>
    ${multiIndexAnalysis?.comparison_points?.length ? `<article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>净值与市场/风格指数跟踪</h3><span>近5年日频有效观察 · 可切换对比指数</span></div></div>${renderMultiIndexChart(multiIndexAnalysis, fund.name)}</article>` : ""}
    <article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>股票与现金仓位监控</h3><span>报告期披露</span></div></div>${assetHistory.length ? renderMiniLineChart(assetHistory, [{ key: "stock_to_nav", label: "股票仓位", color: "#0b7774", width: 3 }, { key: "cash_to_nav", label: "现金仓位", color: "#c5913d", width: 2.5 }], "股票与现金仓位变化") : '<p class="empty-copy">暂无资产配置历史。</p>'}</article>
    ${fund.category === "active-equity" ? `<div class="research-grid two-column-grid"><article class="subpanel chart-subpanel"><div class="subpanel-heading"><div><h3>季度前十大集中度</h3><span>占基金净值</span></div></div>${concentrationHistory.length ? renderMiniLineChart(concentrationHistory, [{ key: "top10_concentration", label: "前十大集中度", color: "#0b7774", width: 3 }], "季度前十大集中度变化") : '<p class="empty-copy">暂无集中度历史。</p>'}</article><article class="subpanel"><div class="subpanel-heading"><div><h3>核心持仓稳定性</h3><span>前十大名单重合与披露权重变化</span></div></div><section class="research-metric-grid metric-two">${metric("平均名单重合", pct(averageJaccard, 1))}${metric("最新名单重合", pct(latestStability?.jaccard, 1), latestStability ? `${latestStability.common}只共同持有` : "")}${metric("最新披露权重变化", pct(latestStability?.weightChange, 1))}</section><p class="method-note">披露权重变化同时受交易和股价涨跌影响，不等于真实换手率。</p></article></div><article class="subpanel"><div class="subpanel-heading"><div><h3>成长价值风格</h3><span>基金月度收益与成长/价值指数相关性</span></div></div><div id="generic-style-correlation-output">${genericStyleCorrelationContent(fund)}</div></article>` : ""}
    <article class="subpanel"><div class="subpanel-heading"><div><h3>季度前十大名单变化</h3><span>近二十个披露期</span></div></div>${transitions.length ? renderTable(["报告期", "披露数", "合计权重", "新进前十", "退出前十"], transitions) : '<p class="empty-copy">暂无可比持仓历史。</p>'}</article>
    <p class="method-note">净值及宽基对比可在“业绩表现”查看；未进入历史指数成分的数据不推断大小盘归属。</p>`;
}

function genericStyleCorrelationContent(fund) {
  const correlation = window.FUND_CORRELATION_METRICS?.funds?.[fund.code];
  if (!window.FUND_CORRELATION_METRICS) return '<p class="empty-copy">打开“调仓跟踪”后自动加载风格相关性。</p>';
  const styleRows = ["399370.SZ", "399371.SZ"].map((code) => {
    const find = (key) => correlation?.windows?.[key]?.indices?.find((item) => item.code === code);
    const item = find("5y") || find("3y") || find("1y") || correlation?.indices?.find((value) => value.code === code);
    return item ? [escapeHTML(item.name), num(find("1y")?.correlation, 3), num(find("3y")?.correlation, 3), num(find("5y")?.correlation ?? item.correlation, 3)] : null;
  }).filter(Boolean);
  return styleRows.length
    ? renderTable(["风格指数", "近1年", "近3年", "近5年"], styleRows)
    : '<p class="empty-copy">风格指数共同样本不足。</p>';
}

function genericCorrelationSide(fund, data, key, type) {
  const windowData = data?.windows?.[key] || {};
  const source = windowData[type] || (key === "5y" ? data?.[type] : []) || [];
  const sampleUnit = windowData.frequency === "daily_return" ? "日" : "月";
  if (type === "peers") {
    const catalog = new Map((window.FUND_DASHBOARD_CATALOG?.funds || []).map((item) => [item.code, item]));
    const rows = source.map((item) => {
      const peer = catalog.get(item.code);
      return [
        escapeHTML(item.code),
        `<a href="fund.html?code=${encodeURIComponent(item.code)}"><strong>${escapeHTML(item.name)}</strong></a>`,
        escapeHTML((peer?.manager || []).join("、") || peer?.fund_company || "—"),
        `<strong>${num(item.correlation, 3)}</strong>`,
        `${item.observations || "—"}${sampleUnit}`,
      ];
    });
    return rows.length ? renderTable(["代码", "名称", "管理人", "相关系数", "共同样本"], rows, "pure-bond-correlation-table") : '<p class="empty-copy">该窗口共同样本不足。</p>';
  }
  const rows = source.map((item) => [
    escapeHTML(item.code),
    `<strong>${escapeHTML(item.name)}</strong>`,
    fund.category === "pure-bond" ? "财富" : "价格",
    `<strong>${num(item.correlation, 3)}</strong>`,
    `${item.observations || "—"}${sampleUnit}`,
  ]);
  return rows.length ? renderTable(["代码", "名称", "口径", "相关系数", "共同样本"], rows, "pure-bond-correlation-table") : '<p class="empty-copy">该窗口共同样本不足。</p>';
}

function genericCorrelationPanel(fund) {
  const data = window.FUND_CORRELATION_METRICS?.funds?.[fund.code];
  if (!data?.peers?.length && !data?.indices?.length) return genericPendingPanel(fund, "correlation");
  if (["pure-bond", "active-equity", "hybrid-bond"].includes(fund.category) && data.windows && Object.keys(data.windows).length) {
    const windowLabels = { "1m": "近1月", "3m": "近3月", "6m": "近6月", ytd: "今年以来", "1y": "近1年", "3y": "近3年", "5y": "近5年" };
    const available = Object.keys(data.windows || { "5y": {} }).filter((key) => windowLabels[key]);
    const selected = available.includes("ytd") ? "ytd" : available.includes("3y") ? "3y" : available.includes("5y") ? "5y" : available[0];
    const options = available.map((key) => `<option value="${key}"${key === selected ? " selected" : ""}>${windowLabels[key]}</option>`).join("");
    return `
      <div class="panel-intro"><div><p class="eyebrow">CORRELATION</p><h2>同类基金与代表指数相关性</h2></div><p>近1/3/6月和今年以来按日收益，近1/3/5年按月收益；左右卡片可独立切换。${fund.category === "pure-bond" ? "纯债指数仅保留含票息再投资的财富口径。" : fund.category === "hybrid-bond" ? "一级/二级债基同时覆盖债券财富指数与权益指数。" : "主动权益覆盖宽基、大小盘及成长价值指数。"}</p></div>
      <div class="research-grid two-column-grid pure-bond-correlation-grid">
        <article class="subpanel"><div class="subpanel-heading"><div><h3>与其他基金相关性</h3><span>按所选窗口频率 · 正相关TOP</span></div></div><label class="correlation-window-select"><span class="sr-only">其他基金相关性窗口</span><select id="generic-peer-correlation-window">${options}</select></label><div id="generic-peer-correlation-output">${genericCorrelationSide(fund, data, selected, "peers")}</div></article>
        <article class="subpanel"><div class="subpanel-heading"><div><h3>与其他指数相关性</h3><span>${fund.category === "pure-bond" ? "vs 各类中债财富指数" : fund.category === "hybrid-bond" ? "vs 债券财富与权益指数" : "vs 宽基与风格指数"} · 正相关TOP</span></div></div><label class="correlation-window-select"><span class="sr-only">其他指数相关性窗口</span><select id="generic-index-correlation-window">${options}</select></label><div id="generic-index-correlation-output">${genericCorrelationSide(fund, data, selected, "indices")}</div></article>
      </div>
      <div class="calibration-note"><strong>用于替换研究</strong><p>同类基金表先回答“净值行为最像谁”，指数表回答“更接近哪类市场风格”。真正用于经理更换或风格漂移后的替换，还应叠加行业集中度、历史行业稳定性、波动回撤和经理任期过滤；仅凭相关系数不直接给出替代结论。</p></div>
      <p class="method-note">相关性描述历史共同波动，不代表持仓相似度、因果关系或未来表现。短窗口至少12/35/70个共同交易日，长期窗口使用月收益。</p>`;
  }
  const peerRows = (data.peers || []).map((item) => [
    `<a href="fund.html?code=${encodeURIComponent(item.code)}"><strong>${escapeHTML(item.name)}</strong></a><small>${escapeHTML(item.code)}</small>`,
    num(item.correlation, 3),
    `${item.observations}个月`,
  ]);
  const indexRows = (data.indices || []).map((item) => [
    `<strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.code)}</small>`,
    num(item.correlation, 3),
    `${item.observations}个月`,
  ]);
  return `
    <div class="panel-intro"><div><p class="eyebrow">CORRELATION</p><h2>同类基金与代表指数相关性</h2></div><p>基于近五年月度复权净值收益，至少需要24个共同月份；同类基金按相关系数从高到低列示。</p></div>
    <div class="research-grid two-column-grid">
      <article class="subpanel"><div class="subpanel-heading"><div><h3>相关性最高的同类基金</h3><span>产品口径，A/C等份额已合并</span></div></div>${peerRows.length ? renderTable(["基金", "相关系数", "共同样本"], peerRows) : '<p class="empty-copy">共同样本不足。</p>'}</article>
      <article class="subpanel"><div class="subpanel-heading"><div><h3>代表指数相关性</h3><span>${fund.category === "active-equity" || fund.category === "index-enhanced" ? "宽基、大小盘与成长价值" : "仅含票息再投资的中债财富指数"}</span></div></div>${indexRows.length ? renderTable(["指数", "相关系数", "共同样本"], indexRows) : '<p class="empty-copy">共同样本不足。</p>'}</article>
    </div>
    <p class="method-note">相关性描述历史共同波动，不代表持仓相似度、因果关系或未来表现。</p>`;
}

function genericCorrelationLoadingPanel(message = "切换到本页签后再加载全市场相关性数据，以缩短基金详情页首次打开时间。") {
  return `<div class="panel-intro"><div><p class="eyebrow">CORRELATION</p><h2>同类基金与代表指数相关性</h2></div><p>${escapeHTML(message)}</p></div><article class="subpanel"><p class="empty-copy" id="generic-correlation-load-state">等待按需加载。</p></article>`;
}

function loadCorrelationMetrics() {
  if (window.FUND_CORRELATION_METRICS) return Promise.resolve(window.FUND_CORRELATION_METRICS);
  if (correlationMetricsPromise) return correlationMetricsPromise;
  correlationMetricsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/correlation_metrics.js";
    script.onload = () => window.FUND_CORRELATION_METRICS
      ? resolve(window.FUND_CORRELATION_METRICS)
      : reject(new Error("相关性数据脚本未生成有效内容"));
    script.onerror = () => reject(new Error("相关性数据加载失败，请检查网络后重试"));
    document.head.appendChild(script);
  }).catch((error) => {
    correlationMetricsPromise = null;
    throw error;
  });
  return correlationMetricsPromise;
}

function bindLazyCorrelation(fund) {
  let loaded = Boolean(window.FUND_CORRELATION_METRICS);
  let loading = false;
  return async (target) => {
    if (!["correlation", "rebalancing"].includes(target) || loading) return;
    const needsStyleClassification = target === "rebalancing"
      && ["active-equity", "index-enhanced"].includes(fund.category)
      && !window.FUND_STOCK_CLASSIFICATION;
    if (loaded && !needsStyleClassification) return;
    loading = true;
    const correlationPanel = document.querySelector('[data-panel="correlation"]');
    const state = correlationPanel?.querySelector("#generic-correlation-load-state");
    if (state) state.textContent = "正在加载全市场相关性数据…";
    try {
      await Promise.all([
        loaded ? Promise.resolve() : loadCorrelationMetrics(),
        needsStyleClassification ? loadDashboardAsset("stock_classification.js") : Promise.resolve(),
      ]);
      loaded = true;
      if (correlationPanel) {
        correlationPanel.innerHTML = genericCorrelationPanel(fund);
        bindGenericCorrelation(fund);
      }
      const styleOutput = document.querySelector("#generic-style-correlation-output");
      if (styleOutput) styleOutput.innerHTML = genericStyleCorrelationContent(fund);
    } catch (error) {
      if (correlationPanel) correlationPanel.innerHTML = genericCorrelationLoadingPanel(`${error.message}。再次切换该页签可重试。`);
    } finally {
      loading = false;
    }
  };
}

function bindGenericCorrelation(fund) {
  if (!["pure-bond", "active-equity", "hybrid-bond"].includes(fund.category)) return;
  const data = window.FUND_CORRELATION_METRICS?.funds?.[fund.code];
  [["peer", "peers"], ["index", "indices"]].forEach(([id, type]) => {
    const select = document.querySelector(`#generic-${id}-correlation-window`);
    const output = document.querySelector(`#generic-${id}-correlation-output`);
    if (!select || !output || !data) return;
    select.addEventListener("change", () => { output.innerHTML = genericCorrelationSide(fund, data, select.value, type); });
  });
}

function bindGenericIndustry(fund) {
  const select = document.querySelector("#generic-industry-level");
  const direction = document.querySelector("#generic-industry-sort");
  const output = document.querySelector("#generic-industry-output");
  const classification = window.FUND_STOCK_CLASSIFICATION?.funds?.[fund.code];
  if (!select || !output || !classification) return;
  const render = () => { output.innerHTML = genericIndustryContent(classification, select.value, direction?.value || "desc"); };
  select.addEventListener("change", render);
  direction?.addEventListener("change", render);
}

function bindGenericRelativeIndustry(fund, holdingHistory) {
  const select = document.querySelector("#generic-relative-industry-level");
  const period = document.querySelector("#generic-relative-industry-period");
  const output = document.querySelector("#generic-relative-industry-output");
  if (!select || !output) return;
  const render = () => { output.innerHTML = genericRelativeIndustryContent(fund, holdingHistory, select.value, period?.value || null); };
  select.addEventListener("change", render);
  period?.addEventListener("change", render);
}

function genericPendingPanel(fund, id) {
  const copy = {
    industries: ["行业分析", "将使用股票持仓和报告期时点的中信一、二、三级行业成员表，季度前十大与半年报/年报完整持仓分开。"],
    holdings: [fund.category === "convertible-bond" ? "持股与转债分析" : "持股分析", fund.category === "convertible-bond" ? "需要同时展示重仓转债、转股溢价率、纯债溢价率、正股估值和正股行业。" : "将展示重仓股特征、报告期新进/退出和连续持仓轨迹。"],
    rebalancing: ["调仓跟踪", "将结合净值跟踪、股票仓位、大小盘与成长价值风格观察披露期之间的组合变化。"],
    correlation: ["相关性分析", "需要基金与同类基金、代表指数的对齐日收益序列，并设置最小共同样本数。"],
  };
  const [title, description] = copy[id] || ["研究模块", "数据正在生成。"];
  return `<div class="panel-intro"><div><p class="eyebrow">DATA PIPELINE</p><h2>${escapeHTML(title)}</h2></div><p>${escapeHTML(description)}</p></div><article class="subpanel"><p class="empty-copy">该基金已进入全量目录；模块级明细尚未生成时保留明确缺失状态，不使用示例数据替代。</p></article>`;
}

const MULTI_ASSET_ATTR_LABELS = {
  market: "市场基准",
  allocation: "资产配置",
  selection: "证券选择",
  residual: "隐形交易与残差",
};

function multiAssetAttributionPeriod(data, periodStart) {
  const period = (data?.periods || []).find((item) => item.start === periodStart) || data?.periods?.at(-1);
  if (!period) return '<p class="empty-copy">该基金没有可复现的持仓法归因区间。</p>';
  const assetRows = (period.assets || []).map((item) => [
    `<strong>${escapeHTML(item.asset)}</strong>`,
    pct(item.portfolio_weight, 2),
    pct(item.benchmark_weight, 2),
    pct(item.benchmark_return, 2, true),
    item.portfolio_return === null || item.portfolio_return === undefined ? "—" : pct(item.portfolio_return, 2, true),
    pct(item.benchmark_contribution, 2, true),
    pct(item.allocation, 2, true),
    pct(item.selection, 2, true),
  ]);
  const bondRows = (period.bond_categories || []).filter((item) => Number(item.weight || 0) > 0).map((item) => [
    escapeHTML(item.category), pct(item.weight, 2), pct(item.benchmark_return, 2, true),
    item.contribution === null || item.contribution === undefined ? "—" : pct(item.contribution, 2, true),
  ]);
  const bf = data?.stock_bf?.periods?.find((item) => item.start === period.start);
  const bfDetails = bf ? (data.stock_bf.details || []).filter((item) => item.start === period.start).sort((left, right) => Math.abs(Number(right.allocation || 0) + Number(right.selection || 0)) - Math.abs(Number(left.allocation || 0) + Number(left.selection || 0))).slice(0, 15) : [];
  const bfRows = bfDetails.map((item) => [
    escapeHTML(item.industry), pct(item.portfolio_weight, 2), pct(item.benchmark_weight, 2),
    pct(item.portfolio_return, 2, true), pct(item.benchmark_return, 2, true),
    pct(item.allocation, 2, true), pct(item.selection, 2, true),
  ]);
  const scope = period.stock_scope === "full" ? "中报/年报完整股票持仓" : period.stock_scope === "quarterly_top10" ? "季报前十大" : "该期无股票持仓明细";
  return `
    <div class="calibration-note"><strong>归因结果</strong><p>${escapeHTML(period.start)} 至 ${escapeHTML(period.end)}：基金实际收益 ${pct(period.actual_return, 2, true)}，市场基准、配置、选择与残差合计严格对齐该区间收益。</p></div>
    <section class="research-metric-grid metric-four">
      ${metric(MULTI_ASSET_ATTR_LABELS.market, pct(period.market, 2, true))}
      ${metric(MULTI_ASSET_ATTR_LABELS.allocation, pct(period.allocation, 2, true))}
      ${metric(MULTI_ASSET_ATTR_LABELS.selection, pct(period.selection, 2, true))}
      ${metric(MULTI_ASSET_ATTR_LABELS.residual, pct(period.residual, 2, true))}
    </section>
    <article class="subpanel"><div class="subpanel-heading"><div><h3>大类资产归因明细</h3><span>基准权重=该基金近8个季度仓位中位数</span></div></div>${renderTable(["资产", "实际权重", "基准权重", "代理指数收益", "持仓法收益", "市场基准", "配置贡献", "选择贡献"], assetRows, "holdings-table-wrap")}</article>
    <div class="research-grid two-column-grid">
      <article class="subpanel"><div class="subpanel-heading"><div><h3>纯债类属贡献</h3><span>披露债券类属结构外推</span></div></div>${bondRows.length ? renderTable(["券种", "估算仓位", "类属指数收益", "对净值贡献"], bondRows, "holdings-table-wrap") : '<p class="empty-copy">该期无可分类纯债持仓。</p>'}<p class="method-note">债券披露覆盖 ${pct(period.bond_disclosed_coverage, 1)}，分类覆盖 ${pct(period.bond_classification_coverage, 1)}，指数代理覆盖 ${pct(period.pure_bond_proxy_coverage, 1)}。</p></article>
      <article class="subpanel"><div class="subpanel-heading"><div><h3>股票子组合口径</h3><span>${escapeHTML(scope)}</span></div></div><div class="research-metric-grid metric-two">${metric("可定价股票", `${period.stock_count || 0}只`)}${metric("持仓收益覆盖", pct(period.stock_return_coverage, 1))}</div><p class="method-note">季报只有前十大，只作高频跟踪；股票 BF 行业归因仅在中报/年报完整持仓区间展示。</p></article>
    </div>
    <article class="subpanel"><div class="subpanel-heading"><div><h3>股票部分收益归因</h3><span>${bf ? `Brinson-Fachler · 完整持仓独立区间 ${escapeHTML(bf.start)} 至 ${escapeHTML(bf.end)} · 中证800统一A股代理` : "该区间不是完整持仓起点"}</span></div></div>${bf ? `<section class="research-metric-grid metric-four">${metric("股票组合收益", pct(bf.portfolio_return, 2, true))}${metric("中证800收益", pct(bf.benchmark_return, 2, true))}${metric("行业配置", pct(bf.allocation, 2, true))}${metric("个股选择", pct(bf.selection, 2, true))}</section>${renderTable(["中信一级行业", "基金权重", "基准权重", "持仓收益", "基准收益", "配置贡献", "选择贡献"], bfRows, "holdings-table-wrap")}<p class="method-note">股票部分收益归因仅使用中报/年报完整持仓，并按完整披露周期单独计算；它与上方季度多资产归因的结束日期可能不同。</p>` : '<p class="empty-copy">季报前十大不作为完整行业结构，因此本区间不计算股票部分收益归因。</p>'}</article>`;
}

function genericMultiAssetAttributionPanel(data) {
  if (!data?.periods?.length) return `<div class="panel-intro"><div><p class="eyebrow">HOLDINGS-BASED ATTRIBUTION</p><h2>持仓法多资产归因</h2></div><p>该基金尚无可复现的连续披露区间。</p></div><article class="subpanel"><p class="empty-copy">通常是基金成立时间较短，或净值、资产与持仓无法在同一区间对齐。</p></article>`;
  const latest = data.periods.at(-1);
  return `
    <div class="panel-intro"><div><p class="eyebrow">HOLDINGS-BASED MULTI-ASSET ATTRIBUTION</p><h2>持仓法多资产业绩归因</h2></div><p>参考交接材料的固收基金框架，将区间收益拆分为市场基准、资产配置、证券选择与残差。</p></div>
    <article class="subpanel"><div class="subpanel-heading"><div><h3>归因实现状态</h3><span>先确认可解释范围，再阅读贡献结果</span></div></div>${renderTable(["归因维度", "实现状态", "当前口径"], [
      ["市场基准收益", '<span class="status-pill entered">已实现</span>', "股票/转债/纯债/现金代理指数"],
      ["资产配置收益", '<span class="status-pill entered">已实现</span>', "实际权重相对近8季仓位中枢"],
      ["股票选择收益", '<span class="status-pill entered">已实现</span>', "完整持仓区间可计算Brinson-Fachler归因"],
      ["转债选择收益", '<span class="status-pill added">部分实现</span>', "指数代理；逐券行情覆盖不足时不强算"],
      ["纯债选择收益", '<span class="status-pill entered">已实现</span>', "官方类属仓位×对应债券财富指数"],
      ["打新收益", '<span class="status-pill reduced">未实现</span>', "本地无网下配售明细，不并入选券能力"],
      ["隐形交易与残差", '<span class="status-pill unchanged">轧差项</span>', "不可直接解释为基金经理交易能力"],
    ])}</article>
    <div class="toolbar"><label>披露区间<select id="multi-asset-attribution-period">${data.periods.slice().reverse().map((item) => `<option value="${escapeHTML(item.start)}"${item.start === latest.start ? " selected" : ""}>${escapeHTML(item.start)} → ${escapeHTML(item.end)}</option>`).join("")}</select></label></div>
    <div id="multi-asset-attribution-output">${multiAssetAttributionPeriod(data, latest.start)}</div>
    <div class="calibration-note"><strong>口径边界</strong><p>${(data.limitations || []).map(escapeHTML).join("；")}</p></div>
    <p class="method-note">公式：市场基准=Σwₑ×rₑ；资产配置=Σ(wₚ−wₑ)×rₑ；证券选择=Σwₚ×(rₚ−rₑ)；残差=基金实际区间收益−前三项。这是披露持仓静态估算，不是逐日交易归因。</p>`;
}

function bindGenericMultiAssetAttribution(data) {
  const select = document.querySelector("#multi-asset-attribution-period");
  const output = document.querySelector("#multi-asset-attribution-output");
  if (!select || !output || !data) return;
  select.addEventListener("change", () => { output.innerHTML = multiAssetAttributionPeriod(data, select.value); });
}

function genericAttributionPanel(fund, brinson, multiAssetAttribution) {
  if (fund.category === "active-equity" && brinson) {
    return `${renderBrinsonAttribution(brinson)}<p class="method-note">中证800在这里是统一的A股研究代理，用于跨基金采用同一行业基准；它不等同于该基金合同约定的业绩比较基准。归因仅覆盖披露的A股子组合，不解释港股、债券、现金、费用及报告期内未披露调仓。</p>`;
  }
  if (fund.category === "active-equity") {
    return `<div class="panel-intro"><div><p class="eyebrow">BRINSON-FACHLER</p><h2>业绩归因</h2></div><p>该基金目前没有可连续计算的完整持仓区间。</p></div><article class="subpanel"><p class="empty-copy">通常是现任管理团队成立后尚未披露半年报/年报完整持仓，或对应A股持仓缺少可定价区间；不使用季度前十大替代完整持仓归因。</p></article>`;
  }
  if (fund.category === "index-enhanced") {
    return `<div class="panel-intro"><div><p class="eyebrow">BARRA</p><h2>Barra归因</h2></div><p>正式因子风险模型尚未接入。</p></div><article class="subpanel"><p class="empty-copy">缺少可复现的 Barra 因子暴露、因子收益与特异收益数据，因此按原要求保留空白，不用 Brinson 替代。</p></article>`;
  }
  return genericMultiAssetAttributionPanel(multiAssetAttribution);
}

const CAMPISI_LABELS = {
  level: "利率水平",
  slope: "曲线斜率",
  curve: "曲线凸度",
  credit: "信用利差",
  default: "违约利差",
  alpha: "主动管理Alpha",
};

const CAMPISI_FACTORS = ["level", "slope", "curve", "credit", "default"];

function campisiPercentileReading(percentile) {
  const value = Number(percentile);
  if (!Number.isFinite(value)) return "位置待计算";
  if (value >= 0.75) return "显著偏高";
  if (value >= 0.60) return "偏高";
  if (value <= 0.25) return "显著偏低";
  if (value <= 0.40) return "偏低";
  return "居中";
}

function genericCampisiProfile(campisi, key) {
  const value = campisi?.windows?.[key];
  if (!value) return '<p class="empty-copy">该窗口有效共同样本不足，暂不输出回归结果。</p>';
  const factorKeys = ["level", "slope", "curve", "credit", "default", "alpha"];
  const contributions = factorKeys.map((factor) => [factor, Number(value.contributions?.[factor])]).filter(([, contribution]) => Number.isFinite(contribution));
  const ranked = contributions.filter(([, contribution]) => Number.isFinite(contribution)).sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]));
  const leaders = ranked.slice(0, 2);
  const leaderCopy = leaders.map(([factor, contribution]) => `${CAMPISI_LABELS[factor]}（${contribution >= 0 ? "贡献" : "拖累"}${pct(Math.abs(contribution), 2)}）`).join("和");
  const leaderTotal = leaders.reduce((sum, [, contribution]) => sum + contribution, 0);
  return `
    <div class="campisi-profile-card">
      <span>基金画像自动总结</span>
      <strong>该基金本窗口主要收益变动来源是${escapeHTML(leaderCopy || "有效贡献不足")}，两项合计${pct(leaderTotal, 2, true)}；模型合计${pct(value.contributions?.total, 2, true)}。</strong>
      <small>基于 ${escapeHTML(value.start)}—${escapeHTML(value.end)} 的五因子日收益回归生成，随窗口和净值数据同步更新。</small>
    </div>`;
}

function renderCampisiWaterfall(value) {
  const factors = ["level", "slope", "curve", "credit", "default", "alpha"];
  const values = factors.map((factor) => Number(value.contributions?.[factor]) || 0);
  const width = 960;
  const height = 330;
  const margin = { top: 32, right: 28, bottom: 58, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const step = innerWidth / (factors.length + 1);
  const barWidth = Math.min(76, step * 0.58);
  let running = 0;
  const bars = values.map((amount, index) => {
    const start = running;
    running += amount;
    return { factor: factors[index], amount, start, end: running, total: false };
  });
  const modelTotal = Number(value.contributions?.total);
  const total = Number.isFinite(modelTotal) ? modelTotal : running;
  bars.push({ factor: "total", amount: total, start: 0, end: total, total: true });
  const extrema = [0, total, ...bars.flatMap((bar) => [bar.start, bar.end])];
  let min = Math.min(...extrema);
  let max = Math.max(...extrema);
  const padding = Math.max((max - min) * 0.16, 0.005);
  min -= padding;
  max += padding;
  const y = (number) => margin.top + (max - number) / Math.max(max - min, 0.0001) * (height - margin.top - margin.bottom);
  const x = (index) => margin.left + step * (index + 0.5);
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, index) => max - index * (max - min) / (tickCount - 1));
  const connectors = bars.slice(0, -2).map((bar, index) => `<line x1="${(x(index) + barWidth / 2).toFixed(1)}" y1="${y(bar.end).toFixed(1)}" x2="${(x(index + 1) - barWidth / 2).toFixed(1)}" y2="${y(bar.end).toFixed(1)}" class="campisi-waterfall-connector"/>`).join("");
  return `<div class="campisi-waterfall-wrap"><svg class="campisi-waterfall" viewBox="0 0 ${width} ${height}" role="img" aria-label="收益贡献瀑布图">
    ${ticks.map((tick) => `<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" class="chart-grid-line"/><text x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end" class="chart-axis-label">${pct(tick, 1)}</text>`).join("")}
    ${connectors}
    ${bars.map((bar, index) => {
      const top = Math.min(y(bar.start), y(bar.end));
      const barHeight = Math.max(Math.abs(y(bar.start) - y(bar.end)), 2);
      const className = bar.total ? "total" : bar.amount >= 0 ? "positive" : "negative";
      const label = bar.total ? "合计" : CAMPISI_LABELS[bar.factor];
      return `<g><title>${escapeHTML(label)}：${pct(bar.amount, 2, true)}</title><rect x="${(x(index) - barWidth / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" class="campisi-waterfall-bar ${className}"/><text x="${x(index).toFixed(1)}" y="${Math.max(top - 8, 14).toFixed(1)}" text-anchor="middle" class="campisi-waterfall-value">${pct(bar.amount, 2, true)}</text><text x="${x(index).toFixed(1)}" y="${height - 24}" text-anchor="middle" class="chart-axis-label campisi-waterfall-label">${escapeHTML(label.replace("主动管理", ""))}</text></g>`;
    }).join("")}
  </svg></div>`;
}

function renderCampisiPeerPosition(campisi, value) {
  const percentiles = campisi.peer_percentiles || {};
  const quartiles = campisi.peer_quartiles || {};
  const available = CAMPISI_FACTORS.filter((factor) => Number.isFinite(Number(percentiles[factor])));
  if (!available.length) return '<p class="empty-copy">同类横截面样本不足，暂不输出百分位定位。</p>';
  const summary = available.map((factor) => ({ factor, percentile: Number(percentiles[factor]) })).sort((left, right) => Math.abs(right.percentile - 0.5) - Math.abs(left.percentile - 0.5)).slice(0, 3).map(({ factor, percentile }) => `${CAMPISI_LABELS[factor]}${campisiPercentileReading(percentile)}（${Math.round(percentile * 100)}%）`).join("、");
  const rows = available.map((factor) => {
    const percentile = Math.max(0, Math.min(1, Number(percentiles[factor])));
    const quartile = quartiles[factor] || {};
    return `<div class="campisi-percentile-row">
      <div class="campisi-percentile-heading"><strong>${escapeHTML(CAMPISI_LABELS[factor])} β=${num(value.betas?.[factor], 3)}</strong><span>第${Math.round(percentile * 100)}百分位 · ${campisiPercentileReading(percentile)}</span></div>
      <div class="campisi-percentile-track"><i style="left:${(percentile * 100).toFixed(2)}%"></i><b class="p25"></b><b class="p50"></b><b class="p75"></b></div>
      <div class="campisi-percentile-labels"><span>P25 ${num(quartile.p25, 2)}</span><span>P50 ${num(quartile.p50, 2)}</span><span>P75 ${num(quartile.p75, 2)}</span></div>
    </div>`;
  }).join("");
  return `<div class="campisi-peer-summary"><strong>${escapeHTML(campisi.peer_reference_date || value.end)}：</strong>${escapeHTML(summary)}。</div>${rows}`;
}

function genericCampisiWindow(campisi, key) {
  const value = campisi?.windows?.[key];
  if (!value) return '<p class="empty-copy">该窗口有效共同样本不足，暂不输出回归结果。</p>';
  return `
    <article class="subpanel campisi-waterfall-panel"><div class="subpanel-heading"><div><h3>收益贡献分解</h3><span>${value.annualized ? "算术年化" : "本窗口实际累计"} · ${escapeHTML(value.start)}至${escapeHTML(value.end)}</span></div></div>${renderCampisiWaterfall(value)}<div class="research-metric-grid metric-four">${metric("模型合计", pct(value.contributions?.total, 2, true))}${metric("主动管理Alpha", pct(value.contributions?.alpha, 2, true))}${metric("拟合优度R²", num(value.r2, 3))}${metric("共同样本", `${value.n}日`)}</div></article>
    <article class="subpanel campisi-peer-panel"><div class="subpanel-heading"><div><h3>同类百分位定位</h3><span>按中长期/短期纯债内部分类 · 全历史β横截面</span></div></div>${renderCampisiPeerPosition(campisi, value)}<p class="method-note">圆点是本基金位置；P25、P50、P75来自同类基金β分布。百分位用于比较因子暴露强弱，不代表收益排名。</p></article>`;
}

function genericCampisiPanel(fund, campisi) {
  if (!campisi?.windows || !Object.keys(campisi.windows).length) {
    return `<div class="panel-intro"><div><p class="eyebrow">CAMPISI / RBA</p><h2>债券五因子归因</h2></div><p>该基金与五因子共同日收益样本不足120个，暂不输出不稳定结果。</p></div><article class="subpanel"><p class="empty-copy">等待基金积累足够净值历史。</p></article>`;
  }
  const labels = { ytd: "今年以来", "1y": "近1年", "3y": "近3年", "5y": "近5年", all: "成立以来" };
  const available = Object.keys(labels).filter((key) => campisi.windows[key]);
  const selected = available.includes("ytd") ? "ytd" : available[0];
  return `
    <div class="panel-intro"><div><p class="eyebrow">CAMPISI / RETURN-BASED ATTRIBUTION</p><h2>债券五因子收益归因</h2></div><p>用基金日复权净值收益回归正交化的利率水平、斜率、凸度、信用和违约五因子，拆分收益来源与主动管理Alpha。</p></div>
    <div class="toolbar"><label>归因窗口<select id="generic-campisi-window">${available.map((key) => `<option value="${key}"${key === selected ? " selected" : ""}>${labels[key]}</option>`).join("")}</select></label></div>
    <div id="generic-campisi-profile">${genericCampisiProfile(campisi, selected)}</div>
    <article class="subpanel campisi-glossary"><div class="subpanel-heading"><div><h3>五因子含义</h3><span>先看方向，再结合贡献和t值判断</span></div></div><div class="campisi-glossary-grid">
      <p><strong>利率水平</strong><span>收益率曲线平行移动，主要反映组合久期暴露。</span></p>
      <p><strong>曲线斜率</strong><span>长短端利率相对变化，反映陡峭化或平坦化配置。</span></p>
      <p><strong>曲线凸度</strong><span>中段相对两端变化，反映子弹型或哑铃型配置。</span></p>
      <p><strong>信用利差</strong><span>高等级信用债相对国债利差，反映信用配置暴露。</span></p>
      <p><strong>违约利差</strong><span>低等级相对高等级信用利差，反映更深信用下沉。</span></p>
    </div></article>
    <div id="generic-campisi-output">${genericCampisiWindow(campisi, selected)}</div>
    <p class="method-note">方法：日简单收益OLS；今年以来使用未年化累计贡献，其余窗口使用252/n算术年化，因此各分项可以线性相加。因子源覆盖2010-01-04至2026-07-29；这是基于净值的RBA，不等同于逐券交易归因。</p>`;
}

function bindGenericCampisi(campisi) {
  const select = document.querySelector("#generic-campisi-window");
  const profile = document.querySelector("#generic-campisi-profile");
  const output = document.querySelector("#generic-campisi-output");
  if (!select || !profile || !output) return;
  select.addEventListener("change", () => {
    profile.innerHTML = genericCampisiProfile(campisi, select.value);
    output.innerHTML = genericCampisiWindow(campisi, select.value);
  });
}

function genericDocumentsPanel(fund, fundDocuments) {
  const documents = fundDocuments?.documents || [];
  const rows = documents.map((item) => {
    const url = safeDocumentUrl(item.pdf_url);
    return [
      escapeHTML(item.publish_date || "—"),
      `<strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.report_id || "")}</small>`,
      url
        ? `<a class="button button-secondary" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">查看PDF原文</a>`
        : '<span class="status-pill reduced">链接待核验</span>',
    ];
  });
  return `
    <div class="panel-intro"><div><p class="eyebrow">DISCLOSURES</p><h2>公告与定期报告原文</h2></div><p>按基金主体合并份额，展示已索引的季度报告、中期/半年度报告和年度报告。</p></div>
    <article class="subpanel"><div class="subpanel-heading"><div><h3>最近定期报告</h3><span>${documents.length ? `已索引 ${documents.length} 份` : "等待增量索引"}</span></div></div>${rows.length ? renderTable(["披露日期", "报告", "原文"], rows, "holdings-table-wrap") : '<p class="empty-copy">该基金的定期报告尚未进入本地增量索引。</p>'}<p class="method-note">元数据来自公开基金公告聚合接口，链接指向公开PDF原文；本地不批量复制PDF。若链接失效，应回到基金管理人网站或证监会基金电子披露平台核验。</p></article>`;
}

function renderGenericFund(fund, catalogData, detail, holdingHistory, bondHistory, fundDocuments, campisi, brinson, multiAssetAttribution, heavyStockTrends) {
  document.title = `${fund.name}详细分析 · 财富产品部-基金研究系统看板`;
  const tabs = GENERIC_TABS[fund.category] || GENERIC_TABS["active-equity"];
  const multiIndexAnalysis = genericMultiIndexAnalysis(fund, detail);
  const content = {
    performance: genericPerformancePanel(fund, detail, brinson),
    evaluation: fund.category === "hybrid-bond" ? genericHybridBondEvaluationPanel(fund, detail, holdingHistory) : "",
    assets: genericAssetPanel(fund, detail, holdingHistory),
    bonds: genericBondPanel(fund, bondHistory, detail),
    industries: genericIndustryPanel(fund, holdingHistory),
    holdings: genericHoldingsPanel(fund, holdingHistory, heavyStockTrends)
      + (fund.category === "convertible-bond" ? genericBondPanel(fund, bondHistory, detail) : ""),
    rebalancing: genericRebalancingPanel(fund, detail, holdingHistory, multiIndexAnalysis),
    correlation: genericCorrelationLoadingPanel(),
    attribution: fund.category === "pure-bond" ? genericCampisiPanel(fund, campisi) : genericAttributionPanel(fund, brinson, multiAssetAttribution),
    documents: genericDocumentsPanel(fund, fundDocuments),
  };
  const latestQuarter = holdingHistory?.quarterly?.at(-1);
  const top10Weight = latestQuarter?.holdings?.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  const relativeMetrics = window.INDEX_ENHANCED_METRICS?.funds?.[fund.code] || fund.relative_metrics || {};
  const overviewMetrics = (() => {
    if (fund.category === "index-enhanced") return `${metric("近1年超额", pct(relativeMetrics.excess_returns?.["1y"], 1, true))}${metric("近3年超额", pct(relativeMetrics.excess_returns?.["3y"], 1, true))}${metric("近1年超额回撤", pct(relativeMetrics.excess_drawdowns?.["1y"], 1))}${metric("跟踪误差", pct(relativeMetrics.tracking_error, 1))}${metric("信息比率", num(relativeMetrics.information_ratio, 2))}`;
    if (fund.category === "pure-bond") return `${metric("近1年收益", pct(fund.performance?.returns?.["1y"], 1, true))}${metric("近3年收益", pct(fund.performance?.returns?.["3y"], 1, true))}${metric("近1年最大回撤", pct(fund.performance?.drawdowns?.["1y"], 1))}${metric("最新杠杆", Number.isFinite(Number(fund.asset?.leverage)) ? `${num(fund.asset.leverage, 2)}x` : "—")}${metric("最新久期", Number.isFinite(Number(fund.duration?.value)) ? `${num(fund.duration.value, 2)}年` : "—")}`;
    if (["hybrid-bond", "convertible-bond"].includes(fund.category)) return `${metric("近1年收益", pct(fund.performance?.returns?.["1y"], 1, true))}${metric("近3年收益", pct(fund.performance?.returns?.["3y"], 1, true))}${metric("近1年最大回撤", pct(fund.performance?.drawdowns?.["1y"], 1))}${metric("最新股票仓位", pct(fund.asset?.stock_weight, 1))}${metric("最新转债仓位", pct(fund.asset?.convertible_bond_weight, 1))}`;
    return `${metric("近1年收益", pct(fund.performance?.returns?.["1y"], 1, true))}${metric("近3年收益", pct(fund.performance?.returns?.["3y"], 1, true))}${metric("近1年最大回撤", pct(fund.performance?.drawdowns?.["1y"], 1))}${metric("最新股票仓位", pct(fund.asset?.stock_weight, 1))}${metric("最新前十大集中度", Number.isFinite(top10Weight) ? pct(top10Weight, 1) : "—")}`;
  })();
  const sourceType = String(catalogData.source?.type || "");
  const navSource = sourceType.includes("choice_increment")
    ? `基金净值历史基线来自WDS，最新区间由Choice复权净值增量补充；全站最新日期为 ${escapeHTML(catalogData.source?.nav_latest || "—")}`
    : `基金净值数据最新到 ${escapeHTML(catalogData.source?.nav_latest || "—")}`;
  page.innerHTML = `
    <a class="back-link" href="index.html#samples">← 返回基金列表</a>
    <section class="fund-page-hero"><div><p class="eyebrow">${escapeHTML(fund.code)} · ${escapeHTML(fund.category_label)}</p><h1>${escapeHTML(fund.name)}</h1><p class="fund-page-summary">${escapeHTML(fund.subtype)} · ${escapeHTML(fund.fund_company || "")}</p><div class="tag-row"><span class="tag">全量基金目录</span><span class="tag">份额已合并</span></div></div><dl class="hero-facts"><div><dt>现任经理</dt><dd>${escapeHTML((fund.manager || []).join("、") || "—")}</dd></div><div><dt>最新规模</dt><dd>${money(fund.asset?.net_asset)}</dd></div><div><dt>净值截止</dt><dd>${escapeHTML(fund.performance?.latest_date || "—")}</dd></div></dl></section>
    <section class="fund-page-metrics">${overviewMetrics}</section>
    <nav class="fund-tab-nav" aria-label="基金分析板块" role="tablist">${tabs.map(([id, label], index) => `<button class="${index === 0 ? "active" : ""}" data-tab="${id}" role="tab" aria-selected="${index === 0}">${escapeHTML(label)}</button>`).join("")}</nav>
    <div class="fund-tab-content">${tabs.map(([id], index) => panel(id, content[id], index === 0)).join("")}</div>
    <section class="data-boundary"><div><p class="eyebrow">DATA BOUNDARY</p><h2>数据口径</h2></div><ul><li>${navSource}；该基金实际净值日期为 ${escapeHTML(fund.performance?.latest_date || "—")}。</li><li>资产配置报告期为 ${escapeHTML(fund.asset?.report_date || "—")}；久期报告期为 ${escapeHTML(fund.duration?.report_date || "—")}。</li><li>同一基金的A/C/D/E等份额已合并；规模和持仓按基金主体去重，不重复加总。</li><li>披露持仓是报告期快照，不代表实时持仓；研究结果不构成投资建议。</li></ul></section>`;
  bindTabs(bindLazyCorrelation(fund));
  if (holdingHistory?.quarterly?.length || holdingHistory?.full?.length) {
    bindIndustryAnalysis({ industry_history: holdingHistory });
    bindHoldingAnalysis({ holding_analysis_history: holdingHistory });
    bindGenericRelativeIndustry(fund, holdingHistory);
  } else {
    bindGenericIndustry(fund);
  }
  bindGenericBondHistory(bondHistory, fund.category === "pure-bond");
  bindGenericCampisi(campisi);
  bindGenericBrinson(brinson);
  bindGenericMultiAssetAttribution(multiAssetAttribution);
  if (fund.category === "hybrid-bond") bindHybridBondEvaluation(fund, detail, holdingHistory);
  if (heavyStockTrends?.stocks?.length) bindHeavyStockTrend({ heavy_stock_trends: heavyStockTrends });
  const chartPoints = genericNavChartPoints(fund, detail);
  const benchmark = genericBenchmark(fund, detail);
  bindGenericPerformanceChart(chartPoints, fund.name, benchmark.name, genericFundNavPoints(detail));
  if (["pure-bond", "hybrid-bond"].includes(fund.category)) bindPureBondIndexComparison(fund, detail);
  const assetHistory = (detail?.asset_history || []).map((item) => ({ report_date: item.date, stock_to_nav: item.stock, bond_to_nav: item.bond, cash_to_nav: item.cash }));
  if (assetHistory.length) bindAssetAllocationChart(assetHistory);
  bindPureBondTripleAxisCharts();
  if (multiIndexAnalysis) bindMultiIndexChart(multiIndexAnalysis, fund.name);
  bindMiniLineCharts();
}

function normalizeGenericHoldingHistory(raw) {
  if (!raw) return null;
  if (!raw.schema_version || raw.schema_version < 2) return raw;
  const securities = raw.s || [];
  const labels = raw.l || [];
  const securityNames = new Map();
  securities.forEach((security) => {
    const code = comparableSecurityCode(security[0]);
    const name = String(security[1] || "").trim();
    if (name && comparableSecurityCode(name) !== code && !/\.(?:SH|SZ|BJ|HK)$/i.test(name)) securityNames.set(code, name);
  });
  const decodePeriod = (period) => {
    const holdings = (period.h || []).map((item, index) => {
      const security = securities[item[0]] || ["—", "—"];
      const comparableCode = comparableSecurityCode(security[0]);
      const displayName = securityNames.get(comparableCode) || security[1];
      return {
        rank: index + 1,
        code: security[0],
        name: displayName,
        weight: item[1],
        float_share_percent: item[2],
        classifications: { sector: labels[item[3]], level1: labels[item[4]], level2: labels[item[5]], level3: labels[item[6]] },
        characteristics: (() => {
          const dateValues = window.FUND_HOLDING_CHARACTERISTICS?.[period.d];
          const values = dateValues?.[security[0]] || dateValues?.[comparableCode];
          if (values) return { market_value: values[0], free_float_market_value: values[1], pe_ttm: values[2], pb_mrq: values[3], roe_ttm: values[4], growth_ttm_pit: values[5] };
          return item.length > 7 ? { market_value: item[7], free_float_market_value: item[8], pe_ttm: item[9], pb_mrq: item[10], roe_ttm: item[11], growth_ttm_pit: item[12] } : null;
        })(),
      };
    });
    const decodeChanges = (values) => values.map((index) => ({ code: securities[index]?.[0] || "—", name: securities[index]?.[1] || "—" }));
    const weights = Object.fromEntries(Object.entries(period.w || {}).map(([dimension, values]) => [dimension, Object.fromEntries(values.map(([index, value]) => [labels[index], value]))]));
    return {
      report_date: period.d,
      announcement_date: period.a,
      holding_count: holdings.length,
      total_weight: holdings.reduce((sum, item) => sum + Number(item.weight || 0), 0),
      weights,
      holdings,
      entered: decodeChanges(period.e || []),
      exited: decodeChanges(period.x || []),
    };
  };
  return { quarterly: (raw.q || []).map(decodePeriod), full: (raw.f || []).map(decodePeriod) };
}

function loadGenericDetail(code) {
  if (window.FUND_DETAIL_DATA?.[code]) return Promise.resolve(window.FUND_DETAIL_DATA[code]);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/funds/${encodeURIComponent(code)}.js`;
    // 单个按基金拆分的连续序列缺失时，仍使用全量目录和公共数据渲染详情页。
    // 不能让一条可选数据失败阻断基金基础信息、收益回撤和持仓模块。
    script.onload = () => resolve(window.FUND_DETAIL_DATA?.[code] || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function loadDeepSampleData() {
  const embedded = window.__standaloneEmbeddedData;
  if (embedded?.["funds.json"] && embedded?.["fund_detail_data.json"] && embedded?.["fund_analysis_data.json"]) {
    return Promise.resolve({
      summary: embedded["funds.json"],
      details: embedded["fund_detail_data.json"],
      analysis: embedded["fund_analysis_data.json"],
    });
  }
  if (window.FUND_DEEP_SAMPLE_DATA) return Promise.resolve(window.FUND_DEEP_SAMPLE_DATA);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/deep_samples.js";
    script.onload = () => window.FUND_DEEP_SAMPLE_DATA
      ? resolve(window.FUND_DEEP_SAMPLE_DATA)
      : reject(new Error("深度样本数据脚本未生成有效内容"));
    script.onerror = () => reject(new Error("深度样本数据加载失败"));
    document.head.appendChild(script);
  });
}

function loadHoldingCharacteristicDates(dates) {
  return Promise.all([...new Set(dates.filter(Boolean))].map((date) => {
      if (window.FUND_HOLDING_CHARACTERISTICS?.[date]) return Promise.resolve();
      return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/holding_characteristics/${encodeURIComponent(date)}.js`;
        script.onload = script.onerror = () => resolve();
        document.head.appendChild(script);
      });
    }));
}

function hydrateHoldingPeriodCharacteristics(period) {
  if (!period?.report_date || !period?.holdings) return period;
  const dateValues = window.FUND_HOLDING_CHARACTERISTICS?.[period.report_date];
  if (!dateValues) return period;
  period.holdings.forEach((holding) => {
    const values = dateValues[holding.code] || dateValues[comparableSecurityCode(holding.code)];
    if (!values) return;
    holding.characteristics = {
      ...(holding.characteristics || {}),
      market_value: values[0],
      free_float_market_value: values[1],
      pe_ttm: values[2],
      pb_mrq: values[3],
      roe_ttm: values[4],
      growth_ttm_pit: values[5],
    };
  });
  return period;
}

function loadGenericHoldingHistory(code) {
  const loadCharacteristics = (raw) => {
    const latestDates = [raw?.q?.at(-1)?.d, raw?.f?.at(-1)?.d].filter(Boolean);
    return loadHoldingCharacteristicDates(latestDates).then(() => normalizeGenericHoldingHistory(raw));
  };
  if (window.FUND_HOLDING_HISTORY?.[code]) return loadCharacteristics(window.FUND_HOLDING_HISTORY[code]);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/holdings/${encodeURIComponent(code)}.js`;
    script.onload = () => loadCharacteristics(window.FUND_HOLDING_HISTORY?.[code]).then(resolve);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function loadGenericStockPrice(code) {
  const normalize = (value) => (value?.prices || []).map((item) => (
    Array.isArray(item) ? { date: item[0], value: item[1] } : item
  ));
  if (window.FUND_STOCK_PRICE_SERIES?.[code]) return Promise.resolve(normalize(window.FUND_STOCK_PRICE_SERIES[code]));
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/stock_prices/${encodeURIComponent(code)}.js`;
    script.onload = () => resolve(normalize(window.FUND_STOCK_PRICE_SERIES?.[code]));
    script.onerror = () => resolve([]);
    document.head.appendChild(script);
  });
}

function loadGenericHeavyStockTrends(code, detail) {
  const normalize = async (value) => {
    if (!value) return null;
    const nav = genericFundNavPoints(detail).map((item) => ({ date: item.date, value: item.fund }));
    const stocks = await Promise.all((value.stocks || []).map(async (stock) => ({
      ...stock,
      prices: stock.prices?.length ? stock.prices : await loadGenericStockPrice(stock.code),
      nav,
    })));
    return { ...value, stocks };
  };
  if (window.FUND_HEAVY_STOCK_TRENDS?.[code]) return normalize(window.FUND_HEAVY_STOCK_TRENDS[code]);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/heavy_stock/${encodeURIComponent(code)}.js`;
    script.onload = () => normalize(window.FUND_HEAVY_STOCK_TRENDS?.[code]).then(resolve);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function enrichDeepHoldingCharacteristics(analysis) {
  const apply = (date, holdings) => (holdings || []).forEach((holding) => {
    const dateValues = window.FUND_HOLDING_CHARACTERISTICS?.[date];
    const values = dateValues?.[holding.code] || dateValues?.[comparableSecurityCode(holding.code)];
    if (!values) return;
    holding.characteristics = {
      ...(holding.characteristics || {}),
      market_value: values[0], free_float_market_value: values[1],
      pe_ttm: values[2], pb_mrq: values[3], roe_ttm: values[4], growth_ttm_pit: values[5],
    };
  });
  apply(analysis.latest_top10?.report_date, analysis.latest_top10?.holdings);
  apply(analysis.full_holdings?.report_date, analysis.full_holdings?.holdings);
  for (const scope of ["quarterly", "full"]) {
    for (const period of analysis.holding_analysis_history?.[scope] || []) apply(period.report_date, period.holdings);
  }
}

function normalizeGenericBondHistory(raw) {
  if (!raw) return null;
  const securities = raw.s || [];
  let previous = new Map();
  return (raw.p || []).map((period) => {
    const holdings = (period.h || []).map((item) => ({
      code: securities[item[0]]?.[0] || "—",
      name: securities[item[0]]?.[1] || "—",
      market_value: item[1],
      quantity: item[2],
      weight: item[3],
    })).map((holding) => {
      const oldWeight = previous.get(holding.code);
      const difference = Number(holding.weight) - Number(oldWeight);
      return {
        ...holding,
        change: !previous.has(holding.code) ? "新进"
          : difference > 0.0001 ? "加仓"
          : difference < -0.0001 ? "减仓"
          : "持平",
      };
    });
    const decode = (values) => values.map((index) => ({ code: securities[index]?.[0] || "—", name: securities[index]?.[1] || "—" }));
    const result = {
      report_date: period.d,
      announcement_date: period.a,
      holdings,
      entered: decode(period.e || []),
      exited: decode(period.x || []),
      turnover_proxy: period.t,
      rolling_4q_turnover_proxy: period.r,
      convertible_turnover_proxy: period.c,
      convertible_rolling_4q_turnover_proxy: period.q,
    };
    previous = new Map(holdings.map((holding) => [holding.code, holding.weight]));
    return result;
  });
}

function loadGenericBondHistory(code) {
  if (window.FUND_BOND_HISTORY?.[code]) return Promise.resolve(normalizeGenericBondHistory(window.FUND_BOND_HISTORY[code]));
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/bond_history/${encodeURIComponent(code)}.js`;
    script.onload = () => resolve(normalizeGenericBondHistory(window.FUND_BOND_HISTORY?.[code]));
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function loadGenericDocuments(code) {
  if (window.FUND_DOCUMENTS?.[code]) return Promise.resolve(window.FUND_DOCUMENTS[code]);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/documents/${encodeURIComponent(code)}.js`;
    script.onload = () => resolve(window.FUND_DOCUMENTS?.[code] || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function loadGenericCampisi(code) {
  if (window.FUND_CAMPISI?.[code]) return Promise.resolve(window.FUND_CAMPISI[code]);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/campisi/${encodeURIComponent(code)}.js`;
    script.onload = () => resolve(window.FUND_CAMPISI?.[code] || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function normalizeGenericBrinson(raw) {
  if (!raw || raw.v !== 2) return raw;
  const industryFields = ["industry", "average_portfolio_weight", "average_benchmark_weight", "linked_allocation_effect", "linked_stock_selection_effect", "linked_active_effect"];
  const periodFields = ["period_start", "period_end", "disclosed_stock_weight", "disclosed_a_share_weight", "priced_a_share_weight", "a_share_holding_count", "priced_a_share_count", "benchmark_constituent_count", "benchmark_weight_coverage", "portfolio_a_share_return", "benchmark_return", "active_return", "allocation_effect", "selection_effect", "interaction_effect", "stock_selection_effect", "unmapped_portfolio_weight", "unmapped_benchmark_weight", "benchmark_name", "benchmark_code"];
  const detailFields = ["period_start", "period_end", "industry", "portfolio_weight", "benchmark_weight", "portfolio_return", "benchmark_return", "allocation_effect", "selection_effect", "interaction_effect", "active_effect"];
  const decode = (values, fields) => values.map((row) => Object.fromEntries(fields.map((field, index) => [field, row[index]])));
  return {
    method: raw.method,
    scope: raw.scope,
    summary: raw.s,
    industries: decode(raw.i || [], industryFields),
    periods: decode(raw.p || [], periodFields),
    period_industries: decode(raw.d || [], detailFields),
  };
}

function loadGenericBrinson(code) {
  if (window.FUND_BRINSON?.[code]) return Promise.resolve(normalizeGenericBrinson(window.FUND_BRINSON[code]));
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/brinson/${encodeURIComponent(code)}.js`;
    script.onload = () => resolve(normalizeGenericBrinson(window.FUND_BRINSON?.[code]));
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function loadGenericMultiAssetAttribution(code) {
  if (window.FUND_MULTI_ASSET_ATTRIBUTION?.[code]) return Promise.resolve(window.FUND_MULTI_ASSET_ATTRIBUTION[code]);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/multi_asset_attribution/${encodeURIComponent(code)}.js`;
    script.onload = () => resolve(window.FUND_MULTI_ASSET_ATTRIBUTION?.[code] || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function bindGenericBrinson(brinson) {
  bindBrinsonRange(brinson);
}

function showError(message) {
  page.innerHTML = `<div class="page-error"><h1>无法打开基金分析</h1><p>${escapeHTML(message)}</p><a class="button button-primary" href="index.html#samples">返回基金列表</a></div>`;
}

if (!fundId && !fundCode) {
  window.location.replace("index.html#samples");
} else {
  const loadCatalogData = async () => {
    if (window.FUND_DASHBOARD_CATALOG) return window.FUND_DASHBOARD_CATALOG;
    const response = await fetch("https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/fund_catalog.json");
    if (!response.ok) throw new Error(`全量基金目录加载失败：${response.status}`);
    return response.json();
  };
  loadCatalogData()
    .then(async (catalogData) => {
      const normalizedCode = String(fundCode || "").toUpperCase();
      if (DEEP_SAMPLE_CODES.has(normalizedCode)) {
        const deepSampleData = await loadDeepSampleData();
        const summaryData = deepSampleData.summary;
        const details = deepSampleData.details;
        const analysisData = deepSampleData.analysis;
        const fund = summaryData.funds.find((item) => item.code === normalizedCode || item.id === fundId);
        if (!fund) throw new Error("没有找到该深度样本的研究数据");
        const detailData = details.funds[fund.code];
        const analysis = analysisData.funds[fund.code];
        if (!detailData || !analysis) throw new Error("该基金的分析模块尚未生成");
        const characteristicDates = [
          analysis.latest_top10?.report_date,
          analysis.full_holdings?.report_date,
        ];
        const [, fundDocuments, currentBrinson] = await Promise.all([
          loadHoldingCharacteristicDates(characteristicDates),
          loadGenericDocuments(fund.code),
          loadGenericBrinson(fund.code),
        ]);
        if (currentBrinson?.periods?.length) analysis.brinson_manager_tenure = currentBrinson;
        enrichDeepHoldingCharacteristics(analysis);
        renderFund(fund, summaryData, detailData, analysisData, analysis, fundDocuments);
        return;
      }
      const catalogFund = (catalogData.funds || []).find((item) =>
        item.code === normalizedCode || item.id === fundId || item.code.split(".")[0] === fundId
      );
      if (!catalogFund) throw new Error("没有找到该基金的研究数据");
      await loadCategoryAssets(catalogFund.category);
      const genericDetail = await loadGenericDetail(catalogFund.code);
      const [holdingHistory, bondHistory, fundDocuments, campisi, brinson, multiAssetAttribution, heavyStockTrends] = await Promise.all([
        ["active-equity", "index-enhanced", "hybrid-bond", "convertible-bond"].includes(catalogFund.category) ? loadGenericHoldingHistory(catalogFund.code) : Promise.resolve(null),
        ["pure-bond", "hybrid-bond", "convertible-bond"].includes(catalogFund.category) ? loadGenericBondHistory(catalogFund.code) : Promise.resolve(null),
        loadGenericDocuments(catalogFund.code),
        catalogFund.category === "pure-bond" ? loadGenericCampisi(catalogFund.code) : Promise.resolve(null),
        catalogFund.category === "active-equity" ? loadGenericBrinson(catalogFund.code) : Promise.resolve(null),
        ["hybrid-bond", "convertible-bond"].includes(catalogFund.category) ? loadGenericMultiAssetAttribution(catalogFund.code) : Promise.resolve(null),
        catalogFund.category === "active-equity" ? loadGenericHeavyStockTrends(catalogFund.code, genericDetail) : Promise.resolve(null),
      ]);
      if (!holdingHistory && ["active-equity", "index-enhanced", "hybrid-bond", "convertible-bond"].includes(catalogFund.category)) {
        await loadDashboardAsset("stock_classification.js");
      }
      renderGenericFund(catalogFund, catalogData, genericDetail, holdingHistory, bondHistory, fundDocuments, campisi, brinson, multiAssetAttribution, heavyStockTrends);
    })
    .catch((error) => showError(error.message));
}
