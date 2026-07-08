
// ==UserScript==
// @name         MotionTMS Copy Trucks iPad Manual Copy
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Show grouped truck text in a selectable box for iPad Safari
// @match        https://express.motiontms.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
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
    return document.querySelector('#express-unit-list-table table') ||
           document.querySelector('#express-unit-list-table') ||
           document.querySelector('[id*="express-unit-list-table"] table') ||
           document.querySelector('[id*="express-unit-list-table"]') ||
           document.querySelector('table');
  }
  function getRows() {
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
    const match = t.match(/\b\d{1,5}[A-Z]\b/i);
    if (match) return match[0].toUpperCase();
    t = t.replace(/tractor[-\s]?trailer/gi, '');
    t = t.replace(/truck contact:.*$/i, '');
    return clean(t);
  }
  function simplifyLocation(text) {
    let t = clean(text);
    t = t.replace(/^location_on\s*/i, '');
    t = t.replace(/\bEdit\b$/i, '');
    t = t.replace(/,\s*([A-Z]{2})\s*\d{5}(?:-\d{4})?/i, ', $1');
    return clean(t);
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
      const truckRaw = getCell(row, [
        '[id^="at-truck-n"]',
        'td.column-truck',
        '[class*="column-truck"]',
        'td:nth-child(3)'
      ]);
      const locRaw = getCell(row, [
        '[id^="at-location-n"]',
        'td.column-location',
        '[class*="column-location"]',
        'td:nth-child(6)'
      ]);
      const availRaw = getCell(row, [
        '[id^="at-available-date-n"]',
        'td.column-available-date',
        '[class*="column-available-date"]',
        'td:nth-child(1)'
      ]);
      if (!truckRaw || !locRaw || !availRaw) return;
      const truck = simplifyTruck(truckRaw);
      const loc = simplifyLocation(locRaw);
      const dt = parseDateAndTime(availRaw);
      if (!dt.date || !truck || !loc) return;
      const oneLine = clean(`${truck} ${loc} ${dt.time}`);
      if (!byDate[dt.date]) byDate[dt.date] = [];
      byDate[dt.date].push(oneLine);
    });
    return byDate;
  }
  function buildTSV(byDate) {
    const dates = Object.keys(byDate).sort((a, b) => {
      const toKey = d => d.split('/').reverse().join('-');
      return toKey(a).localeCompare(toKey(b));
    });
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
