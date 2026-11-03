---
last_mapped_commit: 9989513756f0f2812e4dc65bc89820d256e691e6
last_mapped_at: 2026-11-01
---
# Coding Conventions

**Analysis Date:** 2026-11-01

## Scope of the Codebase

The repo is one browser userscript, `aliexpress-invoice.user.js` (about 280 lines), plus its self-check `aliexpress-invoice.test.js`. There is no `package.json`, no build step, no bundler, and no runtime dependencies. The userscript runs in the page on `https://*.aliexpress.com/p/order/*` with `@grant none`. Conventions below apply to that file and to the test file.

Domain vocabulary is fixed in `CONTEXT.md`. Use its terms in names and comments: "purchase receipt" (not invoice, except the button label "Generate invoice"), "buyer block", "buyer field", "order values", "buyer details", "Leave off", "included VAT". Avoid the listed synonyms.

## Naming Patterns

**Files:**
- Userscript: `aliexpress-invoice.user.js` (the `.user.js` suffix is required by Tampermonkey).
- Tests: `aliexpress-invoice.test.js`, co-located at the repo root next to the script.
- Docs: UPPERCASE `.md` at the root (`README.md`, `AGENTS.md`, `CONTEXT.md`). `CLAUDE.md` is a symlink to `AGENTS.md`.

**Functions:**
- camelCase verbs for behavior: `buyerFromAddress`, `buyerFor`, `settingsFromForm`, `fetchReceipt`, `renderReceipt`, `openSettings`, `makeControls`, `inject`, `main`.
- Pure helpers take plain data and return plain data. They are the only functions exported for tests (see Module Design).
- Short inline helpers are named by their role: `esc` (HTML escape), `lines` (split and trim a multi-line string), `block`, `row`, `field`.

**Variables:**
- `const` by default. `let` only when a value is reassigned (`let name`, `let vat`, `let scheduled`).
- Short names are allowed for local temporaries: `a`, `b`, `d`, `s`, `m`, `w`, `f`, `k`, `v`. Longer names are used for values that cross function boundaries (`deliveryAddress`, `subOrders`, `paymentInfo`).

**Constants:**
- Module-level configuration in UPPER_SNAKE_CASE: `AUTO_PRINT`, `STORE_KEY`, `RECEIPT_API`, `TOTAL_ROWS`, `BUYER_FIELDS`, `RECEIPT_CSS`, `PAGE_CSS`, `FONT`.
- Put a trailing `//` comment on a config constant to say what it does (`// open the print dialog as soon as the receipt renders`).

**Buyer field keys:**
- The four buyer keys are lowercase single words: `name`, `vat`, `address`, `extra`. They appear as object keys, form field `name=` attributes, and entries in the `off` array. Keep these four spellings identical across all three places.

**CSS classes and DOM hooks:**
- Every class added to the host page uses the `ali-invoice` prefix: `.ali-invoice`, `.ali-invoice-btn`, `.ali-invoice-gear`, `.ali-invoice-dialog`, `.ali-invoice-field`, `.ali-invoice-off`, `.ali-invoice-shown`.
- Dataset marker on injected containers: `data-ali-invoice` (read as `dataset.aliInvoice`). It stores the order id and prevents double injection.
- The dialog title id is `ali-invoice-dialog-title`.
- Prefix every new class or id with `ali-invoice` to avoid clashes with AliExpress' own styles.

**Storage keys:**
- `localStorage` key format: `<script-name>.<scope>`, currently `'aliexpress-invoice.buyer'`.

## Code Style

**Formatting:**
- No formatter config is committed (no `.prettierrc`, no `.editorconfig`, no `.eslintrc`, no `biome.json`).
- Indentation: 2 spaces. Keep it consistent with the file.
- Quotes: single quotes for JavaScript strings. Template literals for multi-line HTML and CSS. Double quotes appear only inside generated HTML attributes (`name="${k}"`) and inside template strings.
- Semicolons: always present.
- Braces: required on multi-line blocks. One-line `if` with a single statement and no braces is used for guard clauses and short statements: `if (!orderId) return;`, `if (!mtop) throw new Error(...)`.
- Arrow functions for callbacks and small helpers. `function` declarations for named top-level and inner functions. Both forms appear side by side in the file.
- Long one-liners are accepted when a helper is a single expression (for example `esc` on line 35, the `totals` and `items` builders in `renderReceipt`). Do not reflow them for width. Break a line only when it helps a reader follow a chain.
- The file uses `'use strict';` inside the IIFE. Keep it.

**Linting:**
- Not configured. No lint script exists. Review style by reading the nearby code.

## Import Organization

**Userscript:**
- No imports. The script is a single IIFE: `(function () { 'use strict'; ... })();`.
- Page globals used directly: `window`, `document`, `localStorage`, `location`, `URL`, `URLSearchParams`, `FormData`, `MutationObserver`, `requestAnimationFrame`, `window.lib.mtop`.
- Do not add a dependency. The script must run as a single file under Tampermonkey with `@grant none`.

**Test file:**
- Node built-ins first, then the local module:
  ```js
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { buyerFor, settingsFromForm, renderReceipt, settingsHTML } = require('./aliexpress-invoice.user.js');
  ```
- Use the `node:` prefix for built-in modules.
- CommonJS `require`. The test file does not use ES module `import`.

**Path Aliases:**
- None.

## Section Comments

The script divides into sections with banner comments of this form:

```js
// ---- buyer block -------------------------------------------------------
// ---- receipt -----------------------------------------------------------
// ---- settings dialog -----------------------------------------------------
// ---- page injection ------------------------------------------------------
```

Add a new section banner when a new group of functions starts. Keep the dash run so the banner reaches roughly the same width as the others.

## Comments

**When to comment:**
- Explain why, not what. Examples in the file: the VAT number comes from the contact name because AliExpress has no VAT field (line 48-49); the signed request client is reused so the token is never touched (line 86); the popup is opened synchronously so the popup blocker allows it (line 145).
- Mark a deliberate shortcut with `// ponytail:` followed by the decision and its upgrade path. Example: `// ponytail: localStorage, per origin; GM_setValue if a cross-site store is ever needed`.
- Keep comments to one line where possible.

**Test comments:**
- The first line of the test file is a one-line description and run command: `// Self-check for the pure parts. Run: node --test`.

**JSDoc/TSDoc:**
- Not used. Do not add type annotations or JSDoc blocks. The script is plain JavaScript without a type checker.

## Error Handling

**Patterns:**
- Throw `Error` with a message that names the cause. Example: `throw new Error('Unexpected receipt response: ' + JSON.stringify(res && res.ret));`.
- Catch at the boundary where a user sees the failure, then show the message in the UI. `generate` catches errors from `fetchReceipt` and writes them into the popup body inside a `<pre>`.
- Silent fallbacks are allowed for optional data. Examples:
  - `loadBuyer` returns `null` when `localStorage` holds invalid JSON (`try { return JSON.parse(...) } catch (e) { return null; }`).
  - The dialog placeholder fetch uses an empty rejection handler, `fetchReceipt(orderId).then(..., () => {})`, so the generic placeholders stay when the request fails.
- Guard against missing page globals with an explicit error: `if (!mtop) throw new Error('AliExpress request client (lib.mtop) not found on this page.');`.
- Guard optional input with `&&` and `||` chains, not exceptions: `const d = res && res.data && res.data.data;`.
- Use `alert` only for a blocked popup, the one case where the user must act before anything else can happen.
- Always pass unknown error text through `esc(...)` before writing it into HTML.

**Do not:**
- Do not swallow an error that changes the printed receipt. Only the optional placeholder fetch may fail silently.
- Do not use `console.log` for error reporting. The script shows errors in the generated page.

## Logging

**Framework:** None. The script does not log.

**Patterns:**
- Show user-facing status by writing into the DOM, for example the "Loading order ..." text in the popup and the `.ali-invoice-shown` line in the dialog.

## HTML and Escaping

**Rule:** Every value from AliExpress or the user that goes into a template string passes through `esc()` first. `esc` converts `& < > " '`.

```js
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ ... }[c]));
```

**Pattern:**
- Build HTML with template literals. Assemble lists with `.map(...).join('')` or `.join('\n  ')`.
- Filter empty values before rendering: `[b.name, b.vat && 'VAT ' + b.vat, ...].filter(Boolean)`.
- Use the `row(label, value)` helper for optional table rows; it returns an empty string when the value is missing.
- Use the `TOTAL_ROWS` table to render amount rows. Keys absent from the response are skipped (`TOTAL_ROWS.filter(([k]) => d[k])`). Add a new amount by adding one `[key, label]` entry.

**Injected dialog markup:**
- Use `<form method="dialog">` so the buttons' `value` sets `dialog.returnValue`. The close handler reads `returnValue` (`'save'`, `'clear'`, or `'cancel'`).
- Add `data-1p-ignore` and `autocomplete="off"` to every dialog input so password managers do not fill them.

## Function Design

**Size:** Small. Most functions are under 15 lines. `renderReceipt` returns one long template string. Keep each section builder separate; do not merge the builders into one function.

**Parameters:**
- Pass plain objects and strings. `buyerFor(saved, deliveryAddress)`, `renderReceipt(d, buyer)`, `settingsHTML(b)`.
- Default missing objects inside the function: `a = a || {};`, `const s = saved || {};`, `settingsHTML(loadBuyer() || {})`.

**Return Values:**
- Return plain objects built with `Object.fromEntries(BUYER_FIELDS.map(...))` when the shape comes from `BUYER_FIELDS`.
- Return `null` to mean "nothing to save" (`settingsFromForm`) or "nothing stored" (`loadBuyer`).
- Return strings for HTML builders.

**Buyer shape:**
- A buyer object has exactly the keys `name`, `vat`, `address`, `extra`. A saved buyer may also have `off`, an array of those keys. Old 0.2.0 saves have no `off` key; code must treat it as `[]` (`s.off || []`).

## Module Design

**Iteration over fields:**
- Drive buyer-field logic from `BUYER_FIELDS`, the single list `[key, label, multiline?]`. Add a field by adding one entry. `buyerFor`, `settingsFromForm`, and `settingsHTML` all read the list.

**Export guard:**
- The bottom of the file exports for tests and otherwise runs the page code:
  ```js
  if (typeof module === 'object' && module.exports) module.exports = { buyerFor, settingsFromForm, renderReceipt, settingsHTML, PAGE_CSS, TOTAL_ROWS };
  else main();
  ```
- Export only what the tests need. Do not export page-injection functions.
- Keep the guard as the last statement inside the IIFE.

**Exports:**
- One object literal at the bottom. No `export` keyword.

**Barrel Files:**
- Not used. There is one module.

## Browser and Host-Page Rules

- Do not touch the AliExpress token or signature. Call `window.lib.mtop.request` and read its result (see `fetchReceipt`).
- Do not add `@grant` permissions. The script runs with `@grant none`.
- Do not load external scripts, fonts, or styles. The `FONT` value names a font stack only; it does not import it.
- Keep the injected CSS in the `PAGE_CSS` and `RECEIPT_CSS` template strings. Do not add a separate stylesheet file.
- Use the host's `#009966` green and 32px button height when adding page controls. The comment at line 199 gives the source.
- Inject controls idempotently: check `[data-ali-invoice]` before inserting, and set the attribute on the container.

## Versioning

- The version lives in the userscript header: `// @version      0.3.0`. Bump it with the change that ships a user-visible behavior.
- Commit subjects: `0.3.0: buyer details per field ...` for a release. `refactor: ...`, `chore: ...`, and `README: ...` for other work. Lowercase after the colon.

---

*Convention analysis: 2026-11-01*
