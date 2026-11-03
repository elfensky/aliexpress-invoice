---
last_mapped_commit: 9989513756f0f2812e4dc65bc89820d256e691e6
last_mapped_at: 2026-11-01
---
# Codebase Structure

**Analysis Date:** 2026-11-01

## Directory Layout

```
night-gsd-standard/                       # repo root (git worktree of aliexpress-invoice)
├── aliexpress-invoice.user.js            # the userscript: all runtime code (~16 KB)
├── aliexpress-invoice.test.js            # node:test self-checks for the pure functions
├── AGENTS.md                             # agent and worktree rules for this repo
├── CLAUDE.md -> AGENTS.md                # symlink, same content
├── CONTEXT.md                            # domain glossary (purchase receipt, buyer block, ...)
├── README.md                             # user-facing install and use guide
├── LICENSE                               # MIT
├── .gitignore                            # ignores .worktrees/
├── docs/                                 # README screenshots (PNG)
│   ├── receipt-sample.png
│   ├── settings-dialog.png
│   ├── orders-list.png
│   └── order-detail.png
└── .planning/
    └── codebase/                         # generated codebase maps (this document lives here)
```

Total tracked files: 12. Only four are code or config: the userscript, its test, `.gitignore`, and the symlink pair.

## Directory Purposes

**`/` (repo root):**
- Purpose: the whole product. The userscript and its test sit side by side.
- Contains: one source file, one test file, project docs, license.
- Key files: `aliexpress-invoice.user.js`, `aliexpress-invoice.test.js`.

**`docs/`:**
- Purpose: screenshots referenced by `README.md`.
- Contains: PNG images only. Nothing reads them at runtime.
- Key files: `docs/receipt-sample.png` (sample receipt, not a live order), `docs/settings-dialog.png`.
- Note: the README says the receipt uses sample data and the other screenshots come from the live site.

**`.planning/codebase/`:**
- Purpose: output of `/gsd-map-codebase`. Consumed by planning commands.
- Contains: the analysis documents (`ARCHITECTURE.md`, `STRUCTURE.md`, and others for other focus areas).
- Committed: the directory is not in `.gitignore`. Whether it is committed depends on the session workflow.

**`.worktrees/` (ignored, not in tree):**
- Purpose: per-session git worktrees.
- Contains: checkouts of other branches. Created by `git worktree add .worktrees/<slug>` per `AGENTS.md`.
- Committed: no. `.gitignore` lists `.worktrees/`.

## Key File Locations

**Entry Points:**
- `aliexpress-invoice.user.js`: the `==UserScript==` header (match pattern, version, update URLs) and the `main()` call at the end of the IIFE.

**Configuration:**
- `aliexpress-invoice.user.js`, top constants: `AUTO_PRINT`, `STORE_KEY`, `RECEIPT_API`, `TOTAL_ROWS`.
- `aliexpress-invoice.user.js`, header: `@version` (0.3.0), `@match`, `@updateURL`, `@grant none`, `@run-at document-idle`.
- `.gitignore`: `.worktrees/`.

**Core Logic:**
- `aliexpress-invoice.user.js`, `// ---- buyer block`: `BUYER_FIELDS`, `buyerFromAddress`, `buyerFor`, `settingsFromForm`, `loadBuyer`, `saveBuyer`.
- `aliexpress-invoice.user.js`, `// ---- receipt`: `fetchReceipt`, `RECEIPT_CSS`, `renderReceipt`, `generate`.
- `aliexpress-invoice.user.js`, `// ---- settings dialog`: `settingsHTML`, `openSettings`.
- `aliexpress-invoice.user.js`, `// ---- page injection`: `PAGE_CSS`, `makeControls`, `inject`, `main`.

**Testing:**
- `aliexpress-invoice.test.js`: all tests. Uses `node:test` and `node:assert/strict`. Fixture `receipt` is a trimmed response shape.

**Documentation:**
- `README.md`: user guide and development command.
- `CONTEXT.md`: domain terms. Use these terms in code names and comments.
- `AGENTS.md`: worktree workflow.

## Naming Conventions

**Files:**
- Lowercase kebab-case, with a dotted suffix that names the role: `aliexpress-invoice.user.js` (Tampermonkey userscript), `aliexpress-invoice.test.js` (test for the same module).
- Repo docs use uppercase names: `README.md`, `AGENTS.md`, `CONTEXT.md`, `LICENSE`. Codebase maps use uppercase too.
- Images: kebab-case under `docs/`.

**Functions and variables:**
- camelCase: `buyerFor`, `settingsFromForm`, `renderReceipt`, `fetchReceipt`, `openSettings`.
- Predicate-style names are not used. Helpers are verbs or nouns: `esc`, `lines`, `inject`, `main`.

**Constants:**
- UPPER_SNAKE_CASE for module constants: `AUTO_PRINT`, `STORE_KEY`, `RECEIPT_API`, `TOTAL_ROWS`, `BUYER_FIELDS`, `RECEIPT_CSS`, `PAGE_CSS`, `FONT`.

**Buyer field keys:**
- Short lowercase words: `name`, `vat`, `address`, `extra`. These keys appear in the storage JSON, the form field `name` attributes, and the `BUYER_FIELDS` table. Keep them in sync.

**CSS and DOM:**
- Class prefix `ali-invoice-` for every class and id the script adds (`ali-invoice-btn`, `ali-invoice-gear`, `ali-invoice-dialog`, `ali-invoice-field`, `ali-invoice-off`, `ali-invoice-shown`, `ali-invoice-dialog-title`).
- Wrapper class `ali-invoice` for the control group.
- Idempotence attribute `data-ali-invoice` on host nodes.

**Storage:**
- localStorage key prefix `aliexpress-invoice.`. Current key: `aliexpress-invoice.buyer`.

**Domain terms in code:**
- Names follow `CONTEXT.md`: "receipt" (not "invoice") for the printed document. The button label keeps "Generate invoice" because that is the label users see. The generic error text in `generate` still says "invoice".

## Where to Add New Code

**New buyer field:**
- Add an entry to `BUYER_FIELDS` in `aliexpress-invoice.user.js`. The order rule, form, and saved record pick it up.
- Map the order value in `buyerFromAddress` if AliExpress supplies it.
- Print it in `renderReceipt`'s `block()` helper.
- Add an assertion in `aliexpress-invoice.test.js`. The `settingsHTML` test counts fields, so update its expected count.

**New receipt total row:**
- Add a `[responseKey, label]` pair to `TOTAL_ROWS` in `aliexpress-invoice.user.js`. Order matters: rows print top to bottom.

**New receipt section or column:**
- Edit the template in `renderReceipt` in `aliexpress-invoice.user.js`. Escape each value with `esc()`.
- Add print CSS to `RECEIPT_CSS` in the same file.

**New dialog control:**
- Edit `settingsHTML` and `settingsFromForm` together. The form field `name` must match the `BUYER_FIELDS` key.
- Style rules go in `PAGE_CSS` under `.ali-invoice-dialog`.

**New control on the order page:**
- Add the selector and the insert call in `inject()` in `aliexpress-invoice.user.js`. Set `data-ali-invoice` on the host node to prevent duplicates.
- Button styles go in `PAGE_CSS`, using the `ali-invoice-` prefix.

**New exported function for tests:**
- Add it to the `module.exports` line at the bottom of `aliexpress-invoice.user.js`. Import it in `aliexpress-invoice.test.js`.

**New test:**
- Add to `aliexpress-invoice.test.js`. Use `node:test` and the `receipt` fixture. Keep one `test(...)` per behavior.

**New documentation:**
- User-facing: `README.md`. Keep one intro line per screenshot.
- Domain terms: `CONTEXT.md`.

**Utilities:**
- Shared text helpers: `esc` and `lines` near the top of `aliexpress-invoice.user.js`. There is no separate utility file.

**Separate module or file:**
- Not used. The script is one file by design (README: "no dependencies and no build step"). Splitting it would need a build step, which the project avoids.

## Special Directories

**`.worktrees/`:**
- Purpose: session worktrees for this repo.
- Generated: Yes, by `git worktree add`.
- Committed: No (git-ignored).

**`.planning/`:**
- Purpose: GSD planning and analysis output.
- Generated: Yes, by GSD commands.
- Committed: Depends on workflow. `codebase/` is empty before this run.

**`docs/`:**
- Purpose: README screenshots.
- Generated: No. Captured by hand.
- Committed: Yes.

---

*Structure analysis: 2026-11-01*
