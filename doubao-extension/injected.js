// ================================================================
//  豆包无水印下载 — Injected Script（运行在页面 main 世界）v3.1.0
//
//  核心修正：
//    1. 只监控 /im/ 和 /api/ 路径，避免误捕头像等无关请求
//    2. 同时用两种方式传递数据给 content.js：
//       - 正则嗅探到 image_ori_raw → postMessage DOUBAO_RAW_URL_FOUND
//       - JSON 解析成功 → postMessage DOUBAO_API_RESPONSE（供递归遍历）
//       - 同时也继续支持 dld/pre URL 的 CustomEvent（备用方案）
// ================================================================
(function () {
  'use strict';

  // ── 正则嗅探：从文本中提取 image_ori_raw.url ──
  function sniffOriUrl(text) {
    if (!text || typeof text !== 'string') return;
    const regex = /"image_ori_raw"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const url = m[1].replace(/\\\//g, '/');
      window.postMessage({ type: 'DOUBAO_RAW_URL_FOUND', url }, '*');
    }
  }

  // ── 同时扫描 dld/pre URL（备用方案用）──
  function sniffWatermarkUrls(text) {
    if (!text || typeof text !== 'string') return;
    const re = /https:\/\/[^\s"'\\<>]+(dld_watermark|pre_watermark)[^\s"'\\<>]*/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const url = m[0].replace(/\\u003d/gi, '=').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
      const type = url.includes('dld_watermark') ? 'dld' : 'pre';
      window.dispatchEvent(new CustomEvent('__doubao_capture__', { detail: { type, url } }));
    }
  }

  function sniffText(text) {
    sniffOriUrl(text);
    sniffWatermarkUrls(text);
  }

  // ── 只监控豆包 API 接口，过滤掉头像/埋点等无关请求 ──
  function isApiUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return url.includes('/im/') || url.includes('/api/');
  }

  // ── 拦截 fetch ──
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const resource = args[0];
    const urlStr = typeof resource === 'string' ? resource : (resource?.url || '');
    const response = await _fetch.apply(this, args);

    if (isApiUrl(urlStr)) {
      const clone = response.clone();

      // 方式 A：尝试作为普通 JSON 读取（历史记录接口）
      clone.json().then(data => {
        // 把完整 JSON 对象发给 content.js 做深度递归遍历
        window.postMessage({ type: 'DOUBAO_API_RESPONSE', payload: data }, '*');
      }).catch(async () => {
        // 方式 B：JSON 解析失败，说明是流式 SSE 数据，逐 chunk 嗅探（新建生成接口）
        try {
          const streamClone = response.clone();
          const reader = streamClone.body.getReader();
          const decoder = new TextDecoder('utf-8');
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            sniffText(decoder.decode(value, { stream: true }));
          }
        } catch (_) {}
      });
    }

    return response;
  };

  // ── 拦截 XHR（兜底）──
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    this.addEventListener('load', function () {
      try {
        if (!this.responseText) return;
        // 尝试整体 JSON 解析
        try {
          const data = JSON.parse(this.responseText);
          window.postMessage({ type: 'DOUBAO_API_RESPONSE', payload: data }, '*');
        } catch (_) {}
        // 正则嗅探兜底
        sniffText(this.responseText);
      } catch (_) {}
    });
    return _send.apply(this, arguments);
  };

  // ── MutationObserver：扫描 DOM img src 变化（pre URL 补充来源）──
  const _obs = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        const imgs = node.tagName === 'IMG'
          ? [node]
          : [...node.querySelectorAll('img[src*="byteimg"]')];
        for (const img of imgs) {
          const src = img.src;
          if (!src) continue;
          if (src.includes('pre_watermark') && !src.includes('downsize_watermark')) {
            window.dispatchEvent(new CustomEvent('__doubao_capture__', { detail: { type: 'pre', url: src } }));
          } else if (src.includes('dld_watermark')) {
            window.dispatchEvent(new CustomEvent('__doubao_capture__', { detail: { type: 'dld', url: src } }));
          }
        }
      }
      if (mut.type === 'attributes' && mut.attributeName === 'src' && mut.target.tagName === 'IMG') {
        const src = mut.target.src;
        if (!src) continue;
        if (src.includes('pre_watermark') && !src.includes('downsize_watermark')) {
          window.dispatchEvent(new CustomEvent('__doubao_capture__', { detail: { type: 'pre', url: src } }));
        } else if (src.includes('dld_watermark')) {
          window.dispatchEvent(new CustomEvent('__doubao_capture__', { detail: { type: 'dld', url: src } }));
        }
      }
    }
  });
  _obs.observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['src']
  });

  console.log('%c[豆包无水印] v3.1.0 injected.js 就位 | 监控 /im/ /api/ 路径', 'color:#6c63ff;font-weight:bold');
})();
