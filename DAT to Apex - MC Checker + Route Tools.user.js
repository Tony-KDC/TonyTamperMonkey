// ==UserScript==
// @name         DAT to Apex - MC Checker + Route Tools
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Adds Copy Route, Maps, and Apex MC check buttons to DAT One. Auto-fills and submits on Apex Dashboard.
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
// PART 1: APEX DASHBOARD LOGIC - FIXED
// ==========================================
if (window.location.href.includes('apexcapitalcorp.com')) {
    console.log('[TM Apex] Active');

    let lastHandled = '';

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

    function setNativeValue(el, value) {
        const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value')?.set;
        setter ? setter.call(el, value) : el.value = value;

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }

    async function checkAndFillMC() {
        const pendingMC = GM_getValue('pending_mc_number', '');

        if (!pendingMC || pendingMC === lastHandled) return;

        console.log('[TM Apex] Pending MC found:', pendingMC);

        const mcInput = await waitForElement('#motorCarrierNumber');
        const goButton = await waitForElement('#cc_go_button');

        if (!mcInput || !goButton) {
            console.warn('[TM Apex] Input or Go button not found');
            return;
        }

        lastHandled = pendingMC;

        mcInput.focus();
        setNativeValue(mcInput, '');
        await sleep(100);
        setNativeValue(mcInput, pendingMC);

        await sleep(300);

        console.log('[TM Apex] Clicking Go');
        goButton.click();

        await sleep(800);
        GM_setValue('pending_mc_number', '');
    }

    setInterval(checkAndFillMC, 700);
    window.addEventListener('focus', checkAndFillMC);
    window.addEventListener('load', checkAndFillMC);
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
            // Look for "MC#" followed by numbers
            const match = text.match(/MC#\s*(\d{5,8})/i);

            if (match && el.children.length === 0) {
                const mcNumber = match[1];
                el.dataset.apexBtnInjected = 'true';

                const btn = document.createElement('button');
                btn.className = 'tm-apex-btn';
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
