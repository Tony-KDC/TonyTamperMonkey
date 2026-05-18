// ==UserScript==
// @name         Motion TMS - Copy Pending Loads
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a button to copy all visible pending loads from the Pending Loads page.
// @match        https://express.motiontms.com/loads/pending-list*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_ID = 'tm-copy-pending-loads';
  const BUTTON_ID = 'tm-copy-pending-loads-btn';

  function cleanText(str) {
    return (str || '')
      .replace(/\s+/g, ' ')
      .replace(/\u00A0/g, ' ')
      .trim();
  }

  function getText(el) {
    return el ? cleanText(el.textContent) : '';
  }

  function escapeCell(value) {
    return cleanText(value);
  }

  function getRowNumberFromCell(cell) {
    if (!cell) return null;
    const testId =
      cell.getAttribute('data-testid') ||
      cell.querySelector('[data-testid]')?.getAttribute('data-testid') ||
      '';
    const match = testId.match(/-n(\d+)$/);
    return match ? match[1] : null;
  }

  function findTruckNumber(unitCell) {
    if (!unitCell) return '';

    const activeTruckLink = unitCell.querySelector('[data-testid*="unit-truck-active-link"]');
    if (activeTruckLink) return getText(activeTruckLink);

    const previewLinks = [...unitCell.querySelectorAll('.preview-link')].map(getText).filter(Boolean);
    if (previewLinks.length) return previewLinks[0];

    const text = getText(unitCell);
    const firstLine = text.split(/\s{2,}/)[0];
    return cleanText(firstLine);
  }

  function getRows() {
    return [...document.querySelectorAll('tbody.p-datatable-tbody > tr.p-selectable-row')];
  }

  function parseRow(row) {
    const unitCell = row.querySelector('[data-testid^="at-unit-or-driver-n"]');
    const proCell = row.querySelector('[data-testid^="at-pro-n"]');
    const customerCell = row.querySelector('[data-testid^="at-customer-n"]');
    const reasonCell = row.querySelector('[data-testid^="at-reason-n"]');

    if (!unitCell || !proCell || !reasonCell) return null;

    const truckNumber = findTruckNumber(unitCell);
    const proNumber = getText(proCell);
    const referenceText = customerCell
      ? getText(customerCell.querySelector('[data-testid^="at-reference-n"]') || customerCell)
      : '';

    const referenceNumber = cleanText(referenceText.replace(/^Ref\s*/i, ''));
    const comments = getText(reasonCell);

    return {
      truckNumber,
      proNumber,
      referenceNumber,
      comments
    };
  }

  async function copyLoads() {
    const rows = getRows();
    const parsed = rows.map(parseRow).filter(Boolean);

    if (!parsed.length) {
      alert('No visible pending loads found.');
      return;
    }

    const header = ['Truck Number', 'PRO Number', 'Reference Number', 'Comments'];
    const lines = [
      header.join('\t'),
      ...parsed.map(item => [
        escapeCell(item.truckNumber),
        escapeCell(item.proNumber),
        escapeCell(item.referenceNumber),
        escapeCell(item.comments)
      ].join('\t'))
    ];

    const output = lines.join('\n');

    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(output, 'text');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(output);
      } else {
        throw new Error('Clipboard API unavailable');
      }

      const btn = document.getElementById(BUTTON_ID);
      if (btn) {
        const oldText = btn.textContent;
        btn.textContent = `Copied ${parsed.length} loads`;
        btn.style.background = '#1a8f83';
        setTimeout(() => {
          btn.textContent = oldText;
          btn.style.background = '#2563eb';
        }, 1800);
      }
    } catch (err) {
      console.error('Copy failed:', err);
      alert('Copy failed. Open console for details.');
    }
  }

  function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.textContent = 'Copy Pending Loads';
    btn.addEventListener('click', copyLoads);

    Object.assign(btn.style, {
      position: 'fixed',
      top: '70px',
      right: '200px',
      zIndex: '99999',
      background: '#2563eb',
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      padding: '10px 14px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      boxShadow: '0 2px 10px rgba(0,0,0,0.18)'
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#1d4ed8';
    });

    btn.addEventListener('mouseleave', () => {
      if (!btn.textContent.startsWith('Copied')) {
        btn.style.background = '#2563eb';
      }
    });

    document.body.appendChild(btn);
  }

  function init() {
    createButton();
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById(BUTTON_ID)) createButton();
  });

  window.addEventListener('load', init);
  setTimeout(init, 1000);
  setTimeout(init, 2500);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
