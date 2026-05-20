// pages/features/adobe-tracking.js — Adobe Tracking (debugger adobeDataLayer read)

import { goBack } from '../../utils/router.js';

let events = [];
/** @type {'all' | 'pageloaded' | 'linkclicked' | 'buttonclick'} */
let activeFilter = 'all';
let hasScanned = false;
let scanPending = false;
let messageListener = null;
let pageContainer = null;
let currentTabId = null;
const expandedIndices = new Set();

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderJsonTree(data, depth = 0) {
  if (data === null)             return '<span class="json-null">null</span>';
  if (typeof data === 'boolean') return `<span class="json-boolean">${data}</span>`;
  if (typeof data === 'number')  return `<span class="json-number">${data}</span>`;
  if (typeof data === 'string')  return `<span class="json-string">"${escapeHtml(data)}"</span>`;

  if (Array.isArray(data)) {
    if (!data.length) return '<span class="json-bracket">[ ]</span>';
    const items = data.map((v, i) =>
      `<div>${renderJsonTree(v, depth + 1)}${i < data.length - 1 ? ',' : ''}</div>`
    ).join('');
    return `<details open><summary class="json-toggle">[ ${data.length} ]</summary><div class="json-indent">${items}</div></details>`;
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data);
    if (!entries.length) return '<span class="json-bracket">{ }</span>';
    const items = entries.map(([k, v], i) =>
      `<div><span class="json-key">"${escapeHtml(k)}"</span>: ${renderJsonTree(v, depth + 1)}${i < entries.length - 1 ? ',' : ''}</div>`
    ).join('');
    return `<details open><summary class="json-toggle">{ ${entries.length} }</summary><div class="json-indent">${items}</div></details>`;
  }

  return `<span>${escapeHtml(String(data))}</span>`;
}

function getIdentifier(entry) {
  switch (entry.event) {
    case 'pageLoaded':
      return entry.xdmPageLoad?.web?.webPageDetails?.pageName || 'Unknown page';
    case 'linkClicked':
    case 'buttonClick':
      return entry.xdmActionDetails?.web?.webInteraction?.linkName || 'Unknown';
    default:
      return entry.event;
  }
}

function eventBadgeHTML(eventType) {
  if (eventType === 'pageLoaded') {
    return '<span class="tracking-event-badge tracking-event-page">PAGE</span>';
  }
  if (eventType === 'linkClicked') {
    return '<span class="tracking-event-badge tracking-event-link">LINK</span>';
  }
  if (eventType === 'buttonClick') {
    return '<span class="tracking-event-badge badge-btn">BTN</span>';
  }
  return `<span class="tracking-event-badge tracking-event-other">${escapeHtml(String(eventType))}</span>`;
}

function setCounterVisible(visible) {
  pageContainer?.querySelector('#tracking-counter-row')
    ?.classList.toggle('adobe-tracking-counter-visible', visible);
  pageContainer?.querySelector('#tracking-filter-tabs')
    ?.classList.toggle('adobe-tracking-counter-visible', visible);
}

function wireFilterTabs() {
  const tabs = pageContainer?.querySelectorAll('#tracking-filter-tabs .tracking-tab');
  tabs?.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeFilter = tab.dataset.filter;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      renderEventsList();
    });
  });
}

function wireAccordionHandlers() {
  pageContainer?.querySelectorAll('.tracking-accordion-header').forEach((header) => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.tracking-copy-btn')) return;
      const idx = header.dataset.index;
      const body = pageContainer.querySelector(`#accordion-body-${idx}`);
      const arrow = header.querySelector('.tracking-toggle-arrow');
      if (!body) return;
      const open = expandedIndices.has(idx);
      if (open) {
        expandedIndices.delete(idx);
        body.classList.add('tracking-accordion-body-hidden');
        arrow?.classList.remove('open');
      } else {
        expandedIndices.add(idx);
        body.classList.remove('tracking-accordion-body-hidden');
        arrow?.classList.add('open');
      }
    });
  });

  pageContainer?.querySelectorAll('.tracking-copy-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.index);
      const entry = events[idx];
      if (!entry) return;
      const text = JSON.stringify(entry, null, 2);
      const original = btn.textContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 1500);
      }).catch(() => {});
    });
  });
}

function accordionHTML(entry, index) {
  const isOpen = expandedIndices.has(String(index));
  return `
    <div class="tracking-accordion">
      <div class="tracking-accordion-header" data-index="${index}">
        ${eventBadgeHTML(entry.event)}
        <span class="tracking-identifier">${escapeHtml(getIdentifier(entry))}</span>
        <button type="button" class="tracking-copy-btn" data-index="${index}" title="Copy JSON">📋</button>
        <span class="tracking-toggle-arrow${isOpen ? ' open' : ''}">▼</span>
      </div>
      <div class="tracking-accordion-body${isOpen ? '' : ' tracking-accordion-body-hidden'}" id="accordion-body-${index}">
        <div class="json-tree">${renderJsonTree(entry)}</div>
      </div>
    </div>
  `;
}

function renderEventsList() {
  if (!pageContainer) return;

  const listEl = pageContainer.querySelector('#tracking-list');
  const counterEl = pageContainer.querySelector('#tracking-counter');
  if (!listEl) return;

  let filtered = events;
  if (activeFilter === 'pageloaded') {
    filtered = events.filter((e) => e.event === 'pageLoaded');
  } else if (activeFilter === 'linkclicked') {
    filtered = events.filter((e) => e.event === 'linkClicked');
  } else if (activeFilter === 'buttonclick') {
    filtered = events.filter((e) => e.event === 'buttonClick');
  }

  if (hasScanned && counterEl) {
    counterEl.textContent = `${events.length} event${events.length === 1 ? '' : 's'} captured`;
  }

  if (filtered.length === 0) {
    if (scanPending) {
      listEl.innerHTML = '<div class="tracking-empty">Reading data layer...</div>';
    } else if (hasScanned) {
      listEl.innerHTML = '<div class="tracking-empty">No tracking events found on this page.</div>';
    } else {
      listEl.innerHTML = '<div class="tracking-empty">Click Scan to read the data layer.</div>';
    }
    return;
  }

  listEl.innerHTML = filtered.map((entry) => {
    const index = events.indexOf(entry);
    return accordionHTML(entry, index);
  }).join('');

  wireAccordionHandlers();
}

function triggerScan() {
  events = [];
  scanPending = true;
  expandedIndices.clear();
  renderEventsList();
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, { type: 'TRACKING_SCAN' }, () => {
      void chrome.runtime.lastError;
    });
  }
}

function setupMessageListener() {
  messageListener = (message) => {
    if (message.type === 'TRACKING_DATA') {
      try {
        const msgHost = new URL(message.sourceUrl).hostname;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeHost = tabs[0]?.url
            ? new URL(tabs[0].url).hostname
            : '';
          if (msgHost !== activeHost) return;
          events = message.entries || [];
          scanPending = false;
          hasScanned = true;
          setCounterVisible(true);
          renderEventsList();
        });
      } catch (e) {
        events = message.entries || [];
        scanPending = false;
        hasScanned = true;
        setCounterVisible(true);
        renderEventsList();
      }
    }
  };
  chrome.runtime.onMessage.addListener(messageListener);
}

function teardownMessageListener() {
  if (messageListener) {
    chrome.runtime.onMessage.removeListener(messageListener);
    messageListener = null;
  }
}

function renderPage() {
  if (!pageContainer) return;

  pageContainer.innerHTML = `
    <div class="overlay-header">
      <button class="back-btn" id="adobe-tracking-back">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7L9 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Back
      </button>
      <span class="overlay-title">Adobe Tracking</span>
    </div>

    <div class="page-content adobe-tracking-page">
      <button type="button" class="btn-scan" id="btn-scan">Scan</button>

      <div class="tracking-counter adobe-tracking-counter-hidden" id="tracking-counter-row">
        <span id="tracking-counter">0 events captured</span>
      </div>

      <div class="tracking-filter-tabs adobe-tracking-counter-hidden" id="tracking-filter-tabs">
        <button type="button" class="tracking-tab active" data-filter="all">All</button>
        <button type="button" class="tracking-tab" data-filter="pageloaded">pageLoaded</button>
        <button type="button" class="tracking-tab" data-filter="linkclicked">linkClicked</button>
        <button type="button" class="tracking-tab" data-filter="buttonclick">buttonClick</button>
      </div>

      <div id="tracking-list">
        <div class="tracking-empty">Reading data layer...</div>
      </div>
    </div>
  `;

  pageContainer.querySelector('#adobe-tracking-back')?.addEventListener('click', () => goBack());
  pageContainer.querySelector('#btn-scan')?.addEventListener('click', () => triggerScan());

  wireFilterTabs();
  renderEventsList();
}

/**
 * @param {HTMLElement} container
 */
export async function render(container) {
  pageContainer = container;
}

export function mount(container) {
  if (container) pageContainer = container;
  events = [];
  hasScanned = false;
  scanPending = false;
  activeFilter = 'all';
  expandedIndices.clear();

  setupMessageListener();
  renderPage();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    currentTabId = tabs[0]?.id ?? null;
    if (currentTabId) triggerScan();
  });
}

export function unmount() {
  teardownMessageListener();
  pageContainer = null;
  currentTabId = null;
  events = [];
  hasScanned = false;
  scanPending = false;
  activeFilter = 'all';
  expandedIndices.clear();
}
