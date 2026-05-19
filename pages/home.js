// pages/home.js — Default home page

import { navigateTo } from '../utils/router.js';
import { detectEnv }  from '../utils/env-detector.js';

// ── Login status bar styles ───────────────────────────────────────────────
(function injectLoginStatusStyles() {
  if (document.querySelector('#pd-login-status-styles')) return;
  const s = document.createElement('style');
  s.id = 'pd-login-status-styles';
  s.textContent = [
    '.login-status-bar{font-size:11px;text-align:center;min-height:14px;transition:color 150ms ease}',
    '.login-status-bar.status-info   {color:#d97706}',
    '.login-status-bar.status-success{color:#16a34a}',
    '.login-status-bar.status-error  {color:#dc2626}',
  ].join('');
  document.head.appendChild(s);
})();

// ─── AEM domain maps ──────────────────────────────────────────────────────

const AUTHOR_DOMAIN_BY_ENV = {
  dev:   'author-p116268-e1141504.adobeaemcloud.com',
  stage: 'author-p116268-e1198031.adobeaemcloud.com',
  prod:  'author-p116268-e1198030.adobeaemcloud.com',
};

const AUTHOR_ENV_BY_DOMAIN = Object.fromEntries(
  Object.entries(AUTHOR_DOMAIN_BY_ENV).map(([env, host]) => [host, env])
);

const DAM_PATHS = {
  dishtv: '/assets.html/content/dam/dishtv-aem-web-platform',
  d2h:    '/assets.html/content/dam/d2h',
};

const AUTHOR_DOMAINS = {
  dev:   'author-p116268-e1141504.adobeaemcloud.com',
  stage: 'author-p116268-e1198031.adobeaemcloud.com',
  prod:  'author-p116268-e1198030.adobeaemcloud.com',
};

const PACKMGR_PATH = '/crx/packmgr/index.jsp';

const CONTENT_PREFIX = {
  dishtv: '/content/dishtv/us/en',
  d2h:    '/content/d2h/us/en/homepage',
};

const PUBLISH_DOMAINS = {
  dishtv: { prod: 'www.dishtv.in',  stage: 'stage-aem.dishtv.in', dev: 'dev-aem.dishtv.in' },
  d2h:    { prod: 'www.d2h.com',    stage: 'stage-aem.d2h.com',   dev: 'dev-aem.d2h.com' },
};

// ─── Quick Nav definitions ────────────────────────────────────────────────

const QUICK_NAV = [
  {
    brand: 'DishTV',
    cls: 'dishtv',
    pills: [
      { env: 'prod',  label: 'Prod',  url: 'https://www.dishtv.in/',       site: 'dishtv' },
      { env: 'stage', label: 'Stage', url: 'https://stage-aem.dishtv.in/', site: 'dishtv' },
      { env: 'dev',   label: 'Dev',   url: 'https://dev-aem.dishtv.in/',   site: 'dishtv' },
    ]
  },
  {
    brand: 'D2H',
    cls: 'd2h',
    pills: [
      { env: 'prod',  label: 'Prod',  url: 'https://www.d2h.com/',         site: 'd2h' },
      { env: 'stage', label: 'Stage', url: 'https://stage-aem.d2h.com/',   site: 'd2h' },
      { env: 'dev',   label: 'Dev',   url: 'https://dev-aem.d2h.com/',     site: 'd2h' },
    ]
  },
];

// ─── Login recents storage ────────────────────────────────────────────────

const RECENTS_MAX = 5;

/** Returns a storage key scoped to brand and environment. */
function getRecentsKey(site, env) {
  return `loginRecents_${site}_${env}`;
}

/** @param {string} key @returns {Promise<string[]>} */
function getLoginRecents(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(Array.isArray(result[key]) ? result[key] : []);
    });
  });
}

/** @param {string[]} recents @param {string} key @returns {Promise<void>} */
function saveLoginRecents(recents, key) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: recents }, resolve);
  });
}

// ─── Bookmark storage ─────────────────────────────────────────────────────

const BOOKMARKS_MAX = 8;

function getBookmarksKey(site) {
  if (site === 'dishtv') return 'bookmarks_dishtv';
  if (site === 'd2h')    return 'bookmarks_d2h';
  return null;
}

/** @param {'dishtv'|'d2h'|'unknown'} site @returns {Promise<Array>} */
function getBookmarks(site) {
  const key = getBookmarksKey(site);
  if (!key) return Promise.resolve([]);
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(Array.isArray(result[key]) ? result[key] : []);
    });
  });
}

/** @param {'dishtv'|'d2h'|'unknown'} site @param {Array} bookmarks @returns {Promise<void>} */
function saveBookmarks(site, bookmarks) {
  const key = getBookmarksKey(site);
  if (!key) return Promise.resolve();
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: bookmarks }, resolve);
  });
}

function migrateOldBookmarks() {
  chrome.storage.local.get('bookmarks', (result) => {
    if (result.bookmarks && result.bookmarks.length > 0) {
      chrome.storage.local.remove('bookmarks');
    }
  });
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Panel toast ──────────────────────────────────────────────────────────

function showPanelToast(text, type = '') {
  let el = document.querySelector('#panel-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'panel-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.className = `toast${type ? ` toast-${type}` : ''} toast-visible`;
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('toast-visible'), 3000);
}

// ─── URL analysis ─────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   isAuthor:   boolean,
 *   env:        'dev' | 'stage' | 'prod',
 *   brand:      'dishtv' | 'd2h' | 'unknown',
 *   mode:       'edit' | 'admin' | 'properties' | 'publish' | null,
 *   authorUrls: { edit: string, admin: string, properties: string } | null,
 *   liveUrl:    string | null
 * }} UrlContext
 */

/** @param {string} tabUrl @returns {UrlContext | null} */
function analyzeUrl(tabUrl) {
  if (!tabUrl) return null;

  let parsed;
  try { parsed = new URL(tabUrl); } catch { return null; }

  const { hostname, pathname, search } = parsed;

  // ── Author domain ──────────────────────────────────────────────────────
  const authorEnv = AUTHOR_ENV_BY_DOMAIN[hostname];

  if (authorEnv) {
    let mode = null, contentPath = null;

    if (pathname.startsWith('/editor.html')) {
      mode        = 'edit';
      contentPath = pathname.slice('/editor.html'.length).replace(/\.html$/, '');
    } else if (pathname.startsWith('/sites.html')) {
      mode        = 'admin';
      contentPath = pathname.slice('/sites.html'.length);
    } else if (pathname.includes('properties.html')) {
      mode       = 'properties';
      const item = new URLSearchParams(search).get('item');
      contentPath = item ? decodeURIComponent(item) : null;
    }

    let brand = 'unknown';
    if (contentPath) {
      if (contentPath.includes('/content/dishtv/'))    brand = 'dishtv';
      else if (contentPath.includes('/content/d2h/')) brand = 'd2h';
    }

    let authorUrls = null;
    if (contentPath) {
      const domain         = AUTHOR_DOMAIN_BY_ENV[authorEnv];
      const adminPath      = contentPath.endsWith('.html') ? contentPath.slice(0, -5) : contentPath;
      const propertiesPath = contentPath.endsWith('.html') ? contentPath.slice(0, -5) : contentPath;
      authorUrls = {
        edit:       `https://${domain}/editor.html${contentPath}.html`,
        admin:      `https://${domain}/sites.html${adminPath}`,
        properties: `https://${domain}/mnt/overlay/wcm/core/content/sites/properties.html?item=${encodeURIComponent(propertiesPath)}`,
      };
    }

    let liveUrl = null;
    if (contentPath && brand !== 'unknown') {
      const prefix   = CONTENT_PREFIX[brand];
      const pagePath = contentPath.startsWith(prefix) ? contentPath.slice(prefix.length) : contentPath;
      liveUrl = `https://${PUBLISH_DOMAINS[brand][authorEnv]}${pagePath || '/'}`;
    }

    return { isAuthor: true, env: authorEnv, brand, mode, authorUrls, liveUrl };
  }

  // ── Publish domain ─────────────────────────────────────────────────────
  const { site, env } = detectEnv(tabUrl);
  if (site !== 'unknown' && env !== 'unknown') {
    const pagePath  = pathname === '/' ? '' : pathname;
    const prefix    = CONTENT_PREFIX[site];
    const domain    = AUTHOR_DOMAIN_BY_ENV[env];
    const adminPath = pagePath.endsWith('.html') ? pagePath.slice(0, -5) : pagePath;
    const fullPath  = prefix + pagePath;
    const cleanPath = fullPath.endsWith('.html') ? fullPath.slice(0, -5) : fullPath;
    return {
      isAuthor: false, env, brand: site, mode: 'publish',
      authorUrls: {
        edit:       `https://${domain}/editor.html${prefix}${pagePath}.html`,
        admin:      `https://${domain}/sites.html${prefix}${adminPath}`,
        properties: `https://${domain}/mnt/overlay/wcm/core/content/sites/properties.html?item=${encodeURIComponent(cleanPath)}`,
      },
      liveUrl: null,
    };
  }

  return null;
}

// ─── DOM helpers ──────────────────────────────────────────────────────────

function getCurrentEnv() {
  return {
    site: document.body.dataset.site ?? 'unknown',
    env:  document.body.dataset.env  ?? 'unknown'
  };
}

function syncActivePills(container, activeSite, activeEnv) {
  container.querySelectorAll('.nav-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.site === activeSite && pill.dataset.env === activeEnv);
  });
}

/** Resolve brand for DAM link from author path or publish env detection. */
function resolveDamSite(tabUrl, ctx) {
  if (ctx?.isAuthor) {
    try {
      const { pathname } = new URL(tabUrl);
      if (pathname.includes('/content/dam/d2h') || pathname.includes('/content/d2h/')) {
        return 'd2h';
      }
      if (pathname.includes('/content/dam/dishtv') || pathname.includes('/content/dishtv/')) {
        return 'dishtv';
      }
    } catch { /* fall through */ }
    if (ctx.brand !== 'unknown') return ctx.brand;
  }
  return detectEnv(tabUrl).site;
}

/** @returns {string | null} */
function buildDamUrl(site, env) {
  const damPath = DAM_PATHS[site];
  if (!damPath || site === 'unknown' || env === 'unknown') return null;
  const authorDomain = AUTHOR_DOMAINS[env] || AUTHOR_DOMAINS.stage;
  return `https://${authorDomain}${damPath}`;
}

/** @returns {'dev'|'stage'|'prod'|'unknown'} */
function resolveAemEnv(tabUrl, ctx) {
  if (ctx?.env && ctx.env !== 'unknown') return ctx.env;
  try {
    const hostname = new URL(tabUrl).hostname;
    if (AUTHOR_ENV_BY_DOMAIN[hostname]) return AUTHOR_ENV_BY_DOMAIN[hostname];
  } catch { /* ignore */ }
  return detectEnv(tabUrl).env;
}

/** @returns {string | null} */
function buildPackmgrUrl(env) {
  if (env === 'unknown') return null;
  const authorDomain = AUTHOR_DOMAINS[env] || AUTHOR_DOMAINS.stage;
  return `https://${authorDomain}${PACKMGR_PATH}`;
}

function updatePackmgrButton(packmgrBtn, tabUrl, ctx) {
  if (!packmgrBtn) return;
  const env = resolveAemEnv(tabUrl, ctx);
  const packmgrUrl = buildPackmgrUrl(env);

  if (packmgrUrl) {
    packmgrBtn.disabled = false;
    packmgrBtn.dataset.url = packmgrUrl;
  } else {
    packmgrBtn.disabled = true;
    delete packmgrBtn.dataset.url;
  }
}

function updateDamButton(damBtn, tabUrl, ctx) {
  if (!damBtn) return;

  const env  = (ctx?.env && ctx.env !== 'unknown') ? ctx.env : detectEnv(tabUrl).env;
  const site = resolveDamSite(tabUrl, ctx);
  const damUrl = buildDamUrl(site, env);

  if (damUrl) {
    damBtn.disabled = false;
    damBtn.dataset.url = damUrl;
    damBtn.style.opacity = '';
    damBtn.style.cursor = '';
    damBtn.style.pointerEvents = '';
  } else {
    damBtn.disabled = true;
    delete damBtn.dataset.url;
    damBtn.style.opacity = '0.4';
    damBtn.style.cursor = 'not-allowed';
    damBtn.style.pointerEvents = 'none';
  }
}

function updateAemActions(container, tabUrl) {
  const actions = container.querySelector('#aem-actions');
  if (!actions) return;

  const adminBtn = actions.querySelector('#aem-admin');
  const editBtn  = actions.querySelector('#aem-edit');
  const propsBtn = actions.querySelector('#aem-props');
  const damBtn      = actions.querySelector('#aem-dam');
  const packmgrBtn  = actions.querySelector('#aem-packmgr');
  const liveBtn     = actions.querySelector('#aem-live');
  const hint        = actions.querySelector('#aem-hint');
  const ctx         = analyzeUrl(tabUrl);

  updatePackmgrButton(packmgrBtn, tabUrl, ctx);

  if (!ctx || !ctx.authorUrls) {
    [adminBtn, editBtn, propsBtn].forEach((b) => {
      b.disabled = true;
      b.classList.remove('aem-btn-faded');
      delete b.dataset.url;
    });
    updateDamButton(damBtn, tabUrl, ctx);
    hint.classList.remove('aem-hint-hidden');
    liveBtn?.classList.add('aem-live-hidden');
    return;
  }

  adminBtn.dataset.url = ctx.authorUrls.admin;
  editBtn.dataset.url  = ctx.authorUrls.edit;
  propsBtn.dataset.url = ctx.authorUrls.properties;

  [adminBtn, editBtn, propsBtn].forEach((b) => {
    b.disabled = false;
    b.classList.remove('aem-btn-faded');
  });

  if (ctx.mode === 'edit')            editBtn.classList.add('aem-btn-faded');
  else if (ctx.mode === 'admin')      adminBtn.classList.add('aem-btn-faded');
  else if (ctx.mode === 'properties') propsBtn.classList.add('aem-btn-faded');

  hint.classList.add('aem-hint-hidden');

  if (ctx.isAuthor && ctx.brand !== 'unknown' && ctx.liveUrl) {
    liveBtn.dataset.url = ctx.liveUrl;
    liveBtn?.classList.remove('aem-live-hidden');
  } else {
    delete liveBtn.dataset.url;
    liveBtn?.classList.add('aem-live-hidden');
  }

  updateDamButton(damBtn, tabUrl, ctx);
}

/** Show login section only for stage/dev */
function updateLoginVisibility(container, env) {
  const section = container.querySelector('#login-section');
  if (!section) return;
  const visible = env === 'stage' || env === 'dev';
  section.classList.toggle('login-section-hidden', !visible);
}

/**
 * Full login-section lifecycle: show/hide by env, then request user state
 * with a 1500 ms fallback to the login-input view.
 * @param {HTMLElement} container
 * @param {string} url            — current active tab URL
 * @param {{ timer: ReturnType<typeof setTimeout> | null }} timerRef — shared mutable ref
 */
function refreshLoginSection(container, url, timerRef) {
  const section = container.querySelector('#login-section');
  const divider = container.querySelector('#login-section-divider');
  if (!section) return;

  const { env, site } = detectEnv(url || '');
  const recentsKey = getRecentsKey(site, env);

  if (env !== 'stage' && env !== 'dev') {
    section.classList.add('login-section-hidden');
    divider?.classList.add('login-section-hidden');
    return;
  }

  // Reveal the container immediately so content never disappears
  section.classList.remove('login-section-hidden');
  divider?.classList.remove('login-section-hidden');

  // Reset the fallback timer — if no USER_STATE_UPDATE within 1500 ms, show the form
  clearTimeout(timerRef.timer);
  timerRef.timer = setTimeout(() => renderLoginState(container, recentsKey), 1500);

  // Ask the content script for current login state
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) {
      clearTimeout(timerRef.timer);
      renderLoginState(container, recentsKey);
      return;
    }
    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: 'REQUEST_USER_STATE' },
      () => {
        if (chrome.runtime.lastError) {
          // Content script not present on this page — show login form immediately
          clearTimeout(timerRef.timer);
          renderLoginState(container, recentsKey);
        }
        // No error → wait for USER_STATE_UPDATE; fallback timer guards against silence
      }
    );
  });
}

function renderLoginRecents(container, recents, recentsKey) {
  const el = container.querySelector('#login-recents');
  if (!el) return;
  if (!recents.length) { el.innerHTML = ''; return; }

  el.innerHTML = recents.map((num) => {
    const isMobile   = /^[6-9]\d{9}$/.test(num);
    const badgeLabel = isMobile ? 'RMN' : 'VC';
    const badgeCls   = isMobile ? 'recent-badge-rmn' : 'recent-badge-vc';
    return `
      <div class="recent-pill" data-number="${num}">
        <span class="recent-badge ${badgeCls}">${badgeLabel}</span>
        <span class="recent-number">${num}</span>
        <button class="recent-delete" data-delete="${num}" title="Remove">×</button>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.recent-pill').forEach((pill) => {
    pill.addEventListener('click', (e) => {
      if (e.target.closest('.recent-delete')) return;
      const input  = container.querySelector('#login-number');
      const submit = container.querySelector('#login-submit');
      if (!input) return;
      input.value     = pill.dataset.number;
      submit.disabled = false;
    });
  });

  el.querySelectorAll('.recent-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const num     = btn.dataset.delete;
      const key     = recentsKey;
      const current = key ? await getLoginRecents(key) : recents;
      const updated = current.filter((n) => n !== num);
      if (key) await saveLoginRecents(updated, key);
      renderLoginRecents(container, updated, key);
    });
  });
}

// ─── HTML builders ────────────────────────────────────────────────────────

function quickNavHTML(activeSite, activeEnv) {
  return `
    <div class="quick-nav">
      ${QUICK_NAV.map(({ brand, cls, pills }) => `
        <div class="quick-nav-row">
          <span class="quick-nav-brand">${brand}</span>
          <div class="quick-nav-pills">
            ${pills.map(({ site, env, label, url }) => {
              const isActive = site === activeSite && env === activeEnv;
              return `<button
                class="nav-pill ${cls}${isActive ? ' active' : ''}"
                data-site="${site}"
                data-env="${env}"
                data-url="${url}"
              >${label}</button>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function aemActionsHTML() {
  return `
    <div class="aem-actions" id="aem-actions">
      <div class="aem-actions-row">
        <button class="aem-btn aem-action-btn" id="aem-admin"  disabled>Admin</button>
        <button class="aem-btn aem-action-btn" id="aem-edit"   disabled>Edit</button>
        <button class="aem-btn aem-action-btn" id="aem-props"  disabled>Properties</button>
        <button class="aem-btn aem-action-btn" id="aem-dam" disabled>DAM</button>
      </div>
      <div class="aem-actions-row-2">
        <button class="aem-btn aem-action-btn" id="aem-packmgr" disabled>Packmgr</button>
        <button class="aem-btn aem-btn-live aem-action-btn aem-live-hidden" id="aem-live">🌐 Live</button>
      </div>
      <p class="aem-hint" id="aem-hint">Not on a recognized page</p>
    </div>
  `;
}

function flushSessionButtonHTML() {
  return '<button type="button" class="btn-flush" id="btn-flush-session">Flush Session</button>';
}

function wireFlushSessionButton(root) {
  const btn = root?.querySelector('#btn-flush-session');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs?.[0]?.id) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'FLUSH_SESSION' });
    });
  });
}

function loginSectionHTML() {
  return `
    <div class="login-section login-section-hidden" id="login-section">
      <div id="login-form-view">
        <div class="login-divider"></div>
        <div class="section-label">Login</div>
        <div class="login-recents" id="login-recents"></div>
        <div class="login-input-row">
          <input
            type="tel"
            id="login-number"
            class="login-number-input"
            placeholder="Enter number..."
            autocomplete="off"
            inputmode="numeric"
          />
          <button class="login-submit-btn" id="login-submit" disabled>→</button>
        </div>
        <p class="login-status-bar" id="login-status-bar"></p>
        ${flushSessionButtonHTML()}
      </div>
      <div id="logged-in-view" class="login-section-hidden"></div>
    </div>
  `;
}

function liveSectionHTML() {
  return `
    <div class="section">
      <div class="live-section-header">
        <div class="section-label">
          <span class="live-dot"></span>
          Live
        </div>
        <label class="live-preserve">
          <input type="checkbox" id="live-preserve-checkbox" />
          Preserve logs
        </label>
      </div>
      <div class="live-accordion" id="live-accordion-aem">
        <div class="live-accordion-header" data-target="live-body-aem">
          <span>AEM Services</span>
          <div class="live-accordion-header-right">
            <span class="live-count-badge" id="live-count-aem">0</span>
            <span class="toggle-arrow">▼</span>
          </div>
        </div>
        <div class="live-accordion-body collapsible-card-body-hidden" id="live-body-aem"></div>
      </div>
      <div class="live-accordion" id="live-accordion-api">
        <div class="live-accordion-header" data-target="live-body-api">
          <span>API Calls</span>
          <div class="live-accordion-header-right">
            <span class="live-count-badge" id="live-count-api">0</span>
            <span class="toggle-arrow open">▼</span>
          </div>
        </div>
        <div class="live-accordion-body" id="live-body-api"></div>
      </div>
    </div>
  `;
}

// ── Login status helpers ──────────────────────────────────────────────────

function showLoginStatus(container, text, type) {
  const bar = container.querySelector('#login-status-bar');
  if (!bar) return;
  bar.textContent = text;
  bar.className   = 'login-status-bar' + (type ? ` status-${type}` : '');
}

function setLoginLoading(container, loading) {
  const input  = container.querySelector('#login-number');
  const submit = container.querySelector('#login-submit');
  if (input)  input.disabled  = loading;
  if (submit) submit.disabled = loading || !(input?.value?.length);
}

// ── Logged-in view helpers ────────────────────────────────────────────────

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d.getTime())) return String(str);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function fieldRow(label, value) {
  return `
    <div class="field-row">
      <span class="field-label">${label}</span>
      <span class="field-value">${value ?? '—'}</span>
    </div>
  `;
}

function collapsibleCard(title, bodyHTML, openByDefault) {
  const bodyHidden = openByDefault ? '' : ' collapsible-card-body-hidden';
  const arrowOpen  = openByDefault ? ' open' : '';
  return `
    <div class="collapsible-card">
      <div class="collapsible-card-header">
        ${title}
        <span class="toggle-arrow${arrowOpen}">▼</span>
      </div>
      <div class="collapsible-card-body${bodyHidden}">
        ${bodyHTML}
      </div>
    </div>
  `;
}

function loggedInHTMLD2H(u) {
  const acct   = u.account  || {};
  const zone   = u.zone     || {};
  const scheme = u.scheme   || {};
  const mvcs   = Array.isArray(u.multiVCInfoList) ? u.multiVCInfoList : [];

  const identityBody = [
    fieldRow('Name',             u.subscriberName),
    fieldRow('VC No',            u.vcNo),
    fieldRow('SMS ID',           u.smsid),
    fieldRow('D2H Customer ID',  u.d2HCustomerID),
    fieldRow('Mobile',           u.rmn),
    fieldRow('Email',            u.email),
  ].join('');

  const statusCls  = u.statusID === 1 ? 'status-active' : 'status-inactive';
  const statusText = u.statusID === 1 ? 'Active' : 'DeActive';
  const accountBody = [
    fieldRow('Status',         `<span class="${statusCls}">${statusText}</span>`),
    fieldRow('Switch Off',     formatDate(acct.switchOffDate)),
    fieldRow('Next Recharge',  formatDate(acct.nextRechargeDate)),
    fieldRow('Balance',        acct.accountBalance        != null ? '₹' + acct.accountBalance        : '—'),
    fieldRow('Last Payment',   acct.lastPaymentAmount     != null ? '₹' + acct.lastPaymentAmount     : '—'),
    fieldRow('Last Pay Date',  formatDate(acct.lastPaymentDate)),
    fieldRow('Min Recharge',   acct.minimumRechargeAmount != null ? '₹' + acct.minimumRechargeAmount : '—'),
    fieldRow('Total Recharge', acct.totalRechargeAmount   != null ? '₹' + acct.totalRechargeAmount   : '—'),
  ].join('');

  const zoneVal = (zone.zoneID && zone.zoneName)
    ? `${zone.zoneID} — ${zone.zoneName}`
    : (zone.zoneID || zone.zoneName || '—');
  const planBody = [
    fieldRow('Scheme', scheme.schemeName),
    fieldRow('Zone',   zoneVal),
  ].join('');

  const mvcBody = mvcs.length
    ? mvcs.map((vc) => {
        const vcStatusCls = vc.isActive === 1 ? 'status-active' : 'status-inactive';
        const vcStatusTxt = vc.isActive === 1 ? 'Active' : 'Inactive';
        return `
          <div class="multi-vc-sub-card">
            ${fieldRow('VC No',          vc.vcNo)}
            ${fieldRow('SMS ID',         vc.smsid)}
            ${fieldRow('RMN',            vc.rmn)}
            ${fieldRow('Status',         `<span class="${vcStatusCls}">${vcStatusTxt}</span>`)}
            ${fieldRow('Type',           vc.isParentIndividual === 1 ? 'Parent VC' : 'Child VC')}
            ${fieldRow('Switch Off',     formatDate(vc.switchOffDate))}
            ${fieldRow('Total Recharge', vc.totalRechargeAmount != null ? '₹' + vc.totalRechargeAmount : '—')}
            ${fieldRow('Box Type',       vc.boxTypeCasMaster?.boxType ?? '—')}
          </div>
        `;
      }).join('')
    : '<p class="field-empty">No additional VCs found</p>';

  return `
    <div class="logged-in-section">
      <div class="logged-in-header">
        <span class="logged-in-label">LOGGED IN ✓</span>
        <span class="logged-in-hint">Logout from site to reset</span>
      </div>
      ${collapsibleCard('Identity',       identityBody, true)}
      ${collapsibleCard('Account Status', accountBody,  false)}
      ${collapsibleCard('Plan & Zone',    planBody,     false)}
      ${collapsibleCard('Multi VC',       mvcBody,      false)}
      ${flushSessionButtonHTML()}
    </div>
  `;
}

function loggedInHTML(u) {
  const acct   = u.account          || {};
  const comm   = u.communication    || {};
  const idu    = u.idu              || {};
  const zone   = u.zone             || {};
  const scheme = u.scheme           || {};
  const mvcs   = Array.isArray(u.multiVCInfoList) ? u.multiVCInfoList : [];

  const identityBody = [
    fieldRow('Name',   u.subscriberName),
    fieldRow('VC No',  idu.vcNo),
    fieldRow('SMS ID', u.smsid),
    fieldRow('Mobile', comm.rmnMobilNo),
    fieldRow('Email',  comm.email),
  ].join('');

  const statusCls = u.statusName === 'Active' ? 'status-active' : 'status-inactive';
  const accountBody = [
    fieldRow('Status',         `<span class="${statusCls}">${u.statusName ?? '—'}</span>`),
    fieldRow('Switch Off',     formatDate(acct.switchOffDate)),
    fieldRow('Next Recharge',  formatDate(acct.nextRechargeDate)),
    fieldRow('Balance',        acct.accountBalance        != null ? '₹' + acct.accountBalance        : '—'),
    fieldRow('Last Payment',   acct.lastPaymentAmount     != null ? '₹' + acct.lastPaymentAmount     : '—'),
    fieldRow('Last Pay Date',  formatDate(acct.lastPaymentDate)),
    fieldRow('Min Recharge',   acct.minimumRechargeAmount != null ? '₹' + acct.minimumRechargeAmount : '—'),
    fieldRow('Total Recharge', acct.totalRechargeAmount   != null ? '₹' + acct.totalRechargeAmount   : '—'),
  ].join('');

  const zoneVal = (zone.zoneID && zone.zoneName)
    ? `${zone.zoneID} — ${zone.zoneName}`
    : (zone.zoneID || zone.zoneName || '—');
  const planBody = [
    fieldRow('Scheme', scheme.schemeName),
    fieldRow('Zone',   zoneVal),
  ].join('');

  const mvcBody = mvcs.length
    ? mvcs.map((vc) => {
        const vcStatusCls = vc.isActive === 1 ? 'status-active' : 'status-inactive';
        const vcStatusTxt = vc.isActive === 1 ? 'Active' : 'Inactive';
        return `
          <div class="multi-vc-sub-card">
            ${fieldRow('VC No',          vc.vcNo)}
            ${fieldRow('SMS ID',         vc.smsid)}
            ${fieldRow('RMN',            vc.rmn)}
            ${fieldRow('Status',         `<span class="${vcStatusCls}">${vcStatusTxt}</span>`)}
            ${fieldRow('Type',           vc.isParentIndividual === 1 ? 'Parent VC' : 'Child VC')}
            ${fieldRow('Switch Off',     formatDate(vc.switchOffDate))}
            ${fieldRow('Total Recharge', vc.totalRechargeAmount != null ? '₹' + vc.totalRechargeAmount : '—')}
            ${fieldRow('Box Type',       vc.boxTypeCasMaster?.boxType ?? '—')}
          </div>
        `;
      }).join('')
    : '<p class="field-empty">No additional VCs found</p>';

  return `
    <div class="logged-in-section">
      <div class="logged-in-header">
        <span class="logged-in-label">LOGGED IN ✓</span>
        <span class="logged-in-hint">Logout from site to reset</span>
      </div>
      ${collapsibleCard('Identity',       identityBody, true)}
      ${collapsibleCard('Account Status', accountBody,  false)}
      ${collapsibleCard('Plan & Zone',    planBody,     false)}
      ${collapsibleCard('Multi VC',       mvcBody,      false)}
      ${flushSessionButtonHTML()}
    </div>
  `;
}

function renderLoginState(container, recentsKey) {
  container.querySelector('#login-form-view')?.classList.remove('login-section-hidden');
  container.querySelector('#logged-in-view')?.classList.add('login-section-hidden');
  wireFlushSessionButton(container.querySelector('#login-form-view'));
  getLoginRecents(recentsKey).then((recents) => renderLoginRecents(container, recents, recentsKey));
}

function renderLoggedInState(container, userDetails, site) {
  const view = container.querySelector('#logged-in-view');
  if (!view) return;
  view.innerHTML = site === 'd2h'
    ? loggedInHTMLD2H(userDetails)
    : loggedInHTML(userDetails);
  view.classList.remove('login-section-hidden');
  container.querySelector('#login-form-view')?.classList.add('login-section-hidden');

  view.querySelectorAll('.collapsible-card-header').forEach((header) => {
    header.addEventListener('click', () => {
      const body      = header.nextElementSibling;
      const arrow     = header.querySelector('.toggle-arrow');
      const wasHidden = body.classList.contains('collapsible-card-body-hidden');
      body.classList.toggle('collapsible-card-body-hidden', !wasHidden);
      arrow.classList.toggle('open', wasHidden);
    });
  });

  wireFlushSessionButton(view);
}

// ─── Bookmark tile HTML ───────────────────────────────────────────────────

function bookmarkTileHTML(bookmark) {
  const badgeCls = bookmark.type === 'prelogin' ? 'badge-pre' : 'badge-post';
  const badgeTxt = bookmark.type === 'prelogin' ? 'PRE' : 'POST';

  const { env } = detectEnv(bookmark.url);
  const envBadgeMap = {
    prod:  { cls: 'badge-prod',  txt: 'P' },
    stage: { cls: 'badge-stage', txt: 'S' },
    dev:   { cls: 'badge-dev',   txt: 'D' },
  };
  const envBadge = envBadgeMap[env];
  const envBadgeHTML = envBadge
    ? `<span class="tile-badge ${envBadge.cls}">${envBadge.txt}</span>`
    : '';

  return `
    <div class="bookmark-tile" data-id="${escapeHtml(bookmark.id)}">
      <span class="tile-name">${escapeHtml(bookmark.name)}</span>
      <div class="tile-badges">
        <span class="tile-badge ${badgeCls}">${badgeTxt}</span>
        ${envBadgeHTML}
      </div>
      <span class="tile-delete" data-delete="${escapeHtml(bookmark.id)}">✕</span>
    </div>
  `;
}

// ─── Bookmark click + login URL ───────────────────────────────────────────

function getLoginUrl(site, currentTabUrl) {
  try {
    const url = new URL(currentTabUrl);
    if (site === 'd2h') {
      return `${url.origin}/login.html`;
    }
    return `${url.origin}/`;
  } catch (e) {
    const domains = {
      dishtv: 'https://stage-aem.dishtv.in/',
      d2h:    'https://stage-aem.d2h.com/login.html',
    };
    return domains[site] || '/';
  }
}

function handleBookmarkClick(bookmark) {
  if (bookmark.type === 'prelogin') {
    chrome.tabs.create({ url: bookmark.url });
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      chrome.tabs.create({ url: bookmark.url });
      return;
    }

    const tabId  = tabs[0].id;
    const tabUrl = tabs[0].url;
    const { site, env } = detectEnv(bookmark.url);

    chrome.tabs.sendMessage(
      tabId,
      { type: 'REQUEST_USER_STATE' },
      () => {
        if (chrome.runtime.lastError) {
          chrome.tabs.create({ url: bookmark.url });
        }
      }
    );

    const stateListener = (message) => {
      if (message.type !== 'USER_STATE_UPDATE') return;
      try {
        if (new URL(message.sourceUrl || '').hostname !== new URL(tabUrl).hostname) return;
      } catch { return; }

      chrome.runtime.onMessage.removeListener(stateListener);

      if (message.loggedIn) {
        chrome.tabs.create({ url: bookmark.url });
        return;
      }

      if (!bookmark.vcNumber) {
        chrome.tabs.create({ url: bookmark.url });
        return;
      }

      const loginUrl = getLoginUrl(site, bookmark.url);
      chrome.tabs.update(tabId, { url: loginUrl });

      const loginListener = (msg) => {
        if (msg.type !== 'DISHTV_LOGIN_STATUS' && msg.type !== 'D2H_LOGIN_STATUS') return;
        if (msg.status === 'success') {
          chrome.runtime.onMessage.removeListener(loginListener);
          chrome.tabs.update(tabId, { url: bookmark.url });
        } else if (
          msg.status === 'error' ||
          msg.status === 'timeout' ||
          msg.status === 'otp_failed'
        ) {
          chrome.runtime.onMessage.removeListener(loginListener);
          if (homeContainerRef) {
            showLoginStatus(homeContainerRef, 'Login failed. Could not open page.', 'error');
          }
        }
      };
      chrome.runtime.onMessage.addListener(loginListener);

      const tabLoadListener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(tabLoadListener);
          setTimeout(() => {
            chrome.runtime.sendMessage({
              type:   site === 'd2h' ? 'D2H_LOGIN_INIT' : 'DISHTV_LOGIN_INIT',
              number: bookmark.vcNumber,
            });
          }, 1500);
        }
      };
      chrome.tabs.onUpdated.addListener(tabLoadListener);
    };
    chrome.runtime.onMessage.addListener(stateListener);
  });
}

// ─── Add bookmark form ────────────────────────────────────────────────────

function showBookmarkForm(container, site) {
  const gridId = site === 'dishtv' ? '#bookmarks-dishtv' : '#bookmarks-d2h';
  const grid = container.querySelector(gridId);
  if (!grid) return;

  grid.innerHTML = `
    <div class="bookmark-form">
      <input type="text" id="bm-name" placeholder="Page name" autocomplete="off" />
      <div class="form-error" id="bm-name-error"></div>
      <input type="url" id="bm-url" placeholder="https://..." autocomplete="off" />
      <div class="form-error" id="bm-url-error"></div>
      <select class="bookmark-type-select" id="bm-type">
        <option value="prelogin">Pre-login</option>
        <option value="postlogin">Post-login</option>
      </select>
      <input
        type="text"
        id="bm-vc"
        class="bookmark-vc-input"
        placeholder="VC or Mobile number"
        autocomplete="off"
        style="display: none"
      />
      <div class="form-actions">
        <button class="btn-save">Save</button>
        <button class="btn-cancel">Cancel</button>
      </div>
    </div>
  `;

  const typeSelect = grid.querySelector('#bm-type');
  const vcInput    = grid.querySelector('#bm-vc');
  const urlInput   = grid.querySelector('#bm-url');

  typeSelect?.addEventListener('change', () => {
    const isPost = typeSelect.value === 'postlogin';
    if (vcInput) {
      vcInput.style.display = isPost ? 'block' : 'none';
      if (!isPost) vcInput.value = '';
    }
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (urlInput) urlInput.value = tabs[0]?.url || '';
  });

  grid.querySelector('.btn-cancel').addEventListener('click', () => {
    renderBookmarksGrid(container);
  });

  grid.querySelector('.btn-save').addEventListener('click', async () => {
    const nameInput  = grid.querySelector('#bm-name');
    const urlInputEl = grid.querySelector('#bm-url');
    const vcInputEl  = grid.querySelector('#bm-vc');
    const nameErr    = grid.querySelector('#bm-name-error');
    const urlErr     = grid.querySelector('#bm-url-error');

    nameErr.textContent = '';
    urlErr.textContent  = '';

    let valid = true;

    if (!nameInput.value.trim()) {
      nameErr.textContent = 'Name is required.';
      valid = false;
    }

    const urlVal = urlInputEl.value.trim();
    if (!urlVal || (!urlVal.startsWith('http://') && !urlVal.startsWith('https://'))) {
      urlErr.textContent = 'Enter a valid URL starting with http:// or https://';
      valid = false;
    }

    if (!valid) return;

    const type  = typeSelect.value;
    const vcVal = type === 'postlogin' ? (vcInputEl?.value.trim() ?? '') : '';

    const existing = await getBookmarks(site);
    if (existing.length >= BOOKMARKS_MAX) return;

    await saveBookmarks(site, [...existing, {
      id:       genId(),
      name:     nameInput.value.trim(),
      url:      urlVal,
      type,
      vcNumber: vcVal,
    }]);

    renderBookmarksGrid(container);
  });
}

// ─── Render bookmarks grid ────────────────────────────────────────────────

function wireBookmarkGroup(container, gridEl, site, bookmarks) {
  gridEl.querySelectorAll('.bookmark-tile:not(.add-tile)').forEach((tile) => {
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.tile-delete')) return;
      const bm = bookmarks.find((b) => b.id === tile.dataset.id);
      if (bm) handleBookmarkClick(bm);
    });
  });

  gridEl.querySelectorAll('.tile-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const updated = bookmarks.filter((b) => b.id !== btn.dataset.delete);
      await saveBookmarks(site, updated);
      renderBookmarksGrid(container);
    });
  });

  gridEl.querySelectorAll('.add-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      showBookmarkForm(container, tile.dataset.addSite);
    });
  });
}

function renderBookmarkGroup(container, gridEl, site, bookmarks, canAdd) {
  const addHint = site === 'dishtv'
    ? 'Open a DishTV page to add bookmarks'
    : 'Open a D2H page to add bookmarks';

  let html = bookmarks.map(bookmarkTileHTML).join('');
  if (canAdd && bookmarks.length < BOOKMARKS_MAX) {
    html += `<div class="bookmark-tile add-tile" data-add-site="${site}">+</div>`;
  } else if (!canAdd && bookmarks.length === 0) {
    html = `<div class="live-empty">${addHint}</div>`;
  }
  gridEl.innerHTML = html;
  wireBookmarkGroup(container, gridEl, site, bookmarks);
}

async function renderBookmarksGrid(container) {
  const root = container.querySelector('#bookmarks-grid');
  if (!root) return;

  const { site: currentSite } = detectEnv(moduleCurrentTabUrl);
  const canAddDishTV = currentSite === 'dishtv';
  const canAddD2H    = currentSite === 'd2h';

  const [dishtvBookmarks, d2hBookmarks] = await Promise.all([
    getBookmarks('dishtv'),
    getBookmarks('d2h'),
  ]);

  root.innerHTML = `
    <div class="bookmarks-group">
      <div class="section-label">DishTV</div>
      <div class="bookmarks-grid" id="bookmarks-dishtv"></div>
    </div>
    <div class="bookmarks-group" style="margin-top: 12px;">
      <div class="section-label">D2H</div>
      <div class="bookmarks-grid" id="bookmarks-d2h"></div>
    </div>
  `;

  renderBookmarkGroup(
    container,
    root.querySelector('#bookmarks-dishtv'),
    'dishtv',
    dishtvBookmarks,
    canAddDishTV
  );
  renderBookmarkGroup(
    container,
    root.querySelector('#bookmarks-d2h'),
    'd2h',
    d2hBookmarks,
    canAddD2H
  );
}

// ─── Live section helpers ─────────────────────────────────────────────────

function callRowHTML(call) {
  const statusCls = call.status === null
    ? 'call-status-pending'
    : (call.status >= 200 && call.status < 300 ? 'call-status-ok' : 'call-status-error');
  const statusText = call.status === null ? '…' : String(call.status);
  const isPost     = call.url.includes('/POST/');
  const typeCls    = isPost ? 'badge-post' : 'badge-pre';
  const typeLabel  = isPost ? 'POST' : 'PRE';

  return `
    <div class="call-row" data-call-id="${escapeHtml(call.id)}">
      <span class="method-badge ${typeCls}">${typeLabel}</span>
      <span class="call-path">${escapeHtml(call.path)}</span>
      <span class="call-status ${statusCls}">${statusText}</span>
    </div>
  `;
}

function wireCallRows(bodyEl, liveCalls, container) {
  bodyEl.querySelectorAll('.call-row').forEach((row) => {
    row.addEventListener('click', () => {
      const call = liveCalls.find((c) => c.id === row.dataset.callId);
      if (call) openLiveDetail(call, container);
    });
  });
}

function renderLiveCalls(liveCalls, container) {
  const aemCalls = liveCalls.filter((c) => c.category === 'aem');
  const apiCalls = liveCalls.filter((c) => c.category === 'api');

  const aemBody = container.querySelector('#live-body-aem');
  const apiBody = container.querySelector('#live-body-api');

  if (aemBody) {
    aemBody.innerHTML = aemCalls.length
      ? aemCalls.map(callRowHTML).join('')
      : '<div class="live-empty">No calls captured</div>';
    wireCallRows(aemBody, liveCalls, container);
    const ct = container.querySelector('#live-count-aem');
    if (ct) ct.textContent = aemCalls.length;
  }

  if (apiBody) {
    apiBody.innerHTML = apiCalls.length
      ? apiCalls.map(callRowHTML).join('')
      : '<div class="live-empty">No calls captured</div>';
    wireCallRows(apiBody, liveCalls, container);
    const ct = container.querySelector('#live-count-api');
    if (ct) ct.textContent = apiCalls.length;
  }
}

function appendLiveCall(call, liveCalls, container) {
  const bodyId  = call.category === 'aem' ? 'live-body-aem' : 'live-body-api';
  const countId = call.category === 'aem' ? 'live-count-aem' : 'live-count-api';

  const body = container.querySelector(`#${bodyId}`);
  if (!body) return;

  body.querySelector('.live-empty')?.remove();

  const row = document.createElement('div');
  row.className      = 'call-row';
  row.dataset.callId = call.id;

  const isPost    = call.url.includes('/POST/');
  const typeCls   = isPost ? 'badge-post' : 'badge-pre';
  const typeLabel = isPost ? 'POST' : 'PRE';

  row.innerHTML = `
    <span class="method-badge ${typeCls}">${typeLabel}</span>
    <span class="call-path">${escapeHtml(call.path)}</span>
    <span class="call-status call-status-pending">…</span>
  `;
  row.addEventListener('click', () => openLiveDetail(call, container));
  body.appendChild(row);

  const ct = container.querySelector(`#${countId}`);
  if (ct) ct.textContent = body.querySelectorAll('.call-row').length;
}

function updateCallStatus(id, status, container) {
  const row = container.querySelector(`.call-row[data-call-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const statusEl = row.querySelector('.call-status');
  if (!statusEl) return;
  const cls = (status >= 200 && status < 300) ? 'call-status-ok' : 'call-status-error';
  statusEl.className   = `call-status ${cls}`;
  statusEl.textContent = String(status);
}

function clearAllLiveCalls(container) {
  ['live-body-aem', 'live-body-api'].forEach((id) => {
    const body = container.querySelector(`#${id}`);
    if (body) body.innerHTML = '<div class="live-empty">No calls captured</div>';
  });
  ['live-count-aem', 'live-count-api'].forEach((id) => {
    const ct = container.querySelector(`#${id}`);
    if (ct) ct.textContent = '0';
  });
}

async function openLiveDetail(call, container) {
  const { render: renderDetail } = await import('./features/live-detail.js');
  await renderDetail(container, { call });
}

// ─── Page render ──────────────────────────────────────────────────────────

let homeContainerRef = null;
let homeCleanup = null;
let moduleCurrentTabUrl = '';
let moduleCurrentTabId = null;
let homeActiveTabListenerRegistered = false;

function applyThemeFromUrl(url) {
  const { site, env } = detectEnv(url);
  const body = document.body;
  body.classList.remove('theme-dishtv', 'theme-d2h');
  if (site === 'dishtv') body.classList.add('theme-dishtv');
  else if (site === 'd2h')  body.classList.add('theme-d2h');
  body.dataset.site = site;
  body.dataset.env  = env;
  body.dispatchEvent(new CustomEvent('envchange', { detail: { site, env } }));
}

function ensureHomeActiveTabListener() {
  if (homeActiveTabListenerRegistered) return;
  homeActiveTabListenerRegistered = true;
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'ACTIVE_TAB_CHANGED') return;
    if (!homeContainerRef) return;
    const app = document.getElementById('app');
    if (app?.dataset?.page !== 'home') return;
    renderHomePage(homeContainerRef, message.url, message.tabId);
  });
}

/**
 * Render the home page into the given container.
 * @param {HTMLElement} container
 */
export async function render(container) {
  homeContainerRef = container;
  ensureHomeActiveTabListener();
  await renderHomePage(container);
}

/**
 * Full home page re-render (tab switch, env change, etc.).
 * @param {HTMLElement} container
 * @param {string} [tabUrl]
 * @param {number} [tabId]
 */
async function renderHomePage(container, tabUrl, tabId) {
  if (homeCleanup) {
    homeCleanup();
    homeCleanup = null;
  }

  homeContainerRef = container;
  migrateOldBookmarks();

  if (tabUrl === undefined || tabId === undefined) {
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    tabUrl = tabs[0]?.url ?? '';
    tabId  = tabs[0]?.id ?? null;
  }

  moduleCurrentTabUrl = tabUrl;
  moduleCurrentTabId  = tabId;

  applyThemeFromUrl(tabUrl);

  const { site, env } = detectEnv(tabUrl);

  container.innerHTML = `
    <div class="panel-header">
      <div class="logo">
        <div class="logo-mark">VE</div>
        <span class="logo-text">Project Dish</span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="settings-btn" title="Settings">⚙</button>
      </div>
    </div>

    ${quickNavHTML(site, env)}
    ${aemActionsHTML()}
    ${loginSectionHTML()}
    <div class="section-divider login-section-hidden" id="login-section-divider"></div>

    <div class="page-content">
      <div class="section" id="bookmarks-section">
        <div class="section-label">Bookmarks</div>
        <div id="bookmarks-grid"></div>
      </div>

      <div class="section-divider"></div>

      ${liveSectionHTML()}
    </div>
  `;

  // ── Settings ─────────────────────────────────────────────────────────────
  container.querySelector('#settings-btn').addEventListener('click', () => {
    navigateTo('settings');
  });

  // ── Quick Nav pills ───────────────────────────────────────────────────────
  const TARGET_DOMAINS = {
    dishtv: {
      prod:  'https://www.dishtv.in',
      stage: 'https://stage-aem.dishtv.in',
      dev:   'https://dev-aem.dishtv.in',
    },
    d2h: {
      prod:  'https://www.d2h.com',
      stage: 'https://stage-aem.d2h.com',
      dev:   'https://dev-aem.d2h.com',
    },
  };

  function handlePillClick(targetSite, targetEnv) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentUrl = tabs[0]?.url || '';
      let finalUrl;
      try {
        const current = new URL(currentUrl);
        const { site: currentSite } = detectEnv(currentUrl);
        if (currentSite === targetSite) {
          // Same brand — carry the full path + search + hash to the target env
          const pathAndQuery = current.pathname + current.search + current.hash;
          finalUrl = TARGET_DOMAINS[targetSite][targetEnv] + pathAndQuery;
        } else {
          // Different brand or unknown — open root
          finalUrl = TARGET_DOMAINS[targetSite][targetEnv] + '/';
        }
      } catch (e) {
        finalUrl = TARGET_DOMAINS[targetSite][targetEnv] + '/';
      }
      chrome.tabs.create({ url: finalUrl });
    });
  }

  container.querySelectorAll('.nav-pill[data-site][data-env]').forEach((pill) => {
    pill.addEventListener('click', () => {
      handlePillClick(pill.dataset.site, pill.dataset.env);
    });
  });

  // ── AEM buttons ───────────────────────────────────────────────────────────
  container.querySelectorAll('.aem-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.url) chrome.tabs.create({ url: btn.dataset.url });
    });
  });

  // ── Login section — input handling ───────────────────────────────────────
  const loginInput  = container.querySelector('#login-number');
  const loginSubmit = container.querySelector('#login-submit');

  loginInput?.addEventListener('input', () => {
    loginInput.value     = loginInput.value.replace(/\D/g, '');
    loginSubmit.disabled = loginInput.value.length === 0;
  });

  loginSubmit?.addEventListener('click', () => {
    const number = loginInput?.value ?? '';
    if (!number) return;
    container.dispatchEvent(
      new CustomEvent('login-initiated', { detail: { number }, bubbles: true })
    );
  });

  wireFlushSessionButton(container.querySelector('#login-form-view'));

  const onLoginSuccess = async ({ detail }) => {
    const number = detail?.number;
    if (!number) return;
    const { site, env } = detectEnv(moduleCurrentTabUrl);
    const key = getRecentsKey(site, env);
    const recents = await getLoginRecents(key);
    const updated = [number, ...recents.filter((n) => n !== number)].slice(0, RECENTS_MAX);
    await saveLoginRecents(updated, key);
    renderLoginRecents(container, updated, key);
  };
  document.addEventListener('login-success', onLoginSuccess);

  let pendingLoginNumber = null;

  container.addEventListener('login-initiated', (e) => {
    const { number } = e.detail;
    pendingLoginNumber = number;
    showLoginStatus(container, 'Initiating login…', '');
    setLoginLoading(container, true);
    const { site } = detectEnv(moduleCurrentTabUrl);
    const loginType = site === 'd2h' ? 'D2H_LOGIN_INIT' : 'DISHTV_LOGIN_INIT';
    chrome.runtime.sendMessage({ type: loginType, number });
  });

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  renderBookmarksGrid(container);

  // ── Login section — timer ref (shared between refreshLoginSection + onMessage)
  const loginTimerRef = { timer: null };

  // ── Live section ──────────────────────────────────────────────────────────
  const liveCalls = [];

  // Accordion toggles
  container.querySelectorAll('.live-accordion-header').forEach((header) => {
    header.addEventListener('click', () => {
      const bodyId = header.dataset.target;
      const body   = container.querySelector(`#${bodyId}`);
      const arrow  = header.querySelector('.toggle-arrow');
      if (!body) return;
      const hidden = body.classList.contains('collapsible-card-body-hidden');
      body.classList.toggle('collapsible-card-body-hidden', !hidden);
      arrow?.classList.toggle('open', hidden);
    });
  });

  // Preserve checkbox
  const preserveCheckbox = container.querySelector('#live-preserve-checkbox');
  preserveCheckbox?.addEventListener('change', () => {
    if (!moduleCurrentTabId) return;
    chrome.runtime.sendMessage({
      type:     'LIVE_SET_PRESERVE',
      tabId:    moduleCurrentTabId,
      preserve: preserveCheckbox.checked,
    });
  });

  // ── Login status handler ──────────────────────────────────────────────────
  const handleLoginStatus = ({ status }) => {
    switch (status) {
      case 'otp_sent':
        showLoginStatus(container, 'OTP sent. Filling in…', 'info');
        break;
      case 'otp_failed':
        showLoginStatus(container, 'Invalid number or OTP failed.', 'error');
        setLoginLoading(container, false);
        pendingLoginNumber = null;
        break;
      case 'success':
        showLoginStatus(container, 'Logged in successfully!', 'success');
        document.dispatchEvent(
          new CustomEvent('login-success', { detail: { number: pendingLoginNumber } })
        );
        pendingLoginNumber = null;
        setTimeout(() => {
          setLoginLoading(container, false);
          showLoginStatus(container, '', '');
        }, 2000);
        break;
      case 'timeout':
        showLoginStatus(container, 'Login timed out. Try again.', 'error');
        setLoginLoading(container, false);
        pendingLoginNumber = null;
        break;
      case 'error':
      default:
        showLoginStatus(container, 'Something went wrong.', 'error');
        setLoginLoading(container, false);
        pendingLoginNumber = null;
    }
  };

  // ── Seed active-tab state ─────────────────────────────────────────────────
  updateAemActions(container, moduleCurrentTabUrl);
  refreshLoginSection(container, moduleCurrentTabUrl, loginTimerRef);

  if (moduleCurrentTabId) {
    chrome.runtime.sendMessage({ type: 'LIVE_GET_CALLS', tabId: moduleCurrentTabId }, (response) => {
      if (response?.calls?.length) {
        liveCalls.push(...response.calls);
        renderLiveCalls(liveCalls, container);
      }
    });
  }

  // ── Message router ────────────────────────────────────────────────────────
  const onMessage = (message) => {
    if (message.type === 'DISHTV_LOGIN_STATUS' || message.type === 'D2H_LOGIN_STATUS') {
      handleLoginStatus(message);

    } else if (message.type === 'USER_STATE_UPDATE') {
      // Guard against cross-tab contamination: only render if the message came
      // from the same hostname as the currently active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeUrl = tabs[0]?.url || '';
        const sourceUrl = message.sourceUrl || '';
        try {
          if (new URL(activeUrl).hostname !== new URL(sourceUrl).hostname) return;
        } catch (e) { return; }

        moduleCurrentTabUrl = activeUrl;

        // Cancel fallback timer — we have a real answer from the correct tab
        clearTimeout(loginTimerRef.timer);
        if (message.loggedIn && message.userDetails) {
          renderLoggedInState(container, message.userDetails, message.site);
        } else {
          const { site, env } = detectEnv(moduleCurrentTabUrl);
          renderLoginState(container, getRecentsKey(site, env));
        }
      });

    } else if (message.type === 'LIVE_CALL_ADDED') {
      if (message.tabId === moduleCurrentTabId) {
        liveCalls.push(message.call);
        appendLiveCall(message.call, liveCalls, container);
      }

    } else if (message.type === 'LIVE_CALL_UPDATED') {
      if (message.tabId === moduleCurrentTabId) {
        const call = liveCalls.find((c) => c.id === message.id);
        if (call) call.status = message.status;
        updateCallStatus(message.id, message.status, container);
      }

    } else if (message.type === 'LIVE_CALL_COMPLETE') {
      if (message.tabId === moduleCurrentTabId) {
        const call = liveCalls.find((c) => c.id === message.id);
        if (call) { call.responseBody = message.responseBody; call.complete = true; }
      }

    } else if (message.type === 'LIVE_CALLS_CLEARED') {
      if (message.tabId === moduleCurrentTabId) {
        liveCalls.length = 0;
        clearAllLiveCalls(container);
      }
    }
  };
  chrome.runtime.onMessage.addListener(onMessage);

  // ── Env change ────────────────────────────────────────────────────────────
  const onEnvChange = ({ detail: { site, env } }) => {
    syncActivePills(container, site, env);
    // Login section visibility is driven by TAB_URL_CHANGED; pills-only sync here
  };
  document.body.addEventListener('envchange', onEnvChange);

  const observer = new MutationObserver(() => {
    if (!document.contains(container)) {
      if (homeCleanup) homeCleanup();
      homeCleanup = null;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  homeCleanup = () => {
    document.body.removeEventListener('envchange', onEnvChange);
    document.removeEventListener('login-success', onLoginSuccess);
    chrome.runtime.onMessage.removeListener(onMessage);
    observer.disconnect();
    if (homeContainerRef === container) homeContainerRef = null;
  };
}
