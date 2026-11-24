---
last_mapped_commit: 9989513756f0f2812e4dc65bc89820d256e691e6
last_mapped_at: 2026-11-01
---
<!-- refreshed: 2026-11-01 -->
# Architecture

**Analysis Date:** 2026-11-01

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                    Tampermonkey runtime (aliexpress.com/p/order/*)    │
│                                                                      │
│  main()  `aliexpress-invoice.user.js`                                │
│   ├─ injects PAGE_CSS                                                │
│   ├─ inject()  ── adds controls to order cards and order detail      │
│   └─ MutationObserver ── re-runs inject() as the list paginates      │
├──────────────────────────────────────────────────────────────────────┤
│  Controls                                                            │
│   "Generate invoice" button ──► generate(orderId)                    │
│   ⚙ gear button            ──► openSettings(orderId)                 │
├──────────────────────────────────────────────────────────────────────┤
│  Domain / pure logic (exported to tests)                             │
│   buyerFromAddress · buyerFor · settingsFromForm · renderReceipt     │
│   settingsHTML · TOTAL_ROWS · BUYER_FIELDS                           │
├──────────────────────────────────────────────────────────────────────┤
│  Boundaries                                                          │
│   fetchReceipt() ──► window.lib.mtop (AliExpress request client)     │
│   loadBuyer()/saveBuyer() ──► localStorage["aliexpress-invoice.buyer"]│
│   window.open() ──► receipt tab (document.write + window.print())    │
└──────────────────────────────────────────────────────────────────────┘
```

## Pattern Overview

**Overall:** Single-file userscript. One IIFE holds all code. Pure rendering and rule functions sit beside thin browser-facing shell functions.

**Key Characteristics:**
- One source file, `aliexpress-invoice.user.js` (about 16 KB). No modules, no bundler, no build step, no dependencies. The README states this explicitly.
- `@grant none`. The script runs in the page context. It reads `window.lib.mtop` and does not use `GM_*` APIs.
- Dual load mode. When `module.exports` exists (Node), the IIFE only exports functions. Otherwise it calls `main()`. The test file `aliexpress-invoice.test.js` loads the same file with `require`.
- Stateless except for one persisted value. The only state is the buyer details record in `localStorage`. Every other value is derived per click or per render.
- HTML is built by string templates. The receipt and the dialog are both produced as HTML strings and escaped with `esc()`.
- Auth is delegated. The script never reads tokens or signatures. It calls the page's own `mtop.request` with `needLogin: true` and `ecode: 1`.

## Layers

The code has no formal layers. It has four logical groups, all in the same file. They are listed here in dependency order.

**Constants and helpers:**
- Purpose: fixed values and small text utilities.
- Location: `aliexpress-invoice.user.js`, top of IIFE (`AUTO_PRINT`, `STORE_KEY`, `RECEIPT_API`, `TOTAL_ROWS`, `esc`, `lines`).
- Contains: string constants, one escape function, one line splitter.
- Depends on: nothing.
- Used by: every other group.

**Buyer rules (pure):**
- Purpose: decide which buyer values print on a receipt.
- Location: `aliexpress-invoice.user.js`, section `// ---- buyer block`.
- Contains: `BUYER_FIELDS`, `buyerFromAddress`, `buyerFor`, `settingsFromForm`, `loadBuyer`, `saveBuyer`.
- Depends on: constants. `loadBuyer` and `saveBuyer` touch `localStorage`, so they are the only impure members of this group.
- Used by: `generate`, `openSettings`, `settingsHTML`, and the test file.

**Receipt and dialog rendering (pure, except `Date`):**
- Purpose: turn order data and buyer values into HTML.
- Location: `aliexpress-invoice.user.js`, sections `// ---- receipt` and `// ---- settings dialog`.
- Contains: `RECEIPT_CSS`, `renderReceipt`, `settingsHTML`.
- Depends on: `esc`, `lines`, `TOTAL_ROWS`, `BUYER_FIELDS`, `buyerFor` output.
- Used by: `generate`, `openSettings`, the test file.
- Note: `renderReceipt` reads `new Date()` for the "Generated on" date. Tests check the markup, not that date.

**Page shell (browser-only):**
- Purpose: talk to AliExpress and to the browser.
- Location: `aliexpress-invoice.user.js`, sections `// ---- receipt` (`fetchReceipt`, `generate`), `// ---- settings dialog` (`openSettings`), and `// ---- page injection` (`makeControls`, `inject`, `main`).
- Contains: the network call, popup handling, dialog lifecycle, DOM injection, and the mutation observer.
- Depends on: `window.lib.mtop`, `window.open`, `document`, `localStorage`, `MutationObserver`, `requestAnimationFrame`.
- Used by: nothing outside the IIFE. `main()` is the only entry.

## Data Flow

### Primary Request Path: Generate invoice

1. The user clicks the **Generate invoice** button. `makeControls` binds `generate(orderId)` (`aliexpress-invoice.user.js`, `makeControls`).
2. `generate` opens a blank popup with `window.open('', '_blank')` synchronously. This keeps the popup blocker from stopping it. It writes a loading line into the popup.
3. `fetchReceipt(orderId)` calls `window.lib.mtop.request` with `RECEIPT_API`. It returns `res.data.data`. It throws when the response has no `orderId`.
4. `buyerFor(loadBuyer(), d.deliveryAddress)` merges saved buyer details with the order values. A saved non-empty field wins. A field marked Leave off becomes `''`.
5. `renderReceipt(d, buyer)` returns the full HTML document. It includes the print CSS and, when `AUTO_PRINT` is true, a `<script>` that calls `print()`.
6. `generate` calls `w.document.open()`, `write()`, and `close()` on the popup. Any error replaces the popup body with the error message.

### Secondary Flow: Buyer details dialog

1. The user clicks the gear. `openSettings(orderId)` creates a `<dialog>` and fills it with `settingsHTML(loadBuyer() || {})`.
2. The dialog calls `showModal()`. In parallel, `fetchReceipt(orderId)` loads the order. Its delivery address fills each field's `placeholder` through `buyerFor(null, ...)`. If the request fails, the generic placeholder stays (`.then(…, () => {})`).
3. On `close`, the handler reads `dlg.returnValue`:
   - `save`: `saveBuyer(settingsFromForm(new FormData(form)))`.
   - `clear`: `saveBuyer(null)`, which removes the key.
   - `cancel` or Escape: no change.
4. The dialog element is removed from `document.body`.

### Injection Flow: Adding controls to the page

1. `main()` appends `PAGE_CSS` to `<head>`. It calls `inject()` once.
2. `inject()` finds order cards by `.order-item .order-item-header-right:not([data-ali-invoice])`. It reads `orderId` from the `a[href*="orderId="]` link, marks the node with `data-ali-invoice`, and inserts controls before that link.
3. `inject()` finds the detail block by `.order-status.order-block:not([data-ali-invoice])` and the `orderId` query parameter. It appends controls.
4. A `MutationObserver` on `document.body` calls `inject()` on the next animation frame after DOM changes. A `scheduled` flag coalesces repeated calls.

**State Management:**
- Persisted: one JSON object under `localStorage["aliexpress-invoice.buyer"]`. Shape: `{ name, vat, address, extra, off: [...] }`. Scope is per origin (`aliexpress.com`).
- Derived per call: buyer block, receipt HTML. Nothing is cached in memory between clicks.
- Idempotence marker: `data-ali-invoice` on the host node. It prevents duplicate controls when `inject()` reruns.

## Key Abstractions

**Buyer field:**
- Purpose: one of four printed lines in the buyer block.
- Definition: `BUYER_FIELDS` in `aliexpress-invoice.user.js`. Entries are `[key, label, multiline?]`. Keys are `name`, `vat`, `address`, `extra`.
- Pattern: every buyer function iterates `BUYER_FIELDS`. Adding a field there updates the rule, the form, and the storage shape together.

**Buyer details (saved record):**
- Purpose: user overrides plus Leave off marks.
- Examples: `buyerFor` and `settingsFromForm` in `aliexpress-invoice.user.js`.
- Pattern: a `null` or missing record means "use the delivery address". A record with `off` lacking a key is treated as no mark. Records saved by 0.2.0 have no `off` key and still load (see the test `buyerFor reads 0.2.0 buyer details`).

**Order values:**
- Purpose: buyer values derived from `deliveryAddress`.
- Examples: `buyerFromAddress` in `aliexpress-invoice.user.js`.
- Pattern: a regex pulls a VAT number out of `contactName`. Address lines are joined with `\n` and printed through `lines()`.

**Receipt totals table:**
- Purpose: one row per reported amount.
- Examples: `TOTAL_ROWS` in `aliexpress-invoice.user.js`.
- Pattern: an ordered list of `[responseKey, label]`. Rows whose key is absent from the response are skipped.

## Entry Points

**Userscript load:**
- Location: `aliexpress-invoice.user.js`, the bottom line `else main();`.
- Triggers: Tampermonkey or Violentmonkey runs the file on `https://*.aliexpress.com/p/order/*` at `document-idle` (`@run-at`).
- Responsibilities: inject CSS, inject controls, start the observer.

**Node test entry:**
- Location: `aliexpress-invoice.test.js`.
- Triggers: `node --test` from the repo root.
- Responsibilities: `require`s `./aliexpress-invoice.user.js`. The module detects `module.exports` and returns exports instead of running `main()`.

**Manual debug entry:**
- Location: `aliexpress-invoice.user.js`, constant `AUTO_PRINT`.
- Triggers: setting `AUTO_PRINT` to `false` and pasting the file into DevTools on an orders page (README, Development section).

## Architectural Constraints

- **Threading:** Single-threaded browser event loop. Asynchronous work is `fetchReceipt` only.
- **Global state:** None at module level besides the constants inside the IIFE. The IIFE holds no mutable variables except `scheduled` inside `main()`. The script writes to `document.head`, `document.body`, and `localStorage`.
- **Page coupling:** Depends on AliExpress DOM class names (`.order-item-header-right`, `.order-status.order-block`) and on the global `window.lib.mtop`. A site change breaks injection or fetching.
- **Export-or-run switch:** The `module.exports` check decides whether `main()` runs. Keep the test export list in step with the functions the tests import.
- **Storage scope:** `localStorage` is per origin. Other origins cannot read it. The code comment names `GM_setValue` as the upgrade path if a cross-site store is needed. `@grant none` must change for that.
- **Popup dependency:** The receipt needs a popup. The script opens it before the async call so the popup blocker accepts it.
- **Circular imports:** Not applicable (one file).

## Anti-Patterns

### Hand-built HTML with inline script

**What happens:** `renderReceipt` writes a complete HTML document and includes an inline `<script>` for auto print. Its print button uses an inline `onclick="print()"` attribute.
**Why it's wrong:** Inline script and inline handlers block a strict Content Security Policy in the popup. The popup has no CSP header of its own, so this works today. Any future CSP change would break printing.
**Do this instead:** Keep the popup script minimal. If you add behavior, add it through `w.document` after `close()`, as `generate` already does for the document write (`aliexpress-invoice.user.js`, `generate`).

### Escaping at each call site

**What happens:** Escaping is done by calling `esc()` in each template expression. `renderReceipt` and `settingsHTML` each apply `esc` by hand.
**Why it's wrong:** A new template expression without `esc` is an XSS path. The data comes from the AliExpress response and from the saved user text.
**Do this instead:** Wrap every interpolated value in `esc()`. The test `renderReceipt shows the buyer … and escapes HTML` covers the item title path. Extend that test when a new field is rendered.

### Globals reached through `window.lib`

**What happens:** `fetchReceipt` reads `window.lib.mtop` directly.
**Why it's wrong:** The dependency is invisible to tests. Tests cannot run `fetchReceipt`. Only the pure functions have coverage.
**Do this instead:** Keep network code in `fetchReceipt` and keep the rest pure. Pass the response into `renderReceipt`, as `generate` does now.

## Error Handling

**Strategy:** Catch at the boundary and show the message to the user. No retries. No logging.

**Patterns:**
- `generate` wraps `fetchReceipt` and `renderReceipt` in `try`. On error it replaces the popup body with the error text (`aliexpress-invoice.user.js`, `generate`).
- `fetchReceipt` throws when `lib.mtop` is missing or the response has no `orderId`. The message includes `res.ret` for diagnosis.
- `openSettings` ignores errors from the placeholder request. The dialog still works with generic placeholders.
- `loadBuyer` returns `null` when `localStorage` holds invalid JSON.
- If `window.open` returns `null`, `generate` shows an `alert` asking the user to allow pop-ups.

## Cross-Cutting Concerns

**Logging:** None. No `console` calls. Errors surface only in the popup or the `alert`.
**Validation:** Buyer input is trimmed by `settingsFromForm`. Order VAT detection uses one regex in `buyerFromAddress`. The response is checked only for `orderId`.
**Authentication:** Delegated to AliExpress. `fetchReceipt` sends `needLogin: true`. The script stores no credentials.
**Internationalization:** Labels and the receipt text are English. Amounts are shown as AliExpress formats them (`€ 168,78`).

---

*Architecture analysis: 2026-11-01*
