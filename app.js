const selectedComparisonCodes = new Set();
const grid = document.querySelector("#fund-grid");
const search = document.querySelector("#fund-search");
const filter = document.querySelector("#fund-filter");
const subtypeTabs = document.querySelector("#fund-subtype-tabs");
const resultCount = document.querySelector("#search-result-count");
const listHead = document.querySelector("#fund-list-head");
const suggestionList = document.querySelector("#fund-search-suggestions");
const pagination = document.querySelector("#fund-pagination");
const listTitle = document.querySelector("#fund-list-title");
const workspaceTitle = document.querySelector("#workspace-category-title");
const dataNotes = document.querySelector("#notes");
const dataNotesLink = document.querySelector('.sidebar-note a[href="#notes"]');
const listDescription = document.querySelector("#fund-list-description");
const methodologyNote = document.querySelector("#fund-list-methodology");

const CATEGORY_LABELS = {
  all: "基金总览",
  "active-equity": "主动权益基金",
  "pure-bond": "纯债基金",
  "hybrid-bond": "混合债基",
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
  return CATEGORY_LABELS[fund.category] || fund.category_label;
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
let navDateScope = 'latest';
let lifecyclePoolScope = 'current';
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
let stockClassificationError = null;
let classificationSummaryPromise = null;
let classificationSummaryError = null;
let activeEquityProfilesPromise = null;
let activeEquityProfilesError = null;
let catalogPromise = null;
let activeEquityProfileFilter = "all";
let researchSummaryPromise = null;
let researchSummaryError = null;
let listRenderRequest = 0;
const initialListQuery = new URLSearchParams(window.location.search);
const searchTextByCode = new Map();
const historicalNavCache = new Map();
const historicalNavPending = new Map();
const historicalNavErrors = new Map();

function latestNavDate() { return catalog?.source?.nav_latest || catalog?.as_of || ''; }
function chosenNavDate() { return navDateScope === 'latest' || navDateScope === 'all' ? latestNavDate() : navDateScope; }
function isHistoricalDate() { return navDateScope !== 'latest' && navDateScope !== 'all' && navDateScope !== latestNavDate(); }
function historicalMetric(fund) { return isHistoricalDate() && fund ? historicalNavCache.get(navDateScope)?.[fund.code] : null; }
function performanceFor(fund) { return isHistoricalDate() ? historicalMetric(fund)?.performance || {} : fund.performance; }
function validCutoff(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value && value <= latestNavDate();
}
function clearSort() {
  sortState = {key:null,metric:'return',direction:'desc'};
  classificationRankState.name = '';
  classificationRankState.direction = 'desc';
}
function cycleMetricSort(key, metric) {
  const same = !classificationRankState.name && sortState.key === key && sortState.metric === metric;
  if (same && sortState.direction === 'asc') clearSort();
  else {
    sortState = {key,metric,direction:same ? 'asc' : 'desc'};
    classificationRankState.name = '';
    classificationRankState.direction = 'desc';
  }
}
function cycleClassificationSort() {
  sortState = {key:null,metric:'return',direction:'desc'};
  if (classificationRankState.direction === 'desc') classificationRankState.direction = 'asc';
  else { classificationRankState.name = ''; classificationRankState.direction = 'desc'; }
}
function resetFilter(key) {
  if (key === 'search') { search.value = ''; closeSuggestions(); }
  else if (key === 'size') fundSizeFilterState = 'all';
  else if (key === 'date') navDateScope = 'latest';
  else if (key === 'pool') { lifecyclePoolScope = 'current'; updateSubtypeFilter(); updateListCopy(); }
  else if (key === 'age') ageFilter = 'all';
  else if (key === 'data') dataFilter = 'all';
  else if (key === 'subtype') { filter.value = 'all'; syncSubtypeButtons(); }
  else if (key === 'profile') activeEquityProfileFilter = 'all';
  else if (key === 'industry' || key === 'sort') clearSort();
  currentPage = 1;
}
function resetFilters() {
  ['search','size','date','pool','age','data','subtype','profile','sort'].forEach(resetFilter);
}
function resetDisplaySettings() {
  listView = 'complete'; listPeriodMode = 'short'; hiddenDecisionColumns.clear();
  IndustryBars.setLevel('level1');
  PAGE_SIZE = window.matchMedia('(max-width: 720px)').matches ? 10 : 25;
  clearSort(); currentPage = 1;
  document.querySelectorAll('[data-list-period]').forEach(button => {
    const active = button.dataset.listPeriod === listPeriodMode;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
}

function navSortKey(key = sortState.key, metric = sortState.metric) {
  return ['return','drawdown'].includes(metric) || ['1y','risk1y','current_drawdown','tenure'].includes(key);
}
function historicalSortReady(items) {
  if (!isHistoricalDate()) return true;
  const cache = historicalNavCache.get(navDateScope) || {};
  const dates = new Set();
  for (const fund of items) {
    if (!Object.hasOwn(cache, fund.code) || cache[fund.code].error || !cache[fund.code].actualDate) return false;
    dates.add(cache[fund.code].actualDate);
  }
  return items.length > 0 && dates.size === 1;
}
function renderHistoricalNote() {
  const note = document.querySelector('#historical-date-note');
  if (!note) return;
  note.hidden = !isHistoricalDate();
  if (note.hidden) { note.textContent = ''; return; }
  const results = historicalNavCache.get(navDateScope) || {};
  const visible = filteredFunds();
  const covered = visible.filter(fund => results[fund.code]?.actualDate && !results[fund.code]?.error).length;
  const failures = visible.filter(fund => results[fund.code]?.error).length;
  note.textContent = `净值截至 ${navDateScope}，历史净值已载入 ${covered}/${visible.length} 只；按页读取。非净值日使用此前最近有效净值，表内标注实际日期。区间不足显示“—”。历史同类排名显示“—”；覆盖不全或实际日期不一致时，历史业绩排序暂不可用。规模、持仓和资产配置使用各自披露日。`;
  if (failures) note.insertAdjacentHTML('beforeend', ` <button type="button" id="retry-historical-nav">重试 ${failures} 只</button>`);
}

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
  const rounded=Number((number*100).toFixed(digits));
  return rounded===0?"0%":`${signed && rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}%`;
}

function returnClass(value, digits=1) {
  if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))return 'value-missing';
  const rounded=Number((Number(value)*100).toFixed(digits));
  return rounded===0?'value-zero':rounded<0?'negative':'positive';
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
  const current = funds.filter(fund => lifecyclePoolScope === "history" || FundLifecycle.currentEligible(fund));
  return activeCategory === "all" ? current : current.filter((fund) => fund.category === activeCategory);
}

function searchableText(fund) {
  if (searchTextByCode.has(fund.code)) return searchTextByCode.get(fund.code);
  const value = [
    fund.name,
    fund.code,
    ...Object.keys(FundLifecycle.data().aliases).filter(code => FundLifecycle.canonicalCode(code) === fund.code),
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
    return {
      sector: topWeight(fullMarket.sector_weights) || "未映射",
      industry: topWeight(fullMarket.industry_weights?.[classificationRankState.industryLevel], true) || "暂无A股行业数据",
      date: fullMarket.report_date,
    };
  }
  const analysis = legacyAnalysis(fund);
  const classification = analysis?.home_classification || {};
  const level1 = topWeight(classification.industry_weights?.[classificationRankState.industryLevel]);
  const sector = topWeight(classification.sector_weights);
  const unavailable = !validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION)
    && !validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION_SUMMARY);
  const loadingNote = classificationSummaryError ? "摘要未载入" : "摘要加载中";
  return {
    sector: sector || (unavailable ? `板块${loadingNote}` : "暂无板块映射"),
    industry: level1 || (unavailable ? `行业${loadingNote}` : "暂无行业映射"),
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
  const raw = classificationWeights(fund, level)?.[name];
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function classificationNames(level) {
  if (!validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION)) return [];
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
  return `<button type="button" class="table-filter-direction" data-classification-direction-level="${level}" aria-label="权重${label}，点击切换排序方向" title="权重${label}，点击切换方向"${active ? "" : " disabled"}>${active ? (classificationRankState.direction === 'desc' ? '↓' : '↑') : '↕'}</button>`;
}

function classificationHeader(kind) {
  if (!validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION)) {
    const label = kind === "sector" ? "板块权重" : "行业权重";
    const loading = Boolean(stockClassificationPromise);
    const action = loading ? "正在载入…" : stockClassificationError ? "重试载入排序" : "载入权重排序";
    const note = stockClassificationError ? escapeHtml(stockClassificationError.message) : "需要时载入完整权重";
    return `<th class="table-filter-heading"><span>${label}</span><button type="button" class="table-header-select" data-load-classification${loading ? " disabled" : ""}>${action}</button><small>${note}</small></th>`;
  }
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
  if (!validHomepageFundMap(window.FUND_ACTIVE_EQUITY_PROFILES)) {
    return activeEquityProfilesError
      ? '<td class="fund-profile-cell pending-cell"><strong>画像暂不可用</strong><small>可在表头重试，其他数据仍可查看</small></td>'
      : '<td class="fund-profile-cell pending-cell"><strong>画像加载中</strong><small>正在读取低频画像数据</small></td>';
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
  const unavailable = !validHomepageFundMap(window.FUND_ACTIVE_EQUITY_PROFILES);
  const retry = activeEquityProfilesError ? `<button type="button" class="table-header-select" data-retry-profiles>重试画像</button><small>${escapeHtml(activeEquityProfilesError.message)}</small>` : '';
  return `<th class="table-filter-heading profile-filter-heading"><span>基金画像</span><select id="header-profile-group" class="table-header-select" aria-label="按基金画像分组筛选"${unavailable ? ' disabled' : ''}>${options}</select>${retry}</th>`;
}

function matchesActiveEquityProfile(fund) {
  if (activeCategory !== "active-equity" || activeEquityProfileFilter === "all") return true;
  if (!validHomepageFundMap(window.FUND_ACTIVE_EQUITY_PROFILES)) return false;
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
  const end = new Date(performanceFor(fund)?.latest_date);
  const start = new Date(fund.inception_date);
  if (!fund.inception_date || !performanceFor(fund)?.latest_date || !Number.isFinite(+start) || !Number.isFinite(+end)) return false;
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() - months);
  end.setUTCDate(Math.min(day, new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()));
  return start <= end;
}

function performanceMetric(fund, key, metric) {
  if(key === "tenure")return viewMetric(fund)?.tenure?.[metric === "return" ? "return" : "drawdown"];
  if (!hasFullReturnPeriod(fund, key)) return null;
  return performanceFor(fund)?.[metric === "return" ? "returns" : "drawdowns"]?.[key];
}

function relativeMetrics(fund) {
  if (isHistoricalDate()) return historicalMetric(fund)?.relative_metrics || {};
  return window.INDEX_ENHANCED_METRICS?.funds?.[fund.code] || fund.relative_metrics || {};
}

function periodCell(fund, key, relative = false) {
  if (isHistoricalDate() && !historicalMetric(fund)) return '<td class="period-cell pending-cell"><strong>—</strong><small>正在读取历史净值</small></td>';
  if(key === "tenure"){const t=viewMetric(fund)?.tenure;return `<td class="period-cell"><strong class="${returnClass(t?.return)}">${formatPercent(t?.return,1,true)}</strong><small class="${returnClass(t?.drawdown)}">回撤 ${formatPercent(t?.drawdown)}</small><small>${escapeHtml(t?.start? t.start+"起" : t?.reason || "任职日期待加载")}</small>${t?.reason?`<small>${escapeHtml(t.reason)}</small>`:""}</td>`;}
  if (!hasFullReturnPeriod(fund, key)) return `<td class="period-cell pending-cell"><strong>—</strong><small>${isHistoricalDate() ? '区间数据不足' : '成立未满该区间'}</small></td>`;
  if (relative) {
    const relativeData = relativeMetrics(fund);
    const value = relativeData?.excess_returns?.[key];
    const drawdown = relativeData?.excess_drawdowns?.[key];
    if (!FundResearch.finite(value)) {
      return '<td class="period-cell pending-cell"><strong>待计算</strong><small>基准行情缺失</small></td>';
    }
    return `<td class="period-cell"><strong class="${returnClass(value)}">${formatPercent(value, 1, true)}</strong><small class="${returnClass(drawdown)}">超额回撤 ${formatPercent(drawdown)}</small></td>`;
  }
  const value = performanceMetric(fund, key, "return");
  const drawdown = performanceMetric(fund, key, "drawdown");
  return `<td class="period-cell"><strong class="${returnClass(value)}">${formatPercent(value, 1, true)}</strong><small class="${returnClass(drawdown)}">回撤 ${formatPercent(drawdown)}</small></td>`;
}

function bondStructureCell(asset) {
  const structure=asset?.bond_structure||{};
  const entries=[['国债','government'],['金融债','financial'],['企业债','corporate'],['转债','convertible'],['资产支持证券','abs'],['其他债券','other']].filter(([,key])=>FundResearch.finite(structure[key]));
  if(!entries.length)return '暂无券种披露';
  return entries.sort((a,b)=>structure[b[1]]-structure[a[1]]).map(([label,key])=>`${label} ${formatPercent(structure[key])}`).join('<br>');
}

function commonCells(fund) {
  return `
    <td class="fund-name-cell"><a href="${fundHref(fund)}"><strong>${escapeHtml(fund.name)}</strong>${FundLifecycle.badge(fund)}<small>${escapeHtml(fund.code)} · ${escapeHtml(fund.subtype)}</small></a></td>
    <td><strong>${escapeHtml((fund.manager || []).join("、") || "—")}</strong><small>${escapeHtml(fund.fund_company || "")}</small></td>
    <td>${escapeHtml(fund.inception_date || "—")}</td>
    <td><strong>${formatMoney(fund.asset?.net_asset)}</strong><small>${escapeHtml(fund.asset?.report_date || "无配置披露")}</small></td>
    <td class="benchmark-cell">${escapeHtml(fund.benchmark || "—")}</td>`;
}

function activeEquityOverviewCells(fund) {
  const managers = (fund.manager || []).join('、') || '暂无经理信息';
  return `<td class="fund-name-cell equity-overview-cell">
    <a href="${fundHref(fund)}"><strong>${escapeHtml(fund.name)}</strong>${FundLifecycle.badge(fund)}<small>${escapeHtml(fund.code)} · ${escapeHtml(fund.subtype)}</small></a>
    ${managerDates(fund)}
    <details class="fund-row-details"><summary>资料与基准</summary><dl>
      <dt>基金名称</dt><dd>${escapeHtml(fund.name)}</dd>
      <dt>基金经理</dt><dd>${escapeHtml(managers)}</dd>
      <dt>基金公司</dt><dd>${escapeHtml(fund.fund_company || '—')}</dd>
      <dt>成立日期</dt><dd>${escapeHtml(fund.inception_date || '—')}</dd>
      <dt>业绩基准</dt><dd>${escapeHtml(fund.benchmark || '—')}</dd>
      <dt>净值截至</dt><dd>${escapeHtml(performanceFor(fund)?.latest_date || '—')}</dd>
    </dl></details>
  </td><td><strong>${formatMoney(fund.asset?.net_asset)}</strong><small>${escapeHtml(fund.asset?.report_date || '无配置披露')}</small></td>`;
}

function equityPeriodHeader(key, label) {
  return `<th class="sortable-period-heading"><span>${label}</span><div class="metric-sort-controls"><button type="button" data-sort-key="${key}" data-sort-metric="return" aria-label="${label}收益排序">收益 ↕</button><button type="button" data-sort-key="${key}" data-sort-metric="drawdown" aria-label="${label}回撤排序">回撤 ↕</button></div></th>`;
}

function allFundOverviewCell(fund) {
  return `
    <td class="fund-name-cell all-fund-overview-cell">
      <a href="${fundHref(fund)}"><strong>${escapeHtml(fund.name)}</strong>${FundLifecycle.badge(fund)}<small>${escapeHtml(fund.code)} · ${escapeHtml(fund.subtype)}</small></a>
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
    return `${coreMetric("股票仓位", formatPercent(fund.asset?.stock_weight), assetDate)}${coreMetric("完整持仓板块", escapeHtml(classification.sector), classification.date || "")}${IndustryBars.placeholder(fund)}`;
  }
  if (fund.category === "index-enhanced") {
    const metrics = relativeMetrics(fund);
    return `${coreMetric("跟踪指数", escapeHtml(fund.tracking_index || "—"))}${coreMetric("跟踪误差", formatPercent(metrics.tracking_error), "近1年")}${coreMetric("信息比率", FundResearch.finite(metrics.information_ratio) ? Number(metrics.information_ratio).toFixed(2) : "—")}`;
  }
  if (fund.category === "pure-bond") {
    return `${coreMetric("杠杆", leverageText(fund.asset), leverageNote(fund.asset, assetDate))}${coreMetric("久期", FundResearch.finite(fund.duration?.value) ? `${Number(fund.duration.value).toFixed(2)}年` : "—", fund.duration?.report_date || "")}${coreMetric("券种结构", bondStructureCell(fund.asset))}`;
  }
  if (fund.category === "hybrid-bond") {
    return `${coreMetric("杠杆 / 久期", `${FundResearch.finite(fund.asset?.leverage) ? `${Number(fund.asset.leverage).toFixed(2)}x` : "—"} / ${FundResearch.finite(fund.duration?.value) ? `${Number(fund.duration.value).toFixed(2)}年` : "—"}`)}${coreMetric("股票 / 转债仓位", `${formatPercent(fund.asset?.stock_weight)} / ${formatPercent(fund.asset?.convertible_bond_weight)}`, assetDate)}${coreMetric("券种结构", bondStructureCell(fund.asset))}${fund.asset?.stock_weight === 0 ? "" : IndustryBars.placeholder(fund)}`;
  }
  const classification = classificationSummary(fund);
  return `${coreMetric("转债仓位", formatPercent(fund.asset?.convertible_bond_weight), assetDate)}${coreMetric("股票仓位", formatPercent(fund.asset?.stock_weight))}${IndustryBars.placeholder(fund)}`;
}

function fundRow(fund) {
  if (listView !== 'complete') return decisionFundRow(fund);
  const periods = visiblePeriods();
  const annual = performanceFor(fund)?.calendar?.[(performanceFor(fund)?.latest_date || chosenNavDate()).slice(0, 4)];
  if (activeCategory === "all") {
    return `<tr data-fund-code="${escapeHtml(fund.code)}">${allFundOverviewCell(fund)}
      <td><strong>${formatMoney(fund.asset?.net_asset)}</strong><small>${escapeHtml(fund.asset?.report_date || "无配置披露")}</small></td>
      ${periods.map(([key]) => periodCell(fund, key)).join("")}
      <td class="period-cell"><strong class="${returnClass(annual?.return)}">${formatPercent(annual?.return, 1, true)}</strong><small class="${returnClass(annual?.drawdown)}">年度回撤 ${formatPercent(annual?.drawdown)}</small></td>
      <td><strong>${escapeHtml(displayCategoryLabel(fund))}</strong><small>${escapeHtml(fund.subtype)}</small></td>
      <td class="all-fund-core-cell"><div class="all-fund-core-grid">${allFundCoreCell(fund)}</div></td>
      <td class="benchmark-cell">${escapeHtml(fund.benchmark || "—")}</td>
      <td><strong>${performanceFor(fund)?.latest_date || "—"}</strong><small>净值截止日</small></td></tr>`;
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
      <td>${IndustryBars.placeholder(fund)}</td>`;
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
      <td>${IndustryBars.placeholder(fund)}</td>`;
  } else if (activeCategory === "convertible-bond") {
    const classification = classificationSummary(fund);
    extras = `
      <td><strong>${formatPercent(fund.asset?.convertible_bond_weight)}</strong><small>转债仓位</small></td>
      <td><strong>${formatPercent(fund.asset?.stock_weight)}</strong><small>股票仓位</small></td>
      <td title="${escapeHtml(fund.asset?.leverage_note || "总资产/净资产")}"><strong>${leverageText(fund.asset)}</strong>${fund.asset?.leverage_status === "extreme_reconciled" ? "<small>特殊报告期</small>" : ""}</td>
      <td><strong>${escapeHtml(classification.sector)}</strong><small>${escapeHtml(classification.date || "完整持仓")}</small></td>
      <td>${IndustryBars.placeholder(fund)}</td>`;
  } else {
    extras = `<td><strong>${escapeHtml(displayCategoryLabel(fund))}</strong><small>${escapeHtml(fund.subtype)}</small></td><td><strong>${performanceFor(fund)?.latest_date || "—"}</strong></td>`;
  }
  if(activeCategory==='active-equity'){const m=viewMetric(fund);extras=`<td><strong>${formatPercent(m?.current_drawdown)}</strong><small>近1年收益同类${Number.isFinite(m?.return_top_pct)?"前"+Math.ceil(m.return_top_pct*100)+"%":"样本不足"}</small></td>`+extras;}
  return `<tr data-fund-code="${escapeHtml(fund.code)}">${activeCategory === 'active-equity' ? activeEquityOverviewCells(fund) : commonCells(fund)}${periods.map(([key]) => periodCell(fund, key, relative)).join("")}<td class="period-cell"><strong class="${returnClass(annual?.return)}">${formatPercent(annual?.return, 1, true)}</strong><small class="${returnClass(annual?.drawdown)}">年度回撤 ${formatPercent(annual?.drawdown)}</small></td>${extras}</tr>`;
}

function extraHeaders() {
  if (activeCategory === "active-equity") return `<th class="equity-stock-heading">股票仓位</th>${activeEquityProfileHeader()}${classificationHeader("sector")}${classificationHeader("industry")}`;
  if (activeCategory === "index-enhanced") return "<th>跟踪指数</th><th>跟踪误差</th><th>信息比率</th>";
  if (activeCategory === "pure-bond") return "<th>杠杆</th><th>久期</th><th>券种结构</th>";
  if (activeCategory === "hybrid-bond") return "<th>杠杆</th><th>久期</th><th>券种结构</th><th>股票仓位</th><th>转债仓位</th><th>板块权重</th><th>行业权重</th>";
  if (activeCategory === "convertible-bond") return "<th>转债仓位</th><th>股票仓位</th><th>杠杆</th><th>板块权重</th><th>行业权重</th>";
  return "<th>基金分类</th><th>净值日期</th>";
}

function renderListHead() {
  listHead.closest("table").querySelector("colgroup[data-complete-widths]")?.remove();
  IndustryBars.controls(activeCategory,listView);
  renderClassificationSummaryStatus();
  document.body.dataset.listView = listView;
  listHead.closest('table').classList.toggle('active-equity-mode', activeCategory === 'active-equity' && listView === 'complete');
  if (listView !== 'complete') {
    listHead.closest('table').classList.remove('all-fund-mode');
    listHead.innerHTML = `<tr><th>基金 / 经理</th>${decisionColumns().map(([key, label, metric]) => key==='industry' && activeCategory==='active-equity' ? classificationHeader('industry') : `<th>${metric ? `<button data-sort-key="${key}" data-sort-metric="${metric}">${label} ↕</button>` : label}</th>`).join('')}</tr>`;
    return;
  }
  const periods = visiblePeriods();
  const relative = activeCategory === "index-enhanced";
  const table = listHead.closest("table");
  table?.classList.toggle("all-fund-mode", activeCategory === "all");
  if (activeCategory === 'active-equity') {
    listHead.innerHTML = `<tr><th>基金 / 经理</th>${fundSizeHeader()}${periods.map(([key, label]) => equityPeriodHeader(key, label)).join('')}${equityPeriodHeader('ytd', '今年以来')}<th>当前回撤 / 同类位置</th>${extraHeaders()}</tr>`;
    return;
  }
  if (activeCategory === "all") {
    // Complete metrics have a wider composition cell than the compact list.
    const widths = [280, 140, ...periods.map(() => 135), 135, 120, 320, 310, 120];
    const columns = document.createElement('colgroup');
    columns.dataset.completeWidths = 'true';
    columns.innerHTML = widths.map(width => `<col style="width:${width}px">`).join('');
    table.prepend(columns);
    table.style.setProperty('--complete-table-width', `${widths.reduce((sum, width) => sum + width, 0)}px`);
    listHead.innerHTML = `<tr><th>基金概况</th>${fundSizeHeader()}${periods.map(([key, label]) => `<th class="sortable-period-heading"><button data-sort-key="${key}" data-sort-metric="return">${label} ↕</button></th>`).join("")}<th class="sortable-period-heading"><button data-sort-key="ytd" data-sort-metric="return">今年以来 ↕</button></th><th>基金分类</th><th>分类核心指标</th><th>业绩比较基准</th><th>净值日期</th></tr>`;
    return;
  }
  listHead.innerHTML = `<tr><th>基金名称</th><th>基金经理</th><th>成立时间</th>${fundSizeHeader()}<th>业绩比较基准</th>${periods.map(([key, label]) => `<th class="sortable-period-heading"><button data-sort-key="${key}" data-sort-metric="return">${relative ? label + "超额" : label} ↕</button></th>`).join("")}<th class="sortable-period-heading"><button data-sort-key="ytd" data-sort-metric="return">${relative ? "今年以来超额" : "今年以来"} ↕</button></th>${extraHeaders()}</tr>`;
}

function filteredFunds() {
  const keyword = search.value.trim().toLowerCase();
  const subtype = filter.value;
  const visible = categoryFunds().filter((fund) => {
    const matchesKeyword = !keyword || ReviewCore.matches(searchableText(fund), keyword);
    const matchesSubtype = subtype === "all" || fund.internal_category === subtype;
    const s = decisionSummary(fund);
    const years = fund.inception_date && chosenNavDate() ? (new Date(chosenNavDate()) - new Date(fund.inception_date)) / (365.25 * 86400000) : null;
    const matchesAge = ageFilter === 'all' || years !== null && years >= Number(ageFilter);
    const matchesData = dataFilter === 'all' || (dataFilter === 'summary' ? Boolean(s) : Boolean(fund.asset?.report_date && s?.full_date && s.full_date >= fund.asset.report_date));
    const matchesDate = isHistoricalDate()
      ? !fund.inception_date || fund.inception_date <= chosenNavDate()
      : navDateScope === 'all' || lifecyclePoolScope === 'history' || !latestNavDate() || fund.performance?.latest_date === latestNavDate();
    const rankedPeriod = !isHistoricalDate() && ["ytd","1m","3m","6m","1y","3y","5y"].includes(sortState.key);
    const matchesRankWindow = !rankedPeriod || !["return","drawdown"].includes(sortState.metric) || FundLifecycle.ranks(fund).some(row => row.key === sortState.key);
    return matchesDate && matchesRankWindow && matchesKeyword && matchesSubtype && matchesFundSize(fund) && matchesActiveEquityProfile(fund) && matchesAge && matchesData;
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
  if (!sortState.key || isHistoricalDate() && navSortKey() && !historicalSortReady(visible)) return visible;
  if (sortState.metric === 'decision') return [...visible].sort((left, right) => {
    const a = decisionSortValue(left, sortState.key), b = decisionSortValue(right, sortState.key);
    if (!FundResearch.finite(a)) return FundResearch.finite(b) ? 1 : 0;
    if (!FundResearch.finite(b)) return -1;
    return (a - b) * (sortState.direction === 'asc' ? 1 : -1);
  });
  return [...visible].sort((left, right) => {
    const numeric = value => value === null || value === undefined || value === "" ? NaN : Number(value);
    const leftValue = numeric(activeCategory === "index-enhanced"
      ? relativeMetrics(left)[sortState.metric === 'drawdown' ? 'excess_drawdowns' : 'excess_returns']?.[sortState.key]
      : performanceMetric(left, sortState.key, sortState.metric));
    const rightValue = numeric(activeCategory === "index-enhanced"
      ? relativeMetrics(right)[sortState.metric === 'drawdown' ? 'excess_drawdowns' : 'excess_returns']?.[sortState.key]
      : performanceMetric(right, sortState.key, sortState.metric));
    if (!Number.isFinite(leftValue) && !Number.isFinite(rightValue)) return 0;
    if (!Number.isFinite(leftValue)) return 1;
    if (!Number.isFinite(rightValue)) return -1;
    return (leftValue - rightValue) * (sortState.direction === "asc" ? 1 : -1);
  });
}

function updateClassificationRankControl(resetName = false) {
  if (resetName) classificationRankState.name = "";
  if (activeCategory !== "active-equity" || !classificationRankState.name || !validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION)) return;
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
  return String(source.textContent || "指标").replace(/[↕↑↓]/g, "").replace(/\s+/g, " ").trim();
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
    if (isHistoricalDate() && firstCell) { const item = historicalMetric(funds.find(fund => fund.code === row.dataset.fundCode)); firstCell.insertAdjacentHTML('beforeend', `<small class="historical-row-date">${item?.actualDate ? '实际净值日 '+escapeHtml(item.actualDate) : item?.error ? '历史净值读取失败' : '历史净值读取中…'}</small>`); }
    if (!firstCell || firstCell.querySelector(".mobile-card-toggle")) return;
    firstCell.insertAdjacentHTML(
      "beforeend",
      '<button type="button" class="mobile-card-toggle" aria-expanded="false" aria-label="展开更多指标">更多</button>',
    );
  });
  bindFundComparisonSelection();
  IndustryBars.hydrate(grid);
}

function needsResearchSummary() {
  return listView !== 'complete' || dataFilter !== 'all' || sortState.metric === 'decision';
}

// Retry transient failures once, then leave an explicit manual retry to the user.
function loadHomepageScript(src, label, readPayload) {
  // Same stable URL as detail pages; keep server freshness/ETag validation.
  if (!src.includes('?')) src += '?v=history-v4';
  const attempt = (number) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.onload = script.onerror = null;
      script.remove();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`${label}加载超时，请重试`)), 30000);
    script.src = number === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}_retry=${Date.now()}`;
    script.onload = () => {
      try {
        const value = readPayload();
        finish(value ? null : new Error(`${label}未生成有效内容，请重试`), value);
      } catch (error) { finish(error); }
    };
    script.onerror = () => finish(new Error(`${label}加载失败，请检查网络后重试`));
    document.head.appendChild(script);
  });
  return attempt(0).catch(() => attempt(1));
}

function validHomepageFundMap(value) {
  return Boolean(value?.funds && typeof value.funds === 'object' && !Array.isArray(value.funds));
}

// The lightweight display summary must never delay the catalog or substitute
// for the complete weights required by a restored industry ranking.
function ensureClassificationSummary() {
  if (validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION)) return Promise.resolve(window.FUND_STOCK_CLASSIFICATION);
  if (validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION_SUMMARY)) return Promise.resolve(window.FUND_STOCK_CLASSIFICATION_SUMMARY);
  if (classificationSummaryPromise) return classificationSummaryPromise;
  classificationSummaryPromise = loadHomepageScript(
    'https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/stock_classification_summary.js', '板块/行业摘要',
    () => validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION_SUMMARY) ? window.FUND_STOCK_CLASSIFICATION_SUMMARY : null,
  ).catch((error) => {
    classificationSummaryPromise = null;
    throw error;
  });
  return classificationSummaryPromise;
}

function renderClassificationSummaryStatus() {
  const status = document.querySelector('#classification-summary-status');
  if (!status) return;
  const visible = listView === 'complete' && ['all', 'active-equity', 'hybrid-bond', 'convertible-bond'].includes(activeCategory);
  status.hidden = !visible || validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION)
    || validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION_SUMMARY);
  if (status.hidden) { status.innerHTML = ''; return; }
  status.innerHTML = classificationSummaryError
    ? `板块/行业摘要暂不可用：${escapeHtml(classificationSummaryError.message)}。其他指标仍可查看。 <button type="button" id="retry-classification-summary">重试摘要</button>`
    : '板块/行业摘要正在后台加载；基金目录、搜索和收益指标可先使用。';
}

function requestClassificationSummary() {
  if (classificationSummaryPromise) return classificationSummaryPromise;
  classificationSummaryError = null;
  const loading = ensureClassificationSummary();
  renderClassificationSummaryStatus();
  const refresh = () => {
    renderClassificationSummaryStatus();
    // Use the current controls, not those captured before the request finished.
    if (['complete','portfolio'].includes(listView) && ['all', 'active-equity', 'hybrid-bond', 'convertible-bond'].includes(activeCategory)) renderFunds();
  };
  loading.then(refresh, (error) => {
    classificationSummaryError = error;
    refresh();
  });
  return loading;
}

function ensureResearchSummary() {
  const readPayload = () => {
    const value = window.FUND_RESEARCH_SUMMARY;
    if (value && value.catalog_generated_at !== catalog?.generated_at) {
      throw new Error('摘要与目录版本不一致，请稍后刷新页面');
    }
    return validHomepageFundMap(value) ? value : null;
  };
  if (validHomepageFundMap(window.FUND_RESEARCH_SUMMARY) && window.FUND_RESEARCH_SUMMARY.catalog_generated_at === catalog?.generated_at) return Promise.resolve(window.FUND_RESEARCH_SUMMARY);
  if (researchSummaryPromise) return researchSummaryPromise;
  researchSummaryPromise = loadHomepageScript(
    `https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/research_summary.js?v=${encodeURIComponent(catalog?.generated_at || '')}`,
    '研究摘要', readPayload,
  ).catch(error => { researchSummaryPromise = null; throw error; });
  return researchSummaryPromise;
}

function renderFunds() {
  if (!catalog) return;
  const request = ++listRenderRequest;
  // A restored weight sort needs complete weights; the homepage summary only
  // contains each fund's largest category and cannot produce a valid ranking.
  if (activeCategory === 'active-equity' && classificationRankState.name && !validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION)) {
    if (!stockClassificationError) requestStockClassification();
    saveListQuery();
    renderListHead();
    renderDecisionControls();
    resultCount.textContent = stockClassificationError ? '权重排序暂不可用，可重试或切换收益排序' : '正在载入权重排序…';
    const message = stockClassificationError ? `${escapeHtml(stockClassificationError.message)} <button type="button" data-load-classification>重试</button>` : '正在载入完整板块、行业权重，随后恢复所选排序…';
    grid.innerHTML = `<tr><td colspan="${listHead.querySelectorAll('th').length}" class="empty-state fund-search-empty">${message}</td></tr>`;
    pagination.innerHTML = '';
    document.querySelector('#fund-pagination-top').innerHTML = '';
    return;
  }
  if (needsResearchSummary() && (!validHomepageFundMap(window.FUND_RESEARCH_SUMMARY) || window.FUND_RESEARCH_SUMMARY?.catalog_generated_at !== catalog?.generated_at)) {
    saveListQuery();
    renderListHead();
    renderDecisionControls();
    resultCount.textContent = researchSummaryError ? '研究摘要暂不可用，基础列表仍可使用' : '正在加载研究摘要…';
    grid.innerHTML = `<tr><td colspan="${listHead.querySelectorAll('th').length}" class="empty-state fund-search-empty">${researchSummaryError ? `${escapeHtml(researchSummaryError.message)} <button type="button" id="retry-research-summary">重试</button>` : '正在载入当前视图所需的数据…'}</td></tr>`;
    pagination.innerHTML = '';
    document.querySelector('#fund-pagination-top').innerHTML = '';
    if (!researchSummaryError) ensureResearchSummary().then(() => { if (request === listRenderRequest) renderFunds(); }).catch(error => {
      if (request === listRenderRequest) { researchSummaryError = error; renderFunds(); }
    });
    return;
  }
  if (activeCategory === 'active-equity' && activeEquityProfileFilter !== 'all' && !validHomepageFundMap(window.FUND_ACTIVE_EQUITY_PROFILES)) {
    if (!activeEquityProfilesError) requestActiveEquityProfiles();
    saveListQuery();
    renderListHead();
    renderDecisionControls();
    resultCount.textContent = activeEquityProfilesError ? '画像筛选暂不可用，基础列表仍可使用' : '正在载入画像筛选…';
    const message = activeEquityProfilesError ? `${escapeHtml(activeEquityProfilesError.message)} <button type="button" data-retry-profiles>重试画像</button>` : '正在读取画像，随后恢复所选筛选…';
    grid.innerHTML = `<tr><td colspan="${listHead.querySelectorAll('th').length}" class="empty-state fund-search-empty">${message} <button type="button" data-clear-profile-filter>查看基础列表</button></td></tr>`;
    pagination.innerHTML = '';
    document.querySelector('#fund-pagination-top').innerHTML = '';
    return;
  }
  const visible = filteredFunds();
  currentPage = Math.max(1, Math.min(currentPage, Math.max(1, Math.ceil(visible.length / PAGE_SIZE))));
  saveListQuery();
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = visible.slice(start, start + PAGE_SIZE);
  queueHistoricalPage(pageItems);
  resultCount.textContent = `${visible.length.toLocaleString("zh-CN")}只基金`;
  renderListHead();
  listHead.querySelectorAll('th').forEach(header => header.setAttribute('aria-sort', 'none'));
  listHead.querySelectorAll('[data-sort-key]').forEach(button => {
    const selected = button.dataset.sortKey === sortState.key && button.dataset.sortMetric === sortState.metric && !classificationRankState.name;
    if (selected) button.closest('th').setAttribute('aria-sort', sortState.direction === 'asc' ? 'ascending' : 'descending');
    const unavailable = isHistoricalDate() && navSortKey(button.dataset.sortKey, button.dataset.sortMetric) && !historicalSortReady(visible);
    button.disabled = unavailable;
    if (unavailable) button.title = '历史净值覆盖全部当前筛选基金且实际日期一致后可排序';
    button.setAttribute('aria-pressed', String(selected));
    button.textContent = button.textContent.replace('↕', selected ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕');
  });
  if (activeCategory === 'active-equity' && classificationRankState.name) {
    listHead.querySelector('.table-filter-heading.is-active')?.setAttribute('aria-sort', classificationRankState.direction === 'asc' ? 'ascending' : 'descending');
  }
  const columnCount = listHead.querySelectorAll("th").length;
  grid.innerHTML = pageItems.length
    ? pageItems.map(fundRow).join("")
    : `<tr><td colspan="${columnCount}" class="empty-state fund-search-empty">没有找到匹配的基金。${lifecyclePoolScope === "current" ? `<a href="index.html?pool=history&navDate=latest&q=${encodeURIComponent(search.value.trim())}">查看含已退出基金的历史目录</a>` : ""}</td></tr>`;
  prepareMobileFundCards();
  renderPagination(visible.length);
  renderDecisionControls();
  requestAnimationFrame(syncTopScrollbar);
}

function queueHistoricalPage(items) {
  if (!isHistoricalDate()) return;
  const cutoff = navDateScope;
  const cache = historicalNavCache.get(cutoff) || {};
  historicalNavCache.set(cutoff, cache);
  const missing = items.filter(fund => !Object.hasOwn(cache, fund.code));
  if (!missing.length || historicalNavPending.has(cutoff)) return;
  const pending = window.DesktopNav.prepare(missing, cutoff, loadHomepageScript)
    .then(results => Object.assign(cache, results))
    .catch(error => missing.forEach(fund => { cache[fund.code] = {error:error.message}; }))
    .finally(() => { historicalNavPending.delete(cutoff); if (navDateScope === cutoff) renderFunds(); });
  historicalNavPending.set(cutoff, pending);
}

function saveListQuery() {
  if (!catalog) return;
  const params = new URLSearchParams();
  const values = {pool:lifecyclePoolScope,industryView:IndustryBars.level,q:search.value.trim(), category:activeCategory, period:listPeriodMode, page:String(currentPage), size:fundSizeFilterState, subtype:filter.value, profile:activeEquityProfileFilter, sort:sortState.key||"", metric:sortState.metric, dir:classificationRankState.name?classificationRankState.direction:sortState.direction, industry:classificationRankState.name, level:classificationRankState.level, view:listView, perPage:String(PAGE_SIZE), columns:[...hiddenDecisionColumns].join(','), age:ageFilter, data:dataFilter, navDate:navDateScope};
  for (const [key,value] of Object.entries(values)) if(value && (value!=="all" || key==="navDate") && !(key==="page"&&value==="1")) params.set(key,value);
  try { history.replaceState(null,"",`${window.location.pathname}?${params}${window.location.hash}`); } catch (_) { /* file-only viewers may forbid history changes */ }
}

function restoreListQuery() {
  const q=initialListQuery;
  if (HIDDEN_WEBSITE_CATEGORIES.has(q.get('category'))) {
    // Old category bookmarks return to the overview without stale category filters.
    for (const key of ['category','q','subtype','profile','industry','level','page','sort','metric','dir','size','age','data','scroll','columns']) q.delete(key);
    q.set('notice','category-updated');
  }
  const categoryNotice=document.querySelector('#category-update-notice');
  if (categoryNotice) categoryNotice.hidden=q.get('notice')!=='category-updated';
  navDateScope=validCutoff(q.get('navDate')) && q.get('navDate') !== latestNavDate() ? q.get('navDate') : 'latest';
  lifecyclePoolScope=q.get("pool")==="history"?"history":"current";
  if (['performance','portfolio','changes','complete'].includes(q.get('view'))) listView=q.get('view')==='performance'?'complete':q.get('view');
  if ([10,25,50].includes(Number(q.get('perPage')))) PAGE_SIZE=Number(q.get('perPage'));
  hiddenDecisionColumns=new Set((q.get('columns')||'').split(',').filter(x=>Object.values(DECISION_COLUMNS).flat().some(c=>c[0]===x)));
  if (['1','3','5'].includes(q.get('age'))) ageFilter=q.get('age');
  if (['summary','holdings'].includes(q.get('data'))) dataFilter=q.get('data');
  if (Object.hasOwn(CATEGORY_LABELS,q.get('category')) && !HIDDEN_WEBSITE_CATEGORIES.has(q.get('category'))) activeCategory=q.get('category');
  search.value=(q.get('q')||'').slice(0,200);
  listPeriodMode=q.get('period')==='long'?'long':'short';
  currentPage=Math.max(1,Math.floor(Number(q.get('page'))||1));
  if(FUND_SIZE_FILTERS.some(([key])=>key===q.get('size'))) fundSizeFilterState=q.get('size');
  const sortKey = q.get('sort'), sortMetric = q.get('metric');
  if (['1m','3m','6m','1y','3y','5y','ytd','tenure'].includes(sortKey)) {
    sortState = {key:sortKey, metric:sortMetric === 'drawdown' ? 'drawdown' : 'return', direction:q.get('dir') === 'asc' ? 'asc' : 'desc'};
  } else if (Object.values(DECISION_COLUMNS).flat().some(c => c[0] === sortKey && c[2] === sortMetric)) {
    sortState = {key:sortKey, metric:sortMetric, direction:q.get('dir') === 'asc' ? 'asc' : 'desc'};
  }
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
  const title = activeCategory === "all" ? label : `${label}列表`;
  if (dataNotes) dataNotes.hidden = activeCategory !== "all";
  if (dataNotesLink) dataNotesLink.hidden = activeCategory !== "all";
  if (workspaceTitle) workspaceTitle.textContent = title;
  if (listTitle) listTitle.textContent = title;
  if (listDescription) listDescription.textContent = activeCategory === "active-equity"
    ? `按基金主体合并份额，当前主动权益范围共 ${categoryFunds().length.toLocaleString("zh-CN")} 只；已移除量化策略产品。`
    : `按基金主体合并份额，当前分类共 ${categoryFunds().length.toLocaleString("zh-CN")} 只；点击基金进入对应研究模块。`;
  if (methodologyNote) methodologyNote.textContent = activeCategory === "active-equity"
      ? "主动权益按所列产品范围展示。任期按现任团队最后一位经理加入日计算；同类位置按相同净值日、同一子类排名。"
    : activeCategory === "pure-bond"
      ? "券种权重占基金净资产；规模、持仓与久期分别标注报告日期。"
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
  suggestedFunds = funds.filter((fund) => ReviewCore.matches(searchableText(fund), keyword)).slice(0, 10);
  if (!suggestedFunds.length) return closeSuggestions();
  suggestionList.innerHTML = suggestedFunds.map((fund, index) => `<a id="fund-search-suggestion-${index}" class="fund-search-suggestion" href="${fundHref(fund)}" role="option" aria-selected="false"><span class="fund-search-suggestion-main"><strong>${escapeHtml(fund.name)}</strong>${FundLifecycle.badge(fund)}<small>${escapeHtml(fund.code)} · ${escapeHtml(displayCategoryLabel(fund))} · ${escapeHtml(fund.subtype)}</small></span><span class="fund-search-suggestion-meta">${escapeHtml((fund.manager || []).join("、") || fund.fund_company || "")}</span></a>`).join("");
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
  if (listView !== 'complete') { listView = 'complete'; hiddenDecisionColumns.clear(); clearSort(); }
  if (sortState.key && !visiblePeriods().some(([key]) => key === sortState.key) && sortState.key !== 'ytd') clearSort();
  currentPage = 1;
  document.querySelectorAll("[data-list-period]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute('aria-pressed', String(item === button)); });
  renderFunds();
}));

listHead.addEventListener("click", (event) => {
  const directionButton = event.target.closest("[data-classification-direction-level]");
  if (directionButton && !directionButton.disabled) {
    cycleClassificationSort();
    currentPage = 1;
    renderFunds();
    return;
  }
  const button = event.target.closest("[data-sort-key]");
  if (!button || button.disabled) return;
  cycleMetricSort(button.dataset.sortKey, button.dataset.sortMetric);
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
      classificationRankState.direction = 'desc';
    }
    sortState = { key: null, metric: "return", direction: "desc" };
  } else if (target.id === "header-industry-level") {
    const wasIndustryActive = classificationRankState.level !== "sector";
    classificationRankState.industryLevel = target.value;
    IndustryBars.setLevel(target.value);
    if (wasIndustryActive) {
      classificationRankState.level = target.value;
      classificationRankState.name = "";
    }
  } else if (target.id === "header-industry-name") {
    if (target.value || classificationRankState.level !== "sector") {
      classificationRankState.level = classificationRankState.industryLevel;
      classificationRankState.name = target.value;
      classificationRankState.direction = 'desc';
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
  if (validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION)) return Promise.resolve(window.FUND_STOCK_CLASSIFICATION);
  if (stockClassificationPromise) return stockClassificationPromise;
  stockClassificationPromise = loadHomepageScript(
    'https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/stock_classification.js', '股票分类数据',
    () => validHomepageFundMap(window.FUND_STOCK_CLASSIFICATION) ? window.FUND_STOCK_CLASSIFICATION : null,
  ).catch((error) => {
    stockClassificationPromise = null;
    throw error;
  });
  return stockClassificationPromise;
}

function requestStockClassification() {
  if (stockClassificationPromise) return stockClassificationPromise;
  stockClassificationError = null;
  const loading = ensureStockClassification();
  loading.then(() => {
    classificationNameCache = {};
    if (activeCategory === "active-equity") {
      updateClassificationRankControl();
      renderFunds();
    }
  }, (error) => {
    stockClassificationError = error;
    if (activeCategory === "active-equity") renderFunds();
  });
  return loading;
}

function ensureActiveEquityProfiles() {
  if (validHomepageFundMap(window.FUND_ACTIVE_EQUITY_PROFILES)) return Promise.resolve(window.FUND_ACTIVE_EQUITY_PROFILES);
  if (activeEquityProfilesPromise) return activeEquityProfilesPromise;
  activeEquityProfilesError = null;
  activeEquityProfilesPromise = loadHomepageScript(
    'https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/active_equity_profiles.js', '基金画像数据',
    () => validHomepageFundMap(window.FUND_ACTIVE_EQUITY_PROFILES) ? window.FUND_ACTIVE_EQUITY_PROFILES : null,
  ).catch((error) => {
    activeEquityProfilesPromise = null;
    activeEquityProfilesError = error;
    throw error;
  });
  return activeEquityProfilesPromise;
}

function requestActiveEquityProfiles() {
  if (activeEquityProfilesPromise) return activeEquityProfilesPromise;
  const loading = ensureActiveEquityProfiles();
  loading.then(() => {
    if (activeCategory === 'active-equity') renderFunds();
  }, () => {
    if (activeCategory === 'active-equity') renderFunds();
  });
  return loading;
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
  if(activeCategory==='pure-bond')document.querySelector("#bond-market-overview")?.scrollIntoView({block:"start"});
  if (activeCategory === "active-equity") {
    requestActiveEquityProfiles();
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

function loadCatalog() {
  const readPayload = () => {
    const value = window.FUND_DASHBOARD_CATALOG;
    return Array.isArray(value?.funds) && value.funds.length > 0 ? value : null;
  };
  const embedded = readPayload();
  if (embedded) return Promise.resolve(embedded);
  // The public release contains catalog.js; catalog.json is not published.
  return loadHomepageScript('https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/fund_catalog.js', '全量基金目录', readPayload);
}

async function ensureHomepageHelpers() {
  const jobs = [
    ['review-core.js', '搜索与图表工具', () => window.ReviewCore?.matches && window.ReviewCore?.scale ? window.ReviewCore : null],
    ['research-core.js', '指标工具', () => window.FundResearch?.finite ? window.FundResearch : null],
    ['desktop-nav.js', '历史净值工具', () => window.DesktopNav?.prepare ? window.DesktopNav : null],
  ];
  await Promise.all(jobs.map(([src,label,read]) => read() || loadHomepageScript(src,label,read)));
}

function initializeCatalog() {
  if (catalogPromise) return catalogPromise;
  resultCount.textContent = '正在加载基金目录…';
  const catalogLoading = Promise.all([loadCatalog(), Promise.resolve(window.FundIntegrationReady).then(()=>Promise.resolve(window.FundRankReady).then(()=>FundLifecycle.loadRanks()).catch(error=>{
    console.warn('同类排名暂未载入：'+error.message);
    const slot=document.querySelector('#rank-load-state')||document.createElement('p');slot.id='rank-load-state';slot.className='method-note';slot.textContent='同类排名暂未载入，净值与基金数据照常展示。 ';
    const retry=document.createElement('button');retry.type='button';retry.textContent='重试排名';retry.addEventListener('click',()=>FundLifecycle.loadRanks().then(()=>{slot.remove();renderFunds();}).catch(e=>{slot.firstChild.textContent='同类排名暂未载入：'+e.message+' ';}));slot.append(retry);document.querySelector('.list-toolbar')?.insertAdjacentElement('afterend',slot);
  })), ensureHomepageHelpers()]).then(([value]) => value);
  requestClassificationSummary();
  catalogPromise = catalogLoading.then((catalogData) => {
    catalog = catalogData;
    funds = (catalogData.funds || []).map(fund => BondCBFusion.adaptFund(fund)).filter(isVisibleWebsiteFund);
    searchTextByCode.clear();
    funds.forEach((fund) => { searchableText(fund); });
    classificationNameCache = {};
    legacyFunds = [];
    analysisFunds = {};
    document.querySelector("#fund-count").textContent = funds.length.toLocaleString("zh-CN");
    const visibleScopeNote=document.querySelector('#visible-scope-note');
    if (visibleScopeNote) visibleScopeNote.textContent=`四类目录收录 ${funds.length.toLocaleString("zh-CN")} 个基金主体，覆盖主动权益、纯债、混合债基和转债；列表按基金范围与实际净值日期筛选。下表列出代表基金的数据日期，具体日期以各基金页面为准。`;
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
    if (activeCategory === 'active-equity') requestActiveEquityProfiles();
  }).catch((error) => {
    resultCount.textContent = '基金目录暂不可用';
    grid.innerHTML = `<tr><td class="empty-state fund-search-empty">${escapeHtml(error.message)} <button type="button" id="retry-fund-catalog">重试目录</button></td></tr>`;
  }).finally(() => { catalogPromise = null; });
  return catalogPromise;
}

initializeCatalog();

const DECISION_COLUMNS = {
  performance: [['1y','近1年 / 同类位置','return'], ['current_drawdown','当前回撤','decision'], ['risk1y','近1年最大回撤','decision'], ['size','基金规模','decision']],
  portfolio: [['size','基金规模','decision'], ['exposure','股票 / 转债'], ['industry','主要行业'], ['concentration','前十大 / 杠杆'], ['duration','久期 / 持仓日期']],
  changes: [['size_change','规模变化','decision'], ['stock_change','仓位变化','decision'], ['industry_change','行业变化','decision'], ['entries','完整持仓名单变化']],
};

function decisionSummary(fund) {
  if (catalog && window.FUND_RESEARCH_SUMMARY?.catalog_generated_at !== catalog.generated_at) return null;
  const value = window.FUND_RESEARCH_SUMMARY?.funds?.[fund.code];
  const valid = value && value.nav_date === fund.performance?.latest_date && value.asset_date === (fund.asset?.report_date || null) ? {...value, ...FundLifecycle.rankSummary(fund)} : null;
  if (!valid || !isHistoricalDate()) return valid;
  const historical = historicalMetric(fund);
  return {...valid, nav_date:historical?.actualDate || null, '1y':historical?.performance?.returns?.['1y'] ?? null,
    current_drawdown:historical?.current_drawdown ?? null, underwater_days:historical?.underwater_days ?? null,
    return_top_pct:null, return_top_pct_n:null, drawdown_top_pct:null};
}

function decisionColumns() {
  return categoryDecisionColumns().filter(([key]) => !hiddenDecisionColumns.has(key));
}

function decisionSortValue(fund, key) {
  if (key === 'size') return fund.asset?.net_asset;
  if (key === 'risk1y') return performanceMetric(fund, '1y', 'drawdown');
  return decisionSummary(fund)?.[key];
}

function decisionFundRow(fund) {
  const s = decisionSummary(fund), a = fund.asset || {};
  const change = value => FundResearch.finite(value) ? `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}个百分点` : '待比较';
  const signed = value => `<strong class="${returnClass(value)}">${formatPercent(value, 1, true)}</strong>`;
  const cell = (main, note = '') => `${main}<small>${escapeHtml(note)}</small>`;
  const rank = FundResearch.finite(s?.return_top_pct) ? `同类前${Math.max(1, Math.ceil(s.return_top_pct * 100))}% · ${s.return_top_pct_n}只` : '同日可比样本不足';
  const lag = FundResearch.quarterLag(fund.duration?.report_date, a.report_date);
  const industry = a.stock_weight === 0 ? '无股票持仓 / 不适用' : s?.industry ? `${s.industry} ${formatPercent(s.industry_weight)}` : '无可用行业披露';
  const fields = {
    '1y': cell(signed(performanceMetric(fund, '1y', 'return')), rank),
    current_drawdown: cell(formatPercent(s?.current_drawdown), FundResearch.finite(s?.current_drawdown) ? (s.current_drawdown < -1e-8 ? `未修复 · 距高点${s.underwater_days}天` : '已修复 / 新高') : '—'),
    risk1y: cell(formatPercent(performanceMetric(fund, '1y', 'drawdown')), FundResearch.finite(s?.drawdown_top_pct) ? `损失较小前${Math.max(1, Math.ceil(s.drawdown_top_pct * 100))}%` : isHistoricalDate() ? '历史同类排名 —' : '排名待计算'),
    size: cell(formatMoney(a.net_asset), a.report_date || '暂无披露'),
    exposure: cell(fund.category==='active-equity'?formatPercent(a.stock_weight):`${formatPercent(a.stock_weight)} / ${formatPercent(a.convertible_bond_weight)}`, `${a.report_date || '—'} · 占净值`),
    industry: IndustryBars.placeholder(fund),
    bond_structure: cell(bondStructureCell(a),`${a.report_date||'—'} · 占净值`),
    bond_change: cell(`债券合计 ${change(s?.bond_change)}<br>`+(viewMetric(fund)?.bonds||[]).map(([label,v])=>`${escapeHtml(label)} ${change(v)}`).join('<br>') + (!(viewMetric(fund)?.bonds||[]).length?escapeHtml(viewMetric(fund)?.bond_change_reason||'暂无可比券种明细'):''), `${viewMetric(fund)?.previous_asset_date||'—'} → ${a.report_date||'—'}`),
    leverage_change: cell(FundResearch.finite(viewMetric(fund)?.leverage_change)?`${viewMetric(fund).leverage_change>0?'+':''}${viewMetric(fund).leverage_change.toFixed(3)}倍`:'暂无可比杠杆',`${viewMetric(fund)?.previous_asset_date||'—'} → ${a.report_date||'—'}`),
    duration_change: cell(FundResearch.finite(viewMetric(fund)?.duration_change)?`${viewMetric(fund).duration_change>0?'+':''}${viewMetric(fund).duration_change.toFixed(2)}年`:'暂无可比久期',`${viewMetric(fund)?.previous_duration_date||'—'} → ${viewMetric(fund)?.duration_date||'—'}`),
    concentration: cell(fund.category === 'active-equity' ? formatPercent(s?.top10_weight) : leverageText(a), fund.category === 'active-equity' ? `${s?.full_date || '—'} · 完整披露中前十大` : `${a.report_date || '—'} · 总资产/净资产`),
    duration: cell(fund.category === 'active-equity' ? escapeHtml(s?.full_date || '暂无完整披露') : FundResearch.finite(fund.duration?.value) ? `${Number(fund.duration.value).toFixed(2)}年` : '暂无久期', fund.category === 'active-equity' ? '半年报 / 年报' : `${fund.duration?.report_date || '—'}${lag ? ` · 滞后${lag}期` : ''}`),
    size_change: cell(formatPercent(s?.size_change, 1, true), `${s?.previous_asset_date || '—'} → ${a.report_date || '—'}`),
    stock_change: cell(`股票 ${change(s?.stock_change)}`, `债券 ${change(s?.bond_change)} · 转债 ${change(s?.convertible_bond_change)}`),
    industry_change: cell(s?.industry ? `${escapeHtml(s.industry)} ${change(s.industry_change)}` : '无可比行业披露', `${s?.previous_full_date || '—'} → ${s?.full_date || '—'}`),
    entries: cell(s?.previous_full_date ? `新出现 ${s.entry_count} · 不再出现 ${s.exit_count}` : '不足两期完整披露', `${s?.previous_full_date || '—'} → ${s?.full_date || '—'}`),
  };
  return `<tr data-fund-code="${escapeHtml(fund.code)}"><td class="fund-name-cell"><a href="${fundHref(fund)}" title="${escapeHtml(fund.benchmark || '业绩基准未提供')}"><strong>${escapeHtml(fund.name)}</strong>${FundLifecycle.badge(fund)}<small>${escapeHtml(fund.code)} · ${escapeHtml(fund.subtype)}</small></a>${fund.category==='active-equity'?managerDates(fund):`<small>${escapeHtml((fund.manager || []).join('、') || '暂无经理信息')}</small>`}</td>${decisionColumns().map(([key]) => `<td>${fields[key] || '—'}</td>`).join('')}</tr>`;
}

function sortSummaryText() {
  if (activeCategory === 'active-equity' && classificationRankState.name) {
    return `按${classificationRankState.name}权重 · ${classificationRankState.direction === 'desc' ? '高→低' : '低→高'} · 缺失置后`;
  }
  if (!sortState.key) return '默认顺序 · 点击表头可排序';
  const period = [...PERIOD_SETS.short, ...PERIOD_SETS.long, ['tenure','现任经理任期'], ['ytd', '今年以来']].find(([key]) => key === sortState.key);
  const field = Object.values(DECISION_COLUMNS).flat().find(([key]) => key === sortState.key);
  const label = period ? `${period[1]}${sortState.metric === 'drawdown' ? '回撤' : '收益'}` : (field?.[1] || sortState.key).split(' / ')[0];
  const drawdown = sortState.metric === 'drawdown' || ['risk1y', 'current_drawdown'].includes(sortState.key);
  const direction = drawdown ? (sortState.direction === 'desc' ? '损失较小优先' : '损失较大优先') : (sortState.direction === 'desc' ? '高→低' : '低→高');
  return `${label} · ${direction} · 缺失置后`;
}

function renderDecisionControls() {
  updateViewPanels();
  const target = document.querySelector('#decision-filters');
  const convert = html => html.replace(/^<th[^>]*>/, '<label>').replace(/<\/th>$/, '</label>');
  const moreFiltersOpen = Boolean(target.querySelector('.compact-more-filters')?.open);
  const moreFilterCount = Number(lifecyclePoolScope === 'history') + Number(ageFilter !== 'all') + Number(dataFilter !== 'all') + Number(activeEquityProfileFilter !== 'all') + Number(Boolean(classificationRankState.name));
  target.innerHTML = `${listView === 'complete' ? '' : convert(fundSizeHeader())}
    <label class="nav-date-control">净值截止日<span class="nav-date-inputs"><input type="date" id="decision-navdate" aria-label="净值截止日" value="${escapeHtml(chosenNavDate())}" max="${escapeHtml(latestNavDate())}" min="1900-01-01"><button type="button" id="reset-nav-date"${navDateScope==='latest'?' disabled':''}>恢复最新</button></span></label>
    <details class="compact-more-filters"${moreFiltersOpen?' open':''}><summary>更多筛选${moreFilterCount ? `（${moreFilterCount}）` : ''}</summary><div class="compact-filter-panel">
    <label>基金范围<select id="decision-pool"><option value="current"${lifecyclePoolScope === "current" ? " selected" : ""}>当前基金</option><option value="history"${lifecyclePoolScope === "history" ? " selected" : ""}>含已退出 · 历史资料</option></select></label>
    <label>成立年限<select id="decision-age"><option value="all">不限</option>${[1,3,5].map(n => `<option value="${n}"${ageFilter === String(n) ? ' selected' : ''}>满${n}年</option>`).join('')}</select></label>
    <label>数据范围<select id="decision-data"><option value="all">不限</option><option value="summary"${dataFilter === 'summary' ? ' selected' : ''}>有可用摘要</option><option value="holdings"${dataFilter === 'holdings' ? ' selected' : ''}>完整持仓与配置同期</option></select></label>
    ${activeCategory === 'active-equity' && listView !== 'complete' ? `<div class="compact-profile-filters">${convert(activeEquityProfileHeader())}${convert(classificationHeader('sector'))}${listView === 'portfolio' ? '' : convert(classificationHeader('industry'))}</div>` : ''}
    </div></details>`;
  document.querySelector('#page-size').value = String(PAGE_SIZE);
  document.querySelector('#mobile-category').value = activeCategory;
  const sortColumns = listView === 'complete' ? [...visiblePeriods(), ['ytd', '今年以来']].flatMap(([key,label]) => [[key, `${label}收益`, 'return'], [key, `${label}回撤`, 'drawdown']]) : decisionColumns().filter(c=>c[2]);
  const classificationSorted = activeCategory === 'active-equity' && Boolean(classificationRankState.name);
  document.querySelector('#mobile-sort').innerHTML = (classificationSorted ? `<option value="classification" disabled selected>${escapeHtml(sortSummaryText())}</option>` : '') + '<option value="">默认排序</option>' + sortColumns.flatMap(([key,label,metric])=>['desc','asc'].map(dir=>`<option${isHistoricalDate() && navSortKey(key,metric) && !historicalSortReady(filteredFunds()) ? ' disabled' : ''} value="${key}:${metric}:${dir}"${!classificationSorted&&sortState.key===key&&sortState.metric===metric&&sortState.direction===dir?' selected':''}>${escapeHtml(label.split(' / ')[0])} ${metric==='drawdown'||['risk1y','current_drawdown'].includes(key) ? (dir==='desc'?'损失较小优先':'损失较大优先') : (dir==='desc'?'高→低':'低→高')}</option>`)).join('');
  const sortLabel = document.querySelector('#list-sort-state');
  if (sortLabel) sortLabel.textContent = sortSummaryText() + ` · 净值截止日 ${chosenNavDate()}`;
  renderHistoricalNote();
  document.querySelectorAll('[data-view]').forEach(b => { const active = b.dataset.view === listView; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  document.querySelector('#decision-columns').innerHTML = categoryDecisionColumns().map(([key,label]) => `<label><input type="checkbox" data-column="${key}"${hiddenDecisionColumns.has(key) ? '' : ' checked'}>${label}</label>`).join('');
  document.querySelectorAll('[data-list-period]').forEach(button => {
    const active = listView === 'complete' && button.dataset.listPeriod === listPeriodMode;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  const selected = [
    ['search',search.value.trim()],
    ['pool',lifecyclePoolScope === 'history' ? '含已退出基金' : ''],
    ['size',fundSizeFilterState !== 'all' ? FUND_SIZE_FILTERS.find(([key])=>key===fundSizeFilterState)?.[1] : ''],
    ['date',navDateScope !== 'latest' ? `截至 ${navDateScope}` : ''],
    ['age',ageFilter !== 'all' ? `满${ageFilter}年` : ''],
    ['data',dataFilter === 'summary' ? '有可用摘要' : dataFilter === 'holdings' ? '完整持仓与配置同期' : ''],
    ['industry',classificationRankState.name ? `${classificationRankState.name} ${classificationRankState.direction === 'desc' ? '↓' : '↑'}` : ''],
    ['profile',activeEquityProfileFilter !== 'all' ? activeEquityProfileFilter.split(':')[1] : ''],
    ['subtype',filter.value !== 'all' ? filter.selectedOptions[0]?.textContent : ''],
    ['sort',!classificationRankState.name && sortState.key ? '自选排序' : '']
  ].filter(([,label])=>label);
  const selectedHost = document.querySelector('#selected-filters');
  selectedHost.hidden = !selected.length;
  selectedHost.innerHTML = selected.length ? `<span>已选</span>${selected.map(([key,label]) => `<button type="button" class="filter-chip" data-reset-filter="${key}" aria-label="取消${escapeHtml(label)}">${escapeHtml(label)} <span aria-hidden="true">×</span></button>`).join('')}` : '';
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
  else if (target.id === 'decision-pool') { lifecyclePoolScope = target.value; updateSubtypeFilter(); updateListCopy(); }
  else if (target.id === 'decision-navdate') {
    if (!target.value) navDateScope = 'latest';
    else {
      target.setCustomValidity(validCutoff(target.value) ? '' : '请选择不晚于最新净值日的有效日期。');
      if (!target.reportValidity()) return;
      navDateScope = target.value === latestNavDate() ? 'latest' : target.value;
      if (navSortKey()) clearSort();
    }
  }
  else if (target.id === 'decision-age') ageFilter = target.value;
  else if (target.id === 'decision-data') dataFilter = target.value;
  else if (target.dataset.column) { if (target.checked) hiddenDecisionColumns.delete(target.dataset.column); else { hiddenDecisionColumns.add(target.dataset.column); if (sortState.key === target.dataset.column) clearSort(); } }
  else return;
  currentPage = 1; renderFunds();
});
document.addEventListener('click', event => {
  const reset = event.target.closest('[data-reset-filter]');
  if (reset) { resetFilter(reset.dataset.resetFilter); renderFunds(); return; }
  if (event.target.closest('#reset-nav-date')) { resetFilter('date'); renderFunds(); return; }
  if (event.target.closest('#reset-display-settings')) { resetDisplaySettings(); renderFunds(); return; }
  if (event.target.closest('#retry-historical-nav')) { historicalNavErrors.delete(navDateScope); const cache = historicalNavCache.get(navDateScope); if (cache) for (const [code, item] of Object.entries(cache)) if (item.error) delete cache[code]; window.DesktopNav.clearFailures(); renderFunds(); return; }
  const classificationLoad = event.target.closest('[data-load-classification]');
  if (classificationLoad && !classificationLoad.disabled) { requestStockClassification(); renderFunds(); return; }
  if (event.target.closest('[data-retry-profiles]')) { requestActiveEquityProfiles(); renderFunds(); return; }
  if (event.target.closest('[data-clear-profile-filter]')) { activeEquityProfileFilter = 'all'; renderFunds(); return; }
  if (event.target.id === 'retry-classification-summary') { requestClassificationSummary(); renderFunds(); return; }
  if (event.target.id === 'retry-fund-catalog') { initializeCatalog(); return; }
  if (event.target.id === 'retry-research-summary') { researchSummaryError = null; renderFunds(); return; }
  if (event.target.id === 'mobile-filter-toggle') { const open=document.body.classList.toggle('mobile-filters-open');event.target.setAttribute('aria-expanded',String(open)); }
  const view = event.target.closest('[data-view]');
  if (view || event.target.id === 'show-complete') { listView = view?.dataset.view || 'complete'; hiddenDecisionColumns.clear(); clearSort(); currentPage=1; renderFunds(); }
  if (event.target.closest('#clear-decision-filters')) { resetFilters(); renderFunds(); }
  const direction = event.target.closest('#decision-filters [data-classification-direction-level]');
  if (direction && !direction.disabled) { cycleClassificationSort(); currentPage=1; renderFunds(); }
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


function visiblePeriods(){return activeCategory==='active-equity'?[...PERIOD_SETS[listPeriodMode],['tenure','现任经理任期']]:PERIOD_SETS[listPeriodMode];}
function categoryDecisionColumns(){
  if(activeCategory==='active-equity'&&listView==='portfolio')return [['size','基金规模','decision'],['exposure','股票仓位'],['industry','主要行业'],['concentration','前十大权重'],['duration','完整持仓日期']];
  if(activeCategory==='pure-bond'){
    if(listView==='portfolio')return [['size','基金规模','decision'],['bond_structure','券种分布'],['concentration','杠杆'],['duration','披露久期']];
    if(listView==='changes')return [['size_change','规模变化','decision'],['bond_change','券种权重变化'],['leverage_change','杠杆变化'],['duration_change','披露久期变化']];
  }
  return DECISION_COLUMNS[listView]||[];
}
function viewMetric(fund){
  const data=window.FUND_VIEW_METRICS,v=data?.funds?.[fund.code];
  const valid=data?.catalog_generated_at===catalog?.generated_at&&v?.nav_date===fund.performance?.latest_date&&v?.asset_date===(fund.asset?.report_date||null)?{...v,...FundLifecycle.rankSummary(fund)}:null;
  if (!isHistoricalDate()) return valid;
  const historical=historicalMetric(fund);
  return {...(valid || {}), tenure:historical?.tenure || null, current_drawdown:historical?.current_drawdown ?? null, return_top_pct:null, drawdown_top_pct:null};
}
function managerDates(fund){
  const t=viewMetric(fund)?.tenure;
  return t?.managers?.length ? `<small class="manager-tenure-dates">${t.managers.map(m=>`${escapeHtml(m.name)} ${escapeHtml(m.start||'暂无任职日期')}`).join('<br>')}</small>` : `<small class="manager-tenure-dates">${escapeHtml((fund.manager || []).join('、') || '暂无经理信息')} · 任职日期待加载</small>`;
}
let viewMetricsPromise=null,viewMetricsError=null;
function updateViewPanels(){
  const host=document.querySelector('#bond-market-overview');
  if(host){host.hidden=activeCategory!=='pure-bond';if(!host.hidden)void FundMarket.mount(host);}
  if(viewMetricsPromise||viewMetricsError||window.FUND_VIEW_METRICS?.catalog_generated_at===catalog?.generated_at)return;
  viewMetricsPromise=loadHomepageScript(`https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/fund_view_metrics.js?v=${encodeURIComponent(catalog?.generated_at||'')}`,'任期与披露变化',()=>window.FUND_VIEW_METRICS?.catalog_generated_at===catalog?.generated_at?window.FUND_VIEW_METRICS:null)
    .then(()=>renderFunds()).catch(e=>{viewMetricsError=e;const status=document.querySelector('#view-metrics-status');if(status){status.hidden=false;status.innerHTML=`${escapeHtml(e.message)} <button type="button" data-view-metrics-retry>重试</button>`;status.querySelector('button').addEventListener('click',()=>{viewMetricsError=null;viewMetricsPromise=null;status.hidden=true;updateViewPanels();});}});
}

function bindFundComparisonSelection() {
  const toolbar=document.querySelector('#pagination-comparison-slot');if(!toolbar)return;
  for (const code of selectedComparisonCodes) if (!FundLifecycle.currentCompareEligible(code)) selectedComparisonCodes.delete(code);
  if(!toolbar.querySelector('[data-list-compare]')){
    toolbar.insertAdjacentHTML('beforeend','<span class="list-compare-actions" data-list-compare hidden><button type="button" data-list-compare-run disabled>比较已选</button><button type="button" data-list-compare-clear>清空选择</button><span data-list-compare-status role="status"></span></span>');
    toolbar.querySelector('[data-list-compare-run]').addEventListener('click',()=>{if(selectedComparisonCodes.size>=2){const saved=new URLSearchParams(window.location.search);saved.set('scroll',String(Math.round(window.scrollY)));window.location.href='compare.html?codes='+encodeURIComponent([...selectedComparisonCodes].join(','))+'&list='+encodeURIComponent(saved.toString());}});
    toolbar.querySelector('[data-list-compare-clear]').addEventListener('click',()=>{selectedComparisonCodes.clear();bindFundComparisonSelection();});
  }
  const box=toolbar.querySelector('[data-list-compare]');box.hidden=!selectedComparisonCodes.size;
  const run=box.querySelector('[data-list-compare-run]');run.disabled=selectedComparisonCodes.size<2;run.textContent=`比较已选（${selectedComparisonCodes.size}）`;
  box.querySelector('[data-list-compare-status]').textContent=selectedComparisonCodes.size===1?'再选1只':selectedComparisonCodes.size===4?'最多4只':'';
  grid.querySelectorAll('tr[data-fund-code]').forEach(row=>{
    let input=row.querySelector('[data-compare-select]');
    if(!input){
      const name=row.querySelector('strong')?.textContent || row.dataset.fundCode;
      row.children[0].insertAdjacentHTML('afterbegin',`<label class="fund-compare-select" title="加入基金比较"><input type="checkbox" data-compare-select aria-label="选择${escapeHtml(name)}参与比较"></label>`);
      input=row.querySelector('[data-compare-select]');
      input.addEventListener('change',()=>{if(input.checked&&selectedComparisonCodes.size<4)selectedComparisonCodes.add(row.dataset.fundCode);else selectedComparisonCodes.delete(row.dataset.fundCode);bindFundComparisonSelection();});
    }
    input.checked=selectedComparisonCodes.has(row.dataset.fundCode);input.disabled=!FundLifecycle.currentCompareEligible(row.dataset.fundCode)||!input.checked&&selectedComparisonCodes.size>=4;
  });
}
