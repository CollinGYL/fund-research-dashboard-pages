/* Local lifecycle overlay. Historical state cells are derived by lifecycle_rules.py. */
(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = code => String(code || '').toUpperCase().replace(/^(\d{6})$/, '$1.OF');
  let rankPromise = null;
  function data() {
    const d = root.FUND_LIFECYCLE_DATA;
    if (d?.schema_version !== 1 || !d.records || !d.aliases) throw Error('基金状态资料未加载，请刷新重试。');
    return d;
  }
  function record(subject) {
    const d = data(), code = normalize(typeof subject === 'string' ? subject : subject?.code);
    return d.records[subject?.id] || d.records[d.aliases[code]] || null;
  }
  function canonicalCode(subject) {
    return record(subject)?.code || normalize(typeof subject === 'string' ? subject : subject?.code);
  }
  function status(subject, options = {}) {
    const d = data(), asOf = options.asOf || d.as_of, knownOn = options.knownOn || d.known_on;
    if (![asOf, knownOn].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value))) throw Error('基金状态日期格式不正确。');
    const r = record(subject);
    if (r) {
      const cells = r.cells.filter(c => c.as_from <= asOf && c.known_from <= knownOn)
        .sort((a, b) => b.as_from.localeCompare(a.as_from) || b.known_from.localeCompare(a.known_from));
      if (!cells.length) throw Error('该历史日期的基金状态资料未生成。');
      return {...cells[0].status, as_of: asOf, known_on: knownOn};
    }
    const inception = typeof subject === 'object' ? subject?.inception_date : null;
    const eligible = !inception || inception <= asOf;
    return {state: eligible ? 'unverified_active' : 'not_established', as_of: asOf, known_on: knownOn,
      default_pool_eligible: eligible, filter_eligible: eligible, current_compare_eligible: eligible,
      history_available: true, verification: 'supplier_only_unverified', source_ids: [], reasons: []};
  }
  const currentEligible = subject => status(subject).default_pool_eligible;
  const currentCompareEligible = subject => status(subject).current_compare_eligible;
  function exitEvent(subject) {
    const s = status(subject);
    return record(subject)?.events.find(e => e.kind === 'liquidation_start' && e.effective_on === s.exit_effective_on) || null;
  }
  function label(subject) {
    return {liquidating: '清算中', terminated: '已终止', merged_out: '已合并退出', share_closed: '份额已关闭',
      not_established: '尚未成立', unverified_active: '存续待核', risk: '存续 · 已有风险公告'}[status(subject).state] || '状态待核';
  }
  function badge(subject) {
    return currentEligible(subject) ? '' : `<span class="lifecycle-badge">${esc(label(subject))}</span>`;
  }
  function notice(subject, requestedCode) {
    const s = status(subject), e = exitEvent(subject), r = record(subject);
    const alias = requestedCode && normalize(requestedCode) !== canonicalCode(subject)
      ? `<span>所选 ${esc(normalize(requestedCode))} 与 ${esc(canonicalCode(subject))} 为同一组合，以下保留代表份额资料。</span>` : '';
    if (!e) return `<details class="lifecycle-note" data-lifecycle-state="${esc(s.state)}"><summary>基金状态：${esc(label(subject))}</summary><p>目录观察日 ${esc(s.as_of)}；状态沿用供应商目录，合同与公告尚待逐只核实。</p>${alias}</details>`;
    const source = data().sources[e.source_id];
    return `<aside class="lifecycle-notice" data-lifecycle-state="${esc(s.state)}"><strong>${esc(r.name)} · 清算中</strong><p>最后运作日 ${esc(e.last_operation_date)} · 清算开始 ${esc(e.effective_on)} · 公告日 ${esc(e.published_on)}。</p><p>已退出当前筛选、排名和对比，历史净值与披露资料保留。<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">查看公告</a> · <a href="compare.html?codes=${encodeURIComponent(canonicalCode(subject))}&mode=history">历史净值对比</a></p>${alias}</aside>`;
  }
  function comparisonCodes(codes, historical = false) {
    for (const code of codes) {
      if (!historical && !currentCompareEligible(code)) {
        const e = exitEvent(code);
        throw Error(`${normalize(code)} 已退出当前基金池${e ? `（${e.effective_on}开始清算）` : ''}；请改用“历史资料对比”。`);
      }
    }
    return [...new Set(codes.map(canonicalCode))];
  }
  function historicalNav(detail) {
    const e = exitEvent(detail.fund || detail.code);
    return e ? {...detail, nav: detail.nav.filter(row => row[0] <= e.last_operation_date)} : detail;
  }
  function loadRanks() {
    if (root.FUND_LIFECYCLE_RANKS?.catalog_generated_at === data().catalog_generated_at) return Promise.resolve(root.FUND_LIFECYCLE_RANKS);
    if (!rankPromise) rankPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let ended = false;
      const finish = error => {
        if (ended) return;
        ended = true;
        clearTimeout(timer); script.remove();
        if (error) reject(error);
        else if (root.FUND_LIFECYCLE_RANKS?.catalog_generated_at !== data().catalog_generated_at) reject(Error('同类排名版本与目录不一致。'));
        else resolve(root.FUND_LIFECYCLE_RANKS);
      };
      const timer = setTimeout(() => finish(Error('同类排名加载超时，请刷新重试。')), 15000);
      script.src = 'https://fund-research-dashboard-gy-2026.oss-cn-hongkong.aliyuncs.com/data/fund_dashboard/fund_lifecycle_ranks.js';
      script.onload = () => finish(); script.onerror = () => finish(Error('同类排名未能加载，请刷新重试。'));
      document.head.append(script);
    }).catch(error => { rankPromise = null; throw error; });
    return rankPromise;
  }
  function ranks(subject) {
    const d = root.FUND_LIFECYCLE_RANKS;
    if (!d || d.catalog_generated_at !== data().catalog_generated_at || !currentEligible(subject)) return [];
    const rows = d.ranks[canonicalCode(subject)] || [];
    return d.periods.flatMap(([key, label, start, anchor], i) => {
      const r = rows[i];
      return r ? [{key, label, start, anchor, end: d.as_of, rank: r[0], n: r[1], beaten: r[2] / (r[1] - 1), median: r[3], return: r[4]}] : [];
    });
  }
  function rankSummary(subject) {
    const r = ranks(subject).find(x => x.key === '1y');
    const dd = root.FUND_LIFECYCLE_RANKS?.drawdown1y[canonicalCode(subject)];
    return {return_top_pct: r ? r.rank / r.n : null, return_top_pct_n: r?.n || null,
      drawdown_top_pct: r && dd ? dd[0] / dd[1] : null};
  }
  root.FundLifecycle = {data, status, canonicalCode, currentEligible, currentCompareEligible, exitEvent, label, badge, notice, comparisonCodes, historicalNav, loadRanks, ranks, rankSummary};
  if (typeof module !== 'undefined') module.exports = root.FundLifecycle;
})(typeof window === 'undefined' ? globalThis : window);
