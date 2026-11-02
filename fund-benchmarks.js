/* Optional Wind workbook indices. Existing contract/research benchmark objects stay intact. */
(function (root) {
  'use strict';
  const options = [['CIS58031.WI', '平衡固收+基金指数'], ['CIS58032.WI', '稳健固收+基金指数']];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let pending = null;
  function read() {
    const value = root.FUND_BENCHMARK_LIB;
    if (value?.schema_version !== 1 || !value.source_sha256) throw Error('固收+指数资料尚未同步就绪');
    for (const [code] of options) {
      const s = value.series?.[code];
      if (!Array.isArray(s?.points) || s.points.length < 2 || s.last_date !== s.points.at(-1)?.[0]) throw Error('固收+指数资料不完整');
      let prior = '';
      for (const [date, price] of s.points) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= prior || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) throw Error('固收+指数含无效观测');
        prior = date;
      }
    }
    return value;
  }
  function load(loader, version) {
    if (root.FUND_BENCHMARK_LIB) {
      try { return Promise.resolve(read()); } catch (_) { /* Retry the published object. */ }
    }
    if (!pending) pending = loader(`https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/fund_benchmark_lib.js?v=${encodeURIComponent(version)}`, '固收+基金指数', read).catch(error => {pending = null; throw error;});
    return pending;
  }
  async function prepare(fund, loader, version) {
    if (fund.category !== 'hybrid-bond') return;
    try { await load(loader, version); delete fund.fund_benchmark_error; }
    catch (error) { fund.fund_benchmark_error = error.message; }
  }
  function get(code) {
    const item = options.find(([key]) => key === code);
    if (!item) return root.FUND_COMMON_BENCHMARKS?.benchmarks?.[code];
    try {
      const library = read(), s = library.series[code];
      return {code, name:item[1], series:s.points, last_date:s.last_date, source:'workbook', source_sha256:library.source_sha256};
    } catch (_) { return null; }
  }
  function status(fund) {
    return fund.fund_benchmark_error ? `<div role="status"><p class="simulation-warning">固收+基金指数尚未加载：${esc(fund.fund_benchmark_error)}。其他指数仍可使用。</p><button type="button" class="text-button" data-fund-benchmark-retry>重试固收+基金指数</button></div>` : '';
  }
  function bindRetry(host, fund, loader, version, onReady) {
    const button = host?.querySelector('[data-fund-benchmark-retry]');
    button?.addEventListener('click', async () => {
      button.disabled = true; button.textContent = '正在加载…';
      await prepare(fund, loader, version);
      onReady();
    });
  }
  root.FundBenchmarks = {options, read, load, prepare, get, status, bindRetry};
})(window);
