// ==UserScript==
// @name         DAT to Apex - MC Checker + Route Tools
// @namespace    http://tampermonkey.net/
// @version      6.2
// @description  Adds Copy Route, Maps, and Apex MC check buttons to DAT One. Auto-fills and submits on Apex Dashboard, then paints the DAT button with the Apex verdict read from the results table (OK / RISK / CHECKED). Verdicts older than 24 hours paint as STALE instead of staying green.
// @match        https://one.dat.com/*
// @match        https://amp.apexcapitalcorp.com/*
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        window.focus
// @updateURL    https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/DAT%20to%20Apex%20-%20MC%20Checker%20%2B%20Route%20Tools.user.js
// @downloadURL  https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/DAT%20to%20Apex%20-%20MC%20Checker%20%2B%20Route%20Tools.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ==========================================
    // PART 1: APEX DASHBOARD LOGIC - REVAMPED UI
    // ==========================================
    // Apex replaced the old credit-check form (separate #motorCarrierNumber,
    // #companyName, #state fields) with ONE search box: #creditCheckSearch
    // ("Search Company, MC#, or FF#"). The old field no longer exists, which
    // is why the fill stopped working.
    //
    // New Apex flow this code follows:
    //  1. Type the MC into #creditCheckSearch. The Go button (#cc_go_button)
    //     starts out disabled and only enables once the box has 3+ characters,
    //     so we must fire real 'input' events after setting the value.
    //  2. Clicking Go opens Apex's own "Search Customer" dialog. If the MC
    //     matches exactly one company, Apex runs the credit check on its own;
    //     if several match, the user picks one in the dialog.
    //  3. The finished check appears as the NEWEST row of the Recent Credit
    //     Checks table inside #CreditCheckPanel (columns: Date, Company,
    //     Status, Credit Limit, Remaining, Note, Override). We read the
    //     verdict from that row's Status column — no guessing from page text.
    if (window.location.href.includes('apexcapitalcorp.com')) {
        console.log('[TM Apex] Active');

        let lastHandled = '';

        const SEARCH_INPUT_SEL = '#creditCheckSearch';
        const GO_BUTTON_SEL = '#cc_go_button';
        const PANEL_SEL = '#CreditCheckPanel';
        const RESULT_KEY_PREFIX = 'apex_result_';
        const CAPTURE_MC_KEY = 'apex_capture_mc';
        const CAPTURE_TS_KEY = 'apex_capture_ts';
        const CAPTURE_BASELINE_KEY = 'apex_capture_baseline';
        const CAPTURE_WINDOW_MS = 120000; // user may need time to pick in the dialog

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function waitForElement(selector, timeout = 15000) {
            const start = Date.now();

            while (Date.now() - start < timeout) {
                const el = document.querySelector(selector);
                if (el) return el;
                await sleep(300);
            }

            return null;
        }

        async function waitForEnabled(el, timeout = 3000) {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                if (!el.disabled) return true;
                await sleep(200);
            }
            return !el.disabled;
        }

        function setNativeValue(el, value) {
            const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value')?.set;
            setter ? setter.call(el, value) : el.value = value;

            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        }

        // Read the newest row of the Recent Credit Checks table.
        // Returns { id, company, status, note } or null.
        function getTopCheckRow() {
            const panel = document.querySelector(PANEL_SEL);
            if (!panel) return null;

            const table = panel.querySelector('table#row') || panel.querySelector('table.report');
            if (!table) return null;

            const rows = table.querySelectorAll('tr');
            for (let i = 0; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                if (cells.length < 3) continue;

                const dateLink = cells[0].querySelector('a[href*="CreditCheckPage.do?id="]');
                if (!dateLink) continue; // header row has no such link

                const idMatch = (dateLink.getAttribute('href') || '').match(/id=(\d+)/);
                const companyLink = cells[1].querySelector('a');
                const noteIcon = rows[i].querySelector('.cc-note-icon');

                return {
                    id: idMatch ? parseInt(idMatch[1], 10) : 0,
                    company: (companyLink ? companyLink.textContent : cells[1].textContent).replace(/\s+/g, ' ').trim(),
                    status: cells[2].textContent.replace(/\s+/g, ' ').trim(),
                    note: noteIcon ? (noteIcon.getAttribute('title') || '').trim() : ''
                };
            }
            return null;
        }

        function classifyStatus(statusText) {
            const s = (statusText || '').toLowerCase();
            if (/not\s+approved|declin|denied|reject|ineligible/.test(s)) return 'risk';
            if (/approved/.test(s)) return 'approved';
            return 'checked';
        }

        function saveApexResult(mc, verdict, detail) {
            const payload = { mc: mc, verdict: verdict, detail: detail || '', ts: Date.now() };
            GM_setValue(RESULT_KEY_PREFIX + mc, JSON.stringify(payload));
            GM_setValue('apex_last_result', JSON.stringify(payload));
            GM_setValue(CAPTURE_MC_KEY, '');
            GM_setValue(CAPTURE_BASELINE_KEY, '');
            console.log('[TM Apex] Verdict saved for MC', mc, payload);
        }

        // Watch for our check to land as a new top row in the results table.
        function detectVerdict() {
            const mc = GM_getValue(CAPTURE_MC_KEY, '');
            if (!mc) return;

            const startedAt = parseInt(GM_getValue(CAPTURE_TS_KEY, '0'), 10) || 0;
            if (Date.now() - startedAt > CAPTURE_WINDOW_MS) {
                GM_setValue(CAPTURE_MC_KEY, '');
                GM_setValue(CAPTURE_BASELINE_KEY, '');
                console.log('[TM Apex] Capture window expired for MC', mc);
                return;
            }

            const baselineRaw = GM_getValue(CAPTURE_BASELINE_KEY, '');
            if (baselineRaw === '') return; // no baseline recorded — never guess
            const baseline = parseInt(baselineRaw, 10) || 0;

            const top = getTopCheckRow();
            if (!top || !top.id) return;
            if (top.id <= baseline) return; // still the pre-check top row

            const verdict = classifyStatus(top.status);
            let detail = `${top.company} — Status: ${top.status}`;
            if (top.note) detail += ` — Note: ${top.note}`;
            saveApexResult(mc, verdict, detail);
        }

        async function checkAndFillMC() {
            const pendingMC = GM_getValue('pending_mc_number', '');

            if (!pendingMC || pendingMC === lastHandled) return;

            console.log('[TM Apex] Pending MC found:', pendingMC);

            const searchInput = await waitForElement(SEARCH_INPUT_SEL);
            const goButton = await waitForElement(GO_BUTTON_SEL);

            if (!searchInput || !goButton) {
                console.warn('[TM Apex] Credit check search box or Go button not found');
                return;
            }

            lastHandled = pendingMC;

            // Remember the newest existing check BEFORE submitting, so
            // detectVerdict() can recognise the new row when it appears.
            const topBefore = getTopCheckRow();
            GM_setValue(CAPTURE_BASELINE_KEY, topBefore ? String(topBefore.id) : '0');

            searchInput.focus();
            setNativeValue(searchInput, '');
            await sleep(100);
            setNativeValue(searchInput, pendingMC);

            // Go stays disabled until Apex registers the input. Wait for it;
            // if native events didn't do it, nudge through Apex's own jQuery.
            let enabled = await waitForEnabled(goButton, 3000);
            if (!enabled && window.$) {
                try { window.$(searchInput).val(pendingMC).trigger('input').trigger('change').trigger('keyup'); } catch (e) {}
                enabled = await waitForEnabled(goButton, 2000);
            }
            if (!enabled) {
                console.warn('[TM Apex] Go button never enabled');
                GM_setValue('pending_mc_number', '');
                return;
            }

            // Arm verdict capture BEFORE opening the search dialog.
            GM_setValue(CAPTURE_MC_KEY, pendingMC);
            GM_setValue(CAPTURE_TS_KEY, String(Date.now()));

            console.log('[TM Apex] Clicking Go');
            goButton.click();

            await sleep(800);
            GM_setValue('pending_mc_number', '');
        }

        setInterval(() => { checkAndFillMC(); detectVerdict(); }, 700);
        window.addEventListener('focus', () => { checkAndFillMC(); detectVerdict(); });
        window.addEventListener('load', () => { checkAndFillMC(); detectVerdict(); });
        checkAndFillMC();

        return;
    }

    // ==========================================
    // PART 2: DAT ONE LOGIC
    // ==========================================

    function addStyles() {
        if (document.getElementById('tm-route-tools-style')) return;

        const style = document.createElement('style');
        style.id = 'tm-route-tools-style';
        style.textContent = `
            .tm-route-tools-wrap {
                display: inline-flex !important;
                flex-direction: column !important;
                align-items: flex-start !important;
                gap: 10px !important;
                margin-left: 12px !important;
                vertical-align: top !important;
            }

            .tm-route-btn {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                min-width: 160px !important;
                height: 36px !important;
                padding: 0 16px !important;
                border-radius: 999px !important;
                font-family: Sequel Sans, Helvetica, Arial, sans-serif !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                letter-spacing: 1px !important;
                text-transform: uppercase !important;
                cursor: pointer !important;
                white-space: nowrap !important;
                box-sizing: border-box !important;
                z-index: 999999 !important;
                position: relative !important;
                background: #fff !important;
                -webkit-user-select: none !important;
                user-select: none !important;
                touch-action: manipulation !important;
            }

            .tm-copy-route-btn { border: 2px solid #d90429 !important; color: #d90429 !important; background: #ffebee !important; }
            .tm-copy-route-btn:hover { background: #ffd9df !important; }
            .tm-copy-route-btn.tm-copied { background: #e8f5e9 !important; border-color: #1b8f3a !important; color: #1b8f3a !important; }

            .tm-open-maps-btn { border: 2px solid #0046e0 !important; color: #0046e0 !important; background: #eef4ff !important; }
            .tm-open-maps-btn:hover { background: #dfeaff !important; }
            .tm-open-maps-btn.tm-opened { border-color: #0a7f3f !important; color: #0a7f3f !important; background: #e8f5e9 !important; }

            /* APEX BUTTON STYLES */
            .tm-apex-btn {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                height: 24px !important;
                padding: 0 10px !important;
                margin-left: 8px !important;
                border: 1px solid #d19900 !important;
                border-radius: 4px !important;
                background: #fdf5e6 !important;
                color: #8a5b00 !important;
                font-family: Sequel Sans, Helvetica, Arial, sans-serif !important;
                font-size: 10px !important;
                font-weight: 700 !important;
                letter-spacing: 0.5px !important;
                text-transform: uppercase !important;
                cursor: pointer !important;
                vertical-align: middle !important;
                box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
            }
            .tm-apex-btn:hover { background: #fcebc7 !important; border-color: #b07a00 !important; }
            .tm-apex-btn.tm-apex-sending { background: #e8f5e9 !important; border-color: #1b8f3a !important; color: #1b8f3a !important; }

            /* APEX VERDICT STYLES (painted from the stored Apex result) */
            .tm-apex-btn.tm-apex-ok { background: #e8f5e9 !important; border-color: #1b8f3a !important; color: #1b8f3a !important; }
            .tm-apex-btn.tm-apex-risk { background: #ffebee !important; border-color: #d90429 !important; color: #d90429 !important; }
            .tm-apex-btn.tm-apex-done { background: #eef1f4 !important; border-color: #9aa5b1 !important; color: #45525e !important; }
            .tm-apex-btn.tm-apex-stale { background: #fdf5e6 !important; border-color: #d19900 !important; color: #8a5b00 !important; }

            /* Modal Styles */
            .tm-copy-modal-backdrop { position: fixed !important; inset: 0 !important; background: rgba(0,0,0,.45) !important; z-index: 2147483646 !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 20px !important; }
            .tm-copy-modal { width: min(92vw, 520px) !important; background: #ffffff !important; border-radius: 16px !important; box-shadow: 0 20px 60px rgba(0,0,0,.25) !important; padding: 18px !important; font-family: Sequel Sans, Helvetica, Arial, sans-serif !important; }
            .tm-copy-modal-title { font-size: 16px !important; font-weight: 700 !important; color: #192129 !important; margin-bottom: 10px !important; }
            .tm-copy-modal-text { width: 100% !important; min-height: 96px !important; border: 2px solid #d0d7de !important; border-radius: 10px !important; padding: 12px !important; font-size: 16px !important; line-height: 1.4 !important; color: #192129 !important; background: #fff !important; resize: none !important; box-sizing: border-box !important; -webkit-user-select: text !important; user-select: text !important; }
            .tm-copy-modal-help { font-size: 13px !important; color: #636d79 !important; margin-top: 10px !important; line-height: 1.4 !important; }
            .tm-copy-modal-actions { display: flex !important; gap: 10px !important; justify-content: flex-end !important; margin-top: 14px !important; flex-wrap: wrap !important; }
            .tm-copy-modal-btn { border: none !important; border-radius: 999px !important; padding: 10px 16px !important; font-size: 13px !important; font-weight: 700 !important; letter-spacing: .5px !important; cursor: pointer !important; }
            .tm-copy-modal-btn-primary { background: #0046e0 !important; color: #fff !important; }
            .tm-copy-modal-btn-secondary { background: #eef1f4 !important; color: #192129 !important; }
        `;
        document.head.appendChild(style);
    }

    // --- Route & Map Functions ---
    function cleanText(text) { return (text || '').replace(/\s+/g, ' ').replace(/\(\d+\)/g, '').trim(); }

    function getOriginDestination() {
        const originEl = document.querySelector('[class*="route-origin"] [class*="city"]');
        const destinationEl = document.querySelector('[class*="route-destination"] [class*="city"]');
        const origin = cleanText(originEl?.textContent || '');
        const destination = cleanText(destinationEl?.textContent || '');

        if (origin && destination) return { origin, destination };

        const tripPlace = Array.from(document.querySelectorAll('[class*="trip-place"]'))
            .find(el => (el.textContent || '').includes(',') && (el.textContent || '').match(/→|➜|›|>/));

        if (tripPlace) {
            const raw = cleanText(tripPlace.textContent).replace(/→|➜|›|>/g, '->');
            const parts = raw.split('->').map(s => s.trim()).filter(Boolean);
            if (parts.length >= 2) return { origin: parts[0], destination: parts[1] };
        }
        return null;
    }

    function getRouteText() {
        const route = getOriginDestination();
        return route ? `${route.origin} -> ${route.destination}` : '';
    }

    function getGoogleMapsUrl() {
        const route = getOriginDestination();
        if (!route) return '';
        return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(route.origin)}&destination=${encodeURIComponent(route.destination)}&travelmode=driving`;
    }

    // --- Modal Copy Functions ---
    function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

    function tryExecCopy(textarea) {
        try {
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
            if (isIOS()) {
                const range = document.createRange();
                range.selectNodeContents(textarea);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                textarea.setSelectionRange(0, textarea.value.length);
            }
            return document.execCommand('copy');
        } catch (e) { return false; }
    }

    async function tryAutoCopy(text) {
        try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
        try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return true; } } catch (e) {}
        return false;
    }

    function closeCopyModal() { const old = document.querySelector('.tm-copy-modal-backdrop'); if (old) old.remove(); }

    function openCopyModal(routeText, sourceBtn) {
        closeCopyModal();
        const backdrop = document.createElement('div'); backdrop.className = 'tm-copy-modal-backdrop';
        const modal = document.createElement('div'); modal.className = 'tm-copy-modal';
        const title = document.createElement('div'); title.className = 'tm-copy-modal-title'; title.textContent = 'Copy Route';
        const textarea = document.createElement('textarea'); textarea.className = 'tm-copy-modal-text'; textarea.value = routeText; textarea.setAttribute('readonly', 'readonly');
        const help = document.createElement('div'); help.className = 'tm-copy-modal-help'; help.textContent = 'On iPad/iPhone, if it does not auto-copy, tap and hold in the box above, then tap Copy.';
        const actions = document.createElement('div'); actions.className = 'tm-copy-modal-actions';
        const copyBtn = document.createElement('button'); copyBtn.className = 'tm-copy-modal-btn tm-copy-modal-btn-primary'; copyBtn.textContent = 'Copy';
        const closeBtn = document.createElement('button'); closeBtn.className = 'tm-copy-modal-btn tm-copy-modal-btn-secondary'; closeBtn.textContent = 'Close';

        copyBtn.addEventListener('click', async function (e) {
            e.preventDefault(); e.stopPropagation();
            let copied = await tryAutoCopy(routeText);
            if (!copied) copied = tryExecCopy(textarea);
            textarea.focus(); textarea.select(); textarea.setSelectionRange(0, textarea.value.length);

            if (copied) {
                copyBtn.textContent = 'Copied';
                sourceBtn.textContent = 'COPIED'; sourceBtn.classList.add('tm-copied');
                setTimeout(() => { sourceBtn.textContent = 'COPY ROUTE'; sourceBtn.classList.remove('tm-copied'); }, 1500);
            } else { copyBtn.textContent = 'Tap text and Copy'; }
        });

        closeBtn.addEventListener('click', closeCopyModal);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeCopyModal(); });

        actions.appendChild(closeBtn); actions.appendChild(copyBtn);
        modal.appendChild(title); modal.appendChild(textarea); modal.appendChild(help); modal.appendChild(actions);
        backdrop.appendChild(modal); document.body.appendChild(backdrop);
        setTimeout(() => { textarea.focus(); textarea.select(); textarea.setSelectionRange(0, textarea.value.length); }, 50);
    }

    function flashButton(btn, text, className) {
        const oldText = btn.textContent;
        btn.textContent = text;
        if (className) btn.classList.add(className);
        setTimeout(() => { btn.textContent = oldText; if (className) btn.classList.remove(className); }, 1500);
    }

    // --- Make Route & Map Buttons ---
    function makeCopyButton() {
        const btn = document.createElement('button'); btn.className = 'tm-route-btn tm-copy-route-btn'; btn.type = 'button'; btn.textContent = 'COPY ROUTE';
        const handler = function (e) {
            e.preventDefault(); e.stopPropagation();
            const route = getRouteText();
            if (!route) { flashButton(btn, 'NO ROUTE FOUND'); return; }
            openCopyModal(route, btn);
        };
        btn.addEventListener('click', handler, { passive: false }); btn.addEventListener('touchend', handler, { passive: false });
        return btn;
    }

    function makeMapsButton() {
        const btn = document.createElement('button'); btn.className = 'tm-route-btn tm-open-maps-btn'; btn.type = 'button'; btn.textContent = 'OPEN GOOGLE MAPS';
        const handler = function (e) {
            e.preventDefault(); e.stopPropagation();
            const url = getGoogleMapsUrl();
            if (!url) { flashButton(btn, 'NO ROUTE FOUND'); return; }
            window.open(url, '_blank', 'noopener');
            flashButton(btn, 'OPENED', 'tm-opened');
        };
        btn.addEventListener('click', handler, { passive: false }); btn.addEventListener('touchend', handler, { passive: false });
        return btn;
    }

    // --- Inject Apex MC Buttons next to text ---
    function injectApexButtons() {
        const mcElements = document.querySelectorAll('div, span, a');

        mcElements.forEach(el => {
            if (el.dataset.apexBtnInjected) return;

            const text = cleanText(el.textContent);
            // Look for "MC" followed by numbers: matches MC# 123456, MC 123456,
            // MC-123456, MC#123456 (v6.0 loosened the original "MC#" only rule)
            const match = text.match(/\bMC\s*#?\s*-?\s*(\d{5,8})\b/i);

            if (match && el.children.length === 0) {
                const mcNumber = match[1];
                el.dataset.apexBtnInjected = 'true';

                const btn = document.createElement('button');
                btn.className = 'tm-apex-btn';
                btn.dataset.mc = mcNumber;
                btn.textContent = 'CHECK APEX';
                btn.title = `Check MC# ${mcNumber} on Apex`;

                const handler = function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    // 1. Send the data to Tampermonkey storage
                    GM_setValue('pending_mc_number', mcNumber);

                    // 2. Visual feedback
                    flashButton(btn, 'SENT!', 'tm-apex-sending');

                    // 3. Open Apex tab
                    window.open('https://amp.apexcapitalcorp.com/m3clients/Dashboard.do', 'apex_dashboard_window');
                };

                btn.addEventListener('click', handler, { passive: false });
                btn.addEventListener('touchend', handler, { passive: false });

                el.insertAdjacentElement('afterend', btn);
            }
        });
    }

    // --- Paint stored Apex verdicts onto the DAT buttons (v6.0, freshness v6.2) ---
    // A stored verdict is only trusted for STALE_HOURS. Past that the button
    // stops showing green/red and paints amber "STALE" instead — a broker
    // that was fine on Monday can be out of business by Wednesday, and an
    // old APPROVED must not keep looking fresh. Clicking still re-runs the
    // check and overwrites the stored result.
    const STALE_HOURS = 24;

    function getStoredResult(mc) {
        try {
            const raw = GM_getValue('apex_result_' + mc, '');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function ageText(ageMs) {
        const hours = ageMs / 3600000;
        if (hours < 1) return 'under an hour ago';
        if (hours < 48) return Math.round(hours) + ' hours ago';
        return Math.round(hours / 24) + ' days ago';
    }

    function paintVerdicts() {
        document.querySelectorAll('.tm-apex-btn[data-mc]').forEach(btn => {
            const res = getStoredResult(btn.dataset.mc);
            if (!res) return;

            const ageMs = Date.now() - (res.ts || 0);
            const stale = ageMs > STALE_HOURS * 3600000;

            const key = res.verdict + '|' + res.ts + '|' + (stale ? 'stale' : 'fresh');
            if (btn.dataset.verdictKey === key) return;
            btn.dataset.verdictKey = key;

            const whenStr = new Date(res.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            btn.classList.remove('tm-apex-ok', 'tm-apex-risk', 'tm-apex-done', 'tm-apex-stale');

            if (stale) {
                btn.classList.add('tm-apex-stale');
                const glyph = res.verdict === 'approved' ? '✓' : (res.verdict === 'checked' ? '↻' : '✗');
                btn.textContent = `APEX ${glyph} STALE`;
                btn.title = `MC# ${btn.dataset.mc} — last checked ${whenStr} (${ageText(ageMs)}). This result is STALE.` +
                    (res.detail ? `\nApex said then: ${res.detail}` : '') +
                    `\nClick to run a fresh check.`;
                return;
            }

            btn.title = `MC# ${btn.dataset.mc} — checked ${whenStr}` + (res.detail ? `\nApex said: ${res.detail}` : '');

            if (res.verdict === 'approved') {
                btn.classList.add('tm-apex-ok');
                btn.textContent = 'APEX ✓ OK';
            } else if (res.verdict === 'risk') {
                btn.classList.add('tm-apex-risk');
                btn.textContent = 'APEX ✗ RISK';
            } else if (res.verdict === 'notfound') {
                btn.classList.add('tm-apex-risk');
                btn.textContent = 'APEX ✗ NO RECORD';
            } else {
                btn.classList.add('tm-apex-done');
                btn.textContent = 'APEX: CHECKED';
            }
        });
    }

    function findViewRouteButton() {
        const candidates = Array.from(document.querySelectorAll('div, button, a, span'));
        return candidates.find(el => {
            const txt = cleanText(el.textContent).toUpperCase();
            if (txt !== 'VIEW ROUTE') return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 40 && rect.height > 10;
        });
    }

    function injectRouteButtons() {
        if (document.querySelector('.tm-route-tools-wrap')) return;
        const viewRouteEl = findViewRouteButton();
        if (!viewRouteEl) return;

        const wrap = document.createElement('div');
        wrap.className = 'tm-route-tools-wrap';
        wrap.appendChild(makeCopyButton());
        wrap.appendChild(makeMapsButton());

        viewRouteEl.insertAdjacentElement('afterend', wrap);
    }

    function run() {
        addStyles();
        injectRouteButtons();
        injectApexButtons();
        paintVerdicts();
    }

    let debounce;
    const observer = new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(run, 250);
    });

    window.addEventListener('load', () => {
        run();
        observer.observe(document.body, { childList: true, subtree: true });
        setInterval(run, 1200);
    });
})();
