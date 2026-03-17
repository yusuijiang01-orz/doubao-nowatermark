// ================================================================
//  豆包无水印下载 — Background Service Worker  v3.0.0
//  职责：
//    1. FETCH_IMAGE  — 代理跨域图片请求，返回 dataUrl（Canvas 合并用）
//    2. DOWNLOAD_URL — 直接用 chrome.downloads API 下载原图（方案A用）
// ================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_IMAGE') {
    fetchImageAsDataUrl(message.url)
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true; // 异步响应
  }

  if (message.type === 'DOWNLOAD_URL') {
    downloadUrl(message.url, message.filename)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // 异步响应
  }
});

// ── FETCH_IMAGE：获取图片并转为 dataUrl（供 Canvas 使用）──
async function fetchImageAsDataUrl(url) {
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

// ── DOWNLOAD_URL：直接下载 URL 到本地（无需 Canvas，方案A专用）──
async function downloadUrl(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename: filename || 'doubao_nowm.png',
        saveAs: false,
        conflictAction: 'uniquify',
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (downloadId === undefined) {
          reject(new Error('下载启动失败'));
        } else {
          resolve(downloadId);
        }
      }
    );
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FileReader 失败'));
    reader.readAsDataURL(blob);
  });
}
