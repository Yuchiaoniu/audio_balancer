const DEFAULT = { enabled: true, compressorPreset: 'standard' };

const toggle = document.getElementById('enableToggle');
const presetBtns = document.querySelectorAll('.preset-btn');

// 讀取目前設定
chrome.storage.local.get(DEFAULT, (settings) => {
  toggle.checked = settings.enabled;
  setActivePreset(settings.compressorPreset);
});

// 開關切換
toggle.addEventListener('change', () => {
  const value = toggle.checked;
  chrome.storage.local.set({ enabled: value });
  sendToContent({ type: 'SET_ENABLED', value });
});

// 壓縮強度切換
presetBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = btn.dataset.preset;
    chrome.storage.local.set({ compressorPreset: preset });
    setActivePreset(preset);
    sendToContent({ type: 'SET_PRESET', value: preset });
  });
});

function setActivePreset(preset) {
  presetBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === preset);
  });
}

function sendToContent(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, msg, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[AudioNorm Popup] 無法傳訊給 content script:', chrome.runtime.lastError.message);
        }
      });
    }
  });
}
