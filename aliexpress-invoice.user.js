// ==UserScript==
// @name         AliExpress Invoice
// @namespace    https://github.com/elfensky/aliexpress-invoice
// @version      0.2.0
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

  // Default buyer, parsed from the order's delivery address. AliExpress has no VAT
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

  function loadBuyer() { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; } }
  function saveBuyer(b) { if (b) localStorage.setItem(STORE_KEY, JSON.stringify(b)); else localStorage.removeItem(STORE_KEY); }
  const hasBuyer = (b) => !!(b && (b.name || b.vat || b.address || b.extra));

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

  const RECEIPT_CSS = `
@page { size: A4; margin: 16mm; }
body { font: 12px/1.45 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; color: #111; max-width: 720px; margin: 24px auto; padding: 0 16px; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #666; margin: 0 0 6px; }
header, .parties { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.parties > div { flex: 1; }
table { border-collapse: collapse; }
td, th { padding: 6px 8px; text-align: left; vertical-align: top; }
.meta td:first-child { color: #666; padding-right: 16px; }
.items { width: 100%; margin-bottom: 16px; }
.items th { border-bottom: 2px solid #111; }
.items td { border-bottom: 1px solid #ddd; }
.items th:nth-child(n+2), .items td:nth-child(n+2) { text-align: right; white-space: nowrap; }
.totals { margin-left: auto; }
.totals td:last-child { text-align: right; min-width: 90px; }
.totals .total td { border-top: 2px solid #111; font-weight: 700; }
.muted { color: #666; font-size: 11px; }
footer { margin-top: 32px; }
.no-print { position: fixed; right: 16px; bottom: 16px; padding: 10px 16px; font: inherit; border: 1px solid #111; background: #fff; border-radius: 999px; cursor: pointer; }
@media print { .no-print { display: none; } body { margin: 0; max-width: none; } }
`;

  function renderReceipt(d, buyer) {
    const pay = d.paymentInfo || {};
    const subOrders = d.subOrders || [];
    const sellers = [...new Set(subOrders.map((s) => s.sellerName).filter(Boolean))];
    const block = (b) => [b.name, b.vat && 'VAT ' + b.vat, ...lines(b.address), ...lines(b.extra)].filter(Boolean).map(esc).join('<br>');
    const totals = TOTAL_ROWS.filter(([k]) => d[k]).map(([k, label]) => `<tr><td>${label}</td><td>${esc(d[k])}</td></tr>`).join('');
    const items = subOrders.map((s) => `<tr><td>${esc(s.itemTitle)}${s.relateInfo ? `<div class="muted">${esc(s.relateInfo)}</div>` : ''}<div class="muted">Sold by ${esc(s.sellerName)}</div></td><td>${esc(s.itemCount)}</td><td>${esc(s.amount)}</td></tr>`).join('');
    const row = (label, value) => (value ? `<tr><td>${label}</td><td>${esc(value)}</td></tr>` : '');
    return `<!doctype html><html><head><meta charset="utf-8"><title>aliexpress-${esc(d.orderId)}</title><style>${RECEIPT_CSS}</style></head><body>
<header>
  <div><h1>Purchase receipt</h1><div class="muted">Generated from AliExpress order data on ${new Date().toISOString().slice(0, 10)}</div></div>
  <table class="meta">${row('Order', d.orderId)}${row('Order date', d.orderTime)}${row('Paid on', pay.paymentDate)}${row('Payment', pay.methodName && (pay.methodName + (pay.paymentAmountStr ? ' · ' + pay.paymentAmountStr : '')))}</table>
</header>
<section class="parties">
  <div><h2>Seller</h2>AliExpress (marketplace)<br>${sellers.map(esc).join('<br>')}<div class="muted">Items are sold by third-party sellers on AliExpress, not by AliExpress itself.</div></div>
  <div><h2>Buyer</h2>${block(buyer)}</div>
</section>
<table class="items"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>${items}</tbody></table>
<table class="totals">${totals}<tr class="total"><td>Total</td><td>${esc(d.orderTotal)}</td></tr>${row('of which VAT (included)', d.includedTaxDisplay)}</table>
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
      const stored = loadBuyer();
      const buyer = hasBuyer(stored) ? stored : buyerFromAddress(d.deliveryAddress);
      w.document.open();
      w.document.write(renderReceipt(d, buyer));
      w.document.close();
    } catch (e) {
      w.document.body.innerHTML = `<pre style="padding:24px;white-space:pre-wrap">Could not generate the invoice for order ${esc(orderId)}.\n\n${esc((e && e.message) || e)}</pre>`;
    }
  }

  // ---- settings dialog -----------------------------------------------------

  function settingsHTML(b) {
    return `<form method="dialog">
  <h3 id="ali-invoice-dialog-title">Invoice buyer details</h3>
  <p>Leave everything empty to use the delivery address of each order.</p>
  <label>Company / name<input name="name" data-1p-ignore autocomplete="off" value="${esc(b.name)}"></label>
  <label>VAT number<input name="vat" data-1p-ignore autocomplete="off" value="${esc(b.vat)}"></label>
  <label>Address<textarea name="address" data-1p-ignore autocomplete="off" rows="3">${esc(b.address)}</textarea></label>
  <label>Extra lines (email, IBAN, reference…)<textarea name="extra" data-1p-ignore autocomplete="off" rows="3">${esc(b.extra)}</textarea></label>
  <menu><button value="cancel">Cancel</button><button value="clear">Use delivery address</button><button value="save" class="primary">Save</button></menu>
</form>`;
  }

  function openSettings() {
    const dlg = document.createElement('dialog');
    dlg.className = 'ali-invoice-dialog';
    dlg.setAttribute('aria-labelledby', 'ali-invoice-dialog-title');
    dlg.innerHTML = settingsHTML(loadBuyer() || { name: '', vat: '', address: '', extra: '' });
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'save') {
        const f = new FormData(dlg.querySelector('form'));
        const nb = Object.fromEntries(['name', 'vat', 'address', 'extra'].map((k) => [k, String(f.get(k) || '').trim()]));
        saveBuyer(hasBuyer(nb) ? nb : null);
      } else if (dlg.returnValue === 'clear') {
        saveBuyer(null);
      }
      dlg.remove();
    });
    dlg.showModal();
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
.ali-invoice-dialog input, .ali-invoice-dialog textarea { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 6px 10px; border: 1px solid #ccc; border-radius: 8px; color: #222; font: 14px/1.4 ${FONT}; }
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
    gear.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openSettings(); });
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

  if (typeof module === 'object' && module.exports) module.exports = { buyerFromAddress, renderReceipt, settingsHTML, PAGE_CSS, TOTAL_ROWS };
  else main();
})();
