// ==UserScript==
// @name         MotionTMS Copy Trucks iPad Manual Copy
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Show grouped truck text in a selectable box for iPad Safari
// @match        https://express.motiontms.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/MotionTMS%20Copy%20Trucks%20iPad%20Manual%20Copy.user.js
// @downloadURL  https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/MotionTMS%20Copy%20Trucks%20iPad%20Manual%20Copy.user.js
// ==/UserScript==
(function () {
  'use strict';
  const WRAP_ID = 'tm_trucks_wrap';
  const BTN_ID = 'tm_trucks_btn';
  const MODAL_ID = 'tm_trucks_modal';
  function clean(v) {
    return String(v || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function findTable() {
    // Motion update (Oct 2026): the old #express-unit-list-table <table> is gone.
    // The list is now an Angular Material <mat-table>. Keep the old lookups as
    // fallbacks in case Motion rolls the change back.
    return document.querySelector('mat-table') ||
           document.querySelector('app-available-units-table') ||
           document.querySelector('#express-unit-list-table table') ||
           document.querySelector('#express-unit-list-table') ||
           document.querySelector('[id*="express-unit-list-table"] table') ||
           document.querySelector('[id*="express-unit-list-table"]') ||
           document.querySelector('table');
  }
  function getRows() {
    // New markup: <mat-row class="mat-row cdk-row available-unit-row"
    //   data-testid="at-available-unit-row-<uuid>"> with <mat-cell> children.
    // Old markup: <tbody><tr data-testid="at-available-unit-row..."><td>...
    const newRows = Array.from(document.querySelectorAll(
      'mat-row[data-testid^="at-available-unit-row-"], mat-row.available-unit-row, .mat-row.available-unit-row'
    )).filter(tr => tr.querySelectorAll('mat-cell, td').length);
    if (newRows.length) return newRows;
    const table = findTable();
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody tr'))
      .filter(tr =>
        tr.querySelectorAll('td').length &&
        /at-available-unit-row|p-selectable-row/i.test(tr.getAttribute('data-testid') + ' ' + tr.className)
      );
  }
  function getCell(row, selectors) {
    for (const sel of selectors) {
      const el = row.querySelector(sel);
      if (el) {
        const t = clean(el.innerText || el.textContent);
        if (t) return t;
      }
    }
    return '';
  }
  function simplifyTruck(text) {
    let t = clean(text);
    // Truck cell text looks like "2603 Box Truck" or "235C Tractor-Trailer".
    // The truck number is the first token; the rest is the equipment type.
    const firstToken = t.split(' ')[0] || '';
    if (/^\d{1,5}[A-Z]?$/i.test(firstToken)) return firstToken.toUpperCase();
    const match = t.match(/\b\d{1,5}[A-Z]\b/i);
    if (match) return match[0].toUpperCase();
    t = t.replace(/tractor[-\s]?trailer/gi, '');
    t = t.replace(/box truck/gi, '');
    t = t.replace(/truck contact:.*$/i, '');
    return clean(t);
  }
  function getTruck(row) {
    // Preferred: the preview-link inside the truck cell holds exactly the
    // truck number ("2603", "235C", ...), with no equipment type after it.
    const cell = row.querySelector(
      '[data-testid^="at-truck-"], td.column-truck, [class*="column-truck"], mat-cell.cdk-column-truckExpress, mat-cell:nth-of-type(3), td:nth-child(3)'
    );
    if (cell) {
      const link = cell.querySelector('.preview-link, app-unit-information-preview-link div');
      const linkText = link ? clean(link.innerText || link.textContent) : '';
      if (linkText) return simplifyTruck(linkText);
      const cellText = clean(cell.innerText || cell.textContent);
      if (cellText) return simplifyTruck(cellText);
    }
    return '';
  }
  function simplifyLocation(text) {
    let t = clean(text);
    t = t.replace(/^location_on\s*/i, '');
    t = t.replace(/\bEdit\b$/i, '');
    t = t.replace(/,\s*([A-Z]{2})\s*\d{5}(?:-\d{4})?/i, ', $1');
    // Fix stray space before comma, e.g. "SPARKS , NV" -> "SPARKS, NV"
    t = t.replace(/\s+,/g, ',');
    return clean(t);
  }
  function getLocation(row) {
    // Preferred: the location cell has a div whose title attribute is
    // exactly "Tracy, CA 95376 " — no location_on icon text, no Edit link.
    const cell = row.querySelector(
      '[data-testid^="at-location-"], td.column-location, [class*="column-location"], mat-cell.cdk-column-currentLocationExpress, mat-cell:nth-of-type(7), td:nth-child(6)'
    );
    if (cell) {
      const titled = cell.querySelector('[title]');
      const titleText = titled ? clean(titled.getAttribute('title')) : '';
      if (titleText) return simplifyLocation(titleText);
      const label = cell.querySelector('.label-2');
      const labelText = label ? clean(label.innerText || label.textContent) : '';
      if (labelText) return simplifyLocation(labelText);
      const cellText = clean(cell.innerText || cell.textContent);
      if (cellText) return simplifyLocation(cellText);
    }
    return '';
  }
  function parseDateAndTime(text) {
    const t = clean(text);
    const dateMatch = t.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
    const timeMatch = t.match(/\b\d{1,2}:\d{2}\b/);
    let timePart = timeMatch ? timeMatch[0] : '';
    timePart = timePart.replace(/^0+(\d)/, '$1');
    return {
      date: dateMatch ? dateMatch[0] : '',
      time: timePart
    };
  }
  function extractGrouped() {
    const byDate = {};
    getRows().forEach(row => {
      const truck = getTruck(row);
      const loc = getLocation(row);
      const availRaw = getCell(row, [
        '[data-testid^="at-available-unit-time-"]',
        '[data-testid^="at-available-date-"]',
        'td.column-available-date',
        '[class*="column-available-date"]',
        'mat-cell.cdk-column-availableDate',
        'mat-cell:nth-of-type(1)',
        'td:nth-child(1)'
      ]);
      if (!truck || !loc || !availRaw) return;
      const dt = parseDateAndTime(availRaw);
      if (!dt.date || !truck || !loc) return;
      const oneLine = clean(`${truck} ${loc} ${dt.time}`);
      if (!byDate[dt.date]) byDate[dt.date] = [];
      byDate[dt.date].push(oneLine);
    });
    return byDate;
  }
  function buildTSV(byDate) {
    const dates = Object.keys(byDate).sort((a, b) => new Date(a) - new Date(b));
    const maxLen = Math.max(0, ...dates.map(d => byDate[d].length));
    const lines = [dates.join('\t')];
    for (let i = 0; i < maxLen; i++) {
      lines.push(dates.map(d => byDate[d][i] || '').join('\t'));
    }
    return lines.join('\n');
  }
  function removeModal() {
    const old = document.getElementById(MODAL_ID);
    if (old) old.remove();
  }
  function showModal(text) {
    removeModal();
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;';
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;top:5%;left:5%;width:90%;height:90%;background:#fff;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;';
    const title = document.createElement('div');
    title.textContent = 'Tap Select Text, then Copy';
    title.style.cssText = 'font-size:18px;font-weight:700;color:#111;';
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.cssText = 'flex:1;width:100%;font-size:16px;padding:10px;border:1px solid #999;border-radius:8px;white-space:pre;-webkit-user-select:text;user-select:text;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;';
    const selectBtn = document.createElement('button');
    selectBtn.textContent = 'Select Text';
    selectBtn.style.cssText = 'padding:10px 14px;font-size:16px;font-weight:700;background:#ffd400;color:#000;border:1px solid #000;border-radius:8px;';
    selectBtn.onclick = () => {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
    };
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'padding:10px 14px;font-size:16px;font-weight:700;background:#eee;color:#000;border:1px solid #000;border-radius:8px;';
    closeBtn.onclick = removeModal;
    row.appendChild(selectBtn);
    row.appendChild(closeBtn);
    box.appendChild(title);
    box.appendChild(textarea);
    box.appendChild(row);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }
  function handleButton() {
    const grouped = extractGrouped();
    const dates = Object.keys(grouped);
    if (!dates.length) {
      alert('No trucks found. Make sure the truck table is loaded.');
      return;
    }
    showModal(buildTSV(grouped));
  }
  function addButton() {
    if (!document.body || document.getElementById(WRAP_ID)) return;
    const wrap = document.createElement('div');
    wrap.id = WRAP_ID;
    wrap.style.cssText = 'position:fixed;top:10px;right:50px;z-index:99999;';
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = 'Copy Trucks';
    btn.style.cssText = 'background:#ffd400;color:#000;border:2px solid #000;border-radius:8px;padding:10px 14px;font-size:14px;font-weight:700;cursor:pointer;';
    btn.addEventListener('click', handleButton);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }
  function start() {
    addButton();
  }
  if (document.readyState === 'loading') {
    window.addEventListener('load', start, { once: true });
  } else {
    start();
  }
})();
