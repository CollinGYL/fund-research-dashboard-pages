(function () {
  'use strict';
  const root = document.body;
  if (!root.classList.contains('desktop-home')) return;
  const header = document.querySelector('.site-header');
  const categories = document.querySelector('.research-sidebar');
  const toolbar = document.querySelector('.list-toolbar');
  const pagination = document.querySelector('.desktop-pagination-bar');
  const samples = document.querySelector('#samples');
  const tableWrap = document.querySelector('.fund-list-wrap');
  const tableHead = document.querySelector('#fund-list-head');
  const table = tableHead?.closest('table');
  const desktop = window.matchMedia('(min-width:761px)');
  if (!header || !toolbar) return;
  const sortHelp = toolbar.querySelector('.sort-help');
  const sortTrigger = document.querySelector('#sort-help-trigger');
  const sortTooltip = document.querySelector('#sort-rules-tooltip');
  if (sortHelp && sortTrigger && sortTooltip) {
    let pinned = false;
    let hovered = false;
    const show = () => {
      sortTooltip.hidden = false;
      sortTrigger.setAttribute('aria-expanded', 'true');
    };
    const hide = () => {
      pinned = false;
      sortTooltip.hidden = true;
      sortTrigger.setAttribute('aria-expanded', 'false');
    };
    sortHelp.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      hovered = true;
      show();
    });
    sortHelp.addEventListener('pointerleave', () => {
      hovered = false;
      if (!pinned && document.activeElement !== sortTrigger) hide();
    });
    sortTrigger.addEventListener('focus', show);
    sortTrigger.addEventListener('blur', () => {
      if (!pinned && !hovered) hide();
    });
    sortTrigger.addEventListener('click', () => {
      pinned = !pinned;
      if (pinned) show();
      else hide();
    });
    document.addEventListener('click', event => {
      if (!sortHelp.contains(event.target)) hide();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') hide();
    });
  }
  let scheduled = false;
  let headShift = 0;
  function setPixels(name, value) {
    const next = `${Math.ceil(value)}px`;
    if (root.style.getPropertyValue(name) !== next) root.style.setProperty(name, next);
  }
  function positionTableHead() {
    if (!tableHead || !table || !tableWrap) return;
    if (!desktop.matches) {
      tableHead.style.removeProperty('transform');
      tableHead.classList.remove('is-frozen');
      headShift = 0;
      return;
    }
    const headRect = tableHead.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    // Keep the real header in its original table so column widths and controls stay aligned.
    // Subtract the preceding transform to prevent accumulated movement between frames.
    const naturalTop = headRect.top - headShift;
    const maxShift = Math.max(0, tableRect.bottom - headRect.height - naturalTop);
    const nextShift = Math.min(maxShift, Math.max(0, toolbar.getBoundingClientRect().bottom - naturalTop));
    setPixels('--desktop-table-head-height', headRect.height);
    if (nextShift !== headShift) {
      tableHead.style.transform = nextShift ? `translateY(${nextShift}px)` : '';
      headShift = nextShift;
    }
    tableHead.classList.toggle('is-frozen', headShift > 0);
  }
  function measure() {
    scheduled = false;
    setPixels('--desktop-header-height', header.getBoundingClientRect().height);
    if (categories) setPixels('--desktop-category-height', categories.getBoundingClientRect().height);
    setPixels('--desktop-toolbar-height', toolbar.getBoundingClientRect().height);
    if (pagination) setPixels('--desktop-pagination-height', pagination.getBoundingClientRect().height);
    positionTableHead();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(measure);
  }
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(schedule);
    observer.observe(header);
    if (categories) observer.observe(categories);
    observer.observe(toolbar);
    if (pagination) observer.observe(pagination);
    if (tableHead) observer.observe(tableHead);
    if (table) observer.observe(table);
    if (tableWrap) observer.observe(tableWrap);
  }
  if (samples && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(schedule);
    observer.observe(samples, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  tableWrap?.addEventListener('scroll', schedule, { passive: true });
  desktop.addEventListener?.('change', schedule);
  schedule();
})();
