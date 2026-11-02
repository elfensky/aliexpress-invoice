// ==UserScript==
// @name         AliExpress Invoice
// @namespace    https://github.com/elfensky/aliexpress-invoice
// @version      0.4.0
// @description  Adds a "Generate invoice" button to your AliExpress orders and prints a proper purchase receipt (buyer block, VAT line) to PDF.
// @author       Andrei Lavrenov
// @license      MIT
// @homepageURL  https://github.com/elfensky/aliexpress-invoice
// @supportURL   https://github.com/elfensky/aliexpress-invoice/issues
// @downloadURL  https://raw.githubusercontent.com/elfensky/aliexpress-invoice/main/aliexpress-invoice.user.js
// @updateURL    https://raw.githubusercontent.com/elfensky/aliexpress-invoice/main/aliexpress-invoice.user.js
// @match        https://*.aliexpress.com/p/order/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const AUTO_PRINT = true; // open the print dialog as soon as the receipt renders
  const STORE_KEY = 'aliexpress-invoice.buyer'; // ponytail: localStorage, per origin; GM_setValue if a cross-site store is ever needed
  const RECEIPT_API = 'mtop.global.finance.taxation.invoice.queryOrderReceiptInfo';
  // Rows of the totals table, in order. Keys absent from the response are skipped.
  const TOTAL_ROWS = [
    ['itemsTotal', 'Subtotal'],
    ['shippingFee', 'Shipping'],
    ['totalDiscountAmount', 'Discount'],
    ['adjustPriceAmount', 'Price adjustment'],
    ['totalApplicableFeeAmount', 'Applicable fee'],
    ['totalReceivableTaxAmount', 'Estimated import charges'],
    ['totalSubsidyTaxAmount', 'AliExpress duty reduction'],
    ['totalRefundTaxAmount', 'VAT adjustment'],
  ];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lines = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean);

  // ---- buyer block -------------------------------------------------------

  // The buyer fields, in print order: [key, label in the settings dialog, multi-line].
  const BUYER_FIELDS = [
    ['name', 'Company / name'],
    ['vat', 'VAT number'],
    ['address', 'Address', true],
    ['extra', 'Extra lines (email, IBAN, reference…)', true],
  ];

  // Order values, parsed from the order's delivery address. AliExpress has no VAT
  // field, so companies put it in the contact name: "ACME BV BE0123456789".
  function buyerFromAddress(a) {
    a = a || {};
    let name = a.contactName || '';
    let vat = '';
    const m = name.match(/\b([A-Z]{2}(?=[0-9A-Z]*\d)[0-9A-Z]{8,12})\b/);
    if (m) {
      vat = m[1];
      name = (name.slice(0, m.index) + name.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
    }
    const region = [a.postCode, a.regionAddress].filter(Boolean).join(' ');
    const address = [a.detailAddress, a.detailAddress2, region].filter(Boolean).join('\n');
    return { name, vat, address, extra: a.fullPhoneNo || '' };
  }

  // The buyer block for one order: a saved value replaces the order value, an empty one keeps it,
  // and a field marked Leave off prints nothing. Buyer details saved by 0.2.0 have no marks.
  function buyerFor(saved, deliveryAddress) {
    const order = buyerFromAddress(deliveryAddress);
    const s = saved || {};
    const off = s.off || [];
    return Object.fromEntries(BUYER_FIELDS.map(([k]) => [k, off.includes(k) ? '' : s[k] || order[k]]));
  }

  // Buyer details from the settings form, trimmed; null when nothing is typed or marked.
  function settingsFromForm(form) {
    const b = Object.fromEntries(BUYER_FIELDS.map(([k]) => [k, String(form.get(k) || '').trim()]));
    const off = form.getAll('off');
    b.off = BUYER_FIELDS.map(([k]) => k).filter((k) => off.includes(k));
    return BUYER_FIELDS.some(([k]) => b[k]) || b.off.length ? b : null;
  }

  function loadBuyer() { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; } }
  function saveBuyer(b) { if (b) localStorage.setItem(STORE_KEY, JSON.stringify(b)); else localStorage.removeItem(STORE_KEY); }

  // ---- receipt -----------------------------------------------------------

  // Reuses the page's own signed request client, so this script never touches the token or signature.
  async function fetchReceipt(orderId) {
    const mtop = window.lib && window.lib.mtop;
    if (!mtop) throw new Error('AliExpress request client (lib.mtop) not found on this page.');
    const res = await mtop.request({ api: RECEIPT_API, v: '1.0', type: 'POST', ecode: 1, needLogin: true, data: { orderId } });
    const d = res && res.data && res.data.data;
    if (!d || !d.orderId) throw new Error('Unexpected receipt response: ' + JSON.stringify(res && res.ret));
    return d;
  }

  // AliExpress' 2024 wordmark (Wikimedia Commons, File:AliExpress_2024.svg), coloured like the site header
  // on 2026-11-02. Inline, so the receipt tab loads nothing from the network.
  const LOGO_SVG = '<svg class="logo" role="img" aria-label="AliExpress" viewBox="0 0 1718.74 372.31"><g fill="#111"><path d="m13.74,288.1c8.52-22.47,16.19-42.71,25.1-66.21,11.2,16.28,21.62,29.74,30.02,44.35,4.57,7.95-8.45,20.67-18.38,21.67-2.13.21-4.3.18-6.46.18-9.02.02-18.03,0-30.28,0Z"/><path d="m276.06,288.23V.23h46.32v288h-46.32Z"/><path d="m76.54,126.82L120.97.23h50.4l76.68,288h-32.49c-9.32-3.82-15.32-10.44-17.93-19.37-14.18-48.57-57.14-192.46-57.14-192.46l-35.07,94.49-28.89-44.07Z"/><path d="m370.93,288.92V88.82h46.32v200.1h-46.32Z"/><ellipse cx="394.09" cy="29.04" rx="29.27" ry="28.59"/><polygon points="466.88 0 629.97 0 629.97 40.21 511.13 40.21 511.13 112.99 629.97 112.99 629.97 152.59 511.13 152.58 511.13 247.16 644.4 247.25 614.41 288.39 466.88 288.46 466.88 0"/><polygon points="646.22 88.28 698.51 88.28 741.01 150.04 783.81 88.28 837.93 88.28 768.45 189.17 837.93 289.45 782.59 288.38 741.47 229.83 699.73 288.38 645.01 288.38 714.91 188.87 646.22 88.28"/><path d="m966.82,83.16c-24.06,0-43.51,10.76-59.64,28.39v-23.27h-47.64v284.03h47.64v-106.7c16.23,18.37,34.4,22.77,59.38,22.77,49.66,0,93.57-43.07,93.57-101.01s-43.64-104.22-93.3-104.22Zm-6.75,164.87c-30.83,0-55.65-26.69-55.65-62.04s24.99-63.16,55.81-63.16,57.92,28.23,57.92,63.58-27.26,61.62-58.08,61.62Z"/><path d="m1121.19,179.85c0-29.4,26.45-61.53,66.65-57.42,4.93-8.77,17.28-23.73,29.81-30.5-37.52-12.84-65.84-8.36-96.48,16.98l.02-20.65h-45.02s.01,199.96.01,199.96h45.01v-108.37Z"/><path d="m1327.46,235.66c-10.35,9.17-23.97,14.75-38.89,14.75-26.1,0-49.58-19.1-57.21-42.65h152.86c2.34-76.89-40.94-118.24-95.65-118.24s-99.06,44.79-99.06,100.05,44.35,100.05,99.06,100.05c38.25,0,71.43-21.9,87.94-53.96h-49.05Zm-40.27-104.79c26.1,0,48.2,17.03,55.84,40.59h-111.68c7.64-23.55,29.74-40.59,55.84-40.59Z"/><path d="m1507.7,142.05h40.36c0-64.99-150.42-78.06-150.43,9.02,0,65.76,113.05,42.5,112.51,75.52-.48,29.55-64.24,26.12-73.53,7.18h-41.27c15.59,79.03,156.84,67.08,156.84-4.13,0-78.9-112.82-40.43-114.34-80.87-1.23-32.52,59.2-30.1,69.86-6.73Z"/><path d="m1674.26,142.05h40.36c0-64.99-150.42-78.06-150.43,9.02,0,65.76,113.05,42.5,112.51,75.52-.48,29.55-64.24,26.12-73.53,7.18h-41.27c15.59,79.03,156.84,67.08,156.84-4.13,0-78.9-112.82-40.43-114.34-80.87-1.23-32.52,59.2-30.1,69.86-6.73Z"/></g><path fill="#fcc836" d="m0,130.12h59.68l38.91,57.47c43.66-49.62,100.17-63.65,165.6-52.94-63.38,19.43-123.28,56.61-177.82,120.36L0,130.12Z"/></svg>';

  // On screen the receipt sits on a grey desk as an A4 sheet; in print the sheet is the page.
  const RECEIPT_CSS = `
@page { size: A4; margin: 16mm; }
html { background: #ececec; }
body { box-sizing: border-box; max-width: 794px; margin: 32px auto; padding: 60px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.1), 0 8px 24px rgba(0,0,0,.06); color: #111; font: 12px/1.5 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { margin: 0 0 2px; font-size: 22px; line-height: 1.2; letter-spacing: -.01em; }
h2, dt, .items th { color: #6b6b6b; font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
h2 { margin: 0 0 8px; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 20px; border-bottom: 2px solid #111; }
.logo { display: block; height: 28px; margin-top: 2px; }
.top > div { text-align: right; }
.facts { display: flex; flex-wrap: wrap; gap: 12px 40px; margin: 0; padding: 16px 0; border-bottom: 1px solid #e3e3e3; }
.facts dd { margin: 2px 0 0; font-size: 13px; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; padding: 24px 0 32px; break-inside: avoid; }
.parties strong { font-size: 13px; }
table { width: 100%; border-spacing: 0; font-variant-numeric: tabular-nums; }
td, th { padding: 8px; text-align: left; vertical-align: top; }
td:first-child, th:first-child { padding-left: 0; }
td:last-child, th:last-child { padding-right: 0; }
.items th { padding-top: 0; border-bottom: 1px solid #111; }
.items td { border-bottom: 1px solid #e3e3e3; }
.items th:nth-child(n+2), .items td:nth-child(n+2) { width: 1%; text-align: right; white-space: nowrap; }
.items tr { break-inside: avoid; }
.items .muted { margin-top: 2px; }
.totals { width: 300px; margin: 16px 0 0 auto; break-inside: avoid; }
.totals td { padding: 4px 0; }
.totals td:last-child { text-align: right; }
.totals .total td { padding-top: 10px; border-top: 1px solid #111; font-size: 16px; font-weight: 700; }
.totals .vat td { padding: 8px 10px; background: #f3f3f3; font-weight: 600; }
.muted { color: #6b6b6b; font-size: 11px; }
footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e3e3e3; break-before: avoid; }
.no-print { position: fixed; right: 24px; bottom: 24px; padding: 10px 18px; border: 0; border-radius: 999px; background: #111; color: #fff; font: 600 13px system-ui, sans-serif; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.2); }
@media print { html { background: none; } body { max-width: none; margin: 0; padding: 0; box-shadow: none; } .no-print { display: none; } }
`;

  function renderReceipt(d, buyer) {
    const pay = d.paymentInfo || {};
    const subOrders = d.subOrders || [];
    const sellers = [...new Set(subOrders.map((s) => s.sellerName).filter(Boolean))];
    const block = (b) => [b.name && `<strong>${esc(b.name)}</strong>`, ...[b.vat && 'VAT ' + b.vat, ...lines(b.address), ...lines(b.extra)].map(esc)].filter(Boolean).join('<br>');
    const items = subOrders.map((s) => `<tr><td>${esc(s.itemTitle)}<div class="muted">${[s.relateInfo, s.sellerName && 'Sold by ' + s.sellerName].filter(Boolean).map(esc).join(' · ')}</div></td><td>${esc(s.itemCount)}</td><td>${esc(s.amount)}</td></tr>`).join('');
    const row = (label, value, cls) => (value ? `<tr${cls ? ` class="${cls}"` : ''}><td>${label}</td><td>${esc(value)}</td></tr>` : '');
    const fact = (label, value) => (value ? `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>` : '');
    return `<!doctype html><html><head><meta charset="utf-8"><title>aliexpress-${esc(d.orderId)}</title><style>${RECEIPT_CSS}</style></head><body>
<header class="top">
  ${LOGO_SVG}
  <div><h1>Purchase receipt</h1><div class="muted">Generated from AliExpress order data on ${new Date().toISOString().slice(0, 10)}</div></div>
</header>
<dl class="facts">${fact('Order', d.orderId)}${fact('Order date', d.orderTime)}${fact('Paid on', pay.paymentDate)}${fact('Payment', pay.methodName && (pay.methodName + (pay.paymentAmountStr ? ' · ' + pay.paymentAmountStr : '')))}</dl>
<section class="parties">
  <div><h2>Seller</h2><strong>AliExpress (marketplace)</strong><br>${sellers.map(esc).join('<br>')}<div class="muted">Items are sold by third-party sellers on AliExpress, not by AliExpress itself.</div></div>
  <div><h2>Buyer</h2>${block(buyer)}</div>
</section>
<table class="items"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>${items}</tbody></table>
<table class="totals">${TOTAL_ROWS.map(([k, label]) => row(label, d[k])).join('')}${row('Total', d.orderTotal, 'total')}${row('of which VAT (included)', d.includedTaxDisplay, 'vat')}</table>
<footer class="muted">Amounts as reported by AliExpress for order ${esc(d.orderId)}. "VAT (included)" is the tax amount AliExpress reports as included in the total.</footer>
<button class="no-print" onclick="print()">Print / Save as PDF</button>
${AUTO_PRINT ? '<script>setTimeout(function () { print(); }, 100);</script>' : ''}
</body></html>`;
  }

  async function generate(orderId) {
    const w = window.open('', '_blank'); // opened synchronously in the click handler so the popup blocker allows it
    if (!w) { alert('Allow pop-ups for aliexpress.com to generate the invoice.'); return; }
    w.document.write(`<title>aliexpress-${esc(orderId)}</title><p style="font:14px system-ui;padding:24px">Loading order ${esc(orderId)}…</p>`);
    try {
      const d = await fetchReceipt(orderId);
      w.document.open();
      w.document.write(renderReceipt(d, buyerFor(loadBuyer(), d.deliveryAddress)));
      w.document.close();
    } catch (e) {
      w.document.body.innerHTML = `<pre style="padding:24px;white-space:pre-wrap">Could not generate the invoice for order ${esc(orderId)}.\n\n${esc((e && e.message) || e)}</pre>`;
    }
  }

  // ---- settings dialog -----------------------------------------------------

  function settingsHTML(b) {
    const off = b.off || [];
    const field = ([k, label, multi]) => {
      const attrs = `name="${k}" placeholder="From the order" data-1p-ignore autocomplete="off"`;
      const input = multi ? `<textarea ${attrs} rows="3">${esc(b[k])}</textarea>` : `<input ${attrs} value="${esc(b[k])}">`;
      const mark = `<input type="checkbox" name="off" value="${k}" aria-label="Leave ${label} off the receipt"${off.includes(k) ? ' checked' : ''}>`;
      return `<div class="ali-invoice-field"><label>${label}${input}</label><label class="ali-invoice-off">${mark}Leave off</label></div>`;
    };
    return `<form method="dialog">
  <h3 id="ali-invoice-dialog-title">Invoice buyer details</h3>
  <p>An empty field uses the delivery address of each order. Tick Leave off to keep a line off the receipt.</p>
  <p class="ali-invoice-shown"></p>
  ${BUYER_FIELDS.map(field).join('\n  ')}
  <menu><button value="cancel">Cancel</button><button value="clear">Use delivery address</button><button value="save" class="primary">Save</button></menu>
</form>`;
  }

  function openSettings(orderId) {
    const dlg = document.createElement('dialog');
    dlg.className = 'ali-invoice-dialog';
    dlg.setAttribute('aria-labelledby', 'ali-invoice-dialog-title');
    dlg.innerHTML = settingsHTML(loadBuyer() || {});
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'save') saveBuyer(settingsFromForm(new FormData(dlg.querySelector('form'))));
      else if (dlg.returnValue === 'clear') saveBuyer(null);
      dlg.remove();
    });
    dlg.showModal();
    // Placeholders show what an empty field prints for this order; the generic ones stay if the request fails.
    fetchReceipt(orderId).then((d) => {
      const ph = buyerFor(null, d.deliveryAddress);
      for (const [k] of BUYER_FIELDS) dlg.querySelector(`[name="${k}"]`).placeholder = ph[k] || 'Not in this order';
      dlg.querySelector('.ali-invoice-shown').textContent = `Shown: order ${orderId}. Each order uses its own delivery address.`;
    }, () => {});
  }

  // ---- page injection ------------------------------------------------------

  // Sized and typeset like AliExpress' own Comet buttons (700 14px/24px, 32px tall, 16px radius),
  // measured on the order pages 2026-09-19. #009966 is the site's own positive-money green.
  const FONT = '"TT Norms Pro", "Open Sans", Roboto, Arial, Helvetica, sans-serif';
  const PAGE_CSS = `
.ali-invoice { display: inline-flex; align-items: center; gap: 8px; margin: 0 12px; vertical-align: middle; }
.order-status .ali-invoice { margin: 0; } /* the host buttons there already carry margin-right: 16px */
.ali-invoice-btn, .ali-invoice-gear { box-sizing: border-box; height: 32px; border-radius: 16px; font: 700 14px/24px ${FONT}; cursor: pointer; }
.ali-invoice-btn { padding: 4px 12px; border: 0; background: #009966; color: #fff; }
.ali-invoice-btn:hover { background: #007a52; }
.ali-invoice-gear { width: 32px; padding: 0; border: 1px solid #999; background: #fff; color: #222; font-size: 17px; }
.ali-invoice-gear:hover { border-color: #222; }
.ali-invoice-btn:focus-visible, .ali-invoice-gear:focus-visible { outline: 2px solid #222; outline-offset: 2px; }
.ali-invoice-dialog { border: 0; border-radius: 16px; padding: 20px 24px; width: 380px; max-width: 90vw; color: #222; font: 14px/1.4 ${FONT}; }
.ali-invoice-dialog::backdrop { background: rgba(0,0,0,.4); }
.ali-invoice-dialog h3 { margin: 0 0 4px; font-size: 18px; }
.ali-invoice-dialog p { margin: 0 0 12px; color: #666; font-size: 12px; }
.ali-invoice-dialog label { display: block; margin-bottom: 10px; font-size: 12px; color: #444; }
.ali-invoice-dialog .ali-invoice-shown:empty { display: none; }
.ali-invoice-dialog .ali-invoice-field { position: relative; }
.ali-invoice-dialog .ali-invoice-off { position: absolute; top: 0; right: 0; display: flex; align-items: center; gap: 4px; margin: 0; }
.ali-invoice-dialog input:not([type="checkbox"]), .ali-invoice-dialog textarea { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 6px 10px; border: 1px solid #ccc; border-radius: 8px; color: #222; font: 14px/1.4 ${FONT}; }
.ali-invoice-dialog menu { display: flex; justify-content: flex-end; gap: 8px; margin: 16px 0 0; padding: 0; }
.ali-invoice-dialog button { height: 32px; padding: 4px 12px; border: 1px solid #999; border-radius: 16px; background: #fff; color: #222; font: 700 14px/24px ${FONT}; cursor: pointer; }
.ali-invoice-dialog button.primary { background: #009966; color: #fff; border-color: #009966; }
.ali-invoice-dialog button.primary:hover { background: #007a52; border-color: #007a52; }
`;

  // "Generate invoice" plus a gear for the buyer settings. The gear shares the button's anchor,
  // so it never collides with the host's fixed widgets (AliExpress parks "Need help?" bottom-right).
  function makeControls(orderId) {
    const wrap = document.createElement('span');
    wrap.className = 'ali-invoice';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ali-invoice-btn';
    btn.textContent = 'Generate invoice';
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); generate(orderId); });
    const gear = document.createElement('button');
    gear.type = 'button';
    gear.className = 'ali-invoice-gear';
    gear.textContent = '⚙︎';
    gear.title = 'Invoice settings';
    gear.setAttribute('aria-label', 'Invoice settings');
    gear.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openSettings(orderId); });
    wrap.append(btn, gear);
    return wrap;
  }

  function inject() {
    // Order list: controls per order card, next to "Details".
    document.querySelectorAll('.order-item .order-item-header-right:not([data-ali-invoice])').forEach((hdr) => {
      const link = hdr.querySelector('a[href*="orderId="]');
      const orderId = link && new URL(link.href, location.href).searchParams.get('orderId');
      if (!orderId) return;
      hdr.dataset.aliInvoice = orderId;
      hdr.insertBefore(makeControls(orderId), link);
    });
    // Order detail: controls in the status block, after AliExpress' own buttons.
    const status = document.querySelector('.order-status.order-block:not([data-ali-invoice])');
    const orderId = new URLSearchParams(location.search).get('orderId');
    if (status && orderId) {
      status.dataset.aliInvoice = orderId;
      status.appendChild(makeControls(orderId));
    }
  }

  function main() {
    const style = document.createElement('style');
    style.textContent = PAGE_CSS;
    document.head.appendChild(style);
    inject();
    let scheduled = false; // the order list paginates in place, so keep injecting as cards appear
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; inject(); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (typeof module === 'object' && module.exports) module.exports = { buyerFor, settingsFromForm, renderReceipt, settingsHTML, PAGE_CSS, TOTAL_ROWS };
  else main();
})();
