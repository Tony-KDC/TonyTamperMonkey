// ==UserScript==
// @name         MotionTMS Copy Trucks iPad Manual Copy
// @namespace    http://tampermonkey.net/
// @version      1.2
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
    return document.querySelector('#express-unit-list-table') ||
           document.querySelector('[id*="express-unit-list-table"]');
  }

  function getRows() {
    const table = findTable();
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody tr')).filter(tr => tr.querySelectorAll('td').length);
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
    t = t.replace(/tractor[-\s]?trailer/gi, '');
    t = t.replace(/truck contact:.*$/i, '');
    t = t.replace(/\s+/g, ' ');
    return clean(t);
  }

  function simplifyLocation(text) {
    let t = clean(text);
    t = t.replace(/^location_on\s*/i, '');
    t = t.replace(/\sEdit$/i, '');
    t = t.replace(/,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?$/i, match => match.replace(/\s*\d.*$/, ''));
    return clean(t);
  }

  function parseDateAndTime(text) {
    let t = clean(text);
    const m = t.match(/^(\d{2}\/\d{2}\/\d{4}),\s*\w+\s+calendar_today\s+([0-9:]+)\s*(AM|PM|am|pm|MDT|PDT|EDT|CDT|UTC)?/);

    let datePart = '';
    let timePart = '';

    if (m) {
      datePart = m[1];
      timePart = m[2];
    } else {
      const dateMatch = t.match(/\d{2}\/\d{2}\/\d{4}/);
      const timeMatch = t.match(/\b\d{1,2}:\d{2}\b/);
      datePart = dateMatch ? dateMatch[0] : '';
      timePart = timeMatch ? timeMatch[0] : '';
    }

    timePart = timePart.replace(/^0+(\d)/, '$1');
    return { date: datePart, time: timePart };
  }

  function extractGrouped() {
    const rows = getRows();
    const byDate = {};

    rows.forEach(row => {
      const truckRaw = getCell(row, ['td.column-truck', '[class*="column-truck"]', 'td:nth-child(3)']);
      const locRaw   = getCell(row, ['td.column-location', '[class*="column-location"]', 'td:nth-child(6)']);
      const availRaw = getCell(row, ['td.column-available-date', '[class*="column-available-date"]', 'td:nth-child(1)']);

      if (!truckRaw || !locRaw || !availRaw) return;

      const truck = simplifyTruck(truckRaw);
      const loc = simplifyLocation(locRaw);
      const dt = parseDateAndTime(availRaw);

      if (!dt.date) return;

      const oneLine = clean(`${truck} ${loc} ${dt.time}`);
      if (!byDate[dt.date]) byDate[dt.date] = [];
      byDate[dt.date].push(oneLine);
    });

    return byDate;
  }

  function buildTSV(byDate) {
    const dates = Object.keys(byDate).sort((a, b) => {
      const toKey = d => d.split('/').reverse().join('-');
      return toKey(a) < toKey(b) ? -1 : 1;
    });

    const header = dates;
    const maxLen = Math.max(0, ...dates.map(d => byDate[d].length));
    const lines = [header.join('\t')];

    for (let i = 0; i < maxLen; i++) {
      const row = dates.map(d => byDate[d][i] || '');
      lines.push(row.join('\t'));
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
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0,0,0,0.55)';
    modal.style.zIndex = '999999';

    const box = document.createElement('div');
    box.style.position = 'absolute';
    box.style.top = '5%';
    box.style.left = '5%';
    box.style.width = '90%';
    box.style.height = '90%';
    box.style.background = '#fff';
    box.style.borderRadius = '12px';
    box.style.padding = '12px';
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.gap = '10px';

    const title = document.createElement('div');
    title.textContent = 'Tap in the box, Select All, then Copy';
    title.style.fontSize = '18px';
    title.style.fontWeight = '700';
    title.style.color = '#111';

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.flex = '1';
    textarea.style.width = '100%';
    textarea.style.fontSize = '16px';
    textarea.style.padding = '10px';
    textarea.style.border = '1px solid #999';
    textarea.style.borderRadius = '8px';
    textarea.style.whiteSpace = 'pre';
    textarea.style.webkitUserSelect = 'text';
    textarea.style.userSelect = 'text';

    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'flex';
    buttonRow.style.gap = '10px';

    const selectBtn = document.createElement('button');
    selectBtn.textContent = 'Select Text';
    selectBtn.style.padding = '10px 14px';
    selectBtn.style.fontSize = '16px';
    selectBtn.style.fontWeight = '700';
    selectBtn.style.background = '#ffd400';
    selectBtn.style.color = '#000';
    selectBtn.style.border = '1px solid #000';
    selectBtn.style.borderRadius = '8px';

    selectBtn.addEventListener('click', () => {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.padding = '10px 14px';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.fontWeight = '700';
    closeBtn.style.background = '#eee';
    closeBtn.style.color = '#000';
    closeBtn.style.border = '1px solid #000';
    closeBtn.style.borderRadius = '8px';

    closeBtn.addEventListener('click', removeModal);

    buttonRow.appendChild(selectBtn);
    buttonRow.appendChild(closeBtn);

    box.appendChild(title);
    box.appendChild(textarea);
    box.appendChild(buttonRow);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  function handleButton() {
    const grouped = extractGrouped();
    const dates = Object.keys(grouped);

    if (!dates.length) {
      alert('No trucks found in the table.');
      return;
    }

    const text = buildTSV(grouped);
    showModal(text);
  }

  function addButton() {
    if (!document.body || document.getElementById(WRAP_ID)) return;

    const wrap = document.createElement('div');
    wrap.id = WRAP_ID;
    wrap.style.position = 'fixed';
    wrap.style.top = '10px';
    wrap.style.right = '50px';
    wrap.style.zIndex = '99999';

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = 'Copy Trucks';
    btn.style.background = '#ffd400';
    btn.style.color = '#000';
    btn.style.border = '2px solid #000';
    btn.style.borderRadius = '8px';
    btn.style.padding = '10px 14px';
    btn.style.fontSize = '14px';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';

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
