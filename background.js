// background.js — Service Worker

// ── Side panel ────────────────────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ── Monitored hosts ───────────────────────────────────────────────────────

const MONITORED_HOSTS = [
  'www.dishtv.in',
  'stage-aem.dishtv.in',
  'dev-aem.dishtv.in',
  'www.d2h.com',
  'stage-aem.d2h.com',
  'dev-aem.d2h.com',
];

function isMonitoredUrl(url) {
  try { return MONITORED_HOSTS.includes(new URL(url).hostname); }
  catch { return false; }
}

// ── Debugger management ───────────────────────────────────────────────────

const debuggerAttachedTabs = new Set();
const tabOtpResponses      = {};
const tabNetworkCalls      = {}; // tabId → { calls: [], preserve: false }

function initTabCalls(tabId) {
  if (!tabNetworkCalls[tabId]) {
    tabNetworkCalls[tabId] = { calls: [], preserve: false };
  }
  return tabNetworkCalls[tabId];
}

async function ensureDebuggerAttached(tabId) {
  return new Promise((resolve) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || '';
        if (!msg.includes('already attached')) {
          console.error('Debugger attach error:', msg);
        }
      }
      chrome.debugger.sendCommand({ tabId }, 'Network.enable', {}, () => {
        if (chrome.runtime.lastError) {
          console.error('Network.enable error:', chrome.runtime.lastError.message);
        }
        debuggerAttachedTabs.add(tabId);
        initTabCalls(tabId);
        resolve();
      });
    });
  });
}

// ── URL categorization ────────────────────────────────────────────────────

function categorizeUrl(url) {
  try {
    const u        = new URL(url);
    const hostname = u.hostname;
    const pathname = u.pathname;

    const apiDomains = [
      'bm-bizlogic-api.dishtv.in',
      'bizlogic-api.dishtv.in',
      'bm-bizlogic-api.d2h.com',
      'bizlogic-api.d2h.com',
    ];

    if (apiDomains.includes(hostname)) return 'api';

    const publishDomains = [
      'www.dishtv.in',
      'stage-aem.dishtv.in',
      'dev-aem.dishtv.in',
      'www.d2h.com',
      'stage-aem.d2h.com',
      'dev-aem.d2h.com',
    ];

    if (publishDomains.includes(hostname) && pathname.includes('/services/')) return 'aem';

    return null;
  } catch { return null; }
}

// ── Tab URL relay + auto-attach ───────────────────────────────────────────

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (!tab.url) return;
  chrome.runtime.sendMessage({ type: 'TAB_URL_CHANGED', url: tab.url, tabId: activeInfo.tabId }).catch(() => {});
  chrome.runtime.sendMessage({
    type: 'ACTIVE_TAB_CHANGED',
    tabId: activeInfo.tabId,
    url: tab.url,
  }).catch(() => {});
  if (isMonitoredUrl(tab.url)) {
    await ensureDebuggerAttached(activeInfo.tabId);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Relay URL change to side panel when navigation is complete
  if (changeInfo.status === 'complete' && tab.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
      if (!activeTabs.length || activeTabs[0].id !== tabId) return;
      chrome.runtime.sendMessage({ type: 'TAB_URL_CHANGED', url: tab.url, tabId }).catch(() => {});
      chrome.runtime.sendMessage({
        type: 'ACTIVE_TAB_CHANGED',
        tabId,
        url: tab.url,
      }).catch(() => {});
    });
    // Re-attach on every completed navigation for monitored URLs
    if (isMonitoredUrl(tab.url)) {
      await ensureDebuggerAttached(tabId);
    }
  }

  // On navigation start: clear non-preserved calls
  if (changeInfo.status === 'loading') {
    const entry = tabNetworkCalls[tabId];
    if (entry && !entry.preserve) {
      entry.calls = [];
      chrome.runtime.sendMessage({ type: 'LIVE_CALLS_CLEARED', tabId }).catch(() => {});
    }
  }
});

// ── Debugger events ───────────────────────────────────────────────────────

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;

  // ─ requestWillBeSent — store call ──────────────────────────────────────
  if (method === 'Network.requestWillBeSent') {
    const category = categorizeUrl(params.request.url);
    if (!category) return;

    let requestPayload = null;
    if (params.request.postData) {
      try { requestPayload = JSON.parse(params.request.postData); }
      catch { requestPayload = params.request.postData; }
    }

    let path = params.request.url;
    try { path = new URL(params.request.url).pathname; } catch { /* keep full url */ }

    const call = {
      id:             params.requestId,
      method:         params.request.method,
      url:            params.request.url,
      path,
      category,
      status:         null,
      requestPayload,
      responseBody:   null,
      timestamp:      Date.now(),
      complete:       false,
    };

    initTabCalls(tabId).calls.push(call);
    chrome.runtime.sendMessage({ type: 'LIVE_CALL_ADDED', tabId, call }).catch(() => {});
    return;
  }

  // ─ responseReceived — update status + OTP intercept ────────────────────
  if (method === 'Network.responseReceived') {
    const url = params.response?.url || '';

    // OTP interception (login flow) — shared endpoint, branch on tab hostname
    if (url.includes('/services/auth.loginOtp.json')) {
      chrome.debugger.sendCommand(
        { tabId },
        'Network.getResponseBody',
        { requestId: params.requestId },
        (result) => {
          if (chrome.runtime.lastError || !result) return;
          try {
            const data = JSON.parse(result.body);
            tabOtpResponses[tabId] = data;
            chrome.tabs.get(tabId, (tab) => {
              if (chrome.runtime.lastError || !tab) return;
              try {
                const hostname = new URL(tab.url).hostname;
                if (hostname.includes('d2h.com')) {
                  chrome.tabs.sendMessage(tabId, { type: 'D2H_OTP_RESPONSE', data });
                } else {
                  chrome.tabs.sendMessage(tabId, { type: 'DISHTV_OTP_RESPONSE', data });
                }
              } catch { /* ignore URL parse errors */ }
            });
          } catch { /* ignore parse errors */ }
        }
      );
    }

    // Live monitoring — update call status
    const calls = tabNetworkCalls[tabId]?.calls;
    if (calls) {
      const call = calls.find((c) => c.id === params.requestId);
      if (call) {
        call.status = params.response.status;
        chrome.runtime.sendMessage({
          type:   'LIVE_CALL_UPDATED',
          tabId,
          id:     params.requestId,
          status: params.response.status,
        }).catch(() => {});
      }
    }
    return;
  }

  // ─ loadingFinished — fetch + store response body ────────────────────────
  if (method === 'Network.loadingFinished') {
    const calls = tabNetworkCalls[tabId]?.calls;
    if (!calls) return;
    const call = calls.find((c) => c.id === params.requestId);
    if (!call) return;

    chrome.debugger.sendCommand(
      { tabId },
      'Network.getResponseBody',
      { requestId: params.requestId },
      (result) => {
        if (chrome.runtime.lastError || !result) return;
        call.responseBody = result.body;
        call.complete = true;
        chrome.runtime.sendMessage({
          type:         'LIVE_CALL_COMPLETE',
          tabId,
          id:           params.requestId,
          responseBody: result.body,
        }).catch(() => {});
      }
    );
  }
});

// ── Tab cleanup ───────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  if (debuggerAttachedTabs.has(tabId)) {
    chrome.debugger.detach({ tabId });
    debuggerAttachedTabs.delete(tabId);
  }
  delete tabOtpResponses[tabId];
  delete tabNetworkCalls[tabId];
});

// ── Message routing ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DISHTV_LOGIN_INIT') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs || !tabs[0]) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      const tabId = tabs[0].id;
      await ensureDebuggerAttached(tabId);
      chrome.tabs.sendMessage(
        tabId,
        { type: 'DISHTV_LOGIN_START', number: message.number },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true });
          }
        }
      );
    });
    return true; // keep port open for async sendResponse
  }

  if (message.type === 'D2H_LOGIN_INIT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      const tabId = tabs[0].id;

      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        const currentUrl = tab.url || '';
        const isOnLoginPage = currentUrl.includes('/login.html') ||
                              currentUrl.includes('/login');

        const forwardLoginStart = (delayMs) => {
          setTimeout(async () => {
            await ensureDebuggerAttached(tabId);
            chrome.tabs.sendMessage(
              tabId,
              { type: 'D2H_LOGIN_START', number: message.number },
              (response) => {
                if (chrome.runtime.lastError) {
                  sendResponse({
                    success: false,
                    error: chrome.runtime.lastError.message,
                  });
                } else {
                  sendResponse({ success: true });
                }
              }
            );
          }, delayMs);
        };

        if (isOnLoginPage) {
          forwardLoginStart(1000);
          return;
        }

        try {
          const loginUrl = `${new URL(tab.url).origin}/login.html`;
          chrome.tabs.update(tabId, { url: loginUrl });

          const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
            chrome.tabs.onUpdated.removeListener(listener);
            forwardLoginStart(2500);
          };
          chrome.tabs.onUpdated.addListener(listener);
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      });
    });
    return true;
  }

  if (message.type === 'D2H_LOGIN_STATUS') {
    chrome.runtime.sendMessage(message).catch(() => {});
    return true;
  }

  if (message.type === 'DISHTV_LOGIN_STATUS') {
    chrome.runtime.sendMessage(message).catch(() => {});
    // Only detach if the tab is not a monitored host (keep monitoring active on DishTV pages)
    if (message.status === 'success' && sender.tab) {
      const tabId = sender.tab.id;
      if (!isMonitoredUrl(sender.tab.url)) {
        setTimeout(() => {
          if (debuggerAttachedTabs.has(tabId)) {
            chrome.debugger.detach({ tabId });
            debuggerAttachedTabs.delete(tabId);
          }
        }, 2000);
      }
    }
    return true;
  }

  if (message.type === 'USER_STATE_UPDATE') {
    chrome.runtime.sendMessage(message).catch(() => {});
    return true;
  }

  if (message.type === 'LIVE_SET_PRESERVE') {
    initTabCalls(message.tabId).preserve = message.preserve;
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'LIVE_GET_CALLS') {
    const calls = tabNetworkCalls[message.tabId]?.calls || [];
    sendResponse({ calls });
    return true;
  }
});
