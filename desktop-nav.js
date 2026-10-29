/* Historical NAV calculations for the desktop fund list. */
(function (root) {
  'use strict';
  const MONTHS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, '3y': 36, '5y': 60 };
  const PERIODS = [...Object.keys(MONTHS), 'ytd'];
  const DAY = 86400000;
  const loaded = new Map();
  const prepared = new Map();
  const failedDetails = new Set();

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const time = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }

  function monthStart(iso, months) {
    const [year, month, day] = iso.split('-').map(Number);
    const target = new Date(Date.UTC(year, month - 1 - months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target.toISOString().slice(0, 10);
  }

  function pointsBefore(raw, cutoff) {
    const values = new Map();
    for (const point of raw || []) {
      const date = Array.isArray(point) ? point[0] : point.date;
      const rawValue = Array.isArray(point) ? point[1] : point.value ?? point.fund;
      if (!validDate(date) || date > cutoff || rawValue === null || rawValue === undefined || rawValue === '') continue;
      const value = Number(rawValue);
      if (Number.isFinite(value) && value > 0) values.set(date, value);
    }
    return [...values].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function maximumDrawdown(rows, valueIndex = 1) {
    if (rows.length < 2) return null;
    let peak = rows[0][valueIndex], drawdown = 0;
    for (const point of rows) {
      peak = Math.max(peak, point[valueIndex]);
      drawdown = Math.min(drawdown, point[valueIndex] / peak - 1);
    }
    return drawdown;
  }

  function windowStart(end, key) {
    return key === 'ytd' ? end.slice(0, 4) + '-01-01' : monthStart(end, MONTHS[key]);
  }

  // Matches the absolute-return boundary convention in research-core.js.
  function periodMetric(rows, start) {
    if (rows.length < 2 || !validDate(start) || rows[0][0] > start) return null;
    const next = rows.findIndex(point => point[0] >= start);
    if (next < 0) return null;
    const selected = rows.slice(Math.max(0, next - 1));
    if (selected.length < 2) return null;
    return {
      return: selected.at(-1)[1] / selected[0][1] - 1,
      drawdown: maximumDrawdown(selected),
      start: selected[0][0], end: selected.at(-1)[0], observations: selected.length,
    };
  }

  function emptyRelative() {
    return {
      status: 'unavailable', latest_date: null, observations: 0,
      excess_returns: Object.fromEntries(PERIODS.map(key => [key, null])),
      excess_drawdowns: Object.fromEntries(PERIODS.map(key => [key, null])),
      fund_returns: Object.fromEntries(PERIODS.map(key => [key, null])),
      benchmark_returns: Object.fromEntries(PERIODS.map(key => [key, null])),
      period_observations: Object.fromEntries(PERIODS.map(key => [key, 0])),
      tracking_error: null, information_ratio: null,
      tracking_error_window: '1y_daily',
    };
  }

  // Existing index metrics start on the first common day inside each window.
  // They intentionally differ from the absolute-return boundary convention.
  function relativeMetrics(nav, rawBenchmark, cutoff, trackingIndex) {
    const result = emptyRelative();
    result.tracking_index = trackingIndex || null;
    const benchmark = new Map(pointsBefore(rawBenchmark, cutoff));
    const aligned = nav.filter(point => benchmark.has(point[0]))
      .map(point => [point[0], point[1], benchmark.get(point[0])]);
    if (aligned.length < 2) return result;
    const end = aligned.at(-1)[0];
    result.latest_date = end;
    result.observations = aligned.length;
    result.status = 'success';
    for (const key of PERIODS) {
      const start = windowStart(cutoff, key);
      if (aligned[0][0] > start) continue;
      const rows = aligned.filter(point => point[0] >= start);
      if (rows.length < 2) continue;
      const fundReturn = rows.at(-1)[1] / rows[0][1] - 1;
      const benchmarkReturn = rows.at(-1)[2] / rows[0][2] - 1;
      result.fund_returns[key] = fundReturn;
      result.benchmark_returns[key] = benchmarkReturn;
      result.excess_returns[key] = fundReturn - benchmarkReturn;
      result.excess_drawdowns[key] = maximumDrawdown(rows.map(point => [point[0], point[1] / point[2]]));
      result.period_observations[key] = rows.length;
      if (key === '1y' && rows.length > 2) {
        const excess = rows.slice(1).map((point, i) => point[1] / rows[i][1] - point[2] / rows[i][2]);
        const mean = excess.reduce((sum, value) => sum + value, 0) / excess.length;
        const variance = excess.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (excess.length - 1);
        result.tracking_error = Math.sqrt(variance * 252);
        result.information_ratio = result.tracking_error > 0 ? mean * 252 / result.tracking_error : null;
      }
    }
    return result;
  }

  function emptyResult(cutoff) {
    const returns = Object.fromEntries(PERIODS.map(key => [key, null]));
    const drawdowns = Object.fromEntries(PERIODS.map(key => [key, null]));
    return {
      requestedDate: cutoff, actualDate: null,
      performance: { latest_date: null, returns, drawdowns, calendar: { [cutoff.slice(0, 4)]: { return: null, drawdown: null } } },
      relative_metrics: emptyRelative(), current_drawdown: null, underwater_days: null,
      return_top_pct: null, return_top_pct_n: null, drawdown_top_pct: null,
      tenure: null, windows: {},
    };
  }

  function calculate(detail, cutoff, options = {}) {
    if (!validDate(cutoff)) throw new Error('请选择有效的截止日期');
    const result = emptyResult(cutoff);
    const nav = pointsBefore(detail?.nav, cutoff);
    if (!nav.length) return result;
    const end = nav.at(-1)[0];
    result.actualDate = end;
    result.performance.latest_date = end;
    for (const key of PERIODS) {
      const metric = periodMetric(nav, windowStart(cutoff, key));
      result.performance.returns[key] = metric?.return ?? null;
      result.performance.drawdowns[key] = metric?.drawdown ?? null;
      result.windows[key] = metric ? { start: metric.start, end: metric.end, observations: metric.observations } : null;
    }
    result.performance.calendar = {
      [cutoff.slice(0, 4)]: { return: result.performance.returns.ytd, drawdown: result.performance.drawdowns.ytd },
    };
    let high = nav[0][1], highDate = nav[0][0];
    for (const point of nav) if (point[1] >= high) { high = point[1]; highDate = point[0]; }
    result.current_drawdown = nav.at(-1)[1] / high - 1;
    result.underwater_days = Math.round((Date.parse(end) - Date.parse(highDate)) / DAY);
    if (detail?.fund?.category === 'index-enhanced' || options.category === 'index-enhanced') {
      result.relative_metrics = relativeMetrics(nav, detail.benchmark || options.benchmark || [], cutoff, detail.benchmark_code);
    }
    const existingTenure = options.tenure;
    if (existingTenure) {
      const start = existingTenure.start;
      const selected = validDate(start) ? nav.filter(point => point[0] >= start) : [];
      const metric = start <= end && selected.length >= 2 ? {return:selected.at(-1)[1]/selected[0][1]-1,drawdown:maximumDrawdown(selected),start:selected[0][0]} : null;
      result.tenure = {
        ...existingTenure, start, end,
        return: metric?.return ?? null, drawdown: metric?.drawdown ?? null,
        nav_start: metric?.start ?? null,
      };
      if (metric) delete result.tenure.reason;
      else result.tenure.reason = start > end ? '该日尚未进入现任团队任期' : '任期净值不足';
    }
    return result;
  }

  function cachedLoad(key, task) {
    if (!loaded.has(key)) loaded.set(key, Promise.resolve().then(task).catch(error => { loaded.delete(key); throw error; }));
    return loaded.get(key);
  }

  async function mapLimited(items, limit, task) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index], index);
      }
    }
    await Promise.all(Array.from({length:Math.min(limit,items.length)}, worker));
    return results;
  }
  function clearFailures() {
    for (const code of failedDetails) loaded.delete('detail:' + code);
    failedDetails.clear();
    prepared.clear();
  }

  async function prepare(funds, cutoff, loadScript) {
    if (!validDate(cutoff)) throw new Error('请选择有效的截止日期');
    const key = cutoff + '|' + funds.map(fund => fund.code).join(',');
    if (prepared.has(key)) return prepared.get(key);
    const pending = (async () => {
      let metrics = root.FUND_VIEW_METRICS;
      if (funds.some(fund => fund.category === 'active-equity') && !metrics) {
        try {
          metrics = await cachedLoad('view-metrics', () => loadScript('https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/fund_view_metrics.js', '任期资料', () => root.FUND_VIEW_METRICS || null));
        } catch (_) { metrics = null; }
      }
      const entries = await mapLimited(funds, 4, async fund => {
        try {
          const detail = root.FUND_DETAIL_DATA?.[fund.code] || await cachedLoad('detail:' + fund.code,
            () => loadScript('https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/funds/' + encodeURIComponent(fund.code) + '.js', '历史净值', () => root.FUND_DETAIL_DATA?.[fund.code] || null));
          let benchmark = detail?.benchmark;
          if (fund.category === 'index-enhanced' && !benchmark?.length && detail?.benchmark_code) {
            const common = root.FUND_COMMON_BENCHMARKS || await cachedLoad('benchmarks',
              () => loadScript('https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/common_benchmarks.js', '指数行情', () => root.FUND_COMMON_BENCHMARKS || null));
            benchmark = common?.benchmarks?.[detail.benchmark_code]?.series;
          }
          failedDetails.delete(fund.code);
          return [fund.code, calculate(detail, cutoff, { category: fund.category, benchmark, tenure: metrics?.funds?.[fund.code]?.tenure })];
        } catch (error) {
          failedDetails.add(fund.code);
          return [fund.code, { ...emptyResult(cutoff), error: error.message || '净值数据暂不可用' }];
        }
      });
      const result = Object.fromEntries(entries);
      if (entries.some(([, value]) => value.error)) prepared.delete(key);
      return result;
    })();
    prepared.set(key, pending);
    try { return await pending; }
    catch (error) { prepared.delete(key); throw error; }
  }

  const api = { prepare, clearFailures, mapLimited, calculate, relativeMetrics, periodMetric, maximumDrawdown, monthStart, pointsBefore, validDate };
  root.DesktopNav = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
