// utils/router.js — Lightweight JS page router for the side panel

/**
 * Page registry.
 * Keys are page names; values are dynamic import factories.
 * Add new feature pages here when they are created.
 */
const PAGE_REGISTRY = {
  home:          () => import('../pages/home.js'),
  settings:      () => import('../pages/settings.js'),
  // Feature overlays — register here as they are built
  'auto-login':      () => import('../pages/features/placeholder.js'),
  'api-inspector':   () => import('../pages/features/placeholder.js'),
  // placeholder fallback for any unregistered page name
  _fallback:     () => import('../pages/features/placeholder.js'),
};

/** Navigation history stack: [{ page, params }] */
const history = [];

/** The container element all pages render into */
let appEl = null;

/**
 * Initialise the router. Must be called once after the DOM is ready.
 * @param {HTMLElement} container - The #app div
 */
export function initRouter(container) {
  appEl = container;
}

/**
 * Navigate to a page, pushing current page onto the history stack.
 * @param {string} page  - Page name (must exist in PAGE_REGISTRY)
 * @param {object} [params={}] - Optional data passed to the page's render()
 */
export async function navigateTo(page, params = {}) {
  if (!appEl) throw new Error('Router not initialised — call initRouter() first.');

  // Push current page to history before leaving (skip on very first render)
  const currentPage = appEl.dataset.page;
  if (currentPage) {
    history.push({ page: currentPage, params: appEl.dataset.params ? JSON.parse(appEl.dataset.params) : {} });
  }

  await _renderPage(page, params);
}

/**
 * Navigate back to the previous page.
 * If no history exists, falls back to home.
 */
export async function goBack() {
  if (!appEl) throw new Error('Router not initialised.');

  const previous = history.pop();
  if (previous) {
    await _renderPage(previous.page, previous.params);
  } else {
    await _renderPage('home', {});
  }
}

/** Internal: import + render the given page module */
async function _renderPage(page, params) {
  const factory = PAGE_REGISTRY[page] ?? PAGE_REGISTRY['_fallback'];

  const module = await factory();

  if (typeof module.render !== 'function') {
    console.error(`[Router] Page module "${page}" does not export a render() function.`);
    return;
  }

  appEl.innerHTML = '';
  appEl.dataset.page = page;
  appEl.dataset.params = JSON.stringify(params);

  await module.render(appEl, params);
}
