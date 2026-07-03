/**
 * YouTube Audio Normalizer — content script
 *
 * 音訊處理鏈：
 *   <video>
 *     → MediaElementSourceNode
 *     → BiquadFilter (highpass  20 Hz)   截掉次聲波
 *     → BiquadFilter (lowpass  20000 Hz) 截掉超音波
 *     → DynamicsCompressor                自動拉平音量差距
 *     → AudioContext.destination          輸出到耳機／喇叭
 */

(function () {
  'use strict';

  // 預設設定
  const DEFAULT_SETTINGS = {
    enabled: true,
    compressorPreset: 'standard', // 'light' | 'standard' | 'strong'
  };

  const COMPRESSOR_PRESETS = {
    light:    { threshold: -18, knee: 10, ratio: 3,  attack: 0.05, release: 0.25 },
    standard: { threshold: -24, knee: 10, ratio: 5,  attack: 0.05, release: 0.25 },
    strong:   { threshold: -30, knee: 10, ratio: 12, attack: 0.05, release: 0.25 },
  };

  let ctx = null;
  let sourceNode = null;
  let highpassNode = null;
  let lowpassNode = null;
  let compressorNode = null;
  let currentVideo = null;
  let enabled = DEFAULT_SETTINGS.enabled;
  let compressorPreset = DEFAULT_SETTINGS.compressorPreset;

  // 從 storage 讀取使用者設定
  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    enabled = settings.enabled;
    compressorPreset = settings.compressorPreset;
    attachToVideo();
  });

  // 監聽來自 popup 的指令
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SET_ENABLED') {
      enabled = msg.value;
      reconnect();
    }
    if (msg.type === 'SET_PRESET') {
      compressorPreset = msg.value;
      if (compressorNode) {
        applyPreset(compressorNode, COMPRESSOR_PRESETS[compressorPreset]);
      }
    }
  });

  function applyPreset(node, preset) {
    node.threshold.value = preset.threshold;
    node.knee.value      = preset.knee;
    node.ratio.value     = preset.ratio;
    node.attack.value    = preset.attack;
    node.release.value   = preset.release;
  }

  function buildChain(video) {
    if (!enabled) return;
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // 避免重複掛載同一個 video 元素
    if (sourceNode && currentVideo === video) return;

    // 如果已有舊鏈，先斷開
    teardown();

    try {
      sourceNode = ctx.createMediaElementSource(video);
    } catch (e) {
      // 某些瀏覽器對同一個 video 只允許建立一次 source
      console.warn('[AudioNorm] createMediaElementSource failed:', e);
      return;
    }

    // 高通：截掉 20Hz 以下
    highpassNode = ctx.createBiquadFilter();
    highpassNode.type = 'highpass';
    highpassNode.frequency.value = 20;

    // 低通：截掉 20kHz 以上
    lowpassNode = ctx.createBiquadFilter();
    lowpassNode.type = 'lowpass';
    lowpassNode.frequency.value = 20000;

    // 動態壓縮器：自動拉平音量
    compressorNode = ctx.createDynamicsCompressor();
    applyPreset(compressorNode, COMPRESSOR_PRESETS[compressorPreset]);

    // 串接節點
    sourceNode.connect(highpassNode);
    highpassNode.connect(lowpassNode);
    lowpassNode.connect(compressorNode);
    compressorNode.connect(ctx.destination);

    currentVideo = video;
    console.log('[AudioNorm] 音訊處理鏈已建立，preset:', compressorPreset);
  }

  function teardown() {
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch (_) {}
      sourceNode = null;
    }
    highpassNode = null;
    lowpassNode = null;
    compressorNode = null;
    currentVideo = null;
  }

  function reconnect() {
    teardown();
    if (enabled) {
      const video = document.querySelector('video');
      if (video) buildChain(video);
    }
  }

  function attachToVideo() {
    // 嘗試直接找已存在的 video 元素
    const video = document.querySelector('video');
    if (video) {
      buildChain(video);
      return;
    }

    // YouTube 是 SPA，video 元素可能稍後才出現，改用 MutationObserver 監聽
    const observer = new MutationObserver(() => {
      const v = document.querySelector('video');
      if (v) {
        observer.disconnect();
        buildChain(v);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // YouTube 切換影片時（SPA 導航）需要重新掛載
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      // 等 DOM 更新後再掛
      setTimeout(() => {
        teardown();
        attachToVideo();
      }, 800);
    }
  }, 500);
})();
