// utils/env-detector.js — Detects site + environment from a URL

/** @typedef {{ site: 'dishtv' | 'd2h' | 'unknown', env: 'prod' | 'stage' | 'dev' | 'unknown' }} EnvInfo */

const URL_MAP = [
  { site: 'dishtv', env: 'prod',  hostname: 'www.dishtv.in' },
  { site: 'dishtv', env: 'stage', hostname: 'stage-aem.dishtv.in' },
  { site: 'dishtv', env: 'dev',   hostname: 'dev-aem.dishtv.in' },
  { site: 'd2h',    env: 'prod',  hostname: 'www.d2h.com' },
  { site: 'd2h',    env: 'stage', hostname: 'stage-aem.d2h.com' },
  { site: 'd2h',    env: 'dev',   hostname: 'dev-aem.d2h.com' },
];

/**
 * Synchronously detect which site and environment a URL belongs to.
 * Matches the URL's hostname exactly against the hardcoded URL_MAP.
 *
 * @param {string} url
 * @returns {EnvInfo}
 */
export function detectEnv(url) {
  if (!url) return unknown();

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    return unknown();
  }

  const match = URL_MAP.find((entry) => entry.hostname === hostname);
  return match ? { site: match.site, env: match.env } : unknown();
}

function unknown() {
  return { site: 'unknown', env: 'unknown' };
}
