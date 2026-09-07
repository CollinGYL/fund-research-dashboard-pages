/* Shared presentation semantics. No data fetches, model predictions or dependencies. */
(function (root) {
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const monthStart = (iso, months) => {
    const [y, m, d] = iso.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1 - months, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, last));
    return target.toISOString().slice(0, 10);
  };
  // Same convention as update_cached_dashboard_nav.period_metric: last point BEFORE the boundary.
  const range = (points, start, end = '9999-12-31') => {
    const rows = points.filter(p => p.date <= end);
    const index = rows.findIndex(p => p.date >= start);
    return index < 0 ? [] : rows.slice(Math.max(0, index - 1));
  };
  const weekly = rows => {
    const weeks = new Map();
    for (const row of rows) {
      const date = new Date(row.date + 'T00:00:00Z');
      date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
      weeks.set(date.toISOString().slice(0, 10), row);
    }
    return [...weeks.values()];
  };
  const uniquePeriods = rows => {
    const periods = new Map();
    for (const row of rows || []) {
      const date = row.report_date || row.d;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) continue;
      const key = `${row.report_type || ''}|${date}`;
      const previous = periods.get(key);
      if (!previous || (row.announcement_date || row.a || '') >= (previous.announcement_date || previous.a || '')) periods.set(key, row);
    }
    return [...periods.values()].sort((a, b) => (a.report_date || a.d).localeCompare(b.report_date || b.d));
  };
  const quarterLag = (date, reference) => {
    if (!date || !reference) return null;
    const q = s => Number(s.slice(0, 4)) * 4 + Math.floor((Number(s.slice(5, 7)) - 1) / 3);
    return Math.max(0, q(reference) - q(date));
  };
  const peerWindow = campisi => ['all', '5y', '3y', '1y', 'ytd'].map(k => campisi.windows?.[k]).find(Boolean);
  const api = { finite, monthStart, range, weekly, uniquePeriods, quarterLag, peerWindow };
  root.FundResearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
