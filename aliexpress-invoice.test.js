// Self-check for the pure parts. Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { buyerFor, settingsFromForm, renderReceipt, settingsHTML } = require('./aliexpress-invoice.user.js');

// Trimmed shape of mtop.global.finance.taxation.invoice.queryOrderReceiptInfo → data.data
const receipt = {
  orderId: '3000000000000001',
  orderTime: 'Sep 18, 2026',
  itemsTotal: '€ 168,78',
  shippingFee: '-€ 0,10',
  totalReceivableTaxAmount: '€ 3,63',
  orderTotal: '€ 172,41',
  includedTaxDisplay: '€ 29,92',
  paymentInfo: { methodName: 'Bancontact', paymentDate: 'Sep 18, 2026', paymentAmountStr: 'EUR 172.41' },
  deliveryAddress: { contactName: 'ACME BV BE0123456789', detailAddress: 'Example street 1', detailAddress2: '', postCode: '1000', regionAddress: 'Brussels, Belgium', fullPhoneNo: '+32 400000000' },
  subOrders: [{ itemTitle: 'Widget <b>PCIe</b>', relateInfo: 'With POE', amount: '€ 84,39', itemCount: 2, sellerName: 'Some Store' }],
};

const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [].concat(v)) f.append(k, x); return f; };

test('buyerFor without buyer details uses the order values and splits the VAT number out of the contact name', () => {
  const b = buyerFor(null, receipt.deliveryAddress);
  assert.equal(b.name, 'ACME BV');
  assert.equal(b.vat, 'BE0123456789');
  assert.equal(b.address, 'Example street 1\n1000 Brussels, Belgium');
  assert.equal(b.extra, '+32 400000000');
});

test('buyerFor leaves a plain name alone', () => {
  assert.deepEqual(buyerFor(null, { contactName: 'Jane Doe' }), { name: 'Jane Doe', vat: '', address: '', extra: '' });
});

test('buyerFor: a saved value replaces the order value, an empty one keeps it, and Leave off prints nothing', () => {
  assert.deepEqual(
    buyerFor({ name: '', vat: 'BE0999999999', address: '', extra: '', off: ['extra'] }, receipt.deliveryAddress),
    { name: 'ACME BV', vat: 'BE0999999999', address: 'Example street 1\n1000 Brussels, Belgium', extra: '' },
  );
  assert.equal(buyerFor({ name: 'Other BV', off: ['name'] }, receipt.deliveryAddress).name, '', 'Leave off wins over a saved value');
});

test('buyerFor reads 0.2.0 buyer details (no Leave off marks) field by field', () => {
  assert.deepEqual(
    buyerFor({ name: 'Other BV', vat: '', address: '', extra: '' }, receipt.deliveryAddress),
    { name: 'Other BV', vat: 'BE0123456789', address: 'Example street 1\n1000 Brussels, Belgium', extra: '+32 400000000' },
  );
});

test('settingsFromForm trims the fields, keeps the Leave off marks, and returns null for an empty form', () => {
  assert.deepEqual(
    settingsFromForm(form({ name: ' ACME BV ', vat: '', address: 'Street 1\n', extra: '', off: ['extra', 'vat'] })),
    { name: 'ACME BV', vat: '', address: 'Street 1', extra: '', off: ['vat', 'extra'] },
  );
  assert.deepEqual(settingsFromForm(form({ name: '', vat: '', address: '', extra: '', off: 'extra' })).off, ['extra'], 'a mark alone is worth saving');
  assert.equal(settingsFromForm(form({ name: ' ', vat: '', address: '', extra: '' })), null);
});

test('renderReceipt shows the buyer, every reported amount, the VAT line, and escapes HTML', () => {
  const html = renderReceipt(receipt, buyerFor(null, receipt.deliveryAddress));
  for (const s of ['ACME BV', 'VAT BE0123456789', '€ 168,78', '-€ 0,10', '€ 3,63', '€ 172,41', 'of which VAT (included)', '€ 29,92', 'Bancontact', 'Some Store', 'Widget &lt;b&gt;PCIe&lt;/b&gt;', '<title>aliexpress-3000000000000001</title>']) {
    assert.ok(html.includes(s), 'missing: ' + s);
  }
  assert.ok(!html.includes('Discount'), 'absent keys must not render');
});

test('settingsHTML labels the dialog, keeps password managers out, and escapes values', () => {
  const html = settingsHTML({ name: 'A "quoted" <name>', vat: '', address: '', extra: '' });
  assert.ok(html.includes('id="ali-invoice-dialog-title"'));
  assert.equal((html.match(/data-1p-ignore/g) || []).length, 4);
  assert.ok(html.includes('value="A &quot;quoted&quot; &lt;name&gt;"'));
});

test('settingsHTML gives every field a placeholder and a labelled Leave off box, ticked from the saved marks', () => {
  const html = settingsHTML({ name: '', vat: '', address: '', extra: '', off: ['extra'] });
  assert.equal((html.match(/placeholder="From the order"/g) || []).length, 4);
  assert.equal((html.match(/type="checkbox" name="off"/g) || []).length, 4);
  assert.ok(html.includes('value="extra" aria-label="Leave Extra lines (email, IBAN, reference…) off the receipt" checked>'));
  assert.ok(!html.includes('value="name" aria-label="Leave Company / name off the receipt" checked'));
});
