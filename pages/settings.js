// pages/settings.js — Settings overlay

import { goBack } from '../utils/router.js';

/**
 * Render the settings page into the given container.
 * @param {HTMLElement} container
 */
export async function render(container) {
  container.innerHTML = `
    <div class="overlay-header">
      <button class="back-btn" id="back-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7L9 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Back
      </button>
      <span class="overlay-title">Settings</span>
    </div>

    <div class="page-content">
      <!-- settings content goes here -->
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => goBack());
}
