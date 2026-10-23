// ==UserScript==
// @name         DAT One – Rate-Per-Mile Badges
// @namespace    https://one.dat.com/
// @version      1.1
// @description  Shows $/mile badges on DAT One loads: loaded $/mi from DAT's own trip miles when shown (zip-code estimate otherwise), plus an all-in $/mi that includes DAT's deadhead from your search origin
// @author       Tony-KDC
// @match        https://one.dat.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.zippopotam.us
// @updateURL    https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/DAT%20One%20%E2%80%93%20Rate-Per-Mile%20Badges.user.js
// @downloadURL  https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/DAT%20One%20%E2%80%93%20Rate-Per-Mile%20Badges.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ================= CONFIG — edit these to taste =================
  const CONFIG = {
    ROAD_FACTOR: 1.24,  // fallback only: road miles ≈ straight-line × this.
                        // (v1.0 used 1.18, which ran low on western lanes —
                        //  Truckee→American Fork via I-80 measures ~1.28.)
    GOOD_RPM: 2.60,     // loaded $/mile at or above this = green
    OK_RPM: 2.20,       // loaded $/mile at or above this = amber, below = red
    MIN_ROAD_MILES: 25, // skip very short runs (local loads make $/mi meaningless)
    MIN_RATE: 200,      // ignore $ amounts below this (not a linehaul rate)
    MAX_RATE: 30000     // ignore $ amounts above this (not a single-load rate)
  };
  // ================================================================

  const CACHE_KEY = 'rpm_geo_cache_v1';
  let geoCache = {};
  try { geoCache = JSON.parse(GM_getValue(CACHE_KEY, '{}')) || {}; } catch (e) { geoCache = {}; }

  function saveCache() {
    try { GM_setValue(CACHE_KEY, JSON.stringify(geoCache)); } catch (e) {}
  }

  // --- City/state parsing (same rules as the Zip Injector) ---
  function parseCityState(text) {
    const cleaned = (text || '').replace(/\s*\(\d+\)\s*/g, '').trim();
    const m = cleaned.match(/^([A-Za-z][A-Za-z\s\.\-']{1,30}),\s*([A-Z]{2})$/);
    if (!m) return null;
    return { city: m[1].trim(), state: m[2] };
  }

  function isCityLeaf(el) {
    if (el.children.length > 0) return null;
    const text = (el.textContent || '').trim();
    if (text.length < 5 || text.length > 65) return null;
    if (!/,\s*[A-Z]{2}$/.test(text.replace(/\s*\(\d+\)\s*/g, '').trim())) return null;
    return parseCityState(text);
  }

  // Find "City, ST" leaf elements inside a container, in DOM order
  function findCityLeaves(root) {
    const leaves = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      const parsed = isCityLeaf(node);
      if (parsed) leaves.push({ el: node, city: parsed.city, state: parsed.state });
      node = walker.nextNode();
    }
    return leaves;
  }

  // --- Coordinates via Zippopotam.us (same free API as the Zip Injector) ---
  function fetchCoords(city, state, callback) {
    const key = `${city}|${state}`;
    if (geoCache[key] !== undefined) { callback(geoCache[key]); return; }

    const url = `https://api.zippopotam.us/us/${encodeURIComponent(state.toLowerCase())}/${encodeURIComponent(city.toLowerCase())}`;
    GM_xmlhttpRequest({
      method: 'GET',
      url: url,
      onload: function (res) {
        try {
          if (res.status === 200) {
            const data = JSON.parse(res.responseText);
            if (data.places && data.places.length > 0) {
              const p = data.places[0];
              const coords = { lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) };
              if (isFinite(coords.lat) && isFinite(coords.lng)) {
                geoCache[key] = coords;
                saveCache();
                callback(coords);
                return;
              }
            }
          }
        } catch (e) {}
        geoCache[key] = null;
        saveCache();
        callback(null);
      },
      onerror: function () {
        geoCache[key] = null;
        saveCache();
        callback(null);
      }
    });
  }

  const coordsOf = (city, state) => new Promise(res => fetchCoords(city, state, res));

  function haversineMiles(a, b) {
    const R = 3958.8; // Earth radius in miles
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // --- Rate extraction: first plausible linehaul $ amount in the row ---
  function findRate(rowEl) {
    const text = (rowEl.textContent || '').replace(/\s+/g, ' ');
    const re = /\$\s?(\d{1,3}(?:,\d{3})+|\d{3,5})(?:\.(\d{2}))?/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      // Skip amounts that are already per-mile ("$2.50/mi", "$2.50 per mile")
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 10).toLowerCase();
      if (after.startsWith('/mi') || after.startsWith(' per mi')) continue;
      const value = parseFloat(m[1].replace(/,/g, '') + (m[2] ? '.' + m[2] : ''));
      if (value >= CONFIG.MIN_RATE && value <= CONFIG.MAX_RATE) return value;
    }
    return null;
  }

  // --- NEW in v1.1: DAT's own trip miles, when the row/detail shows them ---
  // Detail view prints "575 mi" next to the route and in the Rate box; list
  // rows show the trip as a bare number in the Trip column.
  function findTripMiles(rowEl) {
    const text = (rowEl.textContent || '').replace(/\s+/g, ' ');

    const withUnit = text.match(/([\d,]{3,6})\s*mi\b/i);
    if (withUnit) {
      const v = parseInt(withUnit[1].replace(/,/g, ''), 10);
      if (v >= 50 && v <= 5000) return v;
    }

    // Bare-number fallback: exactly one leaf in the row that is nothing but
    // a 3–4 digit number in trip range (the Trip column in list view).
    const candidates = [];
    rowEl.querySelectorAll('*').forEach(el => {
      if (el.children.length > 0) return;
      const t = (el.textContent || '').trim();
      if (/^\d{3,4}$/.test(t)) {
        const v = parseInt(t, 10);
        if (v >= 100 && v <= 5000) candidates.push(v);
      }
    });
    if (candidates.length === 1) return candidates[0];

    return null;
  }

  // --- NEW in v1.1: DAT's deadhead from your search origin ---
  // DAT prints it in parentheses right after the pickup city, e.g.
  // "Truckee, CA (101)" — the (101) is deadhead miles from the Origin city
  // in your search to the pickup. We reuse DAT's number instead of estimating.
  function findDeadhead(rowEl, originLeafEl) {
    const sources = [];
    if (originLeafEl) sources.push(originLeafEl.textContent || '');
    sources.push(rowEl.textContent || '');

    for (const src of sources) {
      const m = src.replace(/\s+/g, ' ').match(/\(\s*(\d{1,4})\s*\)/);
      if (m) {
        const v = parseInt(m[1], 10);
        if (v > 0 && v <= 3000) return v;
      }
    }
    return null;
  }

  // --- Badge ---
  function badgeStyle(kind) {
    const colors = {
      good: 'background:#e8f5e9;color:#1b8f3a;border:1px solid #1b8f3a',
      ok:   'background:#fdf5e6;color:#8a5b00;border:1px solid #d19900',
      bad:  'background:#ffebee;color:#d90429;border:1px solid #d90429',
      wait: 'background:#eef1f4;color:#45525e;border:1px solid #9aa5b1'
    };
    return [
      'display:inline-block',
      'margin-left:6px',
      'padding:1px 6px',
      'border-radius:3px',
      'font-size:10px',
      'font-weight:700',
      'letter-spacing:0.5px',
      'vertical-align:middle',
      'line-height:15px',
      'white-space:nowrap',
      "font-family:'Sequel Sans',Helvetica,Arial,sans-serif",
      'cursor:default',
      colors[kind] || colors.wait
    ].join(';');
  }

  async function processRow(rowEl, leaves) {
    if (rowEl.dataset.rpmDone) return;
    rowEl.dataset.rpmDone = 'true';

    const origin = leaves[0];
    const dest = leaves[1];
    const rate = findRate(rowEl);
    if (!rate) return;

    // Placeholder badge right after the destination city, like the other tools
    const badge = document.createElement('span');
    badge.className = 'dat-rpm-badge';
    badge.textContent = '$/mi …';
    badge.style.cssText = badgeStyle('wait');
    badge.title = 'Working out rate per mile…';
    dest.el.insertAdjacentElement('afterend', badge);

    // 1) Loaded miles: prefer DAT's own trip miles; fall back to zip estimate
    let loadedMiles = findTripMiles(rowEl);
    let milesSource = loadedMiles ? 'DAT trip miles' : '';

    if (!loadedMiles) {
      const oCoords = await coordsOf(origin.city, origin.state);
      const dCoords = await coordsOf(dest.city, dest.state);
      if (!oCoords || !dCoords) { badge.remove(); return; }
      loadedMiles = Math.round(haversineMiles(oCoords, dCoords) * CONFIG.ROAD_FACTOR);
      milesSource = 'zip-code estimate';
    }
    if (loadedMiles < CONFIG.MIN_ROAD_MILES) { badge.remove(); return; }

    const loadedRpm = rate / loadedMiles;
    const kind = loadedRpm >= CONFIG.GOOD_RPM ? 'good' : (loadedRpm >= CONFIG.OK_RPM ? 'ok' : 'bad');

    // 2) All-in $/mi: add DAT's deadhead (from your search origin) if shown
    const dh = findDeadhead(rowEl, origin.el);
    let badgeText = `$${loadedRpm.toFixed(2)}/mi · ${milesSource === 'DAT trip miles' ? '' : '~'}${loadedMiles} mi`;
    let tip = `${origin.city}, ${origin.state} → ${dest.city}, ${dest.state}\n` +
              `Loaded: $${rate.toLocaleString('en-US')} ÷ ${loadedMiles} mi (${milesSource}) = $${loadedRpm.toFixed(2)}/mi`;

    if (dh) {
      const totalMiles = loadedMiles + dh;
      const allInRpm = rate / totalMiles;
      badgeText = `$${loadedRpm.toFixed(2)}/mi · $${allInRpm.toFixed(2)} w/DH`;
      tip += `\nDeadhead: ${dh} mi (DAT, from your search origin)\n` +
             `All-in: $${rate.toLocaleString('en-US')} ÷ ${totalMiles} mi = $${allInRpm.toFixed(2)}/mi`;
    }

    badge.style.cssText = badgeStyle(kind);
    badge.textContent = badgeText;
    badge.title = tip;
  }

  // Climb from a city leaf to the smallest ancestor holding 2+ city leaves:
  // that ancestor is treated as the load row.
  function findRow(cityLeafEl) {
    let el = cityLeafEl;
    for (let depth = 0; depth < 10 && el && el !== document.body; depth++) {
      el = el.parentElement;
      if (!el) break;
      const leaves = findCityLeaves(el);
      if (leaves.length >= 2) return { row: el, leaves: leaves };
    }
    return null;
  }

  function scanAll() {
    // Seed from the same DAT containers the Zip Injector uses, then go broad
    const scopes = new Set();
    [
      'dat-grid-destination-cell',
      'dat-grid-shipment-info',
      'dat-grid-shipment-details',
      'cg-grid-shipment-details',
      '[class*="shipment-detail"]',
      '[class*="trip-container"]',
      '[class*="trip-point"]'
    ].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => scopes.add(el));
    });
    scopes.add(document.body);

    const rowsSeen = new Set();
    scopes.forEach(scope => {
      findCityLeaves(scope).forEach(leaf => {
        const found = findRow(leaf.el);
        if (found && !rowsSeen.has(found.row)) {
          rowsSeen.add(found.row);
          processRow(found.row, found.leaves);
        }
      });
    });
  }

  // Debounced observer for Angular SPA DOM changes (same pattern as Zip Injector)
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scanAll, 600);
  }).observe(document.body, { childList: true, subtree: true });

  setTimeout(scanAll, 2000);

})();
