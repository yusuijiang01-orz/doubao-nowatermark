// ================================================================
//  豆包无水印下载 — Popup Script  v3.1.0
//  作者：yusuijiang
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  const dotPage  = document.getElementById('dot-page');
  const pageText = document.getElementById('page-text');
  const openBtn  = document.getElementById('open-doubao');
  const verBadge = document.getElementById('ver-badge');

  // ── 显示版本号（从 manifest 读取，保持单一来源）──
  const manifest = chrome.runtime.getManifest();
  if (verBadge) verBadge.textContent = 'v' + manifest.version;

  // ── 检测当前 tab 是否为豆包 ──
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    const isDoubao = tab && tab.url && tab.url.includes('doubao.com');

    if (isDoubao) {
      dotPage.classList.add('green');
      pageText.textContent = '豆包 ✓';
      openBtn.textContent  = '已在豆包，关闭面板';

      // 尝试从当前标签页获取捕获统计
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
  });

  // ── 打开豆包按钮 ──
  openBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (tab && tab.url && tab.url.includes('doubao.com')) {
        window.close();
      } else {
        chrome.tabs.create({ url: 'https://www.doubao.com/chat/' });
        window.close();
      }
    });
  });

  function setCount(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = (val === null || val === undefined) ? '—' : String(val);
  }
});
