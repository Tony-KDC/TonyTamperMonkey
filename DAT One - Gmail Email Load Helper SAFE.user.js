// ==UserScript==
// @name         DAT One - Gmail Email Load Helper SAFE
// @namespace    http://tampermonkey.net/
// @version      5.5
// @description  DAT Email Load button + safer Gmail helper. v5.5: more reliable Gmail-side insertion (stable storage key with legacy-key fallback, broader compose editor detection incl. full-page compose and plain-text mode, verified insert). v5.4: removed the floating Gmail helper badge. v5.3: the email body no longer includes the Miles line.
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
  // v5.5: ONE stable storage key from now on (it no longer changes with
  // the version). The old per-version keys are still read as a fallback,
  // so a DAT tab running an older script version and a Gmail tab running
  // the new one (or the other way around) still hand the body over.
  const STORAGE_KEY = 'dat_pending_load_email';
  const LEGACY_KEYS = [
    'dat_pending_load_email_v54',
    'dat_pending_load_email_v53',
    'dat_pending_load_email_v52'
  ];
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

    const pending = {
      body: email.body,
      created: Date.now()
    };

    // Clear any stale hand-overs, then write the stable key AND the v5.4
    // key, so a Gmail tab still running v5.4 finds the body too.
    for (const key of LEGACY_KEYS) {
      await GM_deleteValue(key);
    }

    await GM_setValue(STORAGE_KEY, pending);
    await GM_setValue('dat_pending_load_email_v54', pending);

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
  // the reply / "view reply" controls. The helper works silently:
  // no on-screen badge or status text at all. Errors go to console.
  //
  // v5.5 insertion hardening, after a live failure on 2026-11-16 where a
  // full-page Gmail compose (mail.google.com/mail/u/0/?tf=cm...) opened
  // with only the signature and no load info:
  //  - reads the stable key plus every legacy per-version key, so mixed
  //    script versions across tabs still hand over;
  //  - detects more editor shapes: popup compose, full-page compose, and
  //    plain-text mode (a <textarea>), and no longer requires
  //    offsetParent (the full-page compose editor can report null);
  //  - verifies the text actually landed in the editor, with a manual
  //    DOM-insert fallback when execCommand('insertText') does not take;
  //  - re-checks for ~15 s after inserting, in case Gmail's own compose
  //    setup (signature insertion) overwrites the editor afterwards.

  const BODY_MARKER = 'Is this load still available?';

  function getVisibleEditors() {
    return Array.from(
      document.querySelectorAll(
        'div[contenteditable="true"][role="textbox"],' +
        'div[contenteditable="true"][aria-label*="Message Body"],' +
        'div.LW-avf[contenteditable="true"],' +
        'div.editable[contenteditable="true"],' +
        'textarea[name="body"],' +
        'textarea.Ak'
      )
    ).filter(el => {
      const rect = el.getBoundingClientRect();

      return rect.width > 100 && rect.height > 20;
    });
  }

  async function readPending() {
    for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
      const value = await GM_getValue(key, null);

      if (value?.body) {
        return value;
      }
    }

    return null;
  }

  async function clearAllPending() {
    await GM_deleteValue(STORAGE_KEY);

    for (const key of LEGACY_KEYS) {
      await GM_deleteValue(key);
    }
  }

  function editorText(editor) {
    return editor.tagName === 'TEXTAREA'
      ? editor.value
      : (editor.innerText || editor.textContent || '');
  }

  function insertIntoEditor(editor, body) {
    const text = body + '\n\n';

    if (editor.tagName === 'TEXTAREA') {
      editor.value = text + editor.value;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return editorText(editor).includes(BODY_MARKER);
    }

    editor.focus();

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    let ok = false;

    try {
      ok = document.execCommand('insertText', false, text);
    } catch (e) {
      ok = false;
    }

    if (!ok || !editorText(editor).includes(BODY_MARKER)) {
      // Fallback: build the text as DOM nodes at the start of the editor.
      try {
        const fragment = document.createDocumentFragment();

        text.split('\n').forEach((line, i, arr) => {
          fragment.appendChild(document.createTextNode(line));
          if (i < arr.length - 1) {
            fragment.appendChild(document.createElement('br'));
          }
        });

        const r2 = document.createRange();
        r2.selectNodeContents(editor);
        r2.collapse(true);
        r2.insertNode(fragment);

        editor.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (e) {
        // Verification below reports the failure.
      }
    }

    return editorText(editor).includes(BODY_MARKER);
  }

  let processing = false;
  let lastInsert = null;

  async function tryInsertPendingMessage() {
    if (processing) return;

    processing = true;

    try {
      // Post-insert watch: if Gmail's compose setup wiped our text
      // (e.g. signature inserted after us), put it back once or twice.
      if (
        lastInsert &&
        Date.now() - lastInsert.at < 15000 &&
        lastInsert.count < 3
      ) {
        const editors = getVisibleEditors();
        const stillThere = editors.some(
          ed => editorText(ed).includes(BODY_MARKER)
        );

        if (!stillThere && editors.length) {
          if (insertIntoEditor(editors[editors.length - 1], lastInsert.body)) {
            lastInsert.count += 1;
            lastInsert.at = Date.now();
          }
        }
      }

      const pending = await readPending();

      if (!pending?.body) {
        return;
      }

      if (
        pending.created &&
        Date.now() - pending.created > 180000
      ) {
        await clearAllPending();
        return;
      }

      const editors = getVisibleEditors();

      if (!editors.length) {
        return;
      }

      // Already in a compose (inserted by us, or by an older version):
      // just clean up the hand-over so it cannot insert twice.
      if (editors.some(ed => editorText(ed).includes(BODY_MARKER))) {
        await clearAllPending();
        return;
      }

      const editor = editors[editors.length - 1];

      if (insertIntoEditor(editor, pending.body)) {
        lastInsert = { body: pending.body, at: Date.now(), count: 1 };
        await clearAllPending();
      }

    } catch (err) {
      console.error('[DAT Gmail Helper]', err);
    } finally {
      processing = false;
    }
  }

  function startGmail() {
    setTimeout(tryInsertPendingMessage, 1200);

    setInterval(() => {
      tryInsertPendingMessage();
    }, 1500);
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
