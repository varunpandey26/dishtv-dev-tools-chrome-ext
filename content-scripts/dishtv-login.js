// content-scripts/dishtv-login.js — DishTV login automation

// ── Message listener ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'DISHTV_LOGIN_START') {
    initiateDishTVLogin(message.number);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────

/** Send a status update to background.js, which forwards it to the side panel */
function sendStatus(status, detail = null) {
  chrome.runtime.sendMessage({ type: 'DISHTV_LOGIN_STATUS', status, detail });
}

/**
 * Returns a Promise that resolves with the DOM element once it appears.
 * Uses MutationObserver so it doesn't poll via setInterval.
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
 * End-to-end DishTV login automation.
 * @param {string} number - Mobile number entered by the user
 */
async function initiateDishTVLogin(number) {
  try {
    // Step 1 — Click login button
    const loginBtn = await waitForElement('#dishtv-LoginBtn', 5000);
    loginBtn.click();
    await sleep(2000);

    // Step 2 — Fill userid input (character-by-character to satisfy framework listeners)
    const userIdInput = await waitForElement('#userid', 5000);
    userIdInput.focus();
    await sleep(300);

    // Clear existing value first
    userIdInput.value = '';
    userIdInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);

    // Type each character one by one simulating real keyboard input
    for (const char of number) {
      // keydown
      userIdInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: char,
        code: `Digit${char}`,
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true
      }));
      await sleep(30);

      // keypress
      userIdInput.dispatchEvent(new KeyboardEvent('keypress', {
        key: char,
        code: `Digit${char}`,
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true
      }));
      await sleep(30);

      // Actually append character to value
      userIdInput.value = userIdInput.value + char;
      userIdInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(30);

      // keyup
      userIdInput.dispatchEvent(new KeyboardEvent('keyup', {
        key: char,
        code: `Digit${char}`,
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true
      }));

      // Small random delay between keystrokes to mimic human typing
      await sleep(80 + Math.floor(Math.random() * 60));
    }

    // Final change event after all characters typed
    userIdInput.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(800);

    // Step 3 — Set up OTP response listener BEFORE clicking Get OTP
    // background.js intercepts the response via chrome.debugger and sends it here
    let __lastOtpResponse = null;
    const otpResponsePromise = new Promise((resolve) => {
      const listener = (message) => {
        if (message.type === 'DISHTV_OTP_RESPONSE') {
          chrome.runtime.onMessage.removeListener(listener);
          resolve(message.data);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
    });

    const getOtpBtn = await waitForElement('#getOtp', 5000);
    getOtpBtn.click();

    // Step 4 — Wait for OTP response (from debugger) with 20s timeout
    let otpData;
    try {
      otpData = await Promise.race([
        otpResponsePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))
      ]);
    } catch (e) {
      sendStatus('timeout');
      return;
    }

    // Wait for .after-otp to appear in DOM (UI confirmation)
    try {
      await waitForElement('.after-otp', 10000);
    } catch (e) {
      sendStatus('timeout');
      return;
    }

    __lastOtpResponse = otpData;
    console.log('[DishTV Login] __lastOtpResponse:', __lastOtpResponse);

    // Step 5 — Validate OTP response
    if (
      !__lastOtpResponse ||
      __lastOtpResponse.responseDescription !== 'Success' ||
      !__lastOtpResponse.data?.otp
    ) {
      sendStatus('otp_failed');
      return;
    }

    sendStatus('otp_sent');
    const otp = __lastOtpResponse.data.otp.toString();
    console.log('[DishTV Login] OTP to fill:', otp);
    await sleep(500);

    // Step 6 — Fill OTP inputs one digit at a time
    const otpInputs = document.querySelectorAll('.otp-input');
    const digits = otp.split('');
    for (let i = 0; i < otpInputs.length; i++) {
      otpInputs[i].focus();
      otpInputs[i].value = digits[i] || '';
      otpInputs[i].dispatchEvent(new Event('input', { bubbles: true }));
      otpInputs[i].dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[DishTV Login] Filled digit', i, ':', digits[i]);
      await sleep(200);
    }

    await sleep(500);

    // Step 7 — Click Submit
    const submitBtn = await waitForElement('#submit-btn', 3000);
    submitBtn.click();

    // Step 8 — Poll for successful login
    const success = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 15000);
      const interval = setInterval(() => {
        const userDetails = localStorage.getItem('userDetails');
        const loggedIn = document.cookie.includes('userloggedin=true');
        if (userDetails && loggedIn) {
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
    console.error('DishTV login error:', e);
    sendStatus('error');
  }
}
