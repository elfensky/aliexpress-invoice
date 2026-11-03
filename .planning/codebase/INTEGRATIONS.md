---
last_mapped_commit: 9989513756f0f2812e4dc65bc89820d256e691e6
last_mapped_at: 2026-11-01
---
# External Integrations

**Analysis Date:** 2026-11-01

## APIs & External Services

**AliExpress order API (via the page's own client):**
- Service: AliExpress order and tax receipt endpoint, called as mtop API `mtop.global.finance.taxation.invoice.queryOrderReceiptInfo` (constant `RECEIPT_API` in `aliexpress-invoice.user.js`, version `1.0`, type `POST`)
  - Called in: `fetchReceipt` in `aliexpress-invoice.user.js`
  - SDK/Client: `window.lib.mtop` (AliExpress' own request client, present on the order pages). The script does not ship or import an SDK.
  - Request: `mtop.request({ api, v: '1.0', type: 'POST', ecode: 1, needLogin: true, data: { orderId } })`
  - Auth: none stored by the script. The page's client attaches its own signed token and session. The script never reads or handles tokens or signatures (`README.md`, "How it works").
  - Response used: `res.data.data` with fields `orderId`, `orderTime`, `orderTotal`, `itemsTotal`, `shippingFee`, `totalDiscountAmount`, `adjustPriceAmount`, `totalApplicableFeeAmount`, `totalReceivableTaxAmount`, `totalSubsidyTaxAmount`, `totalRefundTaxAmount`, `includedTaxDisplay`, `paymentInfo` (`methodName`, `paymentDate`, `paymentAmountStr`), `deliveryAddress` (`contactName`, `detailAddress`, `detailAddress2`, `postCode`, `regionAddress`, `fullPhoneNo`), and `subOrders` (`itemTitle`, `relateInfo`, `amount`, `itemCount`, `sellerName`)
  - Failure handling: throws `Unexpected receipt response: ...` when `res.data.data.orderId` is missing. The receipt tab shows the error text (`generate`). The settings dialog ignores failures (`openSettings`).

**Page hooks (not an API, but an external dependency):**
- AliExpress order DOM: selectors `.order-item .order-item-header-right`, `a[href*="orderId="]`, `.order-status.order-block` in `inject` in `aliexpress-invoice.user.js`. A change in AliExpress markup breaks button placement.

## Data Storage

**Databases:**
- Not applicable. The script has no database.

**File Storage:**
- Local filesystem only: the browser saves the printed PDF through the print dialog ("Save as PDF"). The file name is set by the page title `aliexpress-<order id>`. The script writes no files.

**Browser storage:**
- `localStorage`, key `aliexpress-invoice.buyer` (constant `STORE_KEY`), scoped per origin (aliexpress.com).
  - Read: `loadBuyer` in `aliexpress-invoice.user.js`
  - Write: `saveBuyer` (JSON of the buyer fields plus an `off` array of field keys)
  - Clear: "Use delivery address" in the settings dialog calls `saveBuyer(null)`
  - Contents: the buyer name, VAT number, address, and extra lines the user typed, plus Leave off marks. These values are personal data about the buyer. They stay in the browser and never go to a server.

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- AliExpress login session only. The script requires an existing login (`needLogin: true`) and relies on the page's session. It has no login flow of its own and no credentials.

## Monitoring & Observability

**Error Tracking:**
- None. Errors appear in the receipt tab (`generate`) or the console. No external error service is used.

**Logs:**
- No logging. The script does not call `console.*`.

## CI/CD & Deployment

**Hosting:**
- GitHub repository `elfensky/aliexpress-invoice`. The script file is served from `https://raw.githubusercontent.com/elfensky/aliexpress-invoice/main/aliexpress-invoice.user.js` (`@downloadURL` and `@updateURL` in the header).

**CI Pipeline:**
- Not detected. No `.github/workflows` directory is in the tracked files. Tests run only by hand with `node --test`.

**Installation links:**
- `README.md` links to the raw script URL for the install badge and links to the Tampermonkey site (`https://www.tampermonkey.net/`).

## Environment Configuration

**Required env vars:**
- None. The repository reads no environment variables.

**Secrets location:**
- No secrets are used or stored in the repository. No `.env` file is present. The `.gitignore` contains only `.worktrees/`.

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None. The script makes no request to any host except the AliExpress mtop call made through the page's own client. It does not send data to a third party.

## Network Requests

- Only `lib.mtop.request` on the AliExpress domain, through `fetchReceipt`.
- No CDN, analytics, font host, or script host is loaded.
- Update checks are performed by Tampermonkey or Violentmonkey against the `@updateURL` raw GitHub URL. The script itself does not make that request.

## Security Notes

- The script uses `@grant none`, so it has no access to Tampermonkey storage or cross-origin APIs.
- The script escapes all values written into the receipt and dialog HTML with `esc` (`&`, `<`, `>`, `"`, `'`). Order data from AliExpress is treated as text, not markup.
- Buyer details are personal data. They stay in `localStorage` for aliexpress.com.

---

*Integration audit: 2026-11-01*
