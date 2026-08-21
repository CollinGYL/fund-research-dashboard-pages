const grid = document.querySelector("#fund-grid");
const search = document.querySelector("#fund-search");
const filter = document.querySelector("#fund-filter");
const subtypeTabs = document.querySelector("#fund-subtype-tabs");
const resultCount = document.querySelector("#search-result-count");
const listHead = document.querySelector("#fund-list-head");
const suggestionList = document.querySelector("#fund-search-suggestions");
const pagination = document.querySelector("#fund-pagination");
const listTitle = document.querySelector("#fund-list-title");
const listDescription = document.querySelector("#fund-list-description");
const methodologyNote = document.querySelector("#fund-list-methodology");

const CATEGORY_LABELS = {
  all: "全部基金",
  "active-equity": "主动权益基金",
  "index-enhanced": "指数增强基金",
  "pure-bond": "纯债基金",
  "hybrid-bond": "一级债基/二级债基",
  "convertible-bond": "转债基金",
};

const PERIOD_SETS = {
  short: [["1m", "近1月"], ["3m", "近3月"], ["6m", "近6月"], ["1y", "近1年"]],
  long: [["1y", "近1年"], ["3y", "近3年"], ["5y", "近5年"]],
};

const FUND_SIZE_FILTERS = [
  ["all", "全部规模"],
  ["lt1", "1亿以下"],
  ["1to10", "1–10亿"],
  ["10to50", "10–50亿"],
  ["50to100", "50–100亿"],
  ["gte100", "100亿以上"],
  ["missing", "规模缺失"],
];

const PAGE_SIZE = 50;
let funds = [];
let catalog = null;
let legacyFunds = [];
let analysisFunds = {};
let activeCategory = "all";
let listPeriodMode = "short";
let currentPage = 1;
let sortState = { key: null, metric: "return", direction: "desc" };
let fundSizeFilterState = "all";
let classificationRankState = { level: "sector", industryLevel: "level1", name: "", direction: "desc" };
let classificationNameCache = {};
let suggestedFunds = [];
let activeSuggestionIndex = -1;
let stockClassificationPromise = null;
const searchTextByCode = new Map();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPercent(value, digits = 1, signed = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${signed && number > 0 ? "+" : ""}${(number * 100).toFixed(digits)}%`;
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (Math.abs(number) >= 1e8) return `${(number / 1e8).toFixed(1)}亿元`;
  if (Math.abs(number) >= 1e4) return `${(number / 1e4).toFixed(0)}万元`;
  return `${number.toFixed(0)}元`;
}

function matchesFundSize(fund) {
  if (fundSizeFilterState === "all") return true;
  const rawValue = fund.asset?.net_asset;
  const value = rawValue === null || rawValue === undefined || rawValue === "" ? NaN : Number(rawValue);
  if (!Number.isFinite(value)) return fundSizeFilterState === "missing";
  if (fundSizeFilterState === "lt1") return value < 1e8;
  if (fundSizeFilterState === "1to10") return value >= 1e8 && value < 1e9;
  if (fundSizeFilterState === "10to50") return value >= 1e9 && value < 5e9;
  if (fundSizeFilterState === "50to100") return value >= 5e9 && value < 1e10;
  if (fundSizeFilterState === "gte100") return value >= 1e10;
  return false;
}

function categoryFunds() {
  return activeCategory === "all" ? funds : funds.filter((fund) => fund.category === activeCategory);
}

function searchableText(fund) {
  if (searchTextByCode.has(fund.code)) return searchTextByCode.get(fund.code);
  const value = [
    fund.name,
    fund.code,
    fund.category_label,
    fund.subtype,
    fund.broad_type,
    fund.fund_company,
    fund.benchmark,
    ...(fund.manager || []),
  ].join(" ").toLowerCase();
  searchTextByCode.set(fund.code, value);
  return value;
}

function legacyAnalysis(fund) {
  return analysisFunds[fund.code] || null;
}

function topWeight(weights) {
  const entries = Object.entries(weights || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]));
  if (!entries.length) return null;
  return `${entries[0][0].replace("(中信)", "")} ${formatPercent(entries[0][1])}`;
}

function classificationSummary(fund) {
  const fullMarket = window.FUND_STOCK_CLASSIFICATION?.funds?.[fund.code]
    || window.FUND_STOCK_CLASSIFICATION_SUMMARY?.funds?.[fund.code];
  if (fullMarket) {
    return {
      sector: topWeight(fullMarket.sector_weights) || "未映射",
      industry: topWeight(fullMarket.industry_weights?.level1) || "未映射",
      date: fullMarket.report_date,
    };
  }
  const analysis = legacyAnalysis(fund);
  const classification = analysis?.home_classification || {};
  const level1 = topWeight(classification.industry_weights?.level1);
  const sector = topWeight(classification.sector_weights);
  return {
    sector: sector || "待生成全量板块映射",
    industry: level1 || "待生成全量行业映射",
    date: classification.report_date || null,
  };
}

function classificationWeights(fund, level) {
  const fullMarket = window.FUND_STOCK_CLASSIFICATION?.funds?.[fund.code]
    || window.FUND_STOCK_CLASSIFICATION_SUMMARY?.funds?.[fund.code];
  if (fullMarket) return level === "sector" ? fullMarket.sector_weights || {} : fullMarket.industry_weights?.[level] || {};
  const classification = legacyAnalysis(fund)?.home_classification || {};
  return level === "sector" ? classification.sector_weights || {} : classification.industry_weights?.[level] || {};
}

function selectedClassificationWeight(fund, level = classificationRankState.level, name = classificationRankState.name) {
  if (!name) return null;
  const value = Number(classificationWeights(fund, level)?.[name]);
  return Number.isFinite(value) ? value : null;
}

function classificationNames(level) {
  if (!window.FUND_STOCK_CLASSIFICATION) return [];
  if (!Object.prototype.hasOwnProperty.call(classificationNameCache, level)) {
    classificationNameCache[level] = [...new Set(
      funds
        .filter((fund) => fund.category === "active-equity")
        .flatMap((fund) => Object.keys(classificationWeights(fund, level))),
    )].sort((left, right) => left.localeCompare(right, "zh-CN"));
  }
  return classificationNameCache[level];
}

function fundSizeHeader() {
  const options = FUND_SIZE_FILTERS.map(([value, label]) => `<option value="${value}"${value === fundSizeFilterState ? " selected" : ""}>${label}</option>`).join("");
  return `<th class="table-filter-heading size-filter-heading"><span>基金规模</span><select id="fund-size-filter" class="table-header-select" aria-label="筛选基金规模">${options}</select></th>`;
}

function classificationDirectionButton(level) {
  const active = classificationRankState.level === level && Boolean(classificationRankState.name);
  const label = classificationRankState.direction === "desc" ? "高→低" : "低→高";
  return `<button type="button" class="table-filter-direction" data-classification-direction-level="${level}" aria-label="切换权重排序方向" title="切换权重排序方向"${active ? "" : " disabled"}>${label}</button>`;
}

function classificationHeader(kind) {
  if (kind === "sector") {
    const selectedName = classificationRankState.level === "sector" ? classificationRankState.name : "";
    const names = classificationNames("sector");
    const options = `<option value="">全部板块</option>${names.map((name) => `<option value="${escapeHtml(name)}"${name === selectedName ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}`;
    return `<th class="table-filter-heading sector-filter-heading${selectedName ? " is-active" : ""}"><span>板块权重</span><div class="table-header-filter-row"><select id="header-sector-name" class="table-header-select" aria-label="选择板块，按权重排序">${options}</select>${classificationDirectionButton("sector")}</div></th>`;
  }
  const industryLevel = classificationRankState.industryLevel;
  const selectedName = classificationRankState.level === industryLevel ? classificationRankState.name : "";
  const options = `<option value="">全部行业</option>${classificationNames(industryLevel).map((name) => `<option value="${escapeHtml(name)}"${name === selectedName ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}`;
  return `<th class="table-filter-heading industry-filter-heading${selectedName ? " is-active" : ""}"><span>行业权重</span><div class="table-header-filter-row"><select id="header-industry-level" class="table-header-select table-header-level-select" aria-label="选择行业层级"><option value="level1"${industryLevel === "level1" ? " selected" : ""}>中信一级</option><option value="level2"${industryLevel === "level2" ? " selected" : ""}>中信二级</option><option value="level3"${industryLevel === "level3" ? " selected" : ""}>中信三级</option></select><select id="header-industry-name" class="table-header-select table-header-name-select" aria-label="选择行业，按权重排序">${options}</select>${classificationDirectionButton(industryLevel)}</div></th>`;
}

function fundHref(fund) {
  return `fund.html?code=${encodeURIComponent(fund.code)}&id=${encodeURIComponent(fund.code.split(".")[0])}`;
}

function performanceMetric(fund, key, metric) {
  return fund.performance?.[metric === "return" ? "returns" : "drawdowns"]?.[key];
}

function relativeMetrics(fund) {
  return window.INDEX_ENHANCED_METRICS?.funds?.[fund.code] || fund.relative_metrics || {};
}

function periodCell(fund, key, relative = false) {
  if (relative) {
    const relativeData = relativeMetrics(fund);
    const value = relativeData?.excess_returns?.[key];
    const drawdown = relativeData?.excess_drawdowns?.[key];
    if (!Number.isFinite(Number(value))) {
      return '<td class="period-cell pending-cell"><strong>待补</strong><small>指数行情缓存</small></td>';
    }
    return `<td class="period-cell"><strong class="${Number(value) < 0 ? "negative" : "positive"}">${formatPercent(value, 1, true)}</strong><small>超额回撤 ${formatPercent(drawdown)}</small></td>`;
  }
  const value = performanceMetric(fund, key, "return");
  const drawdown = performanceMetric(fund, key, "drawdown");
  return `<td class="period-cell"><strong class="${Number(value) < 0 ? "negative" : "positive"}">${formatPercent(value, 1, true)}</strong><small>回撤 ${formatPercent(drawdown)}</small></td>`;
}

function bondStructureCell(asset) {
  const structure = asset?.bond_structure || {};
  const entries = [
    ["利率债", (Number(structure.government) || 0) + (Number(structure.financial) || 0)],
    ["信用债", Number(structure.corporate) || 0],
    ["转债", Number(structure.convertible) || 0],
    ["其他", Number(structure.other) || 0],
  ].filter(([, value]) => value > 0).sort((left, right) => right[1] - left[1]);
  if (!entries.length) return "—";
  return entries.slice(0, 3).map(([label, value]) => `${label} ${formatPercent(value)}`).join("<br>");
}

function commonCells(fund) {
  return `
    <td class="fund-name-cell"><a href="${fundHref(fund)}"><strong>${escapeHtml(fund.name)}</strong><small>${escapeHtml(fund.code)} · ${escapeHtml(fund.subtype)}</small></a></td>
    <td><strong>${escapeHtml((fund.manager || []).join("、") || "—")}</strong><small>${escapeHtml(fund.fund_company || "")}</small></td>
    <td>${escapeHtml(fund.inception_date || "—")}</td>
    <td><strong>${formatMoney(fund.asset?.net_asset)}</strong><small>${escapeHtml(fund.asset?.report_date || "无配置披露")}</small></td>
    <td class="benchmark-cell">${escapeHtml(fund.benchmark || "—")}</td>`;
}

function allFundOverviewCell(fund) {
  return `
    <td class="fund-name-cell all-fund-overview-cell">
      <a href="${fundHref(fund)}"><strong>${escapeHtml(fund.name)}</strong><small>${escapeHtml(fund.code)} · ${escapeHtml(fund.subtype)}</small></a>
      <div class="all-fund-overview-meta">
        <span><b>基金经理</b>${escapeHtml((fund.manager || []).join("、") || "—")}</span>
        <span><b>成立时间</b>${escapeHtml(fund.inception_date || "—")}</span>
        <span><b>基金公司</b>${escapeHtml(fund.fund_company || "—")}</span>
      </div>
    </td>`;
}

function coreMetric(label, value, note = "") {
  return `<span><small>${escapeHtml(label)}</small><strong>${value}</strong>${note ? `<em>${escapeHtml(note)}</em>` : ""}</span>`;
}

function leverageText(asset) {
  return Number.isFinite(Number(asset?.leverage)) ? `${Number(asset.leverage).toFixed(2)}x` : "—";
}

function leverageNote(asset, fallback = "") {
  if (asset?.leverage_status === "extreme_reconciled") {
    return `${fallback ? `${fallback} · ` : ""}特殊报告期`;
  }
  return fallback;
}

function allFundCoreCell(fund) {
  const assetDate = fund.asset?.report_date || "";
  if (fund.category === "active-equity") {
    const classification = classificationSummary(fund);
    return `${coreMetric("股票仓位", formatPercent(fund.asset?.stock_weight), assetDate)}${coreMetric("主要板块", escapeHtml(classification.sector), classification.date || "")}${coreMetric("主要行业", escapeHtml(classification.industry), "中信一级")}`;
  }
  if (fund.category === "index-enhanced") {
    const metrics = relativeMetrics(fund);
    return `${coreMetric("跟踪指数", escapeHtml(fund.tracking_index || "—"))}${coreMetric("跟踪误差", formatPercent(metrics.tracking_error), "近1年")}${coreMetric("信息比率", Number.isFinite(Number(metrics.information_ratio)) ? Number(metrics.information_ratio).toFixed(2) : "—")}`;
  }
  if (fund.category === "pure-bond") {
    return `${coreMetric("杠杆", leverageText(fund.asset), leverageNote(fund.asset, assetDate))}${coreMetric("久期", Number.isFinite(Number(fund.duration?.value)) ? `${Number(fund.duration.value).toFixed(2)}年` : "—", fund.duration?.report_date || "")}${coreMetric("券种结构", bondStructureCell(fund.asset))}`;
  }
  if (fund.category === "hybrid-bond") {
    return `${coreMetric("杠杆 / 久期", `${Number.isFinite(Number(fund.asset?.leverage)) ? `${Number(fund.asset.leverage).toFixed(2)}x` : "—"} / ${Number.isFinite(Number(fund.duration?.value)) ? `${Number(fund.duration.value).toFixed(2)}年` : "—"}`)}${coreMetric("股票 / 转债仓位", `${formatPercent(fund.asset?.stock_weight)} / ${formatPercent(fund.asset?.convertible_bond_weight)}`, assetDate)}${coreMetric("券种结构", bondStructureCell(fund.asset))}`;
  }
  const classification = classificationSummary(fund);
  return `${coreMetric("转债仓位", formatPercent(fund.asset?.convertible_bond_weight), assetDate)}${coreMetric("股票仓位", formatPercent(fund.asset?.stock_weight))}${coreMetric("主要行业", escapeHtml(classification.industry), "中信一级")}`;
}

function fundRow(fund) {
  const periods = PERIOD_SETS[listPeriodMode];
  const annual = fund.performance?.calendar?.[String(new Date(fund.performance?.latest_date || Date.now()).getFullYear())];
  if (activeCategory === "all") {
    return `<tr data-fund-code="${escapeHtml(fund.code)}">${allFundOverviewCell(fund)}
      <td><strong>${formatMoney(fund.asset?.net_asset)}</strong><small>${escapeHtml(fund.asset?.report_date || "无配置披露")}</small></td>
      ${periods.map(([key]) => periodCell(fund, key)).join("")}
      <td class="period-cell"><strong class="${Number(annual?.return) < 0 ? "negative" : "positive"}">${formatPercent(annual?.return, 1, true)}</strong><small>年度回撤 ${formatPercent(annual?.drawdown)}</small></td>
      <td><strong>${escapeHtml(fund.category_label)}</strong><small>${escapeHtml(fund.subtype)}</small></td>
      <td class="all-fund-core-cell"><div class="all-fund-core-grid">${allFundCoreCell(fund)}</div></td>
      <td class="benchmark-cell">${escapeHtml(fund.benchmark || "—")}</td>
      <td><strong>${fund.performance?.latest_date || "—"}</strong><small>净值截止日</small></td></tr>`;
  }
  const relative = activeCategory === "index-enhanced";
  let extras = "";
  if (activeCategory === "active-equity") {
    const classification = classificationSummary(fund);
    const selectedLevel = classificationRankState.level;
    const selectedName = classificationRankState.name;
    const selectedWeight = selectedClassificationWeight(fund, selectedLevel, selectedName);
    const selectedWeightText = Number.isFinite(selectedWeight) ? formatPercent(selectedWeight) : "—";
    const sectorDisplay = selectedName && selectedLevel === "sector" ? `${selectedName} ${selectedWeightText}` : classification.sector;
    const industryDisplay = selectedName && selectedLevel !== "sector" ? `${selectedName} ${selectedWeightText}` : classification.industry;
    extras = `
      <td><strong>${formatPercent(fund.asset?.stock_weight)}</strong><small>${escapeHtml(fund.asset?.report_date || "—")}</small></td>
      <td><strong>${escapeHtml(sectorDisplay)}</strong><small>${selectedName && selectedLevel === "sector" ? "所选板块" : escapeHtml(classification.date || "完整持仓")}</small></td>
      <td><strong>${escapeHtml(industryDisplay)}</strong><small>${selectedName && selectedLevel !== "sector" ? ({ level1: "中信一级", level2: "中信二级", level3: "中信三级" })[selectedLevel] : "中信一级"}</small></td>`;
  } else if (activeCategory === "index-enhanced") {
    extras = `
      <td><strong>${escapeHtml(fund.tracking_index || "—")}</strong><small>跟踪指数</small></td>
      <td><strong>${formatPercent(relativeMetrics(fund).tracking_error)}</strong><small>近1年日频</small></td>
      <td><strong>${Number.isFinite(Number(relativeMetrics(fund).information_ratio)) ? Number(relativeMetrics(fund).information_ratio).toFixed(2) : "—"}</strong></td>`;
  } else if (activeCategory === "pure-bond") {
    extras = `
      <td title="${escapeHtml(fund.asset?.leverage_note || "总资产/净资产")}"><strong>${leverageText(fund.asset)}</strong><small>${escapeHtml(leverageNote(fund.asset, fund.asset?.report_date || ""))}</small></td>
      <td><strong>${Number.isFinite(Number(fund.duration?.value)) ? Number(fund.duration.value).toFixed(2) + "年" : "—"}</strong><small>${escapeHtml(fund.duration?.report_date || "")}</small></td>
      <td class="bond-structure-cell">${bondStructureCell(fund.asset)}</td>`;
  } else if (activeCategory === "hybrid-bond") {
    const classification = classificationSummary(fund);
    extras = `
      <td title="${escapeHtml(fund.asset?.leverage_note || "总资产/净资产")}"><strong>${leverageText(fund.asset)}</strong>${fund.asset?.leverage_status === "extreme_reconciled" ? "<small>特殊报告期</small>" : ""}</td>
      <td><strong>${Number.isFinite(Number(fund.duration?.value)) ? Number(fund.duration.value).toFixed(2) + "年" : "—"}</strong><small>${escapeHtml(fund.duration?.report_date || "")}</small></td>
      <td class="bond-structure-cell">${bondStructureCell(fund.asset)}</td>
      <td><strong>${formatPercent(fund.asset?.stock_weight)}</strong></td>
      <td><strong>${formatPercent(fund.asset?.convertible_bond_weight)}</strong></td>
      <td><strong>${escapeHtml(classification.sector)}</strong><small>${escapeHtml(classification.date || "完整持仓")}</small></td>
      <td><strong>${escapeHtml(classification.industry)}</strong><small>中信一级</small></td>`;
  } else if (activeCategory === "convertible-bond") {
    const classification = classificationSummary(fund);
    extras = `
      <td><strong>${formatPercent(fund.asset?.convertible_bond_weight)}</strong><small>转债仓位</small></td>
      <td><strong>${formatPercent(fund.asset?.stock_weight)}</strong><small>股票仓位</small></td>
      <td title="${escapeHtml(fund.asset?.leverage_note || "总资产/净资产")}"><strong>${leverageText(fund.asset)}</strong>${fund.asset?.leverage_status === "extreme_reconciled" ? "<small>特殊报告期</small>" : ""}</td>
      <td><strong>${escapeHtml(classification.sector)}</strong><small>${escapeHtml(classification.date || "完整持仓")}</small></td>
      <td><strong>${escapeHtml(classification.industry)}</strong><small>中信一级</small></td>`;
  } else {
    extras = `<td><strong>${escapeHtml(fund.category_label)}</strong><small>${escapeHtml(fund.subtype)}</small></td><td><strong>${fund.performance?.latest_date || "—"}</strong></td>`;
  }
  return `<tr data-fund-code="${escapeHtml(fund.code)}">${commonCells(fund)}${periods.map(([key]) => periodCell(fund, key, relative)).join("")}<td class="period-cell"><strong class="${Number(annual?.return) < 0 ? "negative" : "positive"}">${formatPercent(annual?.return, 1, true)}</strong><small>年度回撤 ${formatPercent(annual?.drawdown)}</small></td>${extras}</tr>`;
}

function extraHeaders() {
  if (activeCategory === "active-equity") return `<th>股票仓位</th>${classificationHeader("sector")}${classificationHeader("industry")}`;
  if (activeCategory === "index-enhanced") return "<th>跟踪指数</th><th>跟踪误差</th><th>信息比率</th>";
  if (activeCategory === "pure-bond") return "<th>杠杆</th><th>久期</th><th>券种结构</th>";
  if (activeCategory === "hybrid-bond") return "<th>杠杆</th><th>久期</th><th>券种结构</th><th>股票仓位</th><th>转债仓位</th><th>板块权重</th><th>行业权重</th>";
  if (activeCategory === "convertible-bond") return "<th>转债仓位</th><th>股票仓位</th><th>杠杆</th><th>板块权重</th><th>行业权重</th>";
  return "<th>基金分类</th><th>净值日期</th>";
}

function renderListHead() {
  const periods = PERIOD_SETS[listPeriodMode];
  const relative = activeCategory === "index-enhanced";
  const table = listHead.closest("table");
  table?.classList.toggle("all-fund-mode", activeCategory === "all");
  if (activeCategory === "all") {
    listHead.innerHTML = `<tr><th>基金概况</th>${fundSizeHeader()}${periods.map(([key, label]) => `<th class="sortable-period-heading"><button data-sort-key="${key}" data-sort-metric="return">${label} ↕</button></th>`).join("")}<th class="sortable-period-heading"><button data-sort-key="ytd" data-sort-metric="return">今年以来 ↕</button></th><th>基金分类</th><th>分类核心指标</th><th>业绩比较基准</th><th>净值日期</th></tr>`;
    return;
  }
  listHead.innerHTML = `<tr><th>基金名称</th><th>基金经理</th><th>成立时间</th>${fundSizeHeader()}<th>业绩比较基准</th>${periods.map(([key, label]) => `<th class="sortable-period-heading"><button data-sort-key="${key}" data-sort-metric="return">${relative ? label + "超额" : label} ↕</button></th>`).join("")}<th class="sortable-period-heading"><button data-sort-key="ytd" data-sort-metric="return">${relative ? "今年以来超额" : "今年以来"} ↕</button></th>${extraHeaders()}</tr>`;
}

function filteredFunds() {
  const keyword = search.value.trim().toLowerCase();
  const subtype = filter.value;
  const visible = categoryFunds().filter((fund) => {
    const matchesKeyword = !keyword || searchableText(fund).includes(keyword);
    const matchesSubtype = subtype === "all" || fund.internal_category === subtype;
    return matchesKeyword && matchesSubtype && matchesFundSize(fund);
  });
  if (activeCategory === "active-equity" && classificationRankState.name) {
    return [...visible].sort((left, right) => {
      const leftValue = selectedClassificationWeight(left);
      const rightValue = selectedClassificationWeight(right);
      if (!Number.isFinite(leftValue) && !Number.isFinite(rightValue)) return 0;
      if (!Number.isFinite(leftValue)) return 1;
      if (!Number.isFinite(rightValue)) return -1;
      return (leftValue - rightValue) * (classificationRankState.direction === "asc" ? 1 : -1);
    });
  }
  if (!sortState.key) return visible;
  return [...visible].sort((left, right) => {
    const leftValue = Number(activeCategory === "index-enhanced"
      ? relativeMetrics(left).excess_returns?.[sortState.key]
      : performanceMetric(left, sortState.key, sortState.metric));
    const rightValue = Number(activeCategory === "index-enhanced"
      ? relativeMetrics(right).excess_returns?.[sortState.key]
      : performanceMetric(right, sortState.key, sortState.metric));
    if (!Number.isFinite(leftValue) && !Number.isFinite(rightValue)) return 0;
    if (!Number.isFinite(leftValue)) return 1;
    if (!Number.isFinite(rightValue)) return -1;
    return (leftValue - rightValue) * (sortState.direction === "asc" ? 1 : -1);
  });
}

function updateClassificationRankControl(resetName = false) {
  if (resetName) classificationRankState.name = "";
  if (activeCategory !== "active-equity" || !classificationRankState.name) return;
  if (!classificationNames(classificationRankState.level).includes(classificationRankState.name)) classificationRankState.name = "";
}

function renderPagination(total) {
  if (!pagination) return;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, pageCount);
  pagination.innerHTML = `
    <button data-page="prev" ${currentPage === 1 ? "disabled" : ""}>上一页</button>
    <span>第 ${currentPage} / ${pageCount} 页</span>
    <button data-page="next" ${currentPage === pageCount ? "disabled" : ""}>下一页</button>`;
}

function mobileHeaderLabel(header) {
  const directSpan = [...header.children].find((child) => child.tagName === "SPAN");
  const source = directSpan || header.querySelector("button") || header;
  return String(source.textContent || "指标").replace(/↕/g, "").replace(/\s+/g, " ").trim();
}

function prepareMobileFundCards() {
  const headers = [...listHead.querySelectorAll("th")];
  headers.forEach((header) => header.classList.toggle("mobile-control-heading", Boolean(header.querySelector("button, select"))));
  const primaryLabels = listPeriodMode === "long"
    ? ["基金规模", "近1年", "近3年", "近5年"]
    : ["基金规模", "近1月", "近1年", "今年以来"];
  grid.querySelectorAll("tr[data-fund-code]").forEach((row) => {
    const cells = [...row.children];
    cells.forEach((cell, index) => {
      const label = mobileHeaderLabel(headers[index] || headers[headers.length - 1]);
      cell.dataset.mobileLabel = label;
      cell.classList.toggle("mobile-secondary", index !== 0 && !primaryLabels.some((name) => label.startsWith(name)));
    });
    const firstCell = cells[0];
    if (!firstCell || firstCell.querySelector(".mobile-card-toggle")) return;
    firstCell.insertAdjacentHTML(
      "beforeend",
      '<button type="button" class="mobile-card-toggle" aria-expanded="false" aria-label="展开更多指标">更多</button>',
    );
  });
}

function renderFunds() {
  const visible = filteredFunds();
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = visible.slice(start, start + PAGE_SIZE);
  resultCount.textContent = `共 ${visible.length.toLocaleString("zh-CN")} 只基金主体；当前显示 ${pageItems.length} 只`;
  renderListHead();
  const columnCount = listHead.querySelectorAll("th").length;
  grid.innerHTML = pageItems.length
    ? pageItems.map(fundRow).join("")
    : `<tr><td colspan="${columnCount}" class="empty-state fund-search-empty">没有找到匹配的基金。</td></tr>`;
  prepareMobileFundCards();
  renderPagination(visible.length);
}

function updateSubtypeFilter() {
  const counts = new Map();
  const subtypeOrder = { pure_bond_long: 0, pure_bond_short: 1, primary_bond: 0, secondary_bond: 1 };
  categoryFunds().forEach((fund) => counts.set(fund.internal_category, { label: fund.subtype, count: (counts.get(fund.internal_category)?.count || 0) + 1 }));
  filter.innerHTML = '<option value="all">全部子类</option>' + [...counts.entries()]
    .sort((left, right) => (subtypeOrder[left[0]] ?? 99) - (subtypeOrder[right[0]] ?? 99) || left[1].label.localeCompare(right[1].label, "zh-CN"))
    .map(([value, item]) => `<option value="${escapeHtml(value)}">${escapeHtml(item.label)}（${item.count}）</option>`)
    .join("");
  if (subtypeTabs) {
    const items = [...counts.entries()].sort((left, right) => (subtypeOrder[left[0]] ?? 99) - (subtypeOrder[right[0]] ?? 99) || left[1].label.localeCompare(right[1].label, "zh-CN"));
    const showSubtypeTabs = ["pure-bond", "hybrid-bond"].includes(activeCategory) && items.length > 1;
    subtypeTabs.innerHTML = showSubtypeTabs
      ? `<button class="active" data-subtype="all">全部</button>${items.map(([value, item]) => `<button data-subtype="${escapeHtml(value)}">${escapeHtml(item.label)}（${item.count}）</button>`).join("")}`
      : "";
    subtypeTabs.hidden = !showSubtypeTabs;
  }
  filter.hidden = true;
}

function updateListCopy() {
  const label = CATEGORY_LABELS[activeCategory];
  if (listTitle) listTitle.textContent = `${label}全量列表`;
  if (listDescription) listDescription.textContent = `按基金主体合并份额，当前分类共 ${categoryFunds().length.toLocaleString("zh-CN")} 只；点击基金进入对应研究模块。`;
  if (methodologyNote) methodologyNote.textContent = activeCategory === "index-enhanced"
    ? "指数增强相对指标必须与基金当前跟踪指数日收益对齐；指数行情缓存未完成的产品明确显示待补。"
    : activeCategory === "pure-bond"
      ? "券种结构使用资产配置官方汇总字段；重仓债券只代表披露重仓，不代替完整结构。久期展示报告日期。"
      : "净值、资产配置和持仓使用各自最新可得日期；季度前十大与半年报/年报完整持仓严格分开。";
}

function closeSuggestions() {
  suggestedFunds = [];
  activeSuggestionIndex = -1;
  suggestionList.hidden = true;
  suggestionList.innerHTML = "";
  search.setAttribute("aria-expanded", "false");
}

function renderSuggestions() {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return closeSuggestions();
  suggestedFunds = funds.filter((fund) => searchableText(fund).includes(keyword)).slice(0, 10);
  if (!suggestedFunds.length) return closeSuggestions();
  suggestionList.innerHTML = suggestedFunds.map((fund, index) => `<a id="fund-search-suggestion-${index}" class="fund-search-suggestion" href="${fundHref(fund)}" role="option" aria-selected="false"><span class="fund-search-suggestion-main"><strong>${escapeHtml(fund.name)}</strong><small>${escapeHtml(fund.code)} · ${escapeHtml(fund.category_label)} · ${escapeHtml(fund.subtype)}</small></span><span class="fund-search-suggestion-meta">${escapeHtml((fund.manager || []).join("、") || fund.fund_company || "")}</span></a>`).join("");
  suggestionList.hidden = false;
  search.setAttribute("aria-expanded", "true");
}

function moveSuggestion(direction) {
  const options = [...suggestionList.querySelectorAll('[role="option"]')];
  if (!options.length) return;
  activeSuggestionIndex = (activeSuggestionIndex + direction + options.length) % options.length;
  options.forEach((option, index) => option.classList.toggle("active", index === activeSuggestionIndex));
  options[activeSuggestionIndex].focus({ preventScroll: true });
}

search.addEventListener("input", () => { currentPage = 1; renderFunds(); renderSuggestions(); });
search.addEventListener("focus", renderSuggestions);
search.addEventListener("keydown", (event) => {
  if (event.key === "Escape") return closeSuggestions();
  if (event.key === "ArrowDown") { event.preventDefault(); moveSuggestion(1); }
  if (event.key === "ArrowUp") { event.preventDefault(); moveSuggestion(-1); }
});
document.addEventListener("pointerdown", (event) => { if (!event.target.closest(".home-search-box")) closeSuggestions(); });
function syncSubtypeButtons() {
  subtypeTabs?.querySelectorAll("[data-subtype]").forEach((button) => button.classList.toggle("active", button.dataset.subtype === filter.value));
}

filter.addEventListener("change", () => { currentPage = 1; syncSubtypeButtons(); renderFunds(); });
subtypeTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-subtype]");
  if (!button) return;
  filter.value = button.dataset.subtype;
  currentPage = 1;
  syncSubtypeButtons();
  renderFunds();
});

document.querySelectorAll("[data-list-period]").forEach((button) => button.addEventListener("click", () => {
  listPeriodMode = button.dataset.listPeriod;
  currentPage = 1;
  document.querySelectorAll("[data-list-period]").forEach((item) => item.classList.toggle("active", item === button));
  renderFunds();
}));

listHead.addEventListener("click", (event) => {
  const directionButton = event.target.closest("[data-classification-direction-level]");
  if (directionButton && !directionButton.disabled) {
    classificationRankState.direction = classificationRankState.direction === "desc" ? "asc" : "desc";
    currentPage = 1;
    renderFunds();
    return;
  }
  const button = event.target.closest("[data-sort-key]");
  if (!button) return;
  const same = sortState.key === button.dataset.sortKey;
  sortState = { key: button.dataset.sortKey, metric: button.dataset.sortMetric, direction: same && sortState.direction === "desc" ? "asc" : "desc" };
  classificationRankState.name = "";
  renderFunds();
});

listHead.addEventListener("change", (event) => {
  const target = event.target;
  if (target.id === "fund-size-filter") {
    fundSizeFilterState = target.value;
  } else if (target.id === "header-sector-name") {
    if (target.value || classificationRankState.level === "sector") {
      classificationRankState.level = "sector";
      classificationRankState.name = target.value;
    }
    sortState = { key: null, metric: "return", direction: "desc" };
  } else if (target.id === "header-industry-level") {
    const wasIndustryActive = classificationRankState.level !== "sector";
    classificationRankState.industryLevel = target.value;
    if (wasIndustryActive) {
      classificationRankState.level = target.value;
      classificationRankState.name = "";
    }
  } else if (target.id === "header-industry-name") {
    if (target.value || classificationRankState.level !== "sector") {
      classificationRankState.level = classificationRankState.industryLevel;
      classificationRankState.name = target.value;
    }
    sortState = { key: null, metric: "return", direction: "desc" };
  } else {
    return;
  }
  currentPage = 1;
  renderFunds();
});

pagination?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (!button || button.disabled) return;
  currentPage += button.dataset.page === "next" ? 1 : -1;
  renderFunds();
  document.querySelector("#samples")?.scrollIntoView({ block: "start" });
});

function ensureStockClassification() {
  if (window.FUND_STOCK_CLASSIFICATION) return Promise.resolve(window.FUND_STOCK_CLASSIFICATION);
  if (stockClassificationPromise) return stockClassificationPromise;
  stockClassificationPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/stock_classification.js";
    script.onload = () => window.FUND_STOCK_CLASSIFICATION
      ? resolve(window.FUND_STOCK_CLASSIFICATION)
      : reject(new Error("股票分类数据未生成有效内容"));
    script.onerror = () => reject(new Error("股票分类数据加载失败"));
    document.head.appendChild(script);
  }).catch((error) => {
    stockClassificationPromise = null;
    throw error;
  });
  return stockClassificationPromise;
}

document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
  activeCategory = button.dataset.category;
  currentPage = 1;
  search.value = "";
  document.querySelectorAll("[data-category]").forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-active-equity-section]").forEach((section) => { section.hidden = activeCategory !== "active-equity"; });
  updateSubtypeFilter();
  updateClassificationRankControl(true);
  updateListCopy();
  renderFunds();
  if (activeCategory === "active-equity" && !window.FUND_STOCK_CLASSIFICATION) {
    ensureStockClassification().then(() => {
      classificationNameCache = {};
      if (activeCategory === "active-equity") renderFunds();
    }).catch((error) => {
      if (activeCategory === "active-equity") resultCount.textContent = `行业排序数据暂未加载：${error.message}`;
    });
  }
}));

async function optionalJson(url, fallback) {
  try {
    const response = await fetch(url);
    return response.ok ? response.json() : fallback;
  } catch (_error) {
    return fallback;
  }
}

async function loadCatalog() {
  if (window.FUND_DASHBOARD_CATALOG) return window.FUND_DASHBOARD_CATALOG;
  const response = await fetch("https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/fund_catalog.json");
  if (!response.ok) throw new Error(`全量基金目录加载失败：${response.status}`);
  return response.json();
}

Promise.all([
  loadCatalog(),
]).then(([catalogData]) => {
  catalog = catalogData;
  funds = catalogData.funds || [];
  searchTextByCode.clear();
  funds.forEach((fund) => { searchableText(fund); });
  classificationNameCache = {};
  legacyFunds = [];
  analysisFunds = {};
  document.querySelector("#fund-count").textContent = funds.length.toLocaleString("zh-CN");
  document.querySelector("#update-date").textContent = catalogData.generated_at?.slice(0, 10) || catalogData.as_of;
  const completion = document.querySelector("#completed-category-label");
  if (completion) completion.textContent = "五类目录";
  const completionNote = document.querySelector("#completed-category-note");
  if (completionNote) completionNote.textContent = "8,589个基金主体";
  document.querySelectorAll("[data-active-equity-section]").forEach((section) => { section.hidden = true; });
  updateSubtypeFilter();
  updateClassificationRankControl();
  updateListCopy();
  renderFunds();
}).catch((error) => {
  resultCount.textContent = "";
  grid.innerHTML = `<tr><td class="empty-state fund-search-empty">${escapeHtml(error.message)}</td></tr>`;
});

grid.addEventListener("click", (event) => {
  const button = event.target.closest(".mobile-card-toggle");
  if (!button) return;
  const row = button.closest("tr");
  const expanded = !row.classList.contains("mobile-expanded");
  row.classList.toggle("mobile-expanded", expanded);
  button.setAttribute("aria-expanded", String(expanded));
  button.setAttribute("aria-label", expanded ? "收起更多指标" : "展开更多指标");
  button.textContent = expanded ? "收起" : "更多";
});
