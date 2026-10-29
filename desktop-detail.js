(function () {
  'use strict';
  const root = document.body;
  if (!root.classList.contains('desktop-detail')) return;
  const page = document.querySelector('#fund-page');
  const header = document.querySelector('.site-header');
  const categories = document.querySelector('.detail-sidebar');
  if (!page || !header || !categories) return;
  const desktop = window.matchMedia('(min-width:761px)');
  const tableStates = new Map();
  const observed = new Set();
  let tabs = null;
  let lastCategory = null;
  let scheduled = false;
  let discoveryNeeded = true;
  const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;

  function setPixels(name, value) {
    const next = `${Math.ceil(value)}px`;
    if (root.style.getPropertyValue(name) !== next) root.style.setProperty(name, next);
  }

  function syncNavigation() {
    const query = new URLSearchParams(window.OFFLINE_PAGE_SEARCH ?? window.location.search);
    const code = String(query.get('code') || '').toUpperCase();
    const details = window.FUND_DETAIL_DATA || {};
    const detail = details[code] || Object.values(details).find(item =>
      item.fund?.id === query.get('id') || item.code?.split('.')[0] === query.get('id'));
    const category = detail?.fund?.category;
    categories.querySelectorAll('[data-category-link]').forEach(link => {
      const active = link.dataset.categoryLink === category;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (category && category !== lastCategory) {
      lastCategory = category;
      if (!desktop.matches) categories.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
    }
    const saved = new URLSearchParams(query.get('list') || '');
    const allowed = new URLSearchParams();
    for (const key of ['pool','q','category','period','page','size','subtype','profile','sort','metric','dir','industry','level','view','perPage','scroll','columns','age','data','navDate','industryView']) {
      if (saved.has(key)) allowed.set(key, saved.get(key).slice(0, key === 'q' ? 500 : 200));
    }
    if (!allowed.size) {
      allowed.set('category', category || 'all');
      allowed.set('view', 'portfolio');
      allowed.set('navDate', 'latest');
    }
    const href = `index.html?${allowed}${allowed.has('scroll') ? '' : '#samples'}`;
    const back = document.querySelector('#detail-return-list');
    if (back && back.getAttribute('href') !== href) back.setAttribute('href', href);
  }

  function discover() {
    discoveryNeeded = false;
    syncNavigation();
    tabs = page.querySelector(':scope > .fund-tab-nav');
    for (const [head, state] of tableStates) {
      if (!head.isConnected || !page.contains(head) || head.closest('table') !== state.table) tableStates.delete(head);
    }
    page.querySelectorAll('table > thead').forEach(head => {
      const table = head.closest('table');
      if (table.parentElement.closest('table') || tableStates.has(head)) return;
      const wrap = table.parentElement;
      head.classList.add('desktop-detail-table-head');
      wrap.classList.add('desktop-detail-table-wrap');
      tableStates.set(head, { table, wrap, shift: 0 });
    });
    if (sizes) {
      const targets = new Set([header, categories, page, tabs].filter(Boolean));
      tableStates.forEach(({table, wrap}, head) => [head, table, wrap].forEach(node => targets.add(node)));
      observed.forEach(node => { if (!targets.has(node)) { sizes.unobserve(node); observed.delete(node); } });
      targets.forEach(node => { if (!observed.has(node)) { sizes.observe(node); observed.add(node); } });
    }
  }

  function clearHead(head, state) {
    if (state.shift || head.style.transform) head.style.removeProperty('transform');
    state.shift = 0;
    head.classList.remove('is-frozen');
  }

  function hidden(head) {
    if (head.closest('[hidden]') || !head.getClientRects().length) return true;
    for (let parent = head.parentElement; parent && parent !== page; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && !parent.open) return true;
    }
    return false;
  }

  function hasLocalScroller(table) {
    for (let parent = table.parentElement; parent && parent !== page; parent = parent.parentElement) {
      if (/^(auto|scroll)$/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight + 1) return true;
    }
    return false;
  }

  function measure() {
    scheduled = false;
    if (discoveryNeeded) discover();
    const topHeight = header.getBoundingClientRect().height + categories.getBoundingClientRect().height;
    setPixels('--desktop-header-height', header.getBoundingClientRect().height);
    setPixels('--desktop-category-height', categories.getBoundingClientRect().height);
    setPixels('--desktop-detail-tabs-height', tabs?.getBoundingClientRect().height || 0);
    const freezeTop = Math.max(topHeight, tabs?.getBoundingClientRect().bottom || topHeight);
    tableStates.forEach((state, head) => {
      if (hidden(head)) { clearHead(head, state); return; }
      const local = hasLocalScroller(state.table);
      head.classList.toggle('desktop-detail-local-scroll', local);
      if (local) { clearHead(head, state); return; }
      const rect = head.getBoundingClientRect();
      const headHeight = `${Math.ceil(rect.height)}px`;
      if (state.wrap.style.getPropertyValue('--desktop-detail-table-head-height') !== headHeight) state.wrap.style.setProperty('--desktop-detail-table-head-height', headHeight);
      const naturalTop = rect.top - state.shift;
      const maxShift = Math.max(0, state.table.getBoundingClientRect().bottom - rect.height - naturalTop);
      const shift = Math.min(maxShift, Math.max(0, freezeTop - naturalTop));
      if (shift !== state.shift) head.style.transform = shift ? `translateY(${shift}px)` : '';
      state.shift = shift;
      head.classList.toggle('is-frozen', shift > 0);
    });
  }

  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(measure); }
  }
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => { discoveryNeeded = true; schedule(); }).observe(page, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open']
    });
  }
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('resize', schedule, { passive: true });
  desktop.addEventListener?.('change', schedule);
  schedule();
})();
