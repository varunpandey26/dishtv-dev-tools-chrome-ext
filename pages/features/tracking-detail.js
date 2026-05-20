// pages/features/tracking-detail.js — Tracking entry detail overlay

import { goBack } from '../../utils/router.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFiredAt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

function copyToClipboard(text, btn) {
  const original = btn.textContent;
  navigator.clipboard.writeText(text ?? '').then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }).catch(() => {});
}

function getRawPayloadText(payload) {
  if (payload === null || payload === undefined) return '';
  if (payload._raw) return String(payload._raw);
  if (typeof payload === 'object') return JSON.stringify(payload, null, 2);
  return String(payload);
}

function eventTypeBadgeHTML(eventType) {
  if (eventType === 'pageLoaded') {
    return '<span class="tracking-event-badge tracking-event-page">PAGE</span>';
  }
  if (eventType === 'linkClicked') {
    return '<span class="tracking-event-badge tracking-event-link">LINK</span>';
  }
  const label = String(eventType).slice(0, 4).toUpperCase();
  return `<span class="tracking-event-badge tracking-event-other">${escapeHtml(label)}</span>`;
}

function statusBadgeHTML(fired) {
  if (fired) {
    return '<span class="tracking-detail-status tracking-detail-status-fired">FIRED</span>';
  }
  return '<span class="tracking-detail-status tracking-detail-status-not-fired">NOT FIRED</span>';
}

function identifierText(entry) {
  if (entry.eventType === 'linkClicked' && entry.linkName) {
    return `Link: ${entry.linkName}`;
  }
  if (entry.eventType === 'pageLoaded' && entry.pageName) {
    return `Page: ${entry.pageName}`;
  }
  return entry.eventType || '—';
}

/** @returns {{ enrichedPaths: Set<string>, changedPaths: Map<string, unknown> }} */
function comparePayloads(source, fired) {
  const enrichedPaths = new Set();
  const changedPaths  = new Map();

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function compare(s, f, path) {
    if (f === null || f === undefined) return;

    if (s === null || s === undefined) {
      if (path) enrichedPaths.add(path);
      return;
    }

    if (Array.isArray(f)) {
      if (!Array.isArray(s)) {
        if (path) enrichedPaths.add(path);
        return;
      }
      f.forEach((fv, i) => {
        const childPath = path ? `${path}[${i}]` : `[${i}]`;
        compare(s[i], fv, childPath);
      });
      return;
    }

    if (isObject(f)) {
      if (!isObject(s)) {
        if (path) enrichedPaths.add(path);
        return;
      }
      for (const key of Object.keys(f)) {
        const childPath = path ? `${path}.${key}` : key;
        if (!(key in s)) {
          enrichedPaths.add(childPath);
        } else {
          compare(s[key], f[key], childPath);
        }
      }
      return;
    }

    if (path && JSON.stringify(s) !== JSON.stringify(f)) {
      changedPaths.set(path, s);
    }
  }

  compare(source, fired, '');
  return { enrichedPaths, changedPaths };
}

function renderJsonTree(data, depth = 0, diff = null, pathPrefix = '') {
  if (data === null)             return '<span class="json-null">null</span>';
  if (typeof data === 'boolean') return `<span class="json-boolean">${data}</span>`;
  if (typeof data === 'number')  return `<span class="json-number">${data}</span>`;
  if (typeof data === 'string')  return `<span class="json-string">"${escapeHtml(data)}"</span>`;

  const wrapKey = (keyHtml, keyPath) => {
    if (!diff) return keyHtml;
    if (diff.enrichedPaths.has(keyPath)) {
      return `<span class="json-enriched">${keyHtml}<span class="badge-enriched">enriched</span></span>`;
    }
    if (diff.changedPaths.has(keyPath)) {
      const orig = diff.changedPaths.get(keyPath);
      const origStr = typeof orig === 'string'
        ? `"${escapeHtml(orig)}"`
        : escapeHtml(JSON.stringify(orig));
      return `<span class="json-changed">${keyHtml}<span class="json-original">${origStr}</span></span>`;
    }
    return keyHtml;
  };

  if (Array.isArray(data)) {
    if (!data.length) return '<span class="json-bracket">[ ]</span>';
    const items = data.map((v, i) => {
      const childPath = pathPrefix ? `${pathPrefix}[${i}]` : `[${i}]`;
      const valueHtml = renderJsonTree(v, depth + 1, diff, childPath);
      let line = valueHtml;
      if (diff?.enrichedPaths.has(childPath)) {
        line = `<span class="json-enriched">${line}<span class="badge-enriched">enriched</span></span>`;
      } else if (diff?.changedPaths.has(childPath)) {
        const orig = diff.changedPaths.get(childPath);
        const origStr = typeof orig === 'string'
          ? `"${escapeHtml(orig)}"`
          : escapeHtml(JSON.stringify(orig));
        line = `<span class="json-changed">${line}<span class="json-original">${origStr}</span></span>`;
      }
      return `<div>${line}${i < data.length - 1 ? ',' : ''}</div>`;
    }).join('');
    return `<details open><summary class="json-toggle">[ ${data.length} ]</summary><div class="json-indent">${items}</div></details>`;
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data);
    if (!entries.length) return '<span class="json-bracket">{ }</span>';
    const items = entries.map(([k, v], i) => {
      const childPath = pathPrefix ? `${pathPrefix}.${k}` : k;
      const keyHtml   = wrapKey(`<span class="json-key">"${escapeHtml(k)}"</span>`, childPath);
      const valueHtml = renderJsonTree(v, depth + 1, diff, childPath);
      return `<div>${keyHtml}: ${valueHtml}${i < entries.length - 1 ? ',' : ''}</div>`;
    }).join('');
    return `<details open><summary class="json-toggle">{ ${entries.length} }</summary><div class="json-indent">${items}</div></details>`;
  }

  return `<span>${escapeHtml(String(data))}</span>`;
}

function renderPayloadBody(payload, diff) {
  if (payload === null || payload === undefined) {
    return '<span class="live-empty">Not found in source scan</span>';
  }
  if (payload._raw) {
    return `<pre class="json-pre">${escapeHtml(payload._raw)}</pre>`;
  }
  return `<div class="json-tree">${renderJsonTree(payload, 0, diff, '')}</div>`;
}

function wirePayloadCard(container, headerId, bodyId, copyBtnId) {
  const header = container.querySelector(`#${headerId}`);
  const body   = container.querySelector(`#${bodyId}`);
  const copyBtn = container.querySelector(`#${copyBtnId}`);

  header?.addEventListener('click', (e) => {
    if (e.target.closest('.tracking-copy-btn')) return;
    const arrow     = header.querySelector('.toggle-arrow');
    const wasHidden = body?.classList.contains('collapsible-card-body-hidden');
    body?.classList.toggle('collapsible-card-body-hidden', !wasHidden);
    arrow?.classList.toggle('open', wasHidden);
  });

  copyBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

/**
 * @param {HTMLElement} container
 * @param {{ entry?: object }} params
 */
export async function render(container, { entry } = {}) {
  const e = entry || {};
  const fired = !!e.fired;
  const sourcePayload = e.payload ?? null;
  const firedPayload  = fired ? (e.firedPayload ?? null) : null;

  const diff = (sourcePayload && firedPayload && !sourcePayload._raw && !firedPayload._raw)
    ? comparePayloads(sourcePayload, firedPayload)
    : null;

  const firedBodyHidden = fired ? '' : ' collapsible-card-body-hidden';
  const firedArrowOpen  = fired ? ' open' : '';

  container.innerHTML = `
    <div class="overlay-header tracking-detail-header">
      <button class="back-btn" id="tracking-detail-back">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7L9 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Back
      </button>
      <span class="overlay-title">Tracking Detail</span>
      ${eventTypeBadgeHTML(e.eventType)}
      ${statusBadgeHTML(fired)}
    </div>

    <div class="page-content tracking-detail">
      <div class="tracking-identifier-row">${escapeHtml(identifierText(e))}</div>
      <div class="tracking-meta-row">Found in: ${escapeHtml(e.source || '—')}</div>
      ${e.firedAt ? `<div class="tracking-meta-row">Fired at: ${escapeHtml(formatFiredAt(e.firedAt))}</div>` : ''}

      <div class="tracking-payload-card" id="source-payload-card">
        <div class="tracking-payload-header" id="source-payload-header">
          <span>Source Payload</span>
          <div class="tracking-payload-header-right">
            <button type="button" class="tracking-copy-btn" id="copy-source" title="Copy source payload">📋</button>
            <span class="toggle-arrow open">▼</span>
          </div>
        </div>
        <div class="tracking-payload-body" id="source-payload-body">
          ${renderPayloadBody(sourcePayload, null)}
        </div>
      </div>

      <div class="tracking-payload-card" id="fired-payload-card">
        <div class="tracking-payload-header" id="fired-payload-header">
          <span>Fired Payload</span>
          <div class="tracking-payload-header-right">
            <button type="button" class="tracking-copy-btn" id="copy-fired" title="Copy fired payload">📋</button>
            <span class="toggle-arrow${firedArrowOpen}">▼</span>
          </div>
        </div>
        <div class="tracking-payload-body${firedBodyHidden}" id="fired-payload-body">
          ${fired
    ? renderPayloadBody(firedPayload, diff)
    : '<p class="tracking-not-fired">Not fired yet</p>'}
        </div>
      </div>
    </div>
  `;

  container.querySelector('#tracking-detail-back')?.addEventListener('click', () => goBack());

  const copySourceBtn = container.querySelector('#copy-source');
  copySourceBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(getRawPayloadText(sourcePayload), copySourceBtn);
  });

  const copyFiredBtn = container.querySelector('#copy-fired');
  copyFiredBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(getRawPayloadText(firedPayload), copyFiredBtn);
  });

  wirePayloadCard(container, 'source-payload-header', 'source-payload-body', 'copy-source');
  wirePayloadCard(container, 'fired-payload-header', 'fired-payload-body', 'copy-fired');
}
