// content-scripts/dishtv-tracking.js
// Relays TRACKING_SCAN to background; auto-rescan on page clicks

let clickListenerActive = false;

function onPageClick() {
  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'TRACKING_DO_SCAN',
      sourceUrl: window.location.href,
    });
  }, 600);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TRACKING_SCAN') {
    chrome.runtime.sendMessage({
      type: 'TRACKING_DO_SCAN',
      sourceUrl: window.location.href,
    });
    if (!clickListenerActive) {
      document.addEventListener('click', onPageClick);
      clickListenerActive = true;
    }
  }

  if (message.type === 'TRACKING_STOP_LISTENER') {
    document.removeEventListener('click', onPageClick);
    clickListenerActive = false;
  }
});
