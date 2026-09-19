// Self-check for the pure parts. Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { buyerFromAddress, renderReceipt, settingsHTML } = require('./aliexpress-invoice.user.js');

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

test('buyerFromAddress splits the VAT number out of the contact name', () => {
  const b = buyerFromAddress(receipt.deliveryAddress);
  assert.equal(b.name, 'ACME BV');
  assert.equal(b.vat, 'BE0123456789');
  assert.equal(b.address, 'Example street 1\n1000 Brussels, Belgium');
  assert.equal(b.extra, '+32 400000000');
});

test('buyerFromAddress leaves a plain name alone', () => {
  assert.deepEqual(buyerFromAddress({ contactName: 'Jane Doe' }), { name: 'Jane Doe', vat: '', address: '', extra: '' });
});

test('renderReceipt shows the buyer, every reported amount, the VAT line, and escapes HTML', () => {
  const html = renderReceipt(receipt, buyerFromAddress(receipt.deliveryAddress));
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
