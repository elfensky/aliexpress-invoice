# AliExpress Invoice

[![Install](https://img.shields.io/badge/%E2%96%BC%20Install%20userscript-Tampermonkey-2ea44f?style=for-the-badge)](https://raw.githubusercontent.com/elfensky/aliexpress-invoice/main/aliexpress-invoice.user.js)

A userscript for Tampermonkey. It adds a **Generate invoice** button to your AliExpress orders and prints each order as a purchase receipt in PDF form.

AliExpress has a receipt page for every order. That page omits the VAT amount, has no buyer or seller block, and its Download button saves an image. This script reads the same order data and formats it as a document. It shows the buyer with VAT number, the seller, the items, every amount AliExpress reports, and the VAT included in the total.

## What it looks like

The receipt as it goes to PDF, with sample data:

![Receipt with buyer, seller, items, totals and the VAT line](docs/receipt-sample.png)

The button and its ⚙ settings gear, on the orders list and on an order page:

| Orders list | Order page |
|---|---|
| ![Generate invoice button and gear in an order card](docs/orders-list.png) | ![Generate invoice button and gear next to the order status buttons](docs/order-detail.png) |

The buyer details dialog behind the gear:

<img src="docs/settings-dialog.png" alt="Dialog with company name, VAT number, address and extra lines" width="420">

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or Violentmonkey.
2. Click the **Install** button at the top of this page. The extension opens its install screen.
3. Open or reload your [AliExpress orders](https://www.aliexpress.com/p/order/index.html).

Updates arrive through the script's `@updateURL`. You do not have to reinstall.

## Use

1. Click **Generate invoice** on an order. The receipt opens in a new tab and the print dialog appears.
2. Choose **Save as PDF**. The file is named `aliexpress-<order id>.pdf`.

If the receipt tab does not open, allow pop-ups for `aliexpress.com`.

### Buyer details

By default the receipt uses the delivery address of the order. If the contact name holds a VAT number, the script moves it to its own line. `ACME BV BE0123456789` becomes the name `ACME BV` and the line `VAT BE0123456789`.

To print a different buyer block, click the ⚙ gear next to any Generate invoice button. Enter the company name, VAT number, address, and any extra lines such as an email address, IBAN or purchase order reference. The browser stores these values for aliexpress.com. **Use delivery address** clears them.

## How it works

The order pages load AliExpress' own request client, `lib.mtop`. The script calls the receipt endpoint `mtop.global.finance.taxation.invoice.queryOrderReceiptInfo` through that client, so it never handles tokens or signatures. It renders the response as HTML with print styles and calls `window.print()`. There are no dependencies and no build step.

The receipt shows only what AliExpress reports. It is a purchase receipt generated from order data, not an invoice issued by the seller.

## Development

```sh
node --test   # checks buyer parsing, receipt rendering and the dialog markup
```

To try a change without reinstalling, set `AUTO_PRINT` to `false` and paste the script into the DevTools console on an orders page. The print dialog then stays closed and you can inspect the receipt tab.

## License

MIT
