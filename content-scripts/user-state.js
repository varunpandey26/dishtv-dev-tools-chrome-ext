// content-scripts/user-state.js
// Reads login state from localStorage and reports it to the side panel.
// Runs on all DishTV and D2H domains at document_idle.

const _hostname   = window.location.hostname;
const _isD2H      = _hostname.includes('d2h.com');
const _storageKey = _isD2H ? 'user' : 'userDetails';
const _site       = _isD2H ? 'd2h' : 'dishtv';

/** Read current localStorage state and send USER_STATE_UPDATE to background */
function reportUserState() {
  const raw = localStorage.getItem(_storageKey);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      chrome.runtime.sendMessage({
        type: 'USER_STATE_UPDATE',
        loggedIn: true,
        userDetails: data,
        site: _site,
        sourceUrl: window.location.href,
      });
    } catch (e) {}
  } else {
    chrome.runtime.sendMessage({
      type: 'USER_STATE_UPDATE',
      loggedIn: false,
      site: _site,
      sourceUrl: window.location.href,
    });
  }
}

// Report immediately on page load
reportUserState();

// Watch for login/logout changes via the storage event.
// Note: the storage event only fires in OTHER tabs on the same origin.
// For same-tab changes (e.g. after login automation), REQUEST_USER_STATE
// triggers a fresh read from the side panel.
window.addEventListener('storage', (e) => {
  if (e.key !== 'userDetails' && e.key !== 'user') return;
  if (e.newValue) {
    try {
      const data = JSON.parse(e.newValue);
      chrome.runtime.sendMessage({
        type: 'USER_STATE_UPDATE',
        loggedIn: true,
        userDetails: data,
        site: _site,
        sourceUrl: window.location.href,
      });
    } catch (err) {}
  } else {
    chrome.runtime.sendMessage({
      type: 'USER_STATE_UPDATE',
      loggedIn: false,
      site: _site,
      sourceUrl: window.location.href,
    });
  }
});

// Respond to on-demand state requests from the side panel
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'REQUEST_USER_STATE') {
    reportUserState();
    return;
  }

  if (message.type === 'FLUSH_SESSION') {
    localStorage.removeItem('userDetails');
    localStorage.removeItem('user');

    document.cookie =
      'userloggedin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

    const domain = window.location.hostname;
    document.cookie =
      `userloggedin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${domain}`;
    document.cookie =
      `userloggedin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${domain}`;

    chrome.runtime.sendMessage({
      type: 'USER_STATE_UPDATE',
      loggedIn: false,
      sourceUrl: window.location.href,
    });

    setTimeout(() => {
      location.reload();
    }, 500);
  }
});
