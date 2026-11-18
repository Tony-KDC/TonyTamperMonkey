// ==UserScript==
// @name         DAT One - Gmail Email Load Helper SAFE
// @namespace    http://tampermonkey.net/
// @version      5.7
// @description  DAT Email Load button + safer Gmail helper. v5.7: the insert check no longer hardcodes the body's wording — the presence marker is derived from the actual pending body (its Route line), and each attempt uses one insert method only. v5.6: claim-once hand-over, textContent verification, bounded attempts. v5.5: stable storage key with legacy-key fallback, broader editor detection. v5.4: removed the floating Gmail helper badge. v5.3: the email body no longer includes the Miles line.
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
  const CLAIM_KEY = 'dat_pending_load_email_claim';
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
  //    DOM-insert fallback when execCommand('insertText') does not take.
  // v5.6 (below) supersedes the verification and retry approach — see
  // the anti-duplication note above getVisibleEditors.

  // v5.6 anti-duplication design (fixes the runaway duplication Anthony
  // hit on 2026-11-18, where the body kept pasting itself into the
  // compose over and over):
  //  - v5.5 verified inserts by reading the editor's innerText. In
  //    Gmail's full-page compose that read can come back EMPTY even
  //    when the text visibly landed, so the script believed the insert
  //    had failed, kept the pending body, and re-inserted on every tick.
  //    v5.6 verifies with textContent, which is reliable on any node.
  //  - The hand-over is CLAIMED exactly once: when a compose editor is
  //    present in this tab, the script writes a claim and deletes every
  //    pending key BEFORE inserting, so no tick, tab, or second script
  //    instance can pick the same body up again.
  //  - Attempts are bounded (max 3 per claimed body), the target editor
  //    is marked once inserted, and the v5.5 post-insert re-check watch
  //    is removed — it was another path to duplicate inserts.
  //  - (Superseded in v5.7: the presence marker is derived from the
  //    pending body itself — see markerFor — not a hardcoded sentence.)

  // v5.7: NEVER hardcode the body's wording in the checker. v5.6 looked
  // for the exact sentence "Is this load still available", but a body
  // with different wording (Anthony's live body reads "Details Please?")
  // never matched that check — every verification failed and the script
  // kept re-inserting. The marker is now derived from the pending body
  // itself: its "Route:" line (unique to the load), falling back to the
  // body's longest line. Whatever wording a body uses, the check matches
  // the body that was actually handed over.
  function markerFor(body) {
    const lines = String(body || '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const routeLine = lines.find(line => line.startsWith('Route:'));

    if (routeLine) return routeLine;

    return lines.sort((a, b) => b.length - a.length)[0] || '';
  }

  const CLAIM_TTL_MS = 30000;
  const MAX_ATTEMPTS = 3;

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
    // textContent, NOT innerText: innerText needs layout and can read
    // empty for Gmail's compose editor even when it holds text — that
    // false "empty" is what made v5.5 re-insert forever.
    return editor.tagName === 'TEXTAREA'
      ? editor.value
      : (editor.textContent || '');
  }

  function insertIntoEditor(editor, body, marker, useFallbackFirst) {
    const text = body + '\n\n';

    if (editor.tagName === 'TEXTAREA') {
      editor.value = text + editor.value;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return editorText(editor).includes(marker);
    }

    editor.focus();

    if (!useFallbackFirst) {
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

      if (editorText(editor).includes(marker)) {
        return true;
      }

      if (ok) {
        // execCommand said it inserted but the marker is not readable
        // yet. Gmail can apply the text a beat later — do NOT stack the
        // fallback on top. Report "not yet"; the next tick checks
        // presence first and will mark this done without inserting
        // again. If it truly never landed, the NEXT attempt uses the
        // fallback method instead (useFallbackFirst).
        return false;
      }
    }

    // Fallback: build the text as DOM nodes at the start of the editor.
    // Used when execCommand genuinely failed, or on later attempts when
    // an earlier execCommand "success" never actually landed.
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

    return editorText(editor).includes(marker);
  }

  let processing = false;
  let claimed = null;

  async function tryInsertPendingMessage() {
    if (processing) return;

    processing = true;

    try {
      if (!claimed) {
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

        // Only claim when THIS tab actually has a compose editor —
        // the script also runs in the main Gmail tab, and claiming
        // there would eat the body the compose tab needs.
        const editors = getVisibleEditors();

        if (!editors.length) {
          return;
        }

        const editor = editors[editors.length - 1];

        // The body is already in this compose (inserted by an earlier
        // tick or version): clean up and never touch it again.
        if (
          editor.dataset.datLoadInserted === '1' ||
          editorText(editor).includes(markerFor(pending.body))
        ) {
          await clearAllPending();
          claimed = { body: pending.body, created: pending.created, done: true };
          return;
        }

        // Another Gmail tab may already be handling this exact body.
        const claim = await GM_getValue(CLAIM_KEY, null);

        if (
          claim &&
          claim.created === pending.created &&
          Date.now() - claim.ts < CLAIM_TTL_MS
        ) {
          return;
        }

        // Claim it: mark first, then delete every pending key BEFORE
        // inserting, so nothing can pick this body up a second time.
        await GM_setValue(CLAIM_KEY, {
          created: pending.created,
          ts: Date.now()
        });

        claimed = {
          body: pending.body,
          created: pending.created,
          attempts: 0,
          lastAttemptAt: 0,
          done: false
        };

        await clearAllPending();
      }

      if (claimed.done) {
        return;
      }

      const editors = getVisibleEditors();

      if (!editors.length) {
        return;
      }

      const editor = editors[editors.length - 1];

      if (
        editor.dataset.datLoadInserted === '1' ||
        editorText(editor).includes(markerFor(claimed.body))
      ) {
        claimed.done = true;
        return;
      }

      // Space attempts out: the first ticks can fire back-to-back
      // (initial timeout + interval), and Gmail needs a beat to apply
      // an insert. Presence is re-checked every tick, but a new insert
      // attempt happens at most once every ~2.5 s.
      if (Date.now() - claimed.lastAttemptAt < 2500) {
        return;
      }

      claimed.lastAttemptAt = Date.now();
      claimed.attempts += 1;

      if (insertIntoEditor(
        editor,
        claimed.body,
        markerFor(claimed.body),
        claimed.attempts >= 2
      )) {
        editor.dataset.datLoadInserted = '1';
        claimed.done = true;
      } else if (claimed.attempts >= MAX_ATTEMPTS) {
        console.error(
          '[DAT Gmail Helper] Insert did not land after ' +
          MAX_ATTEMPTS + ' attempts; giving up on this one.'
        );
        claimed.done = true;
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
