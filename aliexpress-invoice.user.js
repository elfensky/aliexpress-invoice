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

  // The logo and font of AliExpress' own receipt dialog (/p/tax-ui/, 2026-11-02), loaded from their servers so
  // this repo ships no copy of them. If one fails to load, the alt text or a system font prints instead.
  const AE_IMG = 'https://ae-pic-a1.aliexpress-media.com/kf/';
  const AE_FONT = 'https://assets.aliexpress-media.com/g/ae-fe/static-ui/open-sans/';
  const LOGO_HTML = `<div class="logo"><img src="${AE_IMG}Sc4750b3945494d33bd7c1210fd85fda3X/160x160.png" alt=""><img src="${AE_IMG}S5818d28e718c47e8869e683acb8d4c4bD/332x72.png" alt="AliExpress"></div>`;

  // Colours and type of AliExpress' order pages and receipt dialog: ink #191919, grey #757575, divider #f5f5f5,
  // price red #f00633, and the orange gradient of their primary buttons. On screen the receipt is an A4 sheet.
  const RECEIPT_CSS = `
@font-face { font-family: "Open Sans"; font-weight: 400; src: local("Open Sans Regular"), local("OpenSans-Regular"), url(${AE_FONT}mem8YaGs126MiZpBA-UFVZ0bf8pkAg.woff2) format("woff2"); }
@font-face { font-family: "Open Sans"; font-weight: 700; src: local("Open Sans Bold"), local("OpenSans-Bold"), url(${AE_FONT}mem5YaGs126MiZpBA-UN7rgOUuhpKKSTjw.woff2) format("woff2"); }
@page { size: A4; margin: 16mm; }
html { background: #f5f5f5; }
body { box-sizing: border-box; max-width: 794px; margin: 32px auto; padding: 56px 60px 60px; border-radius: 12px; background: #fff; color: #191919; font: 12px/1.5 "Open Sans", Roboto, Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { margin: 0 0 2px; font-size: 22px; line-height: 1.2; }
h2 { margin: 0 0 8px; font-size: 14px; }
dt { color: #757575; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding-bottom: 20px; border-bottom: 3px solid #ff3000; border-image: linear-gradient(90deg, #ff640e, #ff3000) 1; }
.logo { display: flex; align-items: center; gap: 10px; }
.logo img:first-child { width: 44px; height: 44px; }
.logo img:last-child { height: 22px; }
.top > div { text-align: right; }
.facts { display: flex; flex-wrap: wrap; gap: 12px 40px; margin: 0; padding: 16px 0; border-bottom: 8px solid #f5f5f5; }
.facts dd { margin: 2px 0 0; font-size: 13px; font-weight: 700; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; padding: 24px 0; margin-bottom: 24px; border-bottom: 8px solid #f5f5f5; break-inside: avoid; }
.parties strong { font-size: 13px; }
table { width: 100%; border-spacing: 0; font-variant-numeric: tabular-nums; }
td, th { padding: 8px; text-align: left; vertical-align: top; }
td:first-child, th:first-child { padding-left: 0; }
td:last-child, th:last-child { padding-right: 0; }
.items th { padding-top: 0; border-bottom: 1px solid #191919; }
.items td { border-bottom: 1px solid #ebebeb; }
.items th:nth-child(n+2), .items td:nth-child(n+2) { width: 1%; text-align: right; white-space: nowrap; }
.items tr { break-inside: avoid; }
.items .muted { margin-top: 2px; }
.totals { width: 300px; margin: 16px 0 0 auto; break-inside: avoid; }
.totals td { padding: 4px 0; }
.totals td:last-child { text-align: right; }
.totals .total td { padding-top: 10px; border-top: 1px solid #191919; font-size: 18px; font-weight: 700; }
.totals .total td:last-child { color: #f00633; }
.totals .vat td { padding: 8px 10px; background: #fff1eb; font-weight: 700; }
.muted { color: #757575; font-size: 11px; }
footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ebebeb; break-before: avoid; }
.no-print { position: fixed; right: 24px; bottom: 24px; padding: 4px 24px; border: 0; border-radius: 24px; background: #191919; color: #fff; font: 700 16px/32px "Open Sans", Roboto, Arial, sans-serif; cursor: pointer; }
@media print { html { background: none; } body { max-width: none; margin: 0; padding: 0; border-radius: 0; } .no-print { display: none; } }
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
  ${LOGO_HTML}
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
${AUTO_PRINT ? '<script>addEventListener("load", function () { document.fonts.ready.then(function () { setTimeout(print, 100); }); });</script>' : ''}
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
