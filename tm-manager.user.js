// ==UserScript==
// @name         TM Script Manager
// @namespace    https://github.com/Tony-KDC/TonyTamperMonkey
// @version      1.1
// @description  Checks the GitHub registry when you open the Tampermonkey dashboard: shows scripts you don't have yet AND updates for scripts you already have, with one-click install
// @author       Tony-KDC
// @match        https://www.tampermonkey.net/*
// @match        chrome-extension://*/index.html*
// @match        chrome-extension://*/options.html*
// @match        moz-extension://*/index.html*
// @match        moz-extension://*/options.html*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/tm-manager.user.js
// @downloadURL  https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/tm-manager.user.js
// ==/UserScript==

(function () {
  'use strict';

  const REGISTRY_URL = 'https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/registry.json';

  // ─── VERSION COMPARE ──────────────────────────────────────────────────────
  // Returns 1 if a > b, -1 if a < b, 0 if equal. Missing parts count as 0,
  // so "1.4" and "1.4.0" are equal.
  function compareVersions(a, b) {
    const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
  }

  // ─── INSTALLED SCRIPT DETECTION ───────────────────────────────────────────
  // The Tampermonkey dashboard lists each installed script with its name and
  // version in the same table row. For every script in the registry, find a
  // dashboard element whose text is exactly the script name, then read the
  // first version-looking number (e.g. 6.2) from that row's text.
  // Returns a Map: lowercase name -> installed version string ('' if the
  // script was found but its version could not be read).
  function getInstalledScripts(registryScripts) {
    const installed = new Map();
    const all = Array.from(document.querySelectorAll('td, span, div, a'));
    registryScripts.forEach(script => {
      const wanted = script.name.trim().toLowerCase();
      const nameEl = all.find(el =>
        el.children.length === 0 &&
        (el.textContent || '').trim().toLowerCase() === wanted
      );
      if (!nameEl) return;
      const row = nameEl.closest('tr') || nameEl.closest('[class*="row"]') || nameEl.parentElement;
      const rowText = row ? (row.textContent || '') : '';
      // Strip the script name itself out so a number inside the name can't
      // be mistaken for the version.
      const afterName = rowText.replace(script.name, ' ');
      const vm = afterName.match(/\b(\d+\.\d+(?:\.\d+)?)\b/);
      installed.set(wanted, vm ? vm[1] : '');
    });
    return installed;
  }

  // ─── INSTALL / UPDATE A SCRIPT ────────────────────────────────────────────
  // Opens the raw .user.js URL — Tampermonkey intercepts it and shows the
  // install prompt (or the update prompt for an already-installed script with
  // the same name + namespace).
  function installScript(url, btn) {
    window.open(url, '_blank');
    btn.textContent = '⏳ Opening...';
    btn.disabled = true;
    btn.style.background = '#444';
  }

  // ─── BUILD THE PANEL ──────────────────────────────────────────────────────
  function showPanel(items) {
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
      width: 400px;
      max-height: 85vh;
      overflow-y: auto;
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
    const title = document.createElement('span');
    title.style.cssText = 'font-size:16px; font-weight:700;';
    title.textContent = '📦 Script Manager';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none; border:none; color:#888; font-size:20px; cursor:pointer; line-height:1; padding:0 4px;';
    closeBtn.addEventListener('click', () => panel.remove());
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // ── Body
    const actionable = items.filter(i => i.status !== 'installed');
    if (actionable.length === 0) {
      const msg = document.createElement('div');
      msg.style.cssText = 'display:flex; align-items:center; gap:10px; color:#7bed9f; font-size:14px;';
      msg.textContent = '✅ All scripts are installed and up to date.';
      panel.appendChild(msg);
    } else {
      const subtitle = document.createElement('p');
      subtitle.style.cssText = 'margin:0 0 14px; color:#aaa; font-size:13px;';
      const updates = actionable.filter(i => i.status === 'update').length;
      const fresh = actionable.length - updates;
      const parts = [];
      if (fresh) parts.push(`${fresh} new`);
      if (updates) parts.push(`${updates} update${updates > 1 ? 's' : ''}`);
      subtitle.textContent = `${parts.join(' + ')} available from the repo:`;
      panel.appendChild(subtitle);

      const list = document.createElement('div');
      list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

      actionable.forEach(item => {
        const script = item.script;
        const row = document.createElement('div');
        row.style.cssText = `
          display:flex; justify-content:space-between; align-items:center;
          background:#12122a; border-radius:10px; padding:10px 14px;
          border: 1px solid #2e2e4e;
        `;
        const info = document.createElement('div');
        info.style.cssText = 'flex:1; min-width:0;';
        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
        nameEl.textContent = script.name;
        const detailEl = document.createElement('div');
        detailEl.style.cssText = 'font-size:11px; color:#888; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
        detailEl.textContent = item.status === 'update'
          ? `Update: v${item.installedVersion} → v${script.version}`
          : (script.description || '');
        info.appendChild(nameEl);
        info.appendChild(detailEl);
        const btn = document.createElement('button');
        btn.textContent = item.status === 'update' ? 'Update' : 'Install';
        btn.style.cssText = `
          margin-left:12px; padding:6px 14px;
          background:${item.status === 'update' ? '#e67e22' : '#6c63ff'}; color:#fff;
          border:none; border-radius:8px;
          cursor:pointer; font-size:12px;
          font-weight:600; white-space:nowrap;
          transition: filter 0.15s;
        `;
        btn.dataset.url = script.downloadURL;
        btn.addEventListener('click', () => installScript(script.downloadURL, btn));
        row.appendChild(info);
        row.appendChild(btn);
        list.appendChild(row);
      });

      panel.appendChild(list);

      // Install All / Update All button (only shown if more than 1)
      if (actionable.length > 1) {
        const installAll = document.createElement('button');
        installAll.textContent = `Install / Update All (${actionable.length})`;
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

        const note = document.createElement('p');
        note.style.cssText = 'margin:10px 0 0; color:#777; font-size:11px;';
        note.textContent = 'Each script opens its own Tampermonkey install tab — click Install/Update in each one. If your browser blocks some tabs, click the remaining buttons one by one.';
        panel.appendChild(note);
      }
    }

    document.body.appendChild(panel);
  }

  // ─── FETCH REGISTRY & COMPARE ─────────────────────────────────────────────
  function checkScripts() {
    GM_xmlhttpRequest({
      method: 'GET',
      url: REGISTRY_URL + '?nocache=' + Date.now(),
      onload: function (res) {
        try {
          const registry = JSON.parse(res.responseText);
          const installed = getInstalledScripts(registry.scripts);

          const items = registry.scripts.map(script => {
            const key = script.name.trim().toLowerCase();
            // Don't offer the Manager to itself — Tampermonkey updates it
            // through its own @updateURL like every other script.
            if (key === 'tm script manager') return { script, status: 'installed' };
            if (!installed.has(key)) return { script, status: 'new' };
            const installedVersion = installed.get(key);
            if (installedVersion && script.version &&
                compareVersions(script.version, installedVersion) > 0) {
              return { script, status: 'update', installedVersion };
            }
            return { script, status: 'installed' };
          });

          showPanel(items);
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
    setTimeout(checkScripts, 1500);
  });

})();
