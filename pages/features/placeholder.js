// pages/features/placeholder.js — Temporary overlay for unbuilt features

import { goBack } from '../../utils/router.js';

/**
 * Generic "coming soon" overlay.
 * Replace this file per feature once it is implemented.
 *
 * @param {HTMLElement} container
 * @param {{ featureLabel?: string }} [params]
 */
export async function render(container, params = {}) {
  const label = params?.featureLabel ?? inferLabel();

  container.innerHTML = `
    <div class="overlay-header">
      <button class="back-btn" id="back-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7L9 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Back
      </button>
      <span class="overlay-title">${escHtml(label)}</span>
    </div>

    <div class="coming-soon">
      <div class="coming-soon-icon">🚧</div>
      <p>Feature coming soon</p>
      <span>This tool is under construction.<br/>Check back in a future release.</span>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => goBack());
}

/** Try to guess a human-readable label from the current router page name */
function inferLabel() {
  const page = document.getElementById('app')?.dataset?.page ?? '';
  return page
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Feature';
}

function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
