// ==UserScript==
// @name         DAT One – City Zip Code Injector
// @namespace    https://one.dat.com/
// @version      3.0
// @description  Shows zip codes next to city names in load rows and detail panel on DAT One
// @author       You
// @match        https://one.dat.com/*
// @grant        GM_xmlhttpRequest
// @connect      api.zippopotam.us
// @updateURL    https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/DAT%20One%20%E2%80%93%20City%20Zip%20Code%20Injector.user.js
// @downloadURL  https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/DAT%20One%20%E2%80%93%20City%20Zip%20Code%20Injector.user.js
// ==/UserScript==

(function () {
  'use strict';

  const zipCache = {};

  // Uses Zippopotam.us – CORS-safe, no API key, works from extensions
  function fetchZip(city, state, callback) {
    const key = `${city}|${state}`;
    if (zipCache[key] !== undefined) { callback(zipCache[key]); return; }

    // Zippopotam endpoint: /us/:state/:city
    const url = `https://api.zippopotam.us/us/${encodeURIComponent(state.toLowerCase())}/${encodeURIComponent(city.toLowerCase())}`;

    GM_xmlhttpRequest({
      method: 'GET',
      url: url,
      onload: function (res) {
        try {
          if (res.status === 200) {
            const data = JSON.parse(res.responseText);
            if (data.places && data.places.length > 0) {
              const zip = data.places[0]['post code'];
              zipCache[key] = zip;
              callback(zip);
              return;
            }
          }
          zipCache[key] = 'N/F';
          callback('N/F');
        } catch (e) {
          zipCache[key] = 'ERR';
          callback('ERR');
        }
      },
      onerror: function () {
        zipCache[key] = 'N/F';
        callback('N/F');
      }
    });
  }

  function injectZipBadge(el, city, state) {
    if (el.dataset.zipInjected) return;
    el.dataset.zipInjected = 'true';

    // Show a loading placeholder immediately
    const badge = document.createElement('span');
    badge.className = 'dat-zip-badge';
    badge.textContent = '…';
    badge.title = `ZIP code for ${city}, ${state}`;
    badge.style.cssText = [
      'display:inline-block',
      'margin-left:4px',
      'padding:1px 6px',
      'background:#e9effe',
      'color:#0046e0',
      'border-radius:3px',
      'font-size:10px',
      'font-weight:700',
      'letter-spacing:0.5px',
      'vertical-align:middle',
      'line-height:15px',
      'white-space:nowrap',
      "font-family:'Sequel Sans',Helvetica,Arial,sans-serif",
      'cursor:default'
    ].join(';');
    el.appendChild(badge);

    fetchZip(city, state, function (zip) {
      badge.textContent = zip;
      badge.title = `ZIP: ${zip} — ${city}, ${state}`;
    });
  }

  // Parse "City, ST" or "City, ST (123)" — strips DH mile numbers
  function parseCityState(text) {
    const cleaned = (text || '').replace(/\s*\(\d+\)\s*/g, '').trim();
    const m = cleaned.match(/^([A-Za-z][A-Za-z\s\.\-']{1,30}),\s*([A-Z]{2})$/);
    if (!m) return null;
    return { city: m[1].trim(), state: m[2] };
  }

  function processEl(el) {
    if (el.dataset.zipInjected) return;
    // Only leaf-like nodes (skip containers with real child elements)
    const realKids = Array.from(el.children).filter(c => !c.classList.contains('dat-zip-badge'));
    if (realKids.length > 0) return;
    const text = (el.textContent || '').trim();
    // Quick gate: reasonable length and ends with 2-letter state after comma
    if (text.length < 5 || text.length > 65) return;
    const cleaned = text.replace(/\s*\(\d+\)\s*/g, '').trim();
    if (!/,\s*[A-Z]{2}$/.test(cleaned)) return;
    const parsed = parseCityState(text);
    if (parsed) injectZipBadge(el, parsed.city, parsed.state);
  }

  function scanAll() {
    // Targeted DAT component selectors first (fastest)
    [
      'dat-grid-destination-cell',
      'dat-grid-shipment-info',
      'dat-grid-shipment-details',
      'cg-grid-shipment-details',
      '[class*="shipment-detail"]',
      '[class*="trip-container"]',
      '[class*="trip-point"]',
      '[class*="origin-city"]',
      '[class*="destination-city"]'
    ].forEach(sel => {
      document.querySelectorAll(sel).forEach(container => {
        container.querySelectorAll('*').forEach(processEl);
        processEl(container);
      });
    });

    // Broad fallback: every span and div on the page
    document.querySelectorAll('span, div, p, td, h1, h2, h3').forEach(processEl);
  }

  // Debounced observer for Angular SPA DOM changes
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scanAll, 400);
  }).observe(document.body, { childList: true, subtree: true });

  // Initial run after Angular finishes bootstrapping
  setTimeout(scanAll, 2000);

})();
