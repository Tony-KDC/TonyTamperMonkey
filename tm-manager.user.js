// ==UserScript==
// @name         TM Script Manager
// @namespace    https://github.com/Tony-KDC/TonyTamperMonkey
// @version      1.0
// @description  Automatically checks your GitHub registry for new scripts when you open the TM dashboard
// @author       Tony-KDC
// @match        https://www.tampermonkey.net/*
// @match        chrome-extension://*/index.html*
// @match        moz-extension://*/index.html*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/tm-manager.user.js
// @downloadURL  https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/tm-manager.user.js
// ==/UserScript==

(function () {
  'use strict';

  const REGISTRY_URL = 'https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/registry.json';

  // ─── INSTALLED SCRIPT DETECTION ───────────────────────────────────────────
  // Scrapes the TM dashboard table to get a list of currently installed script names
  function getInstalledScriptNames() {
    const names = new Set();
    document.querySelectorAll('.name, .scriptname, [class*="name"]').forEach(el => {
      const text = el.textContent.trim().toLowerCase();
      if (text) names.add(text);
    });
    return names;
  }

  // ─── INSTALL A SCRIPT ─────────────────────────────────────────────────────
  // Opens the raw .user.js URL — TM intercepts it and shows the install prompt
  function installScript(url, btn) {
    window.open(url, '_blank');
    btn.textContent = '⏳ Opening...';
    btn.disabled = true;
    btn.style.background = '#444';
  }

  // ─── BUILD THE PANEL ──────────────────────────────────────────────────────
  function showPanel(newScripts) {
    // Remove any existing panel first
    const existing = document.getElementById('tm-manager-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'tm-manager-panel';
    panel.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 99999;
      background: #1a1a2e;
      color: #eee;
      border-radius: 14px;
      padding: 22px;
      width: 380px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      border: 1px solid #2e2e4e;
      animation: tmSlideIn 0.25s ease;
    `;

    // Inject slide-in animation
    if (!document.getElementById('tm-manager-styles')) {
      const style = document.createElement('style');
      style.id = 'tm-manager-styles';
      style.textContent = `
        @keyframes tmSlideIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        #tm-manager-panel button:hover { filter: brightness(1.15); }
      `;
      document.head.appendChild(style);
    }

    // ── Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;';
    header.innerHTML = `
      <span style="font-size:16px; font-weight:700;">📦 Script Manager</span>
      <button id="tm-close-btn" style="
        background:none; border:none; color:#888;
        font-size:20px; cursor:pointer; line-height:1;
        padding:0 4px;">✕</button>
    `;
    panel.appendChild(header);

    // ── Body
    if (newScripts.length === 0) {
      // All up to date
      const msg = document.createElement('div');
      msg.style.cssText = 'display:flex; align-items:center; gap:10px; color:#7bed9f; font-size:14px;';
      msg.innerHTML = `<span style="font-size:22px;">✅</span> All scripts are installed and up to date.`;
      panel.appendChild(msg);
    } else {
      // Show new scripts
      const subtitle = document.createElement('p');
      subtitle.style.cssText = 'margin:0 0 14px; color:#aaa; font-size:13px;';
      subtitle.textContent = `${newScripts.length} new script${newScripts.length > 1 ? 's' : ''} available in your repo:`;
      panel.appendChild(subtitle);

      const list = document.createElement('div');
      list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

      newScripts.forEach(script => {
        const row = document.createElement('div');
        row.style.cssText = `
          display:flex; justify-content:space-between; align-items:center;
          background:#12122a; border-radius:10px; padding:10px 14px;
          border: 1px solid #2e2e4e;
        `;
        row.innerHTML = `
          <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${script.name}
            </div>
            <div style="font-size:11px; color:#888; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${script.description}
            </div>
          </div>
          <button data-url="${script.downloadURL}" style="
            margin-left:12px; padding:6px 14px;
            background:#6c63ff; color:#fff;
            border:none; border-radius:8px;
            cursor:pointer; font-size:12px;
            font-weight:600; white-space:nowrap;
            transition: filter 0.15s;">
            Install
          </button>
        `;
        const btn = row.querySelector('button');
        btn.addEventListener('click', () => installScript(script.downloadURL, btn));
        list.appendChild(row);
      });

      panel.appendChild(list);

      // Install All button (only shown if more than 1 new script)
      if (newScripts.length > 1) {
        const installAll = document.createElement('button');
        installAll.textContent = `Install All (${newScripts.length})`;
        installAll.style.cssText = `
          margin-top:16px; width:100%; padding:10px;
          background:#6c63ff; color:#fff;
          border:none; border-radius:10px;
          cursor:pointer; font-size:14px;
          font-weight:600; transition: filter 0.15s;
        `;
        installAll.addEventListener('click', () => {
          panel.querySelectorAll('[data-url]').forEach(btn => {
            if (!btn.disabled) installScript(btn.dataset.url, btn);
          });
          installAll.textContent = '⏳ Opening all...';
          installAll.disabled = true;
        });
        panel.appendChild(installAll);
      }
    }

    document.body.appendChild(panel);
    document.getElementById('tm-close-btn').addEventListener('click', () => panel.remove());
  }

  // ─── FETCH REGISTRY & COMPARE ─────────────────────────────────────────────
  function checkForNewScripts() {
    GM_xmlhttpRequest({
      method: 'GET',
      url: REGISTRY_URL + '?nocache=' + Date.now(),
      onload: function (res) {
        try {
          const registry = JSON.parse(res.responseText);
          const installed = getInstalledScriptNames();

          const newScripts = registry.scripts.filter(
            s => !installed.has(s.name.toLowerCase())
          );

          showPanel(newScripts);
        } catch (e) {
          console.error('[TM Manager] Failed to parse registry.json:', e);
          alert('[TM Manager] Could not read registry.json — check the file on GitHub.');
        }
      },
      onerror: function () {
        alert('[TM Manager] Could not reach GitHub. Check your internet connection.');
      }
    });
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────
  // Wait for the TM dashboard to fully load before scraping installed scripts
  window.addEventListener('load', () => {
    setTimeout(checkForNewScripts, 1500);
  });

})();
