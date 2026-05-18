// ==UserScript==
// @name         Motion Express - Past Due In-Transit Loads
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Highlight and copy in-transit/dispatched loads whose delivery date is before today.
// @match        https://express.motiontms.com/loads/in-transit-list*
// @grant        GM_setClipboard
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/Motion%20Express%20-%20Past%20Due%20In-Transit%20Loads.user.js
// @downloadURL  https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/Motion%20Express%20-%20Past%20Due%20In-Transit%20Loads.user.js
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    toolbarId: 'tm-pastdue-toolbar',
    buttonId: 'tm-pastdue-scan-btn',
    countId: 'tm-pastdue-count',
    noteClass: 'tm-pastdue-row',
    scannedAttr: 'data-tm-pastdue-scanned'
  };

  function waitForTable() {
    const table = document.querySelector('.p-datatable .p-datatable-tbody');
    if (table) {
      init();
      return;
    }
    setTimeout(waitForTable, 1000);
  }

  function injectStyles() {
    if (document.getElementById('tm-pastdue-styles')) return;

    const style = document.createElement('style');
    style.id = 'tm-pastdue-styles';
    style.textContent = `
      #${CONFIG.toolbarId} {
        position: sticky;
        top: 8px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 10px 16px;
        padding: 10px 12px;
        background: #ffffff;
        border: 1px solid #d9dde3;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        width: fit-content;
      }

      #${CONFIG.buttonId} {
        background: #b42318;
        color: #fff;
        border: 0;
        border-radius: 6px;
        padding: 8px 12px;
        font-weight: 700;
        cursor: pointer;
      }

      #${CONFIG.buttonId}:hover {
        background: #912018;
      }

      #${CONFIG.countId} {
        font-weight: 700;
        color: #b42318;
      }

      tr.${CONFIG.noteClass} {
        background: #ffd9d6 !important;
      }

      tr.${CONFIG.noteClass} td {
        background: #ffd9d6 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function injectToolbar() {
    if (document.getElementById(CONFIG.toolbarId)) return;

    const headerArea =
      document.querySelector('app-intransit-loads-list .table-header') ||
      document.querySelector('.p-datatable .p-datatable-header') ||
      document.querySelector('app-intransit-loads-list') ||
      document.body;

    const wrap = document.createElement('div');
    wrap.id = CONFIG.toolbarId;
    wrap.innerHTML = `
      <button id="${CONFIG.buttonId}" type="button">Copy Past-Due Loads</button>
      <span id="${CONFIG.countId}">0 flagged</span>
    `;

    if (headerArea && headerArea.parentNode) {
      headerArea.parentNode.insertBefore(wrap, headerArea.nextSibling || headerArea);
    } else {
      document.body.prepend(wrap);
    }

    document.getElementById(CONFIG.buttonId).addEventListener('click', runScanAndCopy);
  }

  function cleanText(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function findText(el, selector) {
    const node = el.querySelector(selector);
    return cleanText(node ? node.textContent : '');
  }

  function extractTruck(row) {
    const truckNode = row.querySelector('[data-testid*="at-unit-truck-active-link"]');
    return cleanText(truckNode?.textContent || '');
  }

  function extractPro(row) {
    const proCell = row.querySelector('[data-testid*="at-pro-"]');
    if (!proCell) return '';
    const text = cleanText(proCell.textContent || '');
    const match = text.match(/\b\d[\dA-Za-z-]*\b/);
    return match ? match[0] : text;
  }

  function extractReference(row) {
    const refCell = row.querySelector('[data-testid*="at-reference-"]');
    const text = cleanText(refCell?.textContent || '');
    return text.replace(/^Ref#?\s*/i, '').replace(/^Ref\s*/i, '').trim();
  }

  function extractStatus(row) {
    const statusNode = row.querySelector('.label-box.status');
    return cleanText(statusNode?.textContent || '');
  }

  function extractNotes(row) {
    const notes = [];
    const checkCall = row.querySelector('[data-testid*="at-check-call-"]');
    if (checkCall) {
      const checkText = cleanText(checkCall.textContent || '');
      if (checkText) notes.push(checkText);
    }

    row.querySelectorAll('.danger-msg, .warning-msg, .success-msg').forEach(n => {
      const txt = cleanText(n.textContent || '');
      if (txt && !notes.includes(txt)) notes.push(txt);
    });

    row.querySelectorAll('.link-cell, .caption, .label-3, .mb5, .mt5').forEach(n => {
      const txt = cleanText(n.textContent || '');
      if (!txt) return;
      if (/^Update$/i.test(txt) || /^View All$/i.test(txt) || /^Resolve$/i.test(txt) || /^Complete$/i.test(txt)) return;
      if (/^Prod/i.test(txt) || /^Reef/i.test(txt) || /^\d{8}\s+\d{1,2}:\d{2}/.test(txt)) return;
      if (
        txt.length > 14 &&
        (
          txt.toLowerCase().includes('need') ||
          txt.toLowerCase().includes('confirm') ||
          txt.toLowerCase().includes('written') ||
          txt.toLowerCase().includes('bol') ||
          txt.toLowerCase().includes('problem') ||
          txt.toLowerCase().includes('checked') ||
          txt.includes('"')
        )
      ) {
        if (!notes.includes(txt)) notes.push(txt);
      }
    });

    return cleanText(notes.join(' | '));
  }

  function parseDateFromText(text) {
    const cleaned = cleanText(text);
    const m = cleaned.match(/\b(\d{2})\/(\d{2})(?:\/(\d{4}))?\b/);
    if (!m) return null;

    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();

    const dt = new Date(year, month - 1, day);
    if (Number.isNaN(dt.getTime())) return null;

    dt.setHours(0, 0, 0, 0);
    return {
      raw: `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
      date: dt
    };
  }

  function extractDeliveryDate(row) {
    const dropCell = row.querySelector('[data-testid*="at-drop-off-"]');
    if (!dropCell) return null;

    const text = cleanText(dropCell.textContent || '');
    const parsed = parseDateFromText(text);
    if (parsed) return parsed;

    const captions = [...dropCell.querySelectorAll('.caption, .check-date')];
    for (const cap of captions) {
      const parsedCap = parseDateFromText(cap.textContent || '');
      if (parsedCap) return parsedCap;
    }

    return null;
  }

  function isPastDue(deliveryObj) {
    if (!deliveryObj?.date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return deliveryObj.date < today;
  }

  function getRows() {
    return [...document.querySelectorAll('.p-datatable .p-datatable-tbody > tr.p-selectable-row')];
  }

  function scanRows() {
    const rows = getRows();
    const flagged = [];

    rows.forEach(row => {
      row.classList.remove(CONFIG.noteClass);

      const delivery = extractDeliveryDate(row);
      const status = extractStatus(row);

      if (!delivery || !isPastDue(delivery)) return;

      const truck = extractTruck(row);
      const pro = extractPro(row);
      const reference = extractReference(row);
      const notes = extractNotes(row);

      row.classList.add(CONFIG.noteClass);

      flagged.push({
        truck,
        pro,
        reference,
        delivery: delivery.raw,
        status,
        notes
      });
    });

    const countEl = document.getElementById(CONFIG.countId);
    if (countEl) countEl.textContent = `${flagged.length} flagged`;

    return flagged;
  }

  async function copyText(text) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text);
        return true;
      }
    } catch (e) {}

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {}

    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  }

  async function runScanAndCopy() {
    const flagged = scanRows();

    if (!flagged.length) {
      alert('No past-due loads found on the rows currently visible.');
      return;
    }

    const output = [
      ['Truck #', 'PRO #', 'Reference #', 'Delivery Date', 'Status', 'Notes'].join('\t'),
      ...flagged.map(item => [
        item.truck,
        item.pro,
        item.reference,
        item.delivery,
        item.status,
        item.notes
      ].join('\t'))
    ].join('\n');

    await copyText(output);
    alert(`${flagged.length} past-due loads copied to clipboard.`);
  }

  function observeChanges() {
    const tbody = document.querySelector('.p-datatable .p-datatable-tbody');
    if (!tbody || tbody.getAttribute(CONFIG.scannedAttr)) return;

    tbody.setAttribute(CONFIG.scannedAttr, '1');

    const observer = new MutationObserver(() => {
      scanRows();
    });

    observer.observe(tbody, {
      childList: true,
      subtree: true
    });

    scanRows();
  }

  function init() {
    injectStyles();
    injectToolbar();
    observeChanges();
    scanRows();
  }

  waitForTable();
})();
