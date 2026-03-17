// ================================================================
//  豆包无水印下载 — Popup Script  v4.0.0
//  作者：yusuijiang
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  const dotPage    = document.getElementById('dot-page');
  const pageText   = document.getElementById('page-text');
  const openBtn    = document.getElementById('open-doubao');
  const verBadge   = document.getElementById('ver-badge');
  const actionCard = document.getElementById('action-card');
  const btnSingle  = document.getElementById('btn-single');
  const btnBatch   = document.getElementById('btn-batch');
  const fmtPng     = document.getElementById('fmt-png');
  const fmtJpg     = document.getElementById('fmt-jpg');
  const qualRow    = document.getElementById('qual-row');
  const qualSlider = document.getElementById('qual-slider');
  const qualVal    = document.getElementById('qual-val');

  // ── 版本号 ──
  const manifest = chrome.runtime.getManifest();
  if (verBadge) verBadge.textContent = 'v' + manifest.version;

  // ── 从 storage 读取格式偏好 ──
  chrome.storage.local.get(['db_fmt', 'db_qual'], (res) => {
    const fmt  = res.db_fmt  || 'png';
    const qual = res.db_qual || 0.92;
    applyFmt(fmt, qual);
  });

  function applyFmt(fmt, qual) {
    if (fmt === 'jpeg') {
      fmtJpg.className = 'fmt-btn active';
      fmtPng.className = 'fmt-btn inactive';
      qualRow.style.display = 'block';
    } else {
      fmtPng.className = 'fmt-btn active';
      fmtJpg.className = 'fmt-btn inactive';
      qualRow.style.display = 'none';
    }
    qualSlider.value  = Math.round(qual * 100);
    qualVal.textContent = Math.round(qual * 100) + '%';
  }

  // ── 格式切换 ──
  fmtPng.addEventListener('click', () => {
    const qual = parseInt(qualSlider.value) / 100;
    chrome.storage.local.set({ db_fmt: 'png', db_qual: qual });
    applyFmt('png', qual);
    sendFmtToTab('png', qual);
  });

  fmtJpg.addEventListener('click', () => {
    const qual = parseInt(qualSlider.value) / 100;
    chrome.storage.local.set({ db_fmt: 'jpeg', db_qual: qual });
    applyFmt('jpeg', qual);
    sendFmtToTab('jpeg', qual);
  });

  qualSlider.addEventListener('input', () => {
    const qual = parseInt(qualSlider.value) / 100;
    qualVal.textContent = Math.round(qual * 100) + '%';
    chrome.storage.local.set({ db_qual: qual });
    sendFmtToTab('jpeg', qual);
  });

  function sendFmtToTab(fmt, qual) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (tab && tab.url && tab.url.includes('doubao.com')) {
        chrome.tabs.sendMessage(tab.id, { type: 'SET_FORMAT', fmt, qual }, () => {});
      }
    });
  }

  // ── 检测当前 tab ──
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab      = tabs[0];
    const isDoubao = tab && tab.url && tab.url.includes('doubao.com');

    if (isDoubao) {
      dotPage.classList.add('green');
      pageText.textContent = '豆包 ✓';
      openBtn.textContent  = '已在豆包，关闭面板';
      actionCard.style.display = 'block';

      // 读取统计
      chrome.tabs.sendMessage(tab.id, { type: 'GET_STATS' }, (resp) => {
        if (chrome.runtime.lastError || !resp) return;
        setCount('cnt-ori', resp.ori);
        setCount('cnt-dld', resp.dld);
        setCount('cnt-pre', resp.pre);
      });
    } else {
      pageText.textContent = '非豆包页面';
      setCount('cnt-ori', null);
      setCount('cnt-dld', null);
      setCount('cnt-pre', null);
    }

    // ── 下载当前图 ──
    btnSingle.addEventListener('click', () => {
      if (!isDoubao) return;
      // 格式已由 storage 同步，直接触发页面按钮逻辑
      chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_SINGLE' }, () => {});
      window.close();
    });

    // ── 批量下载 ──
    btnBatch.addEventListener('click', () => {
      if (!isDoubao) return;
      chrome.tabs.sendMessage(tab.id, { type: 'BATCH_DOWNLOAD' }, () => {});
      window.close();
    });
  });

  // ── 打开豆包 ──
  openBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (tab && tab.url && tab.url.includes('doubao.com')) window.close();
      else { chrome.tabs.create({ url: 'https://www.doubao.com/chat/' }); window.close(); }
    });
  });

  function setCount(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = (val === null || val === undefined) ? '—' : String(val);
  }
});
