# AliExpress Invoice

## What This Is

A Tampermonkey (or Violentmonkey) userscript that adds a **Generate invoice** button and a ⚙ gear to every
AliExpress order, on the orders list and on the order page. One click prints the order as a **purchase receipt**
to PDF: a buyer block with VAT number, the seller(s), the items, every amount AliExpress reports, and the VAT
included in the total. It exists because Drünik buys hardware on AliExpress and the accountant needs one document
per purchase; AliExpress' own receipt page omits the VAT line, has no proper buyer or seller block, and its
Download button saves an image. The script is public (MIT) for anyone who buys on AliExpress.

## Core Value

One click on an AliExpress order gives a printable purchase receipt with a correct buyer block and the included
VAT, made only from what AliExpress reports.

## Requirements

### Validated

<!-- Shipped in 0.1.0–0.3.0 and in use. Inferred from the code and the codebase map (.planning/codebase/). -->

- ✓ "Generate invoice" on each order card of the orders list and on the order page; injection keeps up as the
  list paginates, with no duplicate controls — 0.1.0; styled like AliExpress' own buttons, with the gear next to
  it, in 0.2.0
- ✓ Receipt data comes from `mtop.global.finance.taxation.invoice.queryOrderReceiptInfo` through the page's own
  `window.lib.mtop`; the script never reads tokens or signatures (`@grant none`) — 0.1.0
- ✓ The purchase receipt shows order id, order and payment dates, payment method, sellers, items (title, variant,
  seller, quantity, unit price), every reported total row, the total and "of which VAT (included)"; every response
  value is HTML-escaped — 0.1.0
- ✓ The receipt opens in a new tab and the print dialog opens by itself; "Save as PDF" names the file
  `aliexpress-<order id>.pdf` — 0.1.0
- ✓ The buyer block defaults to the order's delivery address, and a VAT number in the contact name moves to its
  own line (`ACME BV BE0123456789` → `ACME BV` + `VAT BE0123456789`) — 0.1.0
- ✓ Password managers stay out of the buyer-details dialog — 0.1.1
- ✓ Buyer details per field: a typed value replaces the order value on every receipt, an empty field keeps each
  order's value, **Leave off** keeps a line off; the placeholders show the gear's own order; **Use delivery
  address** clears the details; 0.2.0 details still load — 0.3.0
- ✓ Installed copies update from `main` through `@updateURL` — 0.1.0
- ✓ `node --test` covers the pure parts: buyer rules, receipt rendering and escaping, dialog markup (8 tests) — 0.3.0

### Active

<!-- Facts from issue #2, PR #4 and the codebase map. Nothing else is filed. -->

- [ ] A failed receipt request shows one plain message with AliExpress' code, and a page without `lib.mtop` gets
  its own message — PR #4 (0.3.1), refs #2
- [ ] Bug #2 (fresh order fails in the first minutes after checkout) is closed with evidence from a real new order
- [ ] The receipt's "Generated … on" date is the local date, also just after local midnight — codebase map
- [ ] VAT-number detection and the escaping of every printed response field are pinned by tests — codebase map
- [ ] Stored buyer details that are not an object are ignored — codebase map
- [ ] Tests cover the page code (control injection, dialog save and clear) — codebase map
- [ ] Every pull request runs `node --test` in CI — codebase map

### Out of Scope

- A seller-issued or tax-compliant invoice — the document is a purchase receipt from order data and shows only
  what AliExpress reports (CONTEXT.md)
- Reading or sending tokens, signatures or credentials — the page's own `lib.mtop` signs every request
- A build step, a bundler or runtime dependencies — the project is one userscript file
- Storage outside the browser — buyer details stay in `localStorage` for aliexpress.com; a cross-site store
  (`GM_setValue`) is only an upgrade path if ever needed
- Other AliExpress pages or other shops — the script matches the order pages only
- An error text inside the gear's dialog — PR #4 keeps the 0.3.0 behaviour: generic placeholders when the request
  fails
- Batch export, file output other than the print dialog, invoice numbering, per-order buyer profiles — nobody
  asked for them

## Context

- **Codebase:** `aliexpress-invoice.user.js` (one IIFE, 280 lines, 0.3.0) and `aliexpress-invoice.test.js`
  (`node:test`). No `package.json`, no lockfile, no CI, no changelog. The file exports its pure functions when
  `module.exports` exists and calls `main()` otherwise. Map: `.planning/codebase/`.
- **Domain language:** CONTEXT.md — purchase receipt, order, included VAT, buyer block, buyer field, order values,
  buyer details, Leave off. PR #4 adds **receipt data**.
- **Dev loop:** set `AUTO_PRINT` to `false` and paste the script into the DevTools console on an orders page. Live
  checks need a signed-in AliExpress account with real orders.
- **In flight:** PR #4 (`fix/receipt-errors`, 0.3.1, open, 11 tests) makes `fetchReceipt(orderId, mtop)` the one
  place that gets the receipt data. Its own open check is a live run on one completed order before the merge. It is
  candidate 02 of an architecture review at `artifacts.static.lav.ren/aliexpress-invoice-architecture-review/`.
- **Bug #2:** on 2026-11-01 a receipt for an order placed minutes before failed once, then worked later the same
  day in Zen Browser and in Chrome. The likely cause is timing (AliExpress prepares the receipt data after
  checkout). The issue holds a capture list for the next new order.
- **Fragile points:** AliExpress' page selectors and `window.lib.mtop` are not public APIs; when they change, the
  controls disappear without a message. On 2026-11-01 the controls were missing once in Chrome and came back after
  a reinstall; the cause is not known.
- **Unverified:** whether the page's Content-Security-Policy can block the receipt tab's inline print script.

## Constraints

- **Tech stack:** one plain-JavaScript userscript, no build, no runtime dependencies — install is one click from
  the raw file
- **Runtime:** Tampermonkey or Violentmonkey on Chrome and Firefox-based browsers (Zen is in use); `@grant none`
- **Data source:** only what `queryOrderReceiptInfo` returns — the receipt never invents an amount
- **Security:** never touch tokens or signatures; escape every response value; buyer details stay in the browser
- **Distribution:** installed copies update from `main`, so every merge to `main` is a release
- **Tests:** `node --test` on the current Node LTS (26), no test framework dependency so far

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Call the page's own `lib.mtop` | No token or signature handling in the script | ✓ Good |
| Print to PDF through `window.print()` in a new tab | No PDF library, the browser does the layout | ✓ Good |
| Purchase receipt, not invoice (button label only says "Generate invoice") | The seller issues invoices; the script only formats order data | ✓ Good |
| Buyer details per field with Leave off (0.3.0) | One saved company block, each field can fall back to the order | ✓ Good |
| One plain error message that claims no cause (PR #4) | The real failure code of #2 is not captured yet | — Pending |
| Active items marked "codebase map" come from `.planning/codebase/CONCERNS.md`, not from filed issues | GSD adoption on 2026-11-01 found no other open work | — Pending (Andrei to confirm or drop) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-01 after initialization*
