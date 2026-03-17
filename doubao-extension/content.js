// ================================================================
//  豆包无水印下载 — Content Script  v3.1.0
//
//  核心修正：
//    1. 用 imgId（rc_gen_image/ 后面的 hash）精确匹配，不再用 lastXxxUrl
//    2. ori URL 缓存用 imgId 做 key，find 时用 url.includes(imgId) 匹配
//    3. dld/pre URL 同样用 imgId 精确匹配，确保合并的是同一张图
//    4. 接收两种来源：postMessage（ori JSON）+ CustomEvent（dld/pre DOM/拦截）
// ================================================================

(function () {
  'use strict';

  // ──────────────────────────────────────────────
  //  注入 injected.js 到页面 main world
  // ──────────────────────────────────────────────
  (function injectMainWorldScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  })();

  // ──────────────────────────────────────────────
  //  全局 URL 缓存（与参考插件一致，用数组存所有捕获到的 URL）
  // ──────────────────────────────────────────────
  const oriUrls = [];   // image_ori_raw，无水印原图
  const dldUrls = [];   // dld_watermark，右下角有水印
  const preUrls = [];   // pre_watermark，左上角有水印

  // 等待者（picId → {resolve, reject, timer}）
  const oriWaiters = new Map();
  const dldWaiters = new Map();
  const preWaiters = new Map();

  // 当前预览图状态
  let currentImgId = null;  // 当前预览图的 imgId

  function log(...a) {
    console.log('%c[豆包无水印]', 'color:#6c63ff;font-weight:bold', ...a);
  }

  // ──────────────────────────────────────────────
  //  工具：提取 imgId（与参考插件保持一致）
  //  URL 示例：.../rc_gen_image/preview_d4d7b86096cb4deb.jpeg~tplv-...
  //  imgId  = d4d7b86096cb4deb（去掉 preview 前缀和扩展名后的 hash）
  // ──────────────────────────────────────────────
  function extractImgId(url) {
    if (!url) return null;
    try {
      const parts = url.split('/rc_gen_image/');
      if (parts.length < 2) return null;
      let filename = parts[1];
      // 去掉查询参数和波浪线后缀（如 ~tplv-...）
      filename = filename.split('~')[0].split('?')[0];
      // 去掉扩展名
      filename = filename.replace(/\.(jpeg|jpg|png|webp)$/i, '');
      // 去掉 preview 前缀（参考插件的做法）
      filename = filename.replace(/^preview_?/i, '');
      return filename || null;
    } catch (_) {
      return null;
    }
  }

  function isPre(url)   { return url && url.includes('pre_watermark') && !url.includes('downsize_watermark'); }
  function isDld(url)   { return url && url.includes('dld_watermark'); }

  // ──────────────────────────────────────────────
  //  保存 URL 到缓存，并通知等待者
  // ──────────────────────────────────────────────
  function cacheUrl(type, url) {
    if (!url) return;
    const imgId = extractImgId(url);

    if (type === 'ori') {
      if (!oriUrls.includes(url)) {
        oriUrls.push(url);
        log('🌟 ori 原图 id=' + (imgId ? imgId.slice(0, 8) : '?'));
        notifyWaiter(oriWaiters, imgId, url);
      }
    } else if (type === 'dld' && isDld(url)) {
      if (!dldUrls.includes(url)) {
        dldUrls.push(url);
        log('📥 dld id=' + (imgId ? imgId.slice(0, 8) : '?'));
        notifyWaiter(dldWaiters, imgId, url);
      }
    } else if (type === 'pre' && isPre(url)) {
      if (!preUrls.includes(url)) {
        preUrls.push(url);
        log('👁 pre id=' + (imgId ? imgId.slice(0, 8) : '?'));
        notifyWaiter(preWaiters, imgId, url);
      }
    }
  }

  function notifyWaiter(waiters, imgId, url) {
    // 精确 ID 匹配
    if (imgId && waiters.has(imgId)) {
      const w = waiters.get(imgId); waiters.delete(imgId);
      clearTimeout(w.timer); w.resolve(url); return;
    }
    // 宽松匹配（等待者用 __any__ key）
    if (waiters.has('__any__')) {
      const w = waiters.get('__any__'); waiters.delete('__any__');
      clearTimeout(w.timer); w.resolve(url);
    }
  }

  // ──────────────────────────────────────────────
  //  按 imgId 精确查找缓存 URL
  // ──────────────────────────────────────────────
  function findOriByImgId(imgId) {
    if (!imgId) return oriUrls[oriUrls.length - 1] || null;
    return oriUrls.find(u => u.includes(imgId)) || null;
  }

  function findDldByImgId(imgId) {
    if (!imgId) return dldUrls[dldUrls.length - 1] || null;
    return dldUrls.find(u => u.includes(imgId)) || null;
  }

  function findPreByImgId(imgId) {
    if (!imgId) return preUrls[preUrls.length - 1] || null;
    return preUrls.find(u => u.includes(imgId)) || null;
  }

  // ──────────────────────────────────────────────
  //  等待函数（超时后 reject）
  // ──────────────────────────────────────────────
  function waitFor(waiters, findFn, imgId, ms) {
    const cached = findFn(imgId);
    if (cached) return Promise.resolve(cached);
    const key = imgId || '__any__';
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(key); reject(new Error('timeout')); }, ms);
      waiters.set(key, { resolve, reject, timer });
    });
  }

  const waitForOri = (imgId, ms = 5000) => waitFor(oriWaiters, findOriByImgId, imgId, ms);
  const waitForDld = (imgId, ms = 10000) => waitFor(dldWaiters, findDldByImgId, imgId, ms);
  const waitForPre = (imgId, ms = 15000) => waitFor(preWaiters, findPreByImgId, imgId, ms);

  // ──────────────────────────────────────────────
  //  深度递归解析 JSON，收集所有 image_ori_raw.url
  // ──────────────────────────────────────────────
  function parseAndCacheApiResponse(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.hasOwnProperty('image_ori_raw')) {
      const rawUrl = obj.image_ori_raw?.url;
      if (rawUrl) cacheUrl('ori', rawUrl);
    }
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) parseAndCacheApiResponse(obj[key]);
    }
  }

  // ──────────────────────────────────────────────
  //  接收 injected.js 的两种消息
  // ──────────────────────────────────────────────

  // 来自 postMessage：完整 JSON 响应体（DOUBAO_API_RESPONSE）或直接 ori URL（DOUBAO_RAW_URL_FOUND）
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'DOUBAO_API_RESPONSE') {
      parseAndCacheApiResponse(event.data.payload);
    } else if (event.data.type === 'DOUBAO_RAW_URL_FOUND') {
      cacheUrl('ori', event.data.url);
    }
  });

  // 来自 CustomEvent：dld/pre URL（备用方案）
  window.addEventListener('__doubao_capture__', (e) => {
    const { type, url } = e.detail || {};
    if (type && url) cacheUrl(type, url);
  });

  // ──────────────────────────────────────────────
  //  从 DOM 读取当前预览图的 pre URL 和 imgId
  // ──────────────────────────────────────────────
  function getPreUrlFromDOM() {
    const img = document.querySelector('[data-testid="in_painting_picture"]');
    if (img?.src?.includes('byteimg') && isPre(img.src)) {
      cacheUrl('pre', img.src);
      return img.src;
    }
    const container = document.querySelector('[data-testid="canvas_image_container"]');
    if (container) {
      for (const i of container.querySelectorAll('img[src*="byteimg"]')) {
        if (!i.classList.contains('hidden') && isPre(i.src)) {
          cacheUrl('pre', i.src);
          return i.src;
        }
      }
    }
    return null;
  }

  function getCurrentImgId() {
    const src = getPreUrlFromDOM();
    return src ? extractImgId(src) : null;
  }

  // ──────────────────────────────────────────────
  //  触发豆包官方下载按钮（让页面发出 API 请求，暴露 ori/dld URL）
  // ──────────────────────────────────────────────
  function triggerOfficialDownload() {
    const btn = document.querySelector('[data-testid="edit_image_download_button"]');
    if (btn) {
      log('🖱 触发官方下载按钮');
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    }
    const fallback = [...document.querySelectorAll('div,span,button')]
      .find(el => el.textContent.trim() === '下载原图' && el.offsetParent);
    if (fallback) {
      log('🖱 备用选择器触发下载');
      fallback.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    }
    return false;
  }

  // ──────────────────────────────────────────────
  //  跨域图片加载 → 通过 background.js 代理
  // ──────────────────────────────────────────────
  function loadImg(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'FETCH_IMAGE', url }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error('图片获取失败: ' + (response?.error || 'unknown')));
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('图片解码失败'));
        img.src = response.dataUrl;
      });
    });
  }

  // ──────────────────────────────────────────────
  //  方案 A：直接下载 ori 无水印原图
  // ──────────────────────────────────────────────
  async function downloadOri(oriUrl, imgId) {
    showToast('⏳ 正在下载原图...');
    const filename = 'doubao_nowm_' + (imgId ? imgId.slice(0, 12) : Date.now()) + '.png';
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_URL', url: oriUrl, filename }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error(response?.error || '下载失败'));
        resolve();
      });
    });
    showToast('✅ 无水印原图下载成功！（直接原图，零损耗）');
    log('✅ 方案A 完成：ori 原图直接下载');
  }

  // ──────────────────────────────────────────────
  //  方案 B：Canvas 合并 dld 上半 + pre 下半
  // ──────────────────────────────────────────────
  async function mergeHalves(dldUrl, preUrl) {
    showToast('⏳ 正在加载图片...');
    log('方案B 合并：dld=', dldUrl.slice(0, 80));
    log('           pre=', preUrl.slice(0, 80));

    const [dldImg, preImg] = await Promise.all([loadImg(dldUrl), loadImg(preUrl)]);
    const W = dldImg.naturalWidth, H = dldImg.naturalHeight;
    if (!W || !H) throw new Error('图片尺寸为 0，URL 可能已过期');
    if (W < 128 || H < 128) throw new Error(`图片尺寸过小（${W}×${H}），请等图片加载完毕后重试`);

    const half = Math.floor(H / 2);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    // 上半取 dld（右下角水印在下半，上半干净）
    ctx.drawImage(dldImg, 0, 0,    W, half,     0, 0,    W, half);
    // 下半取 pre（左上角水印在上半，下半干净）
    ctx.drawImage(preImg, 0, half, W, H - half, 0, half, W, H - half);

    showToast('⏳ 正在生成图片...');
    return new Promise((res, rej) =>
      canvas.toBlob(b => b ? res(b) : rej(new Error('canvas.toBlob 失败')), 'image/png')
    );
  }

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 3000);
  }

  // ──────────────────────────────────────────────
  //  Toast 提示
  // ──────────────────────────────────────────────
  let _toast = null, _toastTm = null;
  function showToast(msg, dur = 4500) {
    if (!_toast) {
      _toast = document.createElement('div');
      _toast.style.cssText = [
        'position:fixed;bottom:88px;left:50%;transform:translateX(-50%)',
        'background:rgba(10,10,18,0.97);color:#fff',
        'border:1.5px solid #6c63ff;border-radius:999px',
        'padding:10px 28px;font-size:14px;font-weight:500',
        'z-index:2147483647;box-shadow:0 4px 24px rgba(108,99,255,.45)',
        'transition:opacity .3s;pointer-events:none;white-space:nowrap',
        "font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif",
      ].join(';');
      document.body.appendChild(_toast);
    }
    _toast.textContent = msg;
    _toast.style.opacity = '1';
    if (_toastTm) clearTimeout(_toastTm);
    _toastTm = setTimeout(() => { if (_toast) _toast.style.opacity = '0'; }, dur);
  }

  // ──────────────────────────────────────────────
  //  按钮样式
  // ──────────────────────────────────────────────
  function ensureSpinStyle() {
    if (document.getElementById('db-spin-kf')) return;
    const s = document.createElement('style');
    s.id = 'db-spin-kf';
    s.textContent = '@keyframes db-spin{to{transform:rotate(360deg)}}';
    (document.head || document.documentElement).appendChild(s);
  }

  const SVG_NOWM = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    <line x1="2" y1="2" x2="22" y2="22" stroke-width="2" stroke="rgba(255,255,255,0.6)"/>
  </svg>`;

  const SVG_SPIN = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
    style="flex-shrink:0;animation:db-spin .85s linear infinite">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>`;

  function setBusy(btn, msg) {
    btn.innerHTML = SVG_SPIN + '<span>' + msg + '</span>';
    btn.disabled = true; btn.style.opacity = '.72'; btn.style.cursor = 'default';
  }
  function setIdle(btn) {
    btn.innerHTML = SVG_NOWM + '<span>下载无水印</span>';
    btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
  }

  // ──────────────────────────────────────────────
  //  核心入口：点击「下载无水印」
  // ──────────────────────────────────────────────
  let nowmBtn = null;
  let isBusy = false;

  async function onNoWatermarkClick() {
    if (isBusy) return;
    isBusy = true;
    if (nowmBtn) setBusy(nowmBtn, '准备中...');

    try {
      // ── 获取当前图片的 imgId（从 DOM pre URL 提取）──
      const preFromDOM = getPreUrlFromDOM();
      const imgId = preFromDOM ? extractImgId(preFromDOM) : getCurrentImgId();

      if (!imgId) {
        showToast('⚠️ 未找到当前预览图，请先打开图片预览界面');
        return;
      }

      log('当前图片 imgId:', imgId.slice(0, 8));

      // ════════════════════════════════════════
      //  方案 A（优先）：ori 无水印原图
      //  用 imgId 精确匹配缓存
      // ════════════════════════════════════════
      let oriUrl = findOriByImgId(imgId);

      if (!oriUrl) {
        // 触发官方下载按钮，让豆包发出 API 请求（可能携带 image_ori_raw）
        showToast('⏳ 正在获取图片信息...');
        if (nowmBtn) setBusy(nowmBtn, '获取中...');
        triggerOfficialDownload();

        // 等待最多 5 秒，用 imgId 精确匹配
        try {
          oriUrl = await waitForOri(imgId, 5000);
        } catch (_) {
          oriUrl = null;
        }
      }

      if (oriUrl) {
        if (nowmBtn) setBusy(nowmBtn, '下载中...');
        await downloadOri(oriUrl, imgId);
        return;
      }

      // ════════════════════════════════════════
      //  方案 B（备用）：dld + pre 拼合
      //  必须确保 dld 和 pre 是同一张图的
      // ════════════════════════════════════════
      log('⚠️ 未捕获到 ori，切换备用方案（dld+pre 拼合）');
      showToast('⏳ 切换备用方案...');

      // pre URL（优先从 DOM 取，已经是当前图的）
      let preUrl = preFromDOM || findPreByImgId(imgId);

      if (!preUrl) {
        showToast('⏳ 等待预览图加载...');
        if (nowmBtn) setBusy(nowmBtn, '等待图片...');
        try {
          preUrl = await waitForPre(imgId, 15000);
        } catch (_) {
          showToast('⚠️ 图片加载超时，请等图片完全加载后再试');
          return;
        }
      }

      // dld URL（用同一个 imgId 精确匹配）
      let dldUrl = findDldByImgId(imgId);

      if (!dldUrl) {
        showToast('⏳ 等待下载链接...');
        if (nowmBtn) setBusy(nowmBtn, '捕获中...');
        // 确保触发了官方下载按钮
        triggerOfficialDownload();
        try {
          dldUrl = await waitForDld(imgId, 10000);
        } catch (_) {
          showToast('❌ 未能捕获下载链接，请稍后重试\n提示：点击豆包页面上的「下载原图」按钮后再试');
          return;
        }
      }

      // 合并
      if (nowmBtn) setBusy(nowmBtn, '合并中...');
      showToast('⏳ 正在合并图片...');
      const blob = await mergeHalves(dldUrl, preUrl);
      saveBlob(blob, 'doubao_nowm_' + imgId.slice(0, 12) + '.png');
      showToast('✅ 无水印图片下载成功！（拼合方案）');
      log('✅ 方案B 完成');

    } catch (e) {
      log('❌', e);
      showToast('❌ 失败：' + e.message);
    } finally {
      isBusy = false;
      if (nowmBtn) setIdle(nowmBtn);
    }
  }

  // ──────────────────────────────────────────────
  //  注入 / 移除按钮
  // ──────────────────────────────────────────────
  function injectBtn() {
    ensureSpinStyle();
    if (nowmBtn) return;
    nowmBtn = document.createElement('button');
    nowmBtn.innerHTML = SVG_NOWM + '<span>下载无水印</span>';
    nowmBtn.style.cssText = [
      'position:fixed;bottom:32px;right:32px',
      'display:flex;align-items:center;gap:7px',
      'padding:10px 20px',
      'background:linear-gradient(135deg,#6c63ff,#4e46e5);color:#fff',
      'border:none;border-radius:999px',
      'font-size:14px;font-weight:600;cursor:pointer',
      'z-index:2147483646;box-shadow:0 4px 20px rgba(108,99,255,.45)',
      'transition:filter .15s,transform .15s,opacity .15s',
      'user-select:none;letter-spacing:.3px',
      "font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif",
    ].join(';');
    nowmBtn.onmouseenter = () => { if (!nowmBtn.disabled) { nowmBtn.style.filter = 'brightness(1.18)'; nowmBtn.style.transform = 'translateY(-1px)'; } };
    nowmBtn.onmouseleave = () => { nowmBtn.style.filter = ''; nowmBtn.style.transform = ''; };
    nowmBtn.addEventListener('click', onNoWatermarkClick);
    document.body.appendChild(nowmBtn);
    log('✅ 按钮已注入');
  }

  function removeBtn() {
    if (nowmBtn) { nowmBtn.remove(); nowmBtn = null; }
  }

  // ──────────────────────────────────────────────
  //  判断是否在图片预览面板
  // ──────────────────────────────────────────────
  function isInPanel() {
    return !!(
      document.querySelector('[data-testid="canvas_panel_container"]') ||
      document.querySelector('[data-testid="canvas_image_container"]') ||
      document.querySelector('[data-testid="in_painting_picture"]')
    );
  }

  // ──────────────────────────────────────────────
  //  MutationObserver：面板变化时注入/移除按钮
  // ──────────────────────────────────────────────
  let _tm = null;
  function scheduleCheck() {
    if (_tm) return;
    _tm = setTimeout(() => {
      _tm = null;
      // 主动读一次 DOM，缓存当前 pre URL
      getPreUrlFromDOM();
      if (isInPanel()) injectBtn();
      else removeBtn();
    }, 350);
  }

  new MutationObserver(scheduleCheck)
    .observe(document.documentElement, { childList: true, subtree: true });

  if (document.body) scheduleCheck();
  else document.addEventListener('DOMContentLoaded', scheduleCheck);

  // ──────────────────────────────────────────────
  //  响应 popup 的统计查询
  // ──────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_STATS') {
      sendResponse({ ori: oriUrls.length, dld: dldUrls.length, pre: preUrls.length });
    }
    return false;
  });

  log('🚀 豆包无水印下载 v3.1.0 已加载 | 精确 ID 匹配，杜绝串图');
})();
