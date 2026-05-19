// utils/storage.js — chrome.storage.sync helpers

const STORAGE_KEY = 'devtools_settings';

/** Default settings schema */
const DEFAULT_SETTINGS = {
  dishtv: {
    urls: { prod: '', stage: '', dev: '' },
    credentials: {
      prod:  { u: '', p: '' },
      stage: { u: '', p: '' },
      dev:   { u: '', p: '' }
    }
  },
  d2h: {
    urls: { prod: '', stage: '', dev: '' },
    credentials: {
      prod:  { u: '', p: '' },
      stage: { u: '', p: '' },
      dev:   { u: '', p: '' }
    }
  }
};

/**
 * Retrieve settings from chrome.storage.sync.
 * Returns merged defaults so callers always get a complete object.
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      const stored = result[STORAGE_KEY] || {};
      resolve(deepMerge(DEFAULT_SETTINGS, stored));
    });
  });
}

/**
 * Persist settings to chrome.storage.sync.
 * @param {typeof DEFAULT_SETTINGS} data
 * @returns {Promise<void>}
 */
export async function saveSettings(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: data }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/** Shallow-deep merge: fills missing keys from defaults without clobbering set values */
function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] !== null &&
      typeof overrides[key] === 'object' &&
      !Array.isArray(overrides[key]) &&
      typeof defaults[key] === 'object'
    ) {
      result[key] = deepMerge(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}
