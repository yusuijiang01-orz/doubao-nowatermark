// ================================================================
//  豆包无水印下载 — Content Script  v4.0.0
//
//  新功能：
//    1. 批量下载：扫描页面所有生成图片，一键全部保存
//    2. 格式选择：PNG（无损）/ JPEG（可调质量 0.6~1.0）
//    3. 智能命名：doubao_对话标题_序号_时间戳.扩展名
//    4. 格式偏好持久化（chrome.storage.local）
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
  //  全局 URL 缓存
  // ──────────────────────────────────────────────
  const oriUrls = [];
  const dldUrls = [];
  const preUrls = [];

  const oriWaiters = new Map();
  const dldWaiters = new Map();
  const preWaiters = new Map();

  function log(...a) {
    console.log('%c[豆包无水印]', 'color:#6c63ff;font-weight:bold', ...a);
  }

  // ──────────────────────────────────────────────
  //  格式偏好（默认 PNG，质量 0.92）
  // ──────────────────────────────────────────────
  let _fmt  = 'png';   // 'png' | 'jpeg'
  let _qual = 0.92;    // jpeg 质量

  chrome.storage.local.get(['db_fmt', 'db_qual'], (res) => {
    if (res.db_fmt)  _fmt  = res.db_fmt;
    if (res.db_qual) _qual = res.db_qual;
  });

  function saveFmt(fmt, qual) {
    _fmt = fmt; _qual = qual;
    chrome.storage.local.set({ db_fmt: fmt, db_qual: qual });
  }

  // ──────────────────────────────────────────────
  //  工具：提取 imgId
  // ──────────────────────────────────────────────
  function extractImgId(url) {
    if (!url) return null;
    try {
      const parts = url.split('/rc_gen_image/');
      if (parts.length < 2) return null;
      let filename = parts[1].split('~')[0].split('?')[0];
      filename = filename.replace(/\.(jpeg|jpg|png|webp)$/i, '');
      filename = filename.replace(/^preview_?/i, '');
      return filename || null;
    } catch (_) { return null; }
  }

  function isPre(url) { return url && url.includes('pre_watermark') && !url.includes('downsize_watermark'); }
  function isDld(url) { return url && url.includes('dld_watermark'); }

  // ──────────────────────────────────────────────
  //  智能文件名
  //  格式：doubao_<对话标题>_<序号>_<时间戳>.<ext>
  // ──────────────────────────────────────────────
  function buildFilename(imgId, index, ext) {
    // 尝试读取对话标题
    const titleEl = document.querySelector(
      '[data-testid="conversation_title"], .conversation-title, h1[class*="title"]'
    );
    let title = titleEl ? titleEl.textContent.trim() : '';
    // 去掉特殊字符，保留中英文数字
    title = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 20);

    const ts   = new Date().toISOString().slice(0,19).replace(/[-:T]/g, '').slice(2); // yymmddHHMMSS
    const seq  = index !== undefined ? ('_' + String(index + 1).padStart(2, '0')) : '';
    const id   = imgId ? imgId.slice(0, 8) : ts;
    const name = title ? `doubao_${title}${seq}_${id}` : `doubao${seq}_${id}`;
    return name + '.' + ext;
  }

  // ──────────────────────────────────────────────
  //  缓存 URL & 通知等待者
  // ──────────────────────────────────────────────
  function cacheUrl(type, url) {
    if (!url) return;
    const imgId = extractImgId(url);
    if (type === 'ori') {
      if (!oriUrls.includes(url)) {
        oriUrls.push(url);
        log('🌟 ori id=' + (imgId ? imgId.slice(0,8) : '?'));
        notifyWaiter(oriWaiters, imgId, url);
      }
    } else if (type === 'dld' && isDld(url)) {
      if (!dldUrls.includes(url)) {
        dldUrls.push(url);
        log('📥 dld id=' + (imgId ? imgId.slice(0,8) : '?'));
        notifyWaiter(dldWaiters, imgId, url);
      }
    } else if (type === 'pre' && isPre(url)) {
      if (!preUrls.includes(url)) {
        preUrls.push(url);
        log('👁 pre id=' + (imgId ? imgId.slice(0,8) : '?'));
        notifyWaiter(preWaiters, imgId, url);
      }
    }
  }

  function notifyWaiter(waiters, imgId, url) {
    if (imgId && waiters.has(imgId)) {
      const w = waiters.get(imgId); waiters.delete(imgId);
      clearTimeout(w.timer); w.resolve(url); return;
    }
    if (waiters.has('__any__')) {
      const w = waiters.get('__any__'); waiters.delete('__any__');
      clearTimeout(w.timer); w.resolve(url);
    }
  }

  function findOriByImgId(imgId) { return imgId ? oriUrls.find(u => u.includes(imgId)) || null : oriUrls[oriUrls.length-1] || null; }
  function findDldByImgId(imgId) { return imgId ? dldUrls.find(u => u.includes(imgId)) || null : dldUrls[dldUrls.length-1] || null; }
  function findPreByImgId(imgId) { return imgId ? preUrls.find(u => u.includes(imgId)) || null : preUrls[preUrls.length-1] || null; }

  function waitFor(waiters, findFn, imgId, ms) {
    const cached = findFn(imgId);
    if (cached) return Promise.resolve(cached);
    const key = imgId || '__any__';
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(key); reject(new Error('timeout')); }, ms);
      waiters.set(key, { resolve, reject, timer });
    });
  }

  const waitForOri = (id, ms=5000)  => waitFor(oriWaiters, findOriByImgId, id, ms);
  const waitForDld = (id, ms=10000) => waitFor(dldWaiters, findDldByImgId, id, ms);
  const waitForPre = (id, ms=15000) => waitFor(preWaiters, findPreByImgId, id, ms);

  // ──────────────────────────────────────────────
  //  接收 injected.js 消息
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

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'DOUBAO_API_RESPONSE')  parseAndCacheApiResponse(event.data.payload);
    else if (event.data.type === 'DOUBAO_RAW_URL_FOUND') cacheUrl('ori', event.data.url);
  });

  window.addEventListener('__doubao_capture__', (e) => {
    const { type, url } = e.detail || {};
    if (type && url) cacheUrl(type, url);
  });

  // ──────────────────────────────────────────────
  //  DOM 读取当前预览图
  // ──────────────────────────────────────────────
  function getPreUrlFromDOM() {
    const img = document.querySelector('[data-testid="in_painting_picture"]');
    if (img?.src?.includes('byteimg') && isPre(img.src)) { cacheUrl('pre', img.src); return img.src; }
    const container = document.querySelector('[data-testid="canvas_image_container"]');
    if (container) {
      for (const i of container.querySelectorAll('img[src*="byteimg"]')) {
        if (!i.classList.contains('hidden') && isPre(i.src)) { cacheUrl('pre', i.src); return i.src; }
      }
    }
    return null;
  }

  function getCurrentImgId() {
    const src = getPreUrlFromDOM();
    return src ? extractImgId(src) : null;
  }

  // ──────────────────────────────────────────────
  //  扫描页面所有生成图（批量用）
  //
  //  修复：豆包页面上的缩略图几乎全是 downsize_watermark，
  //  不是 pre_watermark，所以不能用 isPre() 过滤。
  //  改为：只要 src 包含 rc_gen_image 就提取 imgId，
  //  同时把 pre_watermark / dld_watermark URL 顺便缓存进去。
  //  返回 [{imgId, preUrl, el}]
  // ──────────────────────────────────────────────
  function scanAllGeneratedImages() {
    const result = [];
    const seen   = new Set();

    document.querySelectorAll('img[src*="rc_gen_image"]').forEach(img => {
      const src   = img.src;
      if (!src) return;
      const imgId = extractImgId(src);
      if (!imgId || seen.has(imgId)) return;
      seen.add(imgId);

      // 顺便把 pre / dld 缓存起来
      if (isPre(src)) cacheUrl('pre', src);
      else if (isDld(src)) cacheUrl('dld', src);

      // preUrl hint：优先取已缓存的 pre，没有就传 null（downloadOne 会自己等）
      const preUrl = findPreByImgId(imgId);
      result.push({ imgId, preUrl, el: img });
    });

    // 补充：也扫 oriUrls 缓存里有但 DOM 里没有的 imgId（防止漏扫）
    oriUrls.forEach(url => {
      const imgId = extractImgId(url);
      if (imgId && !seen.has(imgId)) {
        seen.add(imgId);
        result.push({ imgId, preUrl: findPreByImgId(imgId), el: null });
      }
    });

    log(`📋 扫描到 ${result.length} 张生成图（DOM+缓存）`);
    return result;
  }

  // ──────────────────────────────────────────────
  //  触发官方下载按钮
  // ──────────────────────────────────────────────
  function triggerOfficialDownload() {
    const btn = document.querySelector('[data-testid="edit_image_download_button"]');
    if (btn) { btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
    const fallback = [...document.querySelectorAll('div,span,button')]
      .find(el => el.textContent.trim() === '下载原图' && el.offsetParent);
    if (fallback) { fallback.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
    return false;
  }

  // ──────────────────────────────────────────────
  //  跨域图片代理
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
  //  Canvas 合并（方案B）
  // ──────────────────────────────────────────────
  async function mergeHalves(dldUrl, preUrl) {
    const [dldImg, preImg] = await Promise.all([loadImg(dldUrl), loadImg(preUrl)]);
    const W = dldImg.naturalWidth, H = dldImg.naturalHeight;
    if (!W || !H) throw new Error('图片尺寸为 0，URL 可能已过期');
    if (W < 128 || H < 128) throw new Error(`图片尺寸过小（${W}×${H}）`);
    const half = Math.floor(H / 2);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(dldImg, 0, 0,    W, half,     0, 0,    W, half);
    ctx.drawImage(preImg, 0, half, W, H - half, 0, half, W, H - half);
    const mimeType = _fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality  = _fmt === 'jpeg' ? _qual : undefined;
    return new Promise((res, rej) =>
      canvas.toBlob(b => b ? res(b) : rej(new Error('canvas.toBlob 失败')), mimeType, quality)
    );
  }

  // ──────────────────────────────────────────────
  //  保存 Blob（通过 background 代理，绕过 CSP）
  //  返回 Promise，确保调用方可以 await
  // ──────────────────────────────────────────────
  function saveBlob(blob, filename) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        chrome.runtime.sendMessage(
          { type: 'DOWNLOAD_BLOB', dataUrl: reader.result, filename },
          (response) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (!response?.ok) {
              return reject(new Error(response?.error || 'DOWNLOAD_BLOB 失败'));
            }
            resolve();
          }
        );
      };
      reader.onerror = () => reject(new Error('FileReader 读取失败'));
      reader.readAsDataURL(blob);
    });
  }

  // ──────────────────────────────────────────────
  //  方案 A：下载 ori 原图（经 Canvas 导出，保证格式生效）
  //  - PNG：直接用 DOWNLOAD_URL 下载远端 URL（无损，速度快）
  //  - JPEG：先把图片拉到 Canvas，再以 image/jpeg 导出 Blob 保存
  // ──────────────────────────────────────────────
  async function downloadOri(oriUrl, imgId, index) {
    const ext      = _fmt === 'jpeg' ? 'jpg' : 'png';
    const filename = buildFilename(imgId, index, ext);

    if (_fmt === 'png') {
      // PNG 直接下载原始 URL，零损耗
      showToast('⏳ 正在下载原图 (PNG)...');
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'DOWNLOAD_URL', url: oriUrl, filename }, response => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!response?.ok) return reject(new Error(response?.error || '下载失败'));
          resolve();
        });
      });
    } else {
      // JPEG：拉到 Canvas 再导出，质量 = _qual
      showToast('⏳ 正在转换为 JPEG...');
      const img = await loadImg(oriUrl);
      const W = img.naturalWidth, H = img.naturalHeight;
      if (!W || !H) throw new Error('原图尺寸为 0，URL 可能已过期');
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const blob = await new Promise((res, rej) =>
        canvas.toBlob(b => b ? res(b) : rej(new Error('canvas.toBlob 失败')), 'image/jpeg', _qual)
      );
      await saveBlob(blob, filename);
    }

    showToast('✅ 原图下载成功！' + filename);
    log('✅ 方案A:', filename, `格式=${_fmt} 质量=${_fmt==='jpeg'?Math.round(_qual*100)+'%':'无损'}`);
  }

  // ──────────────────────────────────────────────
  //  单张下载核心逻辑
  // ──────────────────────────────────────────────
  async function downloadOne(imgId, preUrlHint, index, totalHint) {
    const prefix = totalHint > 1 ? `[${index+1}/${totalHint}] ` : '';

    // ── 方案 A ──
    let oriUrl = findOriByImgId(imgId);
    if (!oriUrl) {
      showToast(prefix + '⏳ 获取原图中...');
      triggerOfficialDownload();
      try { oriUrl = await waitForOri(imgId, 5000); } catch (_) { oriUrl = null; }
    }
    if (oriUrl) { await downloadOri(oriUrl, imgId, index); return; }

    // ── 方案 B ──
    log('⚠️ ori 未捕获，切换方案B');
    showToast(prefix + '⏳ 切换备用方案...');

    let preUrl = preUrlHint || findPreByImgId(imgId);
    if (!preUrl) {
      try { preUrl = await waitForPre(imgId, 15000); } catch (_) {
        throw new Error('预览图加载超时，请等图片完全加载后重试');
      }
    }

    let dldUrl = findDldByImgId(imgId);
    if (!dldUrl) {
      triggerOfficialDownload();
      try { dldUrl = await waitForDld(imgId, 10000); } catch (_) {
        throw new Error('未能捕获下载链接，请点击豆包「下载原图」按钮后重试');
      }
    }

    showToast(prefix + '⏳ 合并图片...');
    const ext      = _fmt === 'jpeg' ? 'jpg' : 'png';
    const filename = buildFilename(imgId, index, ext);
    const blob = await mergeHalves(dldUrl, preUrl);
    await saveBlob(blob, filename);
    showToast(prefix + '✅ 拼合完成！' + filename);
    log('✅ 方案B:', filename);
  }

  // ──────────────────────────────────────────────
  //  批量下载 — 勾选面板
  // ──────────────────────────────────────────────
  let isBatchRunning = false;
  let batchPanel = null;

  function showBatchPanel(images) {
    // 已有面板则移除
    if (batchPanel) { batchPanel.remove(); batchPanel = null; }

    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed;inset:0',
      'background:rgba(0,0,0,0.65)',
      'z-index:2147483646',
      'display:flex;align-items:center;justify-content:center',
      "font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif",
    ].join(';');
    batchPanel = overlay;

    // ── 面板主体 ──
    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:#12122a;border:1.5px solid #6c63ff',
      'border-radius:18px;padding:20px 22px 18px',
      'width:min(640px,90vw);max-height:80vh',
      'display:flex;flex-direction:column;gap:14px',
      'box-shadow:0 16px 48px rgba(108,99,255,.45)',
      'color:#fff',
    ].join(';');

    // 标题行
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
    header.innerHTML = `
      <div style="font-size:15px;font-weight:700;color:#a78bfa">
        📦 选择要下载的图片
        <span style="font-size:12px;font-weight:400;color:#555577;margin-left:8px">
          共检测到 ${images.length} 张
        </span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button id="bp-selall"  style="${smallBtnStyle('#6c63ff')}">全选</button>
        <button id="bp-selnone" style="${smallBtnStyle('#333355')}">全不选</button>
        <button id="bp-close"   style="${smallBtnStyle('#333355')}">✕ 关闭</button>
      </div>
    `;

    // 格式提示
    const fmtTip = document.createElement('div');
    fmtTip.style.cssText = 'font-size:11px;color:#555577;margin-top:-6px';
    fmtTip.textContent = `当前格式：${_fmt === 'jpeg' ? 'JPEG 质量 ' + Math.round(_qual * 100) + '%' : 'PNG 无损'}（可点右下角 ⚙ 修改）`;

    // 缩略图网格
    const grid = document.createElement('div');
    grid.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(auto-fill,minmax(120px,1fr))',
      'gap:10px;overflow-y:auto;max-height:calc(80vh - 160px)',
      'padding:2px 2px 4px',
    ].join(';');

    const checkboxes = []; // [{cb, imgId, preUrl}]

    images.forEach((item, i) => {
      const { imgId, el } = item;
      const thumbSrc = el?.src || '';

      const card = document.createElement('label');
      card.style.cssText = [
        'position:relative;cursor:pointer;display:block',
        'border-radius:10px;overflow:hidden',
        'border:2px solid transparent',
        'transition:border-color .15s',
      ].join(';');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.style.cssText = 'position:absolute;top:6px;left:6px;width:16px;height:16px;cursor:pointer;z-index:1;accent-color:#6c63ff';

      const thumb = document.createElement('img');
      thumb.style.cssText = 'width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:#1a1a2e';
      if (thumbSrc) thumb.src = thumbSrc;
      thumb.onerror = () => { thumb.style.background = '#1a1a2e'; };

      const label = document.createElement('div');
      label.style.cssText = 'font-size:10px;color:#888899;text-align:center;padding:4px 2px;background:#0d0d1e';
      label.textContent = `#${i + 1} ${imgId ? imgId.slice(0, 6) + '…' : '未知'}`;

      card.appendChild(cb);
      card.appendChild(thumb);
      card.appendChild(label);

      // 选中高亮
      const updateBorder = () => {
        card.style.borderColor = cb.checked ? '#6c63ff' : 'transparent';
      };
      updateBorder();
      cb.addEventListener('change', updateBorder);

      grid.appendChild(card);
      checkboxes.push({ cb, imgId: item.imgId, preUrl: item.preUrl });
    });

    // 底部操作栏
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding-top:4px;border-top:1px solid #1e1e3a';

    const countTip = document.createElement('span');
    countTip.style.cssText = 'font-size:12px;color:#888899';
    const updateCount = () => {
      const n = checkboxes.filter(c => c.cb.checked).length;
      countTip.textContent = `已选 ${n} / ${images.length} 张`;
    };
    updateCount();
    checkboxes.forEach(c => c.cb.addEventListener('change', updateCount));

    const dlBtn = document.createElement('button');
    dlBtn.style.cssText = [
      'padding:9px 28px;border-radius:999px;border:none;cursor:pointer',
      'background:linear-gradient(135deg,#6c63ff,#4e46e5);color:#fff',
      'font-size:13px;font-weight:700;letter-spacing:.3px',
      'box-shadow:0 4px 16px rgba(108,99,255,.4)',
      'transition:filter .15s',
    ].join(';');
    dlBtn.textContent = '开始下载';
    dlBtn.onmouseenter = () => dlBtn.style.filter = 'brightness(1.15)';
    dlBtn.onmouseleave = () => dlBtn.style.filter = '';

    footer.appendChild(countTip);
    footer.appendChild(dlBtn);

    panel.appendChild(header);
    panel.appendChild(fmtTip);
    panel.appendChild(grid);
    panel.appendChild(footer);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // ── 事件绑定 ──
    panel.querySelector('#bp-selall').addEventListener('click', () => {
      checkboxes.forEach(c => { c.cb.checked = true; c.cb.dispatchEvent(new Event('change')); });
    });
    panel.querySelector('#bp-selnone').addEventListener('click', () => {
      checkboxes.forEach(c => { c.cb.checked = false; c.cb.dispatchEvent(new Event('change')); });
    });
    panel.querySelector('#bp-close').addEventListener('click', () => {
      overlay.remove(); batchPanel = null;
    });
    // 点遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); batchPanel = null; }
    });

    dlBtn.addEventListener('click', async () => {
      const selected = checkboxes.filter(c => c.cb.checked);
      if (selected.length === 0) { showToast('⚠️ 请先勾选至少一张图片'); return; }
      overlay.remove(); batchPanel = null;
      await runBatchDownload(selected);
    });
  }

  function smallBtnStyle(bg) {
    return [
      `background:${bg};color:#fff;border:none`,
      'padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer',
      'transition:filter .15s',
    ].join(';');
  }

  // 实际执行下载
  async function runBatchDownload(selected) {
    if (isBatchRunning) { showToast('⏳ 批量下载进行中，请等待...'); return; }
    isBatchRunning = true;
    setBatchBusy(true, `0/${selected.length}`);
    showToast(`📦 开始下载，共 ${selected.length} 张...`);
    let ok = 0, fail = 0;
    for (let i = 0; i < selected.length; i++) {
      const { imgId, preUrl } = selected[i];
      setBatchBusy(true, `${i + 1}/${selected.length}`);
      try {
        await downloadOne(imgId, preUrl, i, selected.length);
        ok++;
        await sleep(600);
      } catch (e) {
        fail++;
        log(`❌ 第${i + 1}张失败:`, e.message);
        showToast(`❌ 第${i + 1}张失败：${e.message}`);
        await sleep(800);
      }
    }
    isBatchRunning = false;
    setBatchBusy(false);
    showToast(`✅ 下载完成：成功 ${ok} 张${fail ? `，失败 ${fail} 张` : ''}`);
  }

  // 入口：扫描 → 弹面板
  async function downloadAll() {
    if (isBatchRunning) { showToast('⏳ 批量下载进行中，请等待...'); return; }
    if (batchPanel) { batchPanel.remove(); batchPanel = null; return; } // 再次点击收起
    const images = scanAllGeneratedImages();
    if (images.length === 0) {
      showToast('⚠️ 未找到生成图片，请确认页面已完全加载');
      return;
    }
    showBatchPanel(images);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ──────────────────────────────────────────────
  //  单张下载入口（悬浮按钮点击）
  // ──────────────────────────────────────────────
  let nowmBtn   = null;
  let batchBtn  = null;
  let isBusy    = false;

  async function onNoWatermarkClick() {
    if (isBusy) return;
    isBusy = true;
    if (nowmBtn) setBusy(nowmBtn, '准备中...');
    try {
      const preFromDOM = getPreUrlFromDOM();
      const imgId = preFromDOM ? extractImgId(preFromDOM) : getCurrentImgId();
      if (!imgId) { showToast('⚠️ 未找到当前预览图，请先打开图片预览'); return; }
      await downloadOne(imgId, preFromDOM, undefined, 1);
    } catch (e) {
      log('❌', e);
      showToast('❌ 失败：' + e.message);
    } finally {
      isBusy = false;
      if (nowmBtn) setIdle(nowmBtn);
    }
  }

  // ──────────────────────────────────────────────
  //  格式选择浮层
  // ──────────────────────────────────────────────
  let fmtPanel = null;

  function showFmtPanel() {
    if (fmtPanel) { fmtPanel.remove(); fmtPanel = null; return; }
    fmtPanel = document.createElement('div');
    fmtPanel.style.cssText = [
      'position:fixed;bottom:90px;right:32px',
      'background:#1a1a2e;border:1.5px solid #6c63ff',
      'border-radius:14px;padding:14px 16px;z-index:2147483646',
      'box-shadow:0 8px 32px rgba(108,99,255,.35)',
      'min-width:220px',
      "font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif",
    ].join(';');

    fmtPanel.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:#a78bfa;margin-bottom:10px;letter-spacing:.5px">下载设置</div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button id="fmt-png" style="${fmtBtnStyle(_fmt==='png')}">PNG 无损</button>
        <button id="fmt-jpg" style="${fmtBtnStyle(_fmt==='jpeg')}">JPEG 有损</button>
      </div>
      <div id="qual-row" style="display:${_fmt==='jpeg'?'block':'none'}">
        <div style="font-size:11px;color:#888899;margin-bottom:6px">
          质量：<span id="qual-val">${Math.round(_qual*100)}%</span>
        </div>
        <input id="qual-slider" type="range" min="60" max="100" value="${Math.round(_qual*100)}"
          style="width:100%;accent-color:#6c63ff;cursor:pointer">
      </div>
      <div style="font-size:10px;color:#555577;margin-top:10px;line-height:1.5">
        PNG：无损，文件较大<br>JPEG：文件小，质量可调
      </div>
    `;

    document.body.appendChild(fmtPanel);

    const pngBtn    = fmtPanel.querySelector('#fmt-png');
    const jpgBtn    = fmtPanel.querySelector('#fmt-jpg');
    const qualRow   = fmtPanel.querySelector('#qual-row');
    const qualSlider = fmtPanel.querySelector('#qual-slider');
    const qualVal   = fmtPanel.querySelector('#qual-val');

    pngBtn.addEventListener('click', () => {
      saveFmt('png', _qual);
      pngBtn.style.cssText = fmtBtnStyle(true);
      jpgBtn.style.cssText = fmtBtnStyle(false);
      qualRow.style.display = 'none';
      showToast('✅ 格式已设为 PNG（无损）');
    });
    jpgBtn.addEventListener('click', () => {
      saveFmt('jpeg', _qual);
      pngBtn.style.cssText = fmtBtnStyle(false);
      jpgBtn.style.cssText = fmtBtnStyle(true);
      qualRow.style.display = 'block';
      showToast('✅ 格式已设为 JPEG（质量 ' + Math.round(_qual*100) + '%）');
    });
    qualSlider.addEventListener('input', () => {
      const v = parseInt(qualSlider.value) / 100;
      saveFmt('jpeg', v);
      qualVal.textContent = Math.round(v*100) + '%';
    });

    // 点击外部关闭
    setTimeout(() => {
      document.addEventListener('click', function closeFmt(e) {
        if (fmtPanel && !fmtPanel.contains(e.target) && e.target !== fmtBtn) {
          fmtPanel.remove(); fmtPanel = null;
          document.removeEventListener('click', closeFmt);
        }
      });
    }, 50);
  }

  function fmtBtnStyle(active) {
    return [
      'flex:1;padding:6px 0;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:none',
      active
        ? 'background:linear-gradient(135deg,#6c63ff,#4e46e5);color:#fff'
        : 'background:#12122a;color:#888899;border:1px solid #2a2a45',
    ].join(';');
  }

  // ──────────────────────────────────────────────
  //  Toast
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
  //  按钮样式工具
  // ──────────────────────────────────────────────
  function ensureSpinStyle() {
    if (document.getElementById('db-spin-kf')) return;
    const s = document.createElement('style');
    s.id = 'db-spin-kf';
    s.textContent = '@keyframes db-spin{to{transform:rotate(360deg)}}';
    (document.head || document.documentElement).appendChild(s);
  }

  const SVG_DL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    <line x1="2" y1="2" x2="22" y2="22" stroke-width="2" stroke="rgba(255,255,255,0.5)"/>
  </svg>`;

  const SVG_ALL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>`;

  const SVG_FMT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
    <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
  </svg>`;

  const SVG_SPIN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
    style="flex-shrink:0;animation:db-spin .85s linear infinite">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>`;

  function setBusy(btn, msg) {
    btn.innerHTML = SVG_SPIN + '<span>' + msg + '</span>';
    btn.disabled = true; btn.style.opacity = '.72'; btn.style.cursor = 'default';
  }
  function setIdle(btn) {
    btn.innerHTML = SVG_DL + '<span>下载无水印</span>';
    btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
  }
  function setBatchBusy(busy, progress) {
    if (!batchBtn) return;
    if (busy) {
      batchBtn.innerHTML = SVG_SPIN + `<span>批量 ${progress}</span>`;
      batchBtn.disabled = true; batchBtn.style.opacity = '.72';
    } else {
      batchBtn.innerHTML = SVG_ALL + '<span>批量下载</span>';
      batchBtn.disabled = false; batchBtn.style.opacity = '1';
    }
  }

  // ──────────────────────────────────────────────
  //  注入按钮组
  //  [ 下载无水印 ] [ 批量下载 ] [ ⚙ ]
  // ──────────────────────────────────────────────
  let fmtBtn = null;
  let btnGroup = null;

  function injectBtn() {
    ensureSpinStyle();
    if (btnGroup) return;

    // 容器
    btnGroup = document.createElement('div');
    btnGroup.style.cssText = [
      'position:fixed;bottom:32px;right:32px',
      'display:flex;gap:8px;align-items:center',
      'z-index:2147483646',
    ].join(';');

    const BASE_BTN = [
      'display:flex;align-items:center;gap:6px',
      'border:none;border-radius:999px',
      'font-size:13px;font-weight:600;cursor:pointer',
      'box-shadow:0 4px 20px rgba(108,99,255,.4)',
      'transition:filter .15s,transform .15s',
      'user-select:none;letter-spacing:.3px',
      "font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif",
    ].join(';');

    // 单张按钮
    nowmBtn = document.createElement('button');
    nowmBtn.innerHTML = SVG_DL + '<span>下载无水印</span>';
    nowmBtn.style.cssText = BASE_BTN + ';padding:10px 18px;background:linear-gradient(135deg,#6c63ff,#4e46e5);color:#fff';
    nowmBtn.onmouseenter = () => { if (!nowmBtn.disabled) { nowmBtn.style.filter='brightness(1.18)'; nowmBtn.style.transform='translateY(-1px)'; } };
    nowmBtn.onmouseleave = () => { nowmBtn.style.filter=''; nowmBtn.style.transform=''; };
    nowmBtn.addEventListener('click', onNoWatermarkClick);

    // 批量按钮
    batchBtn = document.createElement('button');
    batchBtn.innerHTML = SVG_ALL + '<span>批量下载</span>';
    batchBtn.style.cssText = BASE_BTN + ';padding:10px 16px;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff';
    batchBtn.onmouseenter = () => { if (!batchBtn.disabled) { batchBtn.style.filter='brightness(1.18)'; batchBtn.style.transform='translateY(-1px)'; } };
    batchBtn.onmouseleave = () => { batchBtn.style.filter=''; batchBtn.style.transform=''; };
    batchBtn.addEventListener('click', downloadAll);

    // 格式设置按钮
    fmtBtn = document.createElement('button');
    fmtBtn.innerHTML = SVG_FMT;
    fmtBtn.title = '下载格式设置';
    fmtBtn.style.cssText = BASE_BTN + ';padding:10px 12px;background:#1a1a2e;color:#a78bfa;border:1.5px solid #6c63ff';
    fmtBtn.onmouseenter = () => { fmtBtn.style.filter='brightness(1.2)'; fmtBtn.style.transform='translateY(-1px)'; };
    fmtBtn.onmouseleave = () => { fmtBtn.style.filter=''; fmtBtn.style.transform=''; };
    fmtBtn.addEventListener('click', showFmtPanel);

    btnGroup.appendChild(nowmBtn);
    btnGroup.appendChild(batchBtn);
    btnGroup.appendChild(fmtBtn);
    document.body.appendChild(btnGroup);
    log('✅ 按钮组已注入');
  }

  function removeBtn() {
    if (btnGroup) { btnGroup.remove(); btnGroup = null; nowmBtn = null; batchBtn = null; fmtBtn = null; }
    if (fmtPanel)  { fmtPanel.remove(); fmtPanel = null; }
    if (batchPanel) { batchPanel.remove(); batchPanel = null; }
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
  //  MutationObserver
  // ──────────────────────────────────────────────
  let _tm = null;
  function scheduleCheck() {
    if (_tm) return;
    _tm = setTimeout(() => {
      _tm = null;
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
  //  响应 popup 查询
  // ──────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_STATS') {
      sendResponse({ ori: oriUrls.length, dld: dldUrls.length, pre: preUrls.length });
    }
    if (msg.type === 'SET_FORMAT') {
      saveFmt(msg.fmt, msg.qual);
      sendResponse({ ok: true });
    }
    if (msg.type === 'GET_FORMAT') {
      sendResponse({ fmt: _fmt, qual: _qual });
    }
    if (msg.type === 'BATCH_DOWNLOAD') {
      downloadAll();
      sendResponse({ ok: true });
    }
    if (msg.type === 'TRIGGER_SINGLE') {
      onNoWatermarkClick();
      sendResponse({ ok: true });
    }
    return false;
  });

  log('🚀 豆包无水印下载 v4.0.0 已加载 | 批量下载 + 格式选择 + 智能命名');
})();
