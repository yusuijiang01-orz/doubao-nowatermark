// ================================================================
//  豆包无水印下载 — Background Service Worker  v4.0.0
//  职责：
//    1. FETCH_IMAGE  — 代理跨域图片请求，返回 dataUrl（Canvas 合并用）
//    2. DOWNLOAD_URL — 直接用 chrome.downloads API 下载原图 URL（方案A）
//    3. DOWNLOAD_BLOB — 接收 dataUrl，转 Blob 后用 chrome.downloads 保存（方案B JPEG/PNG）
// ================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'FETCH_IMAGE') {
    fetchImageAsDataUrl(message.url)
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(err   => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'DOWNLOAD_URL') {
    downloadUrl(message.url, message.filename)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'DOWNLOAD_BLOB') {
    // content.js 用 FileReader 把 Blob 转成 dataUrl 传过来
    // 这里再转回 Blob，用 URL.createObjectURL 触发下载
    downloadDataUrl(message.dataUrl, message.filename)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// ── FETCH_IMAGE ──
async function fetchImageAsDataUrl(url) {
  const response = await fetch(url, { method: 'GET', credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

// ── DOWNLOAD_URL：直接下载远端 URL ──
async function downloadUrl(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename: filename || 'doubao_nowm.png', saveAs: false, conflictAction: 'uniquify' },
      (downloadId) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (downloadId === undefined) reject(new Error('下载启动失败'));
        else resolve(downloadId);
      }
    );
  });
}

// ── DOWNLOAD_BLOB：直接用 dataUrl 触发下载 ──
// Service Worker 里没有 URL.createObjectURL，
// Chrome downloads API 支持直接传 data: URI，无需转 ObjectURL。
async function downloadDataUrl(dataUrl, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url: dataUrl, filename: filename || 'doubao_nowm.png', saveAs: false, conflictAction: 'uniquify' },
      (downloadId) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (downloadId === undefined) reject(new Error('下载启动失败'));
        else resolve(downloadId);
      }
    );
  });
}

// ── 工具：Blob → dataUrl ──
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FileReader 失败'));
    reader.readAsDataURL(blob);
  });
}
