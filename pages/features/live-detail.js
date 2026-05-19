// pages/features/live-detail.js — API call detail overlay

import { goBack } from '../../utils/router.js';

// ─── Helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMethodClass(method) {
  if (method === 'GET')  return 'method-get';
  if (method === 'POST') return 'method-post';
  return 'method-other';
}

function getStatusClass(status) {
  if (status === null || status === undefined) return 'call-status-pending';
  if (status >= 200 && status < 300) return 'call-status-ok';
  return 'call-status-error';
}

function copyToClipboard(text, btn) {
  const original = btn.textContent;
  navigator.clipboard.writeText(text ?? '').then(() => {
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }).catch(() => {});
}

// ─── JSON Tree renderer ───────────────────────────────────────────────────

/**
 * Recursively renders JSON as a collapsible <details> tree.
 * Uses native <details>/<summary> for zero-JS collapse toggling.
 */
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

// ─── Section content helpers ──────────────────────────────────────────────

function parseJsonSafe(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object')           return raw;
  try   { return JSON.parse(raw); }
  catch { return null; }
}

function renderDataBlock(raw, emptyMsg) {
  if (raw === null || raw === undefined || raw === '') {
    return `<span class="live-empty">${emptyMsg}</span>`;
  }
  const parsed = parseJsonSafe(raw);
  if (parsed !== null) {
    return `<div class="json-tree">${renderJsonTree(parsed)}</div>`;
  }
  return `<pre class="json-pre">${escapeHtml(String(raw))}</pre>`;
}

function getRawText(raw) {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'object') return JSON.stringify(raw, null, 2);
  return String(raw);
}

// ─── Page render ──────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} container  — the full #app element
 * @param {{ call: object }} params
 */
export async function render(container, { call } = {}) {
  const c = call || {};

  const methodCls = getMethodClass(c.method);
  const statusCls = getStatusClass(c.status);
  const statusTxt = c.status != null ? String(c.status) : '…';

  const payloadContent  = renderDataBlock(c.requestPayload, 'No payload');
  const responseContent = renderDataBlock(
    c.responseBody,
    c.complete ? 'No response body' : 'Waiting for response…'
  );

  container.innerHTML = `
    <div class="overlay-header">
      <button class="back-btn" id="detail-back">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7L9 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Back
      </button>
      <span class="overlay-title">API Detail</span>
    </div>

    <div class="page-content">

      <div class="section-label">URL</div>
      <div class="detail-url-block">
        <div class="detail-url-badges">
          <span class="method-badge ${methodCls}">${escapeHtml(c.method || 'GET')}</span>
          <span class="call-status ${statusCls}">${statusTxt}</span>
        </div>
        <div class="detail-url-text">${escapeHtml(c.url || '')}</div>
        <button class="detail-copy-btn" id="copy-url" title="Copy URL">📋</button>
      </div>

      <div class="collapsible-card mt-3" id="payload-card">
        <div class="collapsible-card-header" id="payload-header">
          <span>Request Payload</span>
          <div class="live-accordion-header-right">
            <button class="detail-copy-btn-inline" id="copy-payload" title="Copy payload">📋</button>
            <span class="toggle-arrow open">▼</span>
          </div>
        </div>
        <div class="collapsible-card-body" id="payload-body">
          ${payloadContent}
        </div>
      </div>

      <div class="collapsible-card mt-2" id="response-card">
        <div class="collapsible-card-header" id="response-header">
          <span>Response</span>
          <div class="live-accordion-header-right">
            <button class="detail-copy-btn-inline" id="copy-response" title="Copy response">📋</button>
            <span class="toggle-arrow open">▼</span>
          </div>
        </div>
        <div class="collapsible-card-body" id="response-body">
          ${responseContent}
        </div>
      </div>

    </div>
  `;

  // ── Back ──────────────────────────────────────────────────────────────────
  container.querySelector('#detail-back').addEventListener('click', () => goBack());

  // ── Copy URL ──────────────────────────────────────────────────────────────
  const copyUrlBtn = container.querySelector('#copy-url');
  copyUrlBtn?.addEventListener('click', () => copyToClipboard(c.url, copyUrlBtn));

  // ── Copy payload ──────────────────────────────────────────────────────────
  const copyPayloadBtn = container.querySelector('#copy-payload');
  copyPayloadBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(getRawText(c.requestPayload), copyPayloadBtn);
  });

  // ── Copy response ─────────────────────────────────────────────────────────
  const copyResponseBtn = container.querySelector('#copy-response');
  copyResponseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(getRawText(c.responseBody), copyResponseBtn);
  });

  // ── Collapsible card toggles ──────────────────────────────────────────────
  [
    ['payload-header',  'payload-body'],
    ['response-header', 'response-body'],
  ].forEach(([headerId, bodyId]) => {
    const header = container.querySelector(`#${headerId}`);
    const body   = container.querySelector(`#${bodyId}`);
    if (!header || !body) return;

    header.addEventListener('click', (e) => {
      if (e.target.closest('.detail-copy-btn-inline')) return;
      const arrow     = header.querySelector('.toggle-arrow');
      const wasHidden = body.classList.contains('collapsible-card-body-hidden');
      body.classList.toggle('collapsible-card-body-hidden', !wasHidden);
      arrow?.classList.toggle('open', wasHidden);
    });
  });
}
