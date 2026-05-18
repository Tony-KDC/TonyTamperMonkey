// ==UserScript==
// @name         MotionTMS Max Rows & My Group (No Auto-Paging)
// @namespace    https://tampermonkey.net/
// @version      7.0
// @description  Runs on all Express Motion pages. Forces My Group and sets max rows, but leaves pagination to the user.
// @match        https://express.motiontms.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CFG = {
    debug: true,
    settleMs: 1500
  };

  const log = (...args) => CFG.debug && console.log('[MotionTMS SiteWide]', ...args);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => Array.from(root.querySelectorAll(s));
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  function addBadge(message) {
    let el = qs('#tm-sitewide-badge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tm-sitewide-badge';
      el.style.cssText = `
        position: fixed;
        right: 12px;
        bottom: 12px;
        z-index: 999999;
        background: #111;
        color: #fff;
        padding: 8px 10px;
        border-radius: 10px;
        font: 600 12px -apple-system,BlinkMacSystemFont,sans-serif;
        box-shadow: 0 4px 16px rgba(0,0,0,.25);
        pointer-events: none;
        transition: opacity 0.5s;
        opacity: 0.95;
      `;
      document.body.appendChild(el);
    }
    el.style.opacity = '0.95';
    el.textContent = message;
  }

  function hideBadge() {
    const el = qs('#tm-sitewide-badge');
    if (el) el.style.opacity = '0';
  }

  let isProcessing = false;

  async function processTable(paginator) {
    if (isProcessing) return;
    isProcessing = true;
    paginator.dataset.tmProcessed = 'true';

    log('Processing new table/paginator');

    // 1. Switch to My Group if the tab buttons exist on this page
    const groupBtn = qsa('.mat-button-toggle-button').find(b => txt(b).toLowerCase() === 'my group');
    if (groupBtn) {
      const activeBtn = qs('.mat-button-toggle-checked');
      if (activeBtn && txt(activeBtn).toLowerCase() !== 'my group') {
        addBadge('Switching to My Group...');
        groupBtn.click();
        await sleep(CFG.settleMs);

        // If clicking the tab destroys and rebuilds the table, we should stop here.
        // The observer will catch the newly built table automatically.
        if (!document.body.contains(paginator)) {
          isProcessing = false;
          return;
        }
      }
    }

    // 2. Maximize Page Size
    const dd = qs('.p-paginator-rpp-options');
    if (dd) {
      addBadge('Setting max rows...');
      const labelEl = qs('.p-dropdown-label', dd) || dd;
      const currentVal = parseInt((txt(labelEl).match(/\d+/) || ['0'])[0], 10);

      // Open the dropdown
      const trigger = qs('.p-dropdown-trigger', dd) || dd;
      trigger.click();
      await sleep(800); // Wait for animation

      // Find the highest number option
      const options = qsa('.p-dropdown-item, li[role="option"], .p-selectitem')
        .map(el => ({ el, n: parseInt((txt(el).match(/\d+/) || ['0'])[0], 10) }))
        .filter(x => x.n > 0)
        .sort((a, b) => b.n - a.n);

      if (options.length > 0) {
        const best = options[0];
        if (best.n > currentVal) {
          log('Increasing rows to:', best.n);
          best.el.click();
          await sleep(CFG.settleMs);

          if (!document.body.contains(paginator)) {
             isProcessing = false;
             return; // Let the observer catch the new table
          }
        } else {
          log('Already at max rows:', currentVal);
          document.body.click(); // Close the dropdown safely
        }
      } else {
        document.body.click();
      }
    }

    // Finished! Let the user control the pagination manually from here.
    addBadge('Max rows set!');
    setTimeout(hideBadge, 3000); // Hide the badge after 3 seconds so it's not in your way

    isProcessing = false;
  }

  // Continuously watch the site for new tables appearing
  const observer = new MutationObserver(() => {
    // Look for a paginator we haven't processed yet
    const paginator = qs('.p-paginator:not([data-tm-processed])');
    const tableHasRows = qs('table tbody tr');

    if (paginator && tableHasRows && !isProcessing) {
      // Mark it immediately so it doesn't trigger 100 times
      paginator.dataset.tmProcessed = 'true';

      // Wait 1 second for the table to finish loading its initial data, then start
      setTimeout(() => {
        processTable(paginator).catch(err => {
          console.error('[MotionTMS SiteWide] Error:', err);
          isProcessing = false;
        });
      }, 1000);
    }
  });

  // Start watching the page
  observer.observe(document.body, { childList: true, subtree: true });

})();
