// ==UserScript==
// @name         DAT One - Gmail Email Load Helper SAFE
// @namespace    http://tampermonkey.net/
// @version      5.4
// @description  DAT Email Load button + safer Gmail helper. v5.4: removed the floating Gmail helper badge. v5.3: the email body no longer includes the Miles line.
// @match        https://one.dat.com/*
// @match        https://mail.google.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/DAT%20One%20-%20Gmail%20Email%20Load%20Helper%20SAFE.user.js
// @downloadURL  https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/DAT%20One%20-%20Gmail%20Email%20Load%20Helper%20SAFE.user.js
// ==/UserScript==

(function () {
  'use strict';

  const TEAM_CC = 'Teamblue@uskoinc.com';
  const STORAGE_KEY = 'dat_pending_load_email_v54';
  const BTN_CLASS = 'tm-email-load-btn';

  function clean(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/\(\d+\)/g, '')
      .trim();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =========================
  // DAT SIDE
  // =========================

  function getDetailRoot(emailEl) {
    return (
      emailEl.closest('.details-column') ||
      emailEl
        .closest('[data-test="contact-information-container"]')
        ?.closest('.details-column') ||
      document
    );
  }

  function getText(root, selector) {
    return clean(root.querySelector(selector)?.textContent || '');
  }

  function getDataRow(root, wantedLabel) {
    for (const row of root.querySelectorAll('.data-row')) {
      const label = clean(row.querySelector('.data-label')?.textContent || '');

      if (label.toLowerCase() !== wantedLabel.toLowerCase()) continue;

      const value = clean(row.querySelector('.data-item')?.textContent || '');

      if (!value || value === '-' || value === '–') return '';

      return value;
    }

    return '';
  }

  function getLoadInfo(root) {
    return {
      pickup: getText(root, '.route-origin .city'),
      drop: getText(root, '.route-destination .city'),
      pickupDate: getText(root, '.route-origin .date'),
      reference: getDataRow(root, 'Reference ID')
    };
  }

  function buildEmail(info) {
    const route =
      `${info.pickup || 'Pickup'} to ${info.drop || 'Drop'}`;

    const subject =
      `Load Inquiry - ${route}`;

    const lines = [
      'Hello,',
      '',
      'Is this load still available?',
      '',
      `Route: ${route}`
    ];

    if (info.pickupDate) {
      lines.push(`Pickup Date: ${info.pickupDate}`);
    }

    if (info.reference) {
      lines.push(`Reference: ${info.reference}`);
    }

    lines.push('', 'Thank you.');

    return {
      subject,
      body: lines.join('\n')
    };
  }

  async function openGmail(toEmail, root, btn) {
    const info = getLoadInfo(root);
    const email = buildEmail(info);

    await GM_setValue(STORAGE_KEY, {
      body: email.body,
      created: Date.now()
    });

    const gmailUrl =
      'https://mail.google.com/mail/?view=cm&tf=1' +
      '&to=' + encodeURIComponent(toEmail) +
      '&cc=' + encodeURIComponent(TEAM_CC) +
      '&su=' + encodeURIComponent(email.subject);

    window.open(gmailUrl, 'DAT_GMAIL_COMPOSE');

    btn.textContent = 'Opening Gmail';

    setTimeout(() => {
      btn.textContent = 'Email Load';
    }, 1500);
  }

  function makeButton(email, root) {
    const btn = document.createElement('button');

    btn.type = 'button';
    btn.className = BTN_CLASS;
    btn.textContent = 'Email Load';

    btn.style.cssText = `
      margin-left:8px;
      padding:5px 10px;
      background:#24a148;
      color:#fff;
      border:none;
      border-radius:6px;
      font-size:11px;
      font-weight:800;
      cursor:pointer;
      white-space:nowrap;
    `;

    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      openGmail(email, root, btn);
    });

    return btn;
  }

  function scanDAT() {
    document
      .querySelectorAll('.contacts__email a[href^="mailto:"]')
      .forEach(emailLink => {
        const parent = emailLink.parentElement;

        if (!parent) return;
        if (parent.querySelector(`.${BTN_CLASS}`)) return;

        const href = emailLink.getAttribute('href') || '';

        const email =
          clean(href.replace(/^mailto:/i, '')) ||
          clean(emailLink.textContent);

        if (!email) return;

        const root = getDetailRoot(emailLink);

        emailLink.insertAdjacentElement(
          'afterend',
          makeButton(email, root)
        );
      });
  }

  function startDAT() {
    scanDAT();

    let timer = null;

    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scanDAT, 400);
    }).observe(document.body, {
      childList: true,
      subtree: true
    });

    setInterval(scanDAT, 3000);
  }

  // =========================
  // GMAIL SIDE
  // =========================

  // v5.4: the floating "DAT Gmail Helper ON" badge was removed at
  // Anthony's request — it sat in Gmail's bottom-right corner and covered
  // the reply / "view reply" controls. The helper now works silently:
  // no on-screen badge or status text at all. Errors still go to console.

  function getVisibleEditors() {
    return Array.from(
      document.querySelectorAll(
        'div[contenteditable="true"][role="textbox"],' +
        'div[contenteditable="true"][aria-label*="Message Body"],' +
        'div.LW-avf[contenteditable="true"]'
      )
    ).filter(el => {
      const rect = el.getBoundingClientRect();

      return (
        el.offsetParent !== null &&
        rect.width > 150 &&
        rect.height > 30
      );
    });
  }

  let processing = false;

  async function tryInsertPendingMessage() {
    if (processing) return;

    processing = true;

    try {
      const pending = await GM_getValue(STORAGE_KEY, null);

      if (!pending?.body) {
        return;
      }

      if (
        pending.created &&
        Date.now() - pending.created > 180000
      ) {
        await GM_deleteValue(STORAGE_KEY);
        return;
      }

      const editors = getVisibleEditors();

      if (!editors.length) {
        return;
      }

      const editor = editors[editors.length - 1];

      if (editor.dataset.datInserted === '1') {
        await GM_deleteValue(STORAGE_KEY);
        return;
      }

      editor.focus();

      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(true);

      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      const ok = document.execCommand(
        'insertText',
        false,
        pending.body + '\n\n'
      );

      if (ok) {
        editor.dataset.datInserted = '1';

        await GM_deleteValue(STORAGE_KEY);
      }

    } catch (err) {
      console.error('[DAT Gmail Helper]', err);
    } finally {
      processing = false;
    }
  }

  function startGmail() {
    setTimeout(tryInsertPendingMessage, 1500);

    setInterval(() => {
      tryInsertPendingMessage();
    }, 2000);
  }

  // =========================
  // START
  // =========================

  if (location.hostname === 'one.dat.com') {
    startDAT();
  }

  if (location.hostname === 'mail.google.com') {
    startGmail();
  }

})();
