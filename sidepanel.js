// sidepanel.js — Entry point for the side panel

import { detectEnv } from './utils/env-detector.js';
import { initRouter, navigateTo } from './utils/router.js';

/** Apply theme class + env data attribute to <body> based on detected env */
async function applyTheme(url) {
  const { site, env } = await detectEnv(url);

  const body = document.body;

  // Remove previous theme classes
  body.classList.remove('theme-dishtv', 'theme-d2h');

  if (site === 'dishtv') body.classList.add('theme-dishtv');
  else if (site === 'd2h')  body.classList.add('theme-d2h');

  // Store on body for other modules to read without re-detecting
  body.dataset.site = site;
  body.dataset.env  = env;

  // Dispatch a custom event so mounted page components can react
  body.dispatchEvent(new CustomEvent('envchange', { detail: { site, env } }));
}

/** Get the active tab's URL from the current window */
async function getActiveTabUrl() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs?.[0]?.url ?? '');
    });
  });
}

/** Bootstrap: detect env, apply theme, init router, render home */
async function init() {
  const url = await getActiveTabUrl();
  await applyTheme(url);

  const appEl = document.getElementById('app');
  initRouter(appEl);

  await navigateTo('home');
}

// Listen for URL changes relayed by background.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TAB_URL_CHANGED') {
    applyTheme(message.url);
  }
});

init();
