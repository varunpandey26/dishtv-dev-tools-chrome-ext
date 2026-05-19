// content-scripts/d2h-login.js — D2H login automation

// ── Message listener ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'D2H_LOGIN_START') {
    initiateD2HLogin(message.number);
  }
});

// ── OTP response state ────────────────────────────────────────────────────

let __d2hOtpResponse = null;
const d2hOtpListener = (message) => {
  if (message.type === 'D2H_OTP_RESPONSE') {
    __d2hOtpResponse = message.data;
  }
};
chrome.runtime.onMessage.addListener(d2hOtpListener);

// ── Helpers ───────────────────────────────────────────────────────────────

/** Send a status update back to background.js, which forwards it to the side panel */
function sendStatus(status) {
  chrome.runtime.sendMessage({ type: 'D2H_LOGIN_STATUS', status });
}

/**
 * Resolves with the DOM element once it appears in the document.
 * Uses MutationObserver — no polling.
 * @param {string} selector
 * @param {number} [timeout=5000]
 * @returns {Promise<Element>}
 */
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) { resolve(existing); return; }

    let timer;
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (!el) return;
      clearTimeout(timer);
      observer.disconnect();
      resolve(el);
    });

    timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

/** @param {number} ms @returns {Promise<void>} */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main login flow ───────────────────────────────────────────────────────

/**
 * End-to-end D2H login automation.
 * @param {string} number - Mobile number or VC number entered by the user
 */
async function initiateD2HLogin(number) {
  try {
    const currentPath = window.location.pathname;
    const isAlreadyOnLoginPage = currentPath.includes('/login') ||
                                 currentPath === '/login.html';

    // Step 1 — Detect number type
    // Mobile: starts with 6–9, exactly 10 digits
    // VC: anything else (may be longer than 10 digits)
    const isMobile = /^[6-9]\d{9}$/.test(number);

    // Step 2 — Wait for page JS to settle
    await sleep(isAlreadyOnLoginPage ? 500 : 1000);

    // Step 3 — Select correct radio button
    if (isMobile) {
      // #rtnfor is the RMN (mobile) radio — default, but verify it's checked
      const rmnRadio = await waitForElement('#rtnfor', 5000);
      if (!rmnRadio.checked) {
        rmnRadio.click();
        await sleep(500);
      }
    } else {
      // #vcfor is the VC number radio
      const vcRadio = await waitForElement('#vcfor', 5000);
      vcRadio.click();
      await sleep(500);
    }

    // Step 4 — Fill number input using the native value setter so React/Angular
    // state tracking picks up the change as a real user interaction
    const nativeInputSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;

    const userInput = await waitForElement('#userinput', 5000);
    userInput.removeAttribute('maxlength');
    userInput.focus();
    await sleep(300);

    // Clear existing value
    nativeInputSetter.call(userInput, '');
    userInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);

    // Set full value at once
    nativeInputSetter.call(userInput, number);
    userInput.dispatchEvent(new Event('input', { bubbles: true }));
    userInput.dispatchEvent(new Event('change', { bubbles: true }));
    userInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    await sleep(800);

    // Step 5 — Set up OTP listener BEFORE clicking Request OTP
    __d2hOtpResponse = null;

    const otpResponsePromise = new Promise((resolve) => {
      const tempListener = (msg) => {
        if (msg.type === 'D2H_OTP_RESPONSE') {
          chrome.runtime.onMessage.removeListener(tempListener);
          resolve(msg.data);
        }
      };
      chrome.runtime.onMessage.addListener(tempListener);
    });

    // Step 6 — Click Request OTP button
    const requestOtpBtn = await waitForElement('#show5', 5000);
    requestOtpBtn.click();

    // Step 7 — Wait for OTP response with 15 s timeout
    let otpData;
    try {
      otpData = await Promise.race([
        otpResponsePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 15000)
        ),
      ]);
    } catch (e) {
      sendStatus('timeout');
      return;
    }

    // Step 8 — Validate OTP response
    // D2H OTP lives at data.result.otp (differs from DishTV data.otp)
    if (
      !otpData ||
      otpData.responseDescription !== 'Success!' ||
      !otpData.data?.result?.otp
    ) {
      sendStatus('otp_failed');
      return;
    }

    sendStatus('otp_sent');
    const otp = otpData.data.result.otp.toString();
    await sleep(500);

    // Step 9 — Fill single OTP input (D2H has one field, not 6 boxes)
    const otpInput = await waitForElement('#user-pwd', 5000);
    otpInput.value = otp;
    otpInput.dispatchEvent(new Event('input', { bubbles: true }));
    otpInput.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(500);

    // Step 10 — Click Login button
    const loginBtn = await waitForElement('.btn.btn-primary', 3000);
    loginBtn.click();
    await sleep(1000);

    // Step 11 — Poll for successful login
    // D2H stores user info under the 'user' key (not 'userDetails')
    const success = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 15000);
      const interval = setInterval(() => {
        const user = localStorage.getItem('user');
        const loggedIn = document.cookie.includes('userloggedin=true');
        if (user && loggedIn) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve(true);
        }
      }, 500);
    });

    if (success) {
      sendStatus('success');
    } else {
      sendStatus('timeout');
    }

  } catch (e) {
    console.error('[D2H Login] error:', e);
    sendStatus('error');
  }
}
