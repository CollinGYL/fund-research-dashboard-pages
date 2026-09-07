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
  "active-equity": "主观权益基金",
  "index-enhanced": "指数增强基金",
  "pure-bond": "纯债基金",
  "hybrid-bond": "一级债基/二级债基",
  "convertible-bond": "转债基金",
};

const HIDDEN_WEBSITE_CATEGORIES = new Set(["index-enhanced"]);
const QUANTITATIVE_FUND_NAME_PATTERN = /量化|多因子|数据挖掘|智选|智胜|智航|智投|对冲|阿尔法/;

function isVisibleWebsiteFund(fund) {
  if (HIDDEN_WEBSITE_CATEGORIES.has(fund.category)) return false;
  return !(
    fund.category === "active-equity"
    && QUANTITATIVE_FUND_NAME_PATTERN.test(String(fund.name || ""))
  );
}

function displayCategoryLabel(fund) {
  return fund.category === "active-equity"
    ? "主观权益基金"
    : fund.category_label;
}

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

let PAGE_SIZE = window.matchMedia('(max-width: 720px)').matches ? 10 : 25;
let listView = 'complete';
let hiddenDecisionColumns = new Set();
let ageFilter = 'all';
let dataFilter = 'all';
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
let activeEquityProfilesPromise = null;
let activeEquityProfileFilter = "all";
const initialListQuery = new URLSearchParams(window.location.search);
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
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${signed && number > 0 ? "+" : ""}${(number * 100).toFixed(digits)}%`;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
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
    displayCategoryLabel(fund),
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

function topWeight(weights, excludeMarketBuckets = false) {
  const entries = Object.entries(weights || {})
    .filter(([name, value]) => Number(value) > 0 && (!excludeMarketBuckets || !["港股", "未映射", "UNKNOWN"].includes(name)))
    .sort((left, right) => Number(right[1]) - Number(left[1]));
  if (!entries.length) return null;
  return `${entries[0][0].replace("(中信)", "")} ${formatPercent(entries[0][1])}`;
}

function classificationSummary(fund) {
  if (fund.asset?.stock_weight === 0) return {sector:'无股票持仓 / 不适用', industry:'无股票持仓 / 不适用', date:fund.asset.report_date};
  const fullMarket = window.FUND_STOCK_CLASSIFICATION?.funds?.[fund.code]
    || window.FUND_STOCK_CLASSIFICATION_SUMMARY?.funds?.[fund.code];
  if (fullMarket) {
    if (fullMarket.report_date < (fund.asset?.report_date || "")) return {sector:"无当期股票披露", industry:"无当期行业披露", date:fullMarket.report_date};
    return {
      sector: topWeight(fullMarket.sector_weights) || "未映射",
      industry: topWeight(fullMarket.industry_weights?.level1, true) || "A股行业待补",
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
        .flatMap((fund) => Object.keys(classificationWeights(fund, level)).filter(name => level === "sector" || name !== "港股")),
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

function activeEquityProfile(fund) {
  return window.FUND_ACTIVE_EQUITY_PROFILES?.funds?.[fund.code] || null;
}

function profilePercentile(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `P${Math.round(number * 100)}` : "—";
}

function activeEquityProfileCell(fund) {
  const profile = activeEquityProfile(fund);
  if (!window.FUND_ACTIVE_EQUITY_PROFILES) {
    return '<td class="fund-profile-cell pending-cell"><strong>画像加载中</strong><small>正在读取低频画像数据</small></td>';
  }
  if (!profile) return '<td class="fund-profile-cell pending-cell"><strong>冷启动</strong><small>当前管理结构尚未形成可用画像</small></td>';
  const groups = profile.groups || {};
  const percentiles = profile.percentiles || {};
  const status = profile.status === "mature_3plus" ? "成熟画像" : profile.status === "usable_2" ? "可用画像" : "冷启动";
  if (profile.status === "cold_start") {
    return `<td class="fund-profile-cell pending-cell"><strong>${status}</strong><small>${profile.completed_transition_count || 0}个合格转移区间</small></td>`;
  }
  return `<td class="fund-profile-cell"><div class="fund-profile-chip-grid">
    <span title="调仓活跃度同类分位 ${profilePercentile(percentiles.turnover_activity)}"><b>调仓</b>${escapeHtml(groups.turnover_activity || "—")}</span>
    <span title="持仓集中度同类分位 ${profilePercentile(percentiles.concentration)}"><b>集中</b>${escapeHtml(groups.concentration || "—")}</span>
    <span title="持股延续性同类分位 ${profilePercentile(percentiles.holding_persistence)}"><b>延续</b>${escapeHtml(groups.holding_persistence || "—")}</span>
    <span title="二级行业稳定性同类分位 ${profilePercentile(percentiles.industry_stability)}"><b>行业</b>${escapeHtml(groups.industry_stability || "—")}</span>
  </div><small>${status} · ${profilePercentile(percentiles.turnover_activity)}调仓</small></td>`;
}

function activeEquityProfileHeader() {
  const options = [
    ["all", "全部画像"],
    ["turnover:低调仓", "低调仓组"],
    ["turnover:中等调仓", "中等调仓组"],
    ["turnover:高调仓", "高调仓组"],
    ["concentration:高集中", "高集中组"],
    ["persistence:高延续", "高延续组"],
    ["industry:高稳定", "行业高稳定组"],
    ["status:cold_start", "冷启动"],
  ].map(([value, label]) => `<option value="${value}"${activeEquityProfileFilter === value ? " selected" : ""}>${label}</option>`).join("");
  return `<th class="table-filter-heading profile-filter-heading"><span>基金画像</span><select id="header-profile-group" class="table-header-select" aria-label="按基金画像分组筛选">${options}</select></th>`;
}

function matchesActiveEquityProfile(fund) {
  if (activeCategory !== "active-equity" || activeEquityProfileFilter === "all") return true;
  const profile = activeEquityProfile(fund);
  if (activeEquityProfileFilter === "status:cold_start") return !profile || profile.status === "cold_start";
  if (!profile) return false;
  const [dimension, label] = activeEquityProfileFilter.split(":");
  const keys = { turnover: "turnover_activity", concentration: "concentration", persistence: "holding_persistence", industry: "industry_stability" };
  return profile.groups?.[keys[dimension]] === label;
}

function fundHref(fund) {
  return `fund.html?code=${encodeURIComponent(fund.code)}&id=${encodeURIComponent(fund.code.split(".")[0])}&list=${encodeURIComponent(window.location.search)}`;
}

function hasFullReturnPeriod(fund, key) {
  const months = {"1m":1,"3m":3,"6m":6,"1y":12,"3y":36,"5y":60}[key];
  if (!months) return true;
  const end = new Date(fund.performance?.latest_date);
  const start = new Date(fund.inception_date);
  if (!fund.inception_date || !fund.performance?.latest_date || !Number.isFinite(+start) || !Number.isFinite(+end)) return false;
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() - months);
  end.setUTCDate(Math.min(day, new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()));
  return start <= end;
}

function performanceMetric(fund, key, metric) {
  if (!hasFullReturnPeriod(fund, key)) return null;
  return fund.performance?.[metric === "return" ? "returns" : "drawdowns"]?.[key];
}

function relativeMetrics(fund) {
  return window.INDEX_ENHANCED_METRICS?.funds?.[fund.code] || fund.relative_metrics || {};
}

function periodCell(fund, key, relative = false) {
  if (!hasFullReturnPeriod(fund, key)) return '<td class="period-cell pending-cell"><strong>—</strong><small>成立未满该区间</small></td>';
  if (relative) {
    const relativeData = relativeMetrics(fund);
    const value = relativeData?.excess_returns?.[key];
    const drawdown = relativeData?.excess_drawdowns?.[key];
    if (!FundResearch.finite(value)) {
      return '<td class="period-cell pending-cell"><strong>待计算</strong><small>基准行情缺失</small></td>';
    }
    return `<td class="period-cell"><strong class="${!FundResearch.finite(value) ? "value-missing" : Number(value) < 0 ? "negative" : "positive"}">${formatPercent(value, 1, true)}</strong><small>超额回撤 ${formatPercent(drawdown)}</small></td>`;
  }
  const value = performanceMetric(fund, key, "return");
  const drawdown = performanceMetric(fund, key, "drawdown");
  return `<td class="period-cell"><strong class="${!FundResearch.finite(value) ? "value-missing" : Number(value) < 0 ? "negative" : "positive"}">${formatPercent(value, 1, true)}</strong><small>回撤 ${formatPercent(drawdown)}</small></td>`;
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
  return asset?.leverage !== null && asset?.leverage !== undefined && FundResearch.finite(asset.leverage) ? `${Number(asset.leverage).toFixed(2)}x` : "—";
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
    return `${coreMetric("跟踪指数", escapeHtml(fund.tracking_index || "—"))}${coreMetric("跟踪误差", formatPercent(metrics.tracking_error), "近1年")}${coreMetric("信息比率", FundResearch.finite(metrics.information_ratio) ? Number(metrics.information_ratio).toFixed(2) : "—")}`;
  }
  if (fund.category === "pure-bond") {
    return `${coreMetric("杠杆", leverageText(fund.asset), leverageNote(fund.asset, assetDate))}${coreMetric("久期", FundResearch.finite(fund.duration?.value) ? `${Number(fund.duration.value).toFixed(2)}年` : "—", fund.duration?.report_date || "")}${coreMetric("券种结构", bondStructureCell(fund.asset))}`;
  }
  if (fund.category === "hybrid-bond") {
    return `${coreMetric("杠杆 / 久期", `${FundResearch.finite(fund.asset?.leverage) ? `${Number(fund.asset.leverage).toFixed(2)}x` : "—"} / ${FundResearch.finite(fund.duration?.value) ? `${Number(fund.duration.value).toFixed(2)}年` : "—"}`)}${coreMetric("股票 / 转债仓位", `${formatPercent(fund.asset?.stock_weight)} / ${formatPercent(fund.asset?.convertible_bond_weight)}`, assetDate)}${coreMetric("券种结构", bondStructureCell(fund.asset))}`;
  }
  const classification = classificationSummary(fund);
  return `${coreMetric("转债仓位", formatPercent(fund.asset?.convertible_bond_weight), assetDate)}${coreMetric("股票仓位", formatPercent(fund.asset?.stock_weight))}${coreMetric("主要行业", escapeHtml(classification.industry), "中信一级")}`;
}

function fundRow(fund) {
  if (listView !== 'complete') return decisionFundRow(fund);
  const periods = PERIOD_SETS[listPeriodMode];
  const annual = fund.performance?.calendar?.[String(new Date(fund.performance?.latest_date || Date.now()).getFullYear())];
  if (activeCategory === "all") {
    return `<tr data-fund-code="${escapeHtml(fund.code)}">${allFundOverviewCell(fund)}
      <td><strong>${formatMoney(fund.asset?.net_asset)}</strong><small>${escapeHtml(fund.asset?.report_date || "无配置披露")}</small></td>
      ${periods.map(([key]) => periodCell(fund, key)).join("")}
      <td class="period-cell"><strong class="${Number(annual?.return) < 0 ? "negative" : "positive"}">${formatPercent(annual?.return, 1, true)}</strong><small>年度回撤 ${formatPercent(annual?.drawdown)}</small></td>
      <td><strong>${escapeHtml(displayCategoryLabel(fund))}</strong><small>${escapeHtml(fund.subtype)}</small></td>
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
      ${activeEquityProfileCell(fund)}
      <td><strong>${escapeHtml(sectorDisplay)}</strong><small>${selectedName && selectedLevel === "sector" ? "所选板块" : escapeHtml(classification.date || "完整持仓")}</small></td>
      <td><strong>${escapeHtml(industryDisplay)}</strong><small>${selectedName && selectedLevel !== "sector" ? ({ level1: "中信一级", level2: "中信二级", level3: "中信三级" })[selectedLevel] : "中信一级"}</small></td>`;
  } else if (activeCategory === "index-enhanced") {
    extras = `
      <td><strong>${escapeHtml(fund.tracking_index || "—")}</strong><small>跟踪指数</small></td>
      <td><strong>${formatPercent(relativeMetrics(fund).tracking_error)}</strong><small>近1年日频</small></td>
      <td><strong>${FundResearch.finite(relativeMetrics(fund).information_ratio) ? Number(relativeMetrics(fund).information_ratio).toFixed(2) : "—"}</strong></td>`;
  } else if (activeCategory === "pure-bond") {
    extras = `
      <td title="${escapeHtml(fund.asset?.leverage_note || "总资产/净资产")}"><strong>${leverageText(fund.asset)}</strong><small>${escapeHtml(leverageNote(fund.asset, fund.asset?.report_date || ""))}</small></td>
      <td><strong>${FundResearch.finite(fund.duration?.value) ? Number(fund.duration.value).toFixed(2) + "年" : "—"}</strong><small>${escapeHtml(fund.duration?.report_date || "")}</small></td>
      <td class="bond-structure-cell">${bondStructureCell(fund.asset)}</td>`;
  } else if (activeCategory === "hybrid-bond") {
    const classification = classificationSummary(fund);
    extras = `
      <td title="${escapeHtml(fund.asset?.leverage_note || "总资产/净资产")}"><strong>${leverageText(fund.asset)}</strong>${fund.asset?.leverage_status === "extreme_reconciled" ? "<small>特殊报告期</small>" : ""}</td>
      <td><strong>${FundResearch.finite(fund.duration?.value) ? Number(fund.duration.value).toFixed(2) + "年" : "—"}</strong><small>${escapeHtml(fund.duration?.report_date || "")}</small></td>
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
    extras = `<td><strong>${escapeHtml(displayCategoryLabel(fund))}</strong><small>${escapeHtml(fund.subtype)}</small></td><td><strong>${fund.performance?.latest_date || "—"}</strong></td>`;
  }
  return `<tr data-fund-code="${escapeHtml(fund.code)}">${commonCells(fund)}${periods.map(([key]) => periodCell(fund, key, relative)).join("")}<td class="period-cell"><strong class="${Number(annual?.return) < 0 ? "negative" : "positive"}">${formatPercent(annual?.return, 1, true)}</strong><small>年度回撤 ${formatPercent(annual?.drawdown)}</small></td>${extras}</tr>`;
}

function extraHeaders() {
  if (activeCategory === "active-equity") return `<th>股票仓位</th>${activeEquityProfileHeader()}${classificationHeader("sector")}${classificationHeader("industry")}`;
  if (activeCategory === "index-enhanced") return "<th>跟踪指数</th><th>跟踪误差</th><th>信息比率</th>";
  if (activeCategory === "pure-bond") return "<th>杠杆</th><th>久期</th><th>券种结构</th>";
  if (activeCategory === "hybrid-bond") return "<th>杠杆</th><th>久期</th><th>券种结构</th><th>股票仓位</th><th>转债仓位</th><th>板块权重</th><th>行业权重</th>";
  if (activeCategory === "convertible-bond") return "<th>转债仓位</th><th>股票仓位</th><th>杠杆</th><th>板块权重</th><th>行业权重</th>";
  return "<th>基金分类</th><th>净值日期</th>";
}

function renderListHead() {
  document.body.dataset.listView = listView;
  if (listView !== 'complete') {
    listHead.closest('table').classList.remove('all-fund-mode');
    listHead.innerHTML = `<tr><th>基金 / 经理</th>${decisionColumns().map(([key, label, metric]) => `<th>${metric ? `<button data-sort-key="${key}" data-sort-metric="${metric}">${label} ↕</button>` : label}</th>`).join('')}</tr>`;
    return;
  }
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
    const s = decisionSummary(fund);
    const years = fund.inception_date && fund.performance?.latest_date ? (new Date(fund.performance.latest_date) - new Date(fund.inception_date)) / (365.25 * 86400000) : null;
    const matchesAge = ageFilter === 'all' || years !== null && years >= Number(ageFilter);
    const matchesData = dataFilter === 'all' || (dataFilter === 'summary' ? Boolean(s) : Boolean(fund.asset?.report_date && s?.full_date && s.full_date >= fund.asset.report_date));
    return matchesKeyword && matchesSubtype && matchesFundSize(fund) && matchesActiveEquityProfile(fund) && matchesAge && matchesData;
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
  if (sortState.metric === 'decision') return [...visible].sort((left, right) => {
    const a = decisionSortValue(left, sortState.key), b = decisionSortValue(right, sortState.key);
    if (!FundResearch.finite(a)) return FundResearch.finite(b) ? 1 : 0;
    if (!FundResearch.finite(b)) return -1;
    return (a - b) * (sortState.direction === 'asc' ? 1 : -1);
  });
  return [...visible].sort((left, right) => {
    const numeric = value => value === null || value === undefined || value === "" ? NaN : Number(value);
    const leftValue = numeric(activeCategory === "index-enhanced"
      ? relativeMetrics(left).excess_returns?.[sortState.key]
      : performanceMetric(left, sortState.key, sortState.metric));
    const rightValue = numeric(activeCategory === "index-enhanced"
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
  document.querySelector('#fund-pagination-top').innerHTML = pagination.innerHTML;
}

function mobileHeaderLabel(header) {
  const directSpan = [...header.children].find((child) => child.tagName === "SPAN");
  const source = directSpan || header.querySelector("button") || header;
  return String(source.textContent || "指标").replace(/↕/g, "").replace(/\s+/g, " ").trim();
}

function prepareMobileFundCards() {
  const headers = [...listHead.querySelectorAll("th")];
  headers.forEach((header) => header.classList.toggle("mobile-control-heading", Boolean(header.querySelector("button, select"))));
  const primaryLabels = listView !== 'complete' ? ['近1年', '当前回撤', '股票 / 转债', '主要行业', '规模变化', '仓位变化'] : listPeriodMode === "long"
    ? ["基金规模", "近1年", "近3年", "近5年"]
    : ["基金规模", "近1月", "近1年", "今年以来"];
  if (activeCategory === "active-equity" && listView === 'complete') primaryLabels.push("基金画像");
  grid.querySelectorAll("tr[data-fund-code]").forEach((row) => {
    const cells = [...row.children];
    cells.forEach((cell, index) => {
      const label = mobileHeaderLabel(headers[index] || headers[headers.length - 1]);
      cell.dataset.mobileLabel = label;
      const primary = listView === 'performance' ? [1,2].includes(index) : primaryLabels.some((name) => label.startsWith(name));
      cell.classList.toggle("mobile-secondary", index !== 0 && !primary);
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
  currentPage = Math.max(1, Math.min(currentPage, Math.max(1, Math.ceil(visible.length / PAGE_SIZE))));
  saveListQuery();
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = visible.slice(start, start + PAGE_SIZE);
  resultCount.textContent = `${visible.length.toLocaleString("zh-CN")}只基金主体 · 净值至${catalog?.source?.nav_latest || catalog?.as_of || '—'} · 数据版本 ${(catalog?.generated_at || '').replace('T', ' ').slice(0, 16)}`;
  renderListHead();
  listHead.querySelectorAll('[data-sort-key]').forEach(button => {
    const selected = button.dataset.sortKey === sortState.key && !classificationRankState.name;
    button.closest('th').setAttribute('aria-sort', selected ? (sortState.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    button.textContent = button.textContent.replace('↕', selected ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕');
  });
  const columnCount = listHead.querySelectorAll("th").length;
  grid.innerHTML = pageItems.length
    ? pageItems.map(fundRow).join("")
    : `<tr><td colspan="${columnCount}" class="empty-state fund-search-empty">没有找到匹配的基金。</td></tr>`;
  prepareMobileFundCards();
  renderPagination(visible.length);
  renderDecisionControls();
  requestAnimationFrame(syncTopScrollbar);
}

function saveListQuery() {
  if (!catalog) return;
  const params = new URLSearchParams();
  const values = {q:search.value.trim(), category:activeCategory, period:listPeriodMode, page:String(currentPage), size:fundSizeFilterState, subtype:filter.value, profile:activeEquityProfileFilter, sort:sortState.key||"", metric:sortState.metric, dir:classificationRankState.name?classificationRankState.direction:sortState.direction, industry:classificationRankState.name, level:classificationRankState.level, view:listView, perPage:String(PAGE_SIZE), columns:[...hiddenDecisionColumns].join(','), age:ageFilter, data:dataFilter};
  for (const [key,value] of Object.entries(values)) if(value && value!=="all" && !(key==="page"&&value==="1")) params.set(key,value);
  try { history.replaceState(null,"",`${window.location.pathname}?${params}${window.location.hash}`); } catch (_) { /* file-only viewers may forbid history changes */ }
}

function restoreListQuery() {
  const q=initialListQuery;
  if (['performance','portfolio','changes','complete'].includes(q.get('view'))) listView=q.get('view');
  if ([10,25,50].includes(Number(q.get('perPage')))) PAGE_SIZE=Number(q.get('perPage'));
  hiddenDecisionColumns=new Set((q.get('columns')||'').split(',').filter(x=>Object.values(DECISION_COLUMNS).flat().some(c=>c[0]===x)));
  if (['1','3','5'].includes(q.get('age'))) ageFilter=q.get('age');
  if (['summary','holdings'].includes(q.get('data'))) dataFilter=q.get('data');
  if (Object.hasOwn(CATEGORY_LABELS,q.get('category')) && !HIDDEN_WEBSITE_CATEGORIES.has(q.get('category'))) activeCategory=q.get('category');
  search.value=(q.get('q')||'').slice(0,200);
  listPeriodMode=q.get('period')==='long'?'long':'short';
  currentPage=Math.max(1,Math.floor(Number(q.get('page'))||1));
  if(FUND_SIZE_FILTERS.some(([key])=>key===q.get('size'))) fundSizeFilterState=q.get('size');
  if(['1m','3m','6m','1y','3y','5y','ytd'].includes(q.get('sort'))) sortState={key:q.get('sort'),metric:'return',direction:q.get('dir')==='asc'?'asc':'desc'};
  if (['return','drawdown','decision'].includes(q.get('metric')) && Object.values(DECISION_COLUMNS).flat().some(c=>c[0]===q.get('sort'))) sortState={key:q.get('sort'),metric:q.get('metric'),direction:q.get('dir')==='asc'?'asc':'desc'};
  if(['sector','level1','level2','level3'].includes(q.get('level'))) classificationRankState={...classificationRankState,level:q.get('level'),industryLevel:q.get('level')==='sector'?'level1':q.get('level'),name:q.get('industry')||'',direction:q.get('dir')==='asc'?'asc':'desc'};
  activeEquityProfileFilter=q.get('profile')||'all';
  document.querySelectorAll('[data-category]').forEach(b=>{const active=b.dataset.category===activeCategory;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
  document.querySelectorAll('[data-list-period]').forEach(b=>b.classList.toggle('active',b.dataset.listPeriod===listPeriodMode));
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
  if (listDescription) listDescription.textContent = activeCategory === "active-equity"
    ? `按基金主体合并份额，当前主观权益范围共 ${categoryFunds().length.toLocaleString("zh-CN")} 只；已移除量化策略产品。`
    : `按基金主体合并份额，当前分类共 ${categoryFunds().length.toLocaleString("zh-CN")} 只；点击基金进入对应研究模块。`;
  if (methodologyNote) methodologyNote.textContent = activeCategory === "index-enhanced"
    ? "指数增强相对指标必须与基金当前跟踪指数日收益对齐；指数行情缓存未完成的产品明确显示待补。"
    : activeCategory === "active-equity"
      ? "主观权益口径排除指数增强和名称含量化策略的产品。画像按当前稳定管理结构独立累积，分位是同类相对位置，不是评级或综合得分。"
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
  suggestionList.innerHTML = suggestedFunds.map((fund, index) => `<a id="fund-search-suggestion-${index}" class="fund-search-suggestion" href="${fundHref(fund)}" role="option" aria-selected="false"><span class="fund-search-suggestion-main"><strong>${escapeHtml(fund.name)}</strong><small>${escapeHtml(fund.code)} · ${escapeHtml(displayCategoryLabel(fund))} · ${escapeHtml(fund.subtype)}</small></span><span class="fund-search-suggestion-meta">${escapeHtml((fund.manager || []).join("、") || fund.fund_company || "")}</span></a>`).join("");
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
  currentPage = 1;
  renderFunds();
});

document.addEventListener("change", (event) => {
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
  } else if (target.id === "header-profile-group") {
    activeEquityProfileFilter = target.value;
  } else {
    return;
  }
  currentPage = 1;
  renderFunds();
});

document.addEventListener("click", (event) => {
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

function ensureActiveEquityProfiles() {
  if (window.FUND_ACTIVE_EQUITY_PROFILES) return Promise.resolve(window.FUND_ACTIVE_EQUITY_PROFILES);
  if (activeEquityProfilesPromise) return activeEquityProfilesPromise;
  activeEquityProfilesPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/active_equity_profiles.js";
    script.onload = () => window.FUND_ACTIVE_EQUITY_PROFILES
      ? resolve(window.FUND_ACTIVE_EQUITY_PROFILES)
      : reject(new Error("基金画像数据未生成有效内容"));
    script.onerror = () => reject(new Error("基金画像数据加载失败"));
    document.head.appendChild(script);
  }).catch((error) => {
    activeEquityProfilesPromise = null;
    throw error;
  });
  return activeEquityProfilesPromise;
}

document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
  activeCategory = button.dataset.category;
  activeEquityProfileFilter = "all";
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
  if (activeCategory === "active-equity") {
    Promise.all([ensureStockClassification(), ensureActiveEquityProfiles()]).then(() => {
      classificationNameCache = {};
      if (activeCategory === "active-equity") renderFunds();
    }).catch((error) => {
      if (activeCategory === "active-equity") resultCount.textContent = `主观权益扩展数据暂未加载：${error.message}`;
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
  funds = (catalogData.funds || []).filter(isVisibleWebsiteFund);
  searchTextByCode.clear();
  funds.forEach((fund) => { searchableText(fund); });
  classificationNameCache = {};
  legacyFunds = [];
  analysisFunds = {};
  document.querySelector("#fund-count").textContent = funds.length.toLocaleString("zh-CN");
  document.querySelector("#update-date").textContent = catalogData.generated_at?.slice(0, 10) || catalogData.as_of;
  const completion = document.querySelector("#completed-category-label");
  if (completion) completion.textContent = "四类目录";
  const completionNote = document.querySelector("#completed-category-note");
  if (completionNote) completionNote.textContent = `${funds.length.toLocaleString("zh-CN")}个基金主体`;
  document.querySelectorAll("[data-active-equity-section]").forEach((section) => { section.hidden = true; });
  restoreListQuery();
  updateSubtypeFilter();
  if ([...filter.options].some(o=>o.value===initialListQuery.get('subtype'))) filter.value=initialListQuery.get('subtype');
  syncSubtypeButtons();
  updateListCopy();
  renderFunds();
  requestAnimationFrame(() => window.scrollTo({top:Math.max(0, Math.min(20000, Number(initialListQuery.get('scroll'))||0)), behavior:'instant'}));
  if(activeCategory==='active-equity') Promise.all([ensureStockClassification(),ensureActiveEquityProfiles()]).then(()=>{classificationNameCache={};updateClassificationRankControl();renderFunds();}).catch(error=>{resultCount.textContent=`扩展数据加载失败：${error.message}`;});
}).catch((error) => {
  resultCount.textContent = "";
  grid.innerHTML = `<tr><td class="empty-state fund-search-empty">${escapeHtml(error.message)}</td></tr>`;
});

const DECISION_COLUMNS = {
  performance: [['1y','近1年 / 同类位置','return'], ['current_drawdown','当前回撤','decision'], ['risk1y','近1年最大回撤','decision'], ['size','基金规模','decision']],
  portfolio: [['size','基金规模','decision'], ['exposure','股票 / 转债'], ['industry','主要行业'], ['concentration','前十大 / 杠杆'], ['duration','久期 / 持仓日期']],
  changes: [['size_change','规模变化','decision'], ['stock_change','仓位变化','decision'], ['industry_change','行业变化','decision'], ['entries','完整持仓名单变化']],
};

function decisionSummary(fund) {
  if (catalog && window.FUND_RESEARCH_SUMMARY?.catalog_generated_at !== catalog.generated_at) return null;
  const value = window.FUND_RESEARCH_SUMMARY?.funds?.[fund.code];
  return value && value.nav_date === fund.performance?.latest_date && value.asset_date === (fund.asset?.report_date || null) ? value : null;
}

function decisionColumns() {
  return (DECISION_COLUMNS[listView] || []).filter(([key]) => !hiddenDecisionColumns.has(key));
}

function decisionSortValue(fund, key) {
  if (key === 'size') return fund.asset?.net_asset;
  if (key === 'risk1y') return performanceMetric(fund, '1y', 'drawdown');
  return decisionSummary(fund)?.[key];
}

function decisionFundRow(fund) {
  const s = decisionSummary(fund), a = fund.asset || {};
  const change = value => FundResearch.finite(value) ? `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}pct` : '待比较';
  const signed = value => `<strong class="${!FundResearch.finite(value) ? 'value-missing' : value < 0 ? 'negative' : 'positive'}">${formatPercent(value, 1, true)}</strong>`;
  const cell = (main, note = '') => `${main}<small>${escapeHtml(note)}</small>`;
  const rank = FundResearch.finite(s?.return_top_pct) ? `同类前${Math.max(1, Math.ceil(s.return_top_pct * 100))}% · ${s.return_top_pct_n}只` : '同日可比样本不足';
  const lag = FundResearch.quarterLag(fund.duration?.report_date, a.report_date);
  const industry = a.stock_weight === 0 ? '无股票持仓 / 不适用' : s?.industry ? `${s.industry} ${formatPercent(s.industry_weight)}` : '无可用行业披露';
  const fields = {
    '1y': cell(signed(performanceMetric(fund, '1y', 'return')), rank),
    current_drawdown: cell(formatPercent(s?.current_drawdown), s ? (s.current_drawdown < -1e-8 ? `未修复 · 距高点${s.underwater_days}天` : '已修复 / 新高') : '待生成摘要'),
    risk1y: cell(formatPercent(performanceMetric(fund, '1y', 'drawdown')), FundResearch.finite(s?.drawdown_top_pct) ? `损失较小前${Math.max(1, Math.ceil(s.drawdown_top_pct * 100))}%` : '排名待计算'),
    size: cell(formatMoney(a.net_asset), a.report_date || '暂无披露'),
    exposure: cell(`${formatPercent(a.stock_weight)} / ${formatPercent(a.convertible_bond_weight)}`, `${a.report_date || '—'} · 占NAV`),
    industry: cell(escapeHtml(industry), `${s?.full_date || '—'} · 中信一级 · 占NAV`),
    concentration: cell(fund.category === 'active-equity' ? formatPercent(s?.top10_weight) : leverageText(a), fund.category === 'active-equity' ? `${s?.full_date || '—'} · 完整披露中前十大` : `${a.report_date || '—'} · 总资产/净资产`),
    duration: cell(fund.category === 'active-equity' ? escapeHtml(s?.full_date || '暂无完整披露') : FundResearch.finite(fund.duration?.value) ? `${Number(fund.duration.value).toFixed(2)}年` : '暂无久期', fund.category === 'active-equity' ? '半年报 / 年报' : `${fund.duration?.report_date || '—'}${lag ? ` · 滞后${lag}期` : ''}`),
    size_change: cell(formatPercent(s?.size_change, 1, true), `${s?.previous_asset_date || '—'} → ${a.report_date || '—'}`),
    stock_change: cell(`股票 ${change(s?.stock_change)}`, `债券 ${change(s?.bond_change)} · 转债 ${change(s?.convertible_bond_change)}`),
    industry_change: cell(s?.industry ? `${escapeHtml(s.industry)} ${change(s.industry_change)}` : '无可比行业披露', `${s?.previous_full_date || '—'} → ${s?.full_date || '—'}`),
    entries: cell(s?.previous_full_date ? `新出现 ${s.entry_count} · 不再出现 ${s.exit_count}` : '不足两期完整披露', '仅名单变化，不等于首次买入 / 实际卖出'),
  };
  return `<tr data-fund-code="${escapeHtml(fund.code)}"><td class="fund-name-cell"><a href="${fundHref(fund)}" title="${escapeHtml(fund.benchmark || '业绩基准未提供')}"><strong>${escapeHtml(fund.name)}</strong><small>${escapeHtml(fund.code)} · ${escapeHtml(fund.subtype)}</small></a><small>${escapeHtml((fund.manager || []).join('、') || '经理待补')}</small></td>${decisionColumns().map(([key]) => `<td>${fields[key] || '—'}</td>`).join('')}</tr>`;
}

function renderDecisionControls() {
  const target = document.querySelector('#decision-filters');
  const convert = html => html.replace(/^<th[^>]*>/, '<label>').replace(/<\/th>$/, '</label>');
  target.innerHTML = `${listView === 'complete' ? '' : convert(fundSizeHeader())}<label>成立年限<select id="decision-age"><option value="all">不限</option>${[1,3,5].map(n => `<option value="${n}"${ageFilter === String(n) ? ' selected' : ''}>满${n}年</option>`).join('')}</select></label><label>数据范围<select id="decision-data"><option value="all">不限</option><option value="summary"${dataFilter === 'summary' ? ' selected' : ''}>有可用摘要</option><option value="holdings"${dataFilter === 'holdings' ? ' selected' : ''}>完整持仓与配置同期</option></select></label>${activeCategory === 'active-equity' && listView !== 'complete' ? `<details class="more-filters"><summary>画像 / 行业</summary><div>${convert(activeEquityProfileHeader())}${convert(classificationHeader('sector'))}${convert(classificationHeader('industry'))}<p>板块、行业按选中暴露排序，不排除主题外股票。</p></div></details>` : ''}`;
  document.querySelector('#page-size').value = String(PAGE_SIZE);
  document.querySelector('#mobile-category').value = activeCategory;
  const sortColumns = listView === 'complete' ? PERIOD_SETS[listPeriodMode].flatMap(([key,label]) => [[key, `${label}收益`, 'return'], [key, `${label}回撤`, 'drawdown']]) : decisionColumns().filter(c=>c[2]);
  document.querySelector('#mobile-sort').innerHTML = '<option value="">默认排序</option>' + sortColumns.flatMap(([key,label,metric])=>['desc','asc'].map(dir=>`<option value="${key}:${metric}:${dir}"${sortState.key===key&&sortState.metric===metric&&sortState.direction===dir?' selected':''}>${escapeHtml(label.split(' / ')[0])} ${dir==='desc'?'高→低':'低→高'}</option>`)).join('');
  document.querySelectorAll('[data-view]').forEach(b => { const active = b.dataset.view === listView; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  document.querySelector('#decision-columns').innerHTML = (DECISION_COLUMNS[listView] || []).map(([key,label]) => `<label><input type="checkbox" data-column="${key}"${hiddenDecisionColumns.has(key) ? '' : ' checked'}>${label}</label>`).join('') + (listView === 'complete' ? '<p>当前展示原有完整指标；可切换短期 / 长期，或选择上方摘要视图。</p>' : '<button type="button" id="show-complete">查看完整指标</button>');
  const selected = [activeCategory !== 'all' ? CATEGORY_LABELS[activeCategory] : '', search.value.trim(), fundSizeFilterState !== 'all' ? FUND_SIZE_FILTERS.find(([k])=>k===fundSizeFilterState)?.[1] : '', ageFilter !== 'all' ? `满${ageFilter}年` : '', dataFilter !== 'all' ? '已筛选数据状态' : '', classificationRankState.name ? `${classificationRankState.name} · ${classificationRankState.direction === 'desc' ? '高→低' : '低→高'}` : '', activeEquityProfileFilter !== 'all' ? activeEquityProfileFilter.split(':')[1] : '', filter.value !== 'all' ? filter.selectedOptions[0]?.textContent : ''].filter(Boolean);
  document.querySelector('#selected-filters').innerHTML = selected.length ? `<span>已选</span>${selected.map(t => `<span class="filter-chip">${escapeHtml(t)}</span>`).join('')}<button id="clear-decision-filters">清空筛选</button>` : '';
}

function syncTopScrollbar() {
  const top = document.querySelector('#table-top-scroll'), wrap = document.querySelector('.fund-list-wrap');
  top.firstElementChild.style.width = `${wrap.scrollWidth}px`;
  top.hidden = wrap.scrollWidth <= wrap.clientWidth;
}

document.querySelector('#table-top-scroll').addEventListener('scroll', event => { document.querySelector('.fund-list-wrap').scrollLeft = event.target.scrollLeft; });
document.querySelector('.fund-list-wrap').addEventListener('scroll', event => { document.querySelector('#table-top-scroll').scrollLeft = event.target.scrollLeft; });
window.addEventListener('resize', syncTopScrollbar);
document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'mobile-category') { document.querySelector(`[data-category="${target.value}"]`)?.click(); return; }
  if (target.id === 'mobile-sort') { const [key,metric,direction]=target.value.split(':');sortState={key:key||null,metric:metric||'return',direction:direction||'desc'};classificationRankState.name='';currentPage=1;renderFunds();return; }
  if (target.id === 'page-size') PAGE_SIZE = Number(target.value);
  else if (target.id === 'decision-age') ageFilter = target.value;
  else if (target.id === 'decision-data') dataFilter = target.value;
  else if (target.dataset.column) { if (target.checked) hiddenDecisionColumns.delete(target.dataset.column); else hiddenDecisionColumns.add(target.dataset.column); }
  else return;
  currentPage = 1; renderFunds();
});
document.addEventListener('click', event => {
  if (event.target.id === 'mobile-filter-toggle') { const open=document.body.classList.toggle('mobile-filters-open');event.target.setAttribute('aria-expanded',String(open)); }
  const view = event.target.closest('[data-view]');
  if (view || event.target.id === 'show-complete') { listView = view?.dataset.view || 'complete'; hiddenDecisionColumns.clear(); sortState = {key:null,metric:'return',direction:'desc'}; renderFunds(); }
  if (event.target.id === 'clear-decision-filters') { search.value=''; fundSizeFilterState='all'; ageFilter='all'; dataFilter='all'; filter.value='all'; activeEquityProfileFilter='all'; classificationRankState.name=''; currentPage=1; syncSubtypeButtons(); renderFunds(); }
  const direction = event.target.closest('#decision-filters [data-classification-direction-level]');
  if (direction && !direction.disabled) { classificationRankState.direction=classificationRankState.direction==='desc'?'asc':'desc'; renderFunds(); }
}, false);
document.addEventListener('click', event => {
  const link = event.target.closest('a[href*="fund.html?"]');
  if (!link) return;
  const url = new URL(link.href, window.location.href), saved = new URLSearchParams(window.location.search);
  saved.set('scroll', String(Math.round(window.scrollY)));
  url.searchParams.set('list', saved.toString()); link.setAttribute('href', `fund.html?${url.searchParams}`);
}, true);

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
