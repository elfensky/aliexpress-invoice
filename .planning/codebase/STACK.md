---
last_mapped_commit: 9989513756f0f2812e4dc65bc89820d256e691e6
last_mapped_at: 2026-11-01
---
# Technology Stack

**Analysis Date:** 2026-11-01

## Languages

**Primary:**
- JavaScript (ES2019+: `async`/`await`, arrow functions, template literals, `Object.fromEntries`) - all runtime code in `aliexpress-invoice.user.js`
- JavaScript (CommonJS, `require`) - self-check tests in `aliexpress-invoice.test.js`

**Secondary:**
- HTML and CSS - generated at runtime as a receipt document (`renderReceipt` in `aliexpress-invoice.user.js`) and as a settings dialog (`settingsHTML`, `PAGE_CSS`), both embedded as template strings in the same file
- Markdown - documentation: `README.md`, `CONTEXT.md` (domain glossary), `AGENTS.md` (also served as `CLAUDE.md` via symlink)

## Runtime

**Environment:**
- Browser runtime: Tampermonkey or Violentmonkey userscript manager, executing in the page context of `https://*.aliexpress.com/p/order/*` (`@match` in `aliexpress-invoice.user.js`)
- Test runtime: Node.js with the built-in `node:test` and `node:assert/strict` modules (no minimum version is pinned; `node:test` needs Node 18 or later)
- No `.nvmrc`, `.node-version`, `.tool-versions`, or `engines` field present. Node version is not pinned.

**Package Manager:**
- None. There is no `package.json`, no lockfile, and no `node_modules`.
- Lockfile: Not applicable

## Frameworks

**Core:**
- None. The script uses plain DOM APIs (`document.createElement`, `MutationObserver`, `requestAnimationFrame`, `window.open`, `dialog.showModal`) and no UI framework.

**Testing:**
- Node built-in test runner (`node:test`) - run with `node --test` (documented in `README.md`, "Development" section)
- Node built-in assertions (`node:assert/strict`)

**Build/Dev:**
- None. "There are no dependencies and no build step" (`README.md`, "How it works"). The file ships as-is.
- Dev loop: set `AUTO_PRINT` to `false` in `aliexpress-invoice.user.js` and paste the script into the DevTools console on an orders page (`README.md`, "Development").

## Key Dependencies

**Critical:**
- None declared in the repository.
- Page dependency: `window.lib.mtop`, the request client that AliExpress' own order pages load. The script calls it at `fetchReceipt` in `aliexpress-invoice.user.js` and does not bundle its own copy. If the page does not expose `lib.mtop`, the script throws `AliExpress request client (lib.mtop) not found on this page.`

**Infrastructure:**
- Tampermonkey or Violentmonkey - the host that loads the userscript. Metadata is declared in the header block of `aliexpress-invoice.user.js` (`@grant none`, `@run-at document-idle`).

## Script Metadata

Declared in the `==UserScript==` header of `aliexpress-invoice.user.js`:
- `@version 0.3.0`
- `@namespace https://github.com/elfensky/aliexpress-invoice`
- `@license MIT`
- `@grant none` - the script uses no `GM_*` APIs. It stores buyer details in `localStorage` (key `aliexpress-invoice.buyer`, constant `STORE_KEY`).
- `@run-at document-idle`
- `@match https://*.aliexpress.com/p/order/*`
- `@downloadURL` and `@updateURL` both point to `https://raw.githubusercontent.com/elfensky/aliexpress-invoice/main/aliexpress-invoice.user.js`

## Configuration

**Environment:**
- No environment variables. No `.env` file is present in the repository. The `.gitignore` contains only `.worktrees/`.
- Runtime configuration is hard-coded constants at the top of `aliexpress-invoice.user.js`:
  - `AUTO_PRINT` (`true`) - open the print dialog when the receipt renders
  - `STORE_KEY` (`'aliexpress-invoice.buyer'`) - `localStorage` key for buyer details
  - `RECEIPT_API` (`'mtop.global.finance.taxation.invoice.queryOrderReceiptInfo'`) - AliExpress API name
  - `TOTAL_ROWS` - ordered list of totals rows and their labels
  - `BUYER_FIELDS` - the four buyer fields and their labels
- Persistent user settings live in the browser's `localStorage`, scoped per origin (aliexpress.com). They are not stored in the repository.

**Build:**
- No build configuration. No `tsconfig.json`, bundler config, linter config, or formatter config is present.

## Platform Requirements

**Development:**
- A text editor and Node.js for `node --test`
- A Git checkout. Work happens in worktrees under `.worktrees/` (git-ignored), per `AGENTS.md`.
- `gh` CLI for pull requests (`AGENTS.md` workflow)

**Production:**
- Distributed as a single file through GitHub raw URLs (`@downloadURL`, `@updateURL`). Tampermonkey or Violentmonkey checks `@updateURL` for new versions. No server, no container, no deployment pipeline.
- Browser: any modern desktop browser that runs Tampermonkey or Violentmonkey and supports `<dialog>` (`showModal`), `MutationObserver`, and `Object.fromEntries`.
- Requires a logged-in AliExpress session. The receipt request uses `needLogin: true`.

## Browser APIs Used

- `localStorage` - buyer details persistence (`loadBuyer`, `saveBuyer` in `aliexpress-invoice.user.js`)
- `window.open` - receipt tab (`generate`). Must run synchronously in the click handler to avoid the pop-up blocker.
- `window.print` - via `print()` in the receipt page and the auto-print `<script>` in `renderReceipt`
- `HTMLDialogElement` (`<dialog>`, `showModal`, `returnValue`) - settings dialog (`openSettings`)
- `MutationObserver` and `requestAnimationFrame` - inject buttons into order cards as the list paginates (`main`)
- `FormData` - reads the settings form (`settingsFromForm`)
- `URL` and `URLSearchParams` - read `orderId` from links and the page location

## Fonts and Assets

- No font files, images, or scripts are loaded from a CDN or any external host at runtime.
- The font stack in `FONT` (`"TT Norms Pro", "Open Sans", Roboto, Arial, Helvetica, sans-serif`) names fonts by name only. The browser uses a locally installed font when one exists. No font file is downloaded.
- Screenshots in `docs/` (`docs/receipt-sample.png`, `docs/settings-dialog.png`, `docs/orders-list.png`, `docs/order-detail.png`) are used only by `README.md`. The script does not load them.

---

*Stack analysis: 2026-11-01*
