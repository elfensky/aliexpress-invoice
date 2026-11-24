---
last_mapped_commit: 9989513756f0f2812e4dc65bc89820d256e691e6
last_mapped_at: 2026-11-01
---
# Codebase Concerns

**Analysis Date:** 2026-11-01

## Scope

The repository holds one Tampermonkey userscript, `aliexpress-invoice.user.js` (280 lines), its self-check `aliexpress-invoice.test.js` (79 lines), and documentation (`README.md`, `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`). It has no `package.json`, no lockfile, no build step, and no CI configuration. The findings below cover the whole repository.

## Security Considerations

**Auto-update from the `main` branch runs code on logged-in AliExpress pages:**
- Risk: The script declares `@updateURL` and `@downloadURL` pointing at `https://raw.githubusercontent.com/elfensky/aliexpress-invoice/main/aliexpress-invoice.user.js` (`aliexpress-invoice.user.js` lines 10-11). Every user who installed the script receives each new commit on `main` without a manual step. A compromised GitHub account, a force-push, or a merged malicious change runs with access to the user's signed-in AliExpress session.
- Files: `aliexpress-invoice.user.js` (lines 10-11)
- Current mitigation: Changes reach `main` by pull request (`AGENTS.md`, "Worktrees" section). No signed tags or release pinning exist.
- Recommendations: Require review and signed commits on `main`. Consider a release-tag URL for `@downloadURL` and `@updateURL` so that users update only on a tagged version.

**Script runs in the page context with `@grant none`:**
- Risk: The script runs in the same JavaScript world as AliExpress' own scripts (`aliexpress-invoice.user.js` line 13). Any page script can read the DOM, the `localStorage` entry, and `window.lib.mtop`. A page-level script injection on aliexpress.com exposes the buyer details and the request client.
- Files: `aliexpress-invoice.user.js` (lines 13, 88, 151, 181)
- Current mitigation: The script never reads tokens or signatures. It calls the page's own client (`fetchReceipt`, line 87-94).
- Recommendations: Accept this as the cost of using `lib.mtop`. Do not add any code that reads or sends credentials. Re-evaluate if `@grant` changes to a sandboxed mode.

**Personal and business data stored in plain `localStorage`:**
- Risk: Buyer details hold a company name, VAT number, postal address, email, and IBAN or reference lines (`BUYER_FIELDS`, lines 41-46). They are stored as unencrypted JSON under `aliexpress-invoice.buyer` (`STORE_KEY`, line 21; `saveBuyer`, line 82). Any script on the `aliexpress.com` origin reads them. The data persists across sessions until the user clicks **Use delivery address**.
- Files: `aliexpress-invoice.user.js` (lines 21, 81-82)
- Current mitigation: Storage is per origin. The README states the browser stores these settings (`README.md`, "Buyer details").
- Recommendations: Document the storage in the README as stored data, not as a preference. Do not add a cross-site store (the comment on line 21 names `GM_setValue` as the upgrade path). Consider a clear-on-close option for shared machines.

**Receipt HTML escaping is consistent but relies on each interpolation:**
- Risk: `renderReceipt` builds HTML with template strings. The values from the AliExpress response (`itemTitle`, `sellerName`, `relateInfo`, `deliveryAddress` fields, `paymentInfo`) pass through `esc()` (line 35) at each use. A future edit that adds an unescaped interpolation opens an injection path into the receipt window.
- Files: `aliexpress-invoice.user.js` (lines 119-141, 147, 154)
- Current mitigation: All current interpolations of response data use `esc()`. The test at `aliexpress-invoice.test.js` lines 58-64 checks that `<b>` is escaped in one item title.
- Recommendations: Add a test that feeds HTML-special characters into each response field (seller, address, payment method, order id) and checks the output.

**Inline scripts in the receipt window may be blocked by page policy (unverified):**
- Risk: The receipt uses an inline `onclick="print()"` button and an inline `<script>` for auto-print (lines 139-140). If AliExpress sends a Content-Security-Policy that blocks inline scripts, and the policy applies to the `about:blank` window opened by `window.open`, the print button and auto-print fail without an error message.
- Files: `aliexpress-invoice.user.js` (lines 139-140, 145)
- Current mitigation: The README screenshots show the feature working on the live site. The policy of the opened window was not checked in this review.
- Recommendations: Verify the behaviour in a browser with DevTools on the live site. If it fails, attach the print listener with `addEventListener` from the opener, or write the receipt through a `Blob` URL.

## Tech Debt

**Reliance on undocumented AliExpress internals:**
- Issue: The script depends on `window.lib.mtop` (line 88) and the endpoint name `mtop.global.finance.taxation.invoice.queryOrderReceiptInfo` (line 22). It also depends on DOM selectors `.order-item .order-item-header-right`, `a[href*="orderId="]`, and `.order-status.order-block` (lines 249-257). None of these is a public API.
- Files: `aliexpress-invoice.user.js` (lines 22, 88, 249-257)
- Impact: A site redesign or a renamed endpoint silently removes the buttons or breaks generation. The error path (lines 92, 154) shows the message to the user, but the injection path fails without any message.
- Fix approach: Log a single console warning when `lib.mtop` or the selectors are missing. Keep the selectors in one constant block so that a future fix touches one place.

**Test coverage limited to pure functions:**
- Issue: `aliexpress-invoice.test.js` covers `buyerFor`, `settingsFromForm`, `renderReceipt`, and `settingsHTML`. The code that runs on the live page is not tested: `main`, `inject`, `makeControls`, `generate`, and `openSettings` (lines 144-276). The `module` check at line 278 controls which path runs.
- Files: `aliexpress-invoice.test.js`, `aliexpress-invoice.user.js` (lines 144-195, 247-279)
- Impact: A regression in DOM injection, the popup flow, or the settings save path reaches users without a failing test. The only check on these paths is a manual run.
- Fix approach: Add a DOM test (for example with `jsdom`, added only as a dev dependency) for `inject` on a fixture of the order list and the order detail page. Add one test for the save path in `openSettings`.

**No package manifest and no CI:**
- Issue: The test command is `node --test` (`README.md`, "Development"). No `package.json` declares it. Nothing runs the test on push or pull request.
- Files: repository root; `README.md` (lines 52-56)
- Impact: Tests can fail on `main` unnoticed. Node version is not declared.
- Fix approach: Add a minimal `package.json` with `"test": "node --test"` and an `engines` field. Add a CI workflow that runs the test on each pull request.

**Manual version bump with no changelog:**
- Issue: `@version` is set by hand on line 4 (`0.3.0`). Recent commits use version numbers in messages (`9989513 0.3.0: ...`). No changelog file exists.
- Files: `aliexpress-invoice.user.js` (line 4)
- Impact: Users who update through `@updateURL` have no release notes in the script.
- Fix approach: Add a `CHANGELOG.md` with one line per version. Bump `@version` in the same commit.

**Development switch is a source edit:**
- Issue: `AUTO_PRINT` is a constant (line 20). The README tells developers to edit it to test (`README.md`, line 58). A commit that leaves it `false` or changes its default alters the production behaviour for all users.
- Files: `aliexpress-invoice.user.js` (line 20); `README.md` (line 58)
- Impact: Accidental release of a debug setting.
- Fix approach: Keep the constant. Add an assertion in the test file that `AUTO_PRINT` is `true`, or expose it through a `window` flag for development use only.

## Known Bugs and Logic Issues

**Date stamp on the receipt uses UTC:**
- Symptoms: The line "Generated from AliExpress order data on YYYY-MM-DD" uses `new Date().toISOString().slice(0, 10)` (line 129). That value is the UTC date. For a user in Belgium (UTC+1 or UTC+2), a receipt made between 00:00 and 01:00 or 02:00 local time shows the previous day.
- Files: `aliexpress-invoice.user.js` (line 129)
- Trigger: Generate a receipt in the first one or two hours after local midnight.
- Workaround: None in the script.
- Fix: Format the date in local time, for example with `toLocaleDateString('en-CA')`, which yields `YYYY-MM-DD`.

**VAT number detection matches any uppercase token:**
- Symptoms: The pattern on line 54 matches two uppercase letters followed by 8 to 12 letters or digits that include at least one digit. It does not check a country-specific format. It removes the matched text from the name and shows it as `VAT <token>`. A company name or a reference code of that shape is moved to the VAT line. A lowercase VAT (`be0123456789`) is not matched.
- Files: `aliexpress-invoice.user.js` (lines 50-58)
- Trigger: A contact name such as `ACME AB12345678`, or a name with a reference such as `SHOP XX1234567`.
- Workaround: Type the name and VAT number in the settings dialog. A typed value replaces the order value (`buyerFor`, lines 66-71).
- Fix: Accept only the known Belgian and EU formats, or accept the match case-insensitively with a country-code list. Add tests for names that must not match.

**Buyer details apply to every order:**
- Symptoms: A typed name or VAT number replaces the order value on every receipt, for every order, until the user clicks **Use delivery address** (`buyerFor`, lines 66-71; `README.md`, lines 40-44). A receipt for a private delivery can print the company name and VAT number of an earlier company order.
- Files: `aliexpress-invoice.user.js` (lines 66-71, 151, 184-185)
- Trigger: Save buyer details for a company, then generate a receipt for a private order.
- Workaround: Open the gear, click **Use delivery address**, then generate the receipt.
- Fix: Keep this behaviour, and show the active buyer block in the receipt preview, or store buyer details per order id as an option.

**Placeholder text falls back to a different string on request failure:**
- Symptoms: On a successful receipt request, an empty field shows the order value or `Not in this order` (line 192). When the request fails, the placeholder stays `From the order` (line 163). The dialog then shows no order-specific hint, and the failure is silent (`() => {}`, line 194).
- Files: `aliexpress-invoice.user.js` (lines 163, 190-194)
- Trigger: Open the gear while the receipt request fails or times out.
- Workaround: Generate the invoice, which shows the error in the new tab.
- Fix: Show the request error inside the dialog in the `shown` line (`.ali-invoice-shown`, line 171).

**Corrupt stored value is accepted silently:**
- Symptoms: `loadBuyer` returns whatever `JSON.parse` yields (line 81). A stored value that parses to a non-object (for example a number) passes into `buyerFor` and `settingsHTML` without a check.
- Files: `aliexpress-invoice.user.js` (lines 81, 66-71, 160-162)
- Trigger: Manual edit of `localStorage` in DevTools.
- Workaround: Click **Use delivery address** in the dialog.
- Fix: Return `null` when the parsed value is not a plain object.

## Performance Bottlenecks

**Full-document observer triggers repeated selector scans:**
- Problem: The `MutationObserver` watches `document.body` with `subtree: true` (line 275). Each batch of mutations schedules one `inject()` on the next animation frame (lines 271-274). `inject()` runs `querySelectorAll` on the order-card selector each time (line 249).
- Files: `aliexpress-invoice.user.js` (lines 247-263, 265-276)
- Cause: The observer reacts to every DOM change on the page, including unrelated widgets, and the selector runs without a cache.
- Improvement path: Keep the `data-ali-invoice` guard (it prevents duplicate buttons). Narrow the observer to the order list container. Stop observing after the status block is injected on the detail page.

## Fragile Areas

**Injection depends on the order page layout:**
- Files: `aliexpress-invoice.user.js` (lines 247-263, 199-224)
- Why fragile: The controls are inserted before a `Details` link (line 254) and appended to `.order-status.order-block` (line 261). The CSS relies on `.order-status .ali-invoice { margin: 0; }` because the host buttons carry a 16px margin (lines 203-204). A layout change on the host adds or removes margins or moves the link.
- Safe modification: Change one selector at a time and check both the order list and the order detail page. The comments at lines 199-204 and 226-227 record the measured sizes and the reason for the fixed-position avoidance.
- Test coverage: None for the injection code (see Tech Debt above).

**Module export check decides whether the script runs:**
- Files: `aliexpress-invoice.user.js` (line 278)
- Why fragile: `if (typeof module === 'object' && module.exports) module.exports = {...}; else main();` runs `main()` only when no `module` object exists on the page. A page that defines a global `module` with an `exports` property would stop the script from injecting anything, and the failure is silent.
- Safe modification: Keep the test export. Replace the check with a dedicated flag, for example `typeof process !== 'undefined'`, and test that the page path starts.
- Test coverage: The test file loads the module under Node, so the page path is never run in tests.

**Opened window lifecycle:**
- Files: `aliexpress-invoice.user.js` (lines 144-156)
- Why fragile: `window.open('', '_blank')` runs before the request (line 145). The new window is written with `document.write`, then `document.open()` replaces its content (line 150). If the user closes the window while the request runs, the write calls fail without a message.
- Safe modification: Check `w.closed` before the write at line 151, and keep the synchronous open in the click handler.
- Test coverage: None.

## Missing Critical Features

**No invoice numbering or seller VAT identity:**
- Problem: The output is a purchase receipt. It has no sequential number, no issuer VAT number, and no statement of the VAT rate. `CONTEXT.md` (line 10) says the document is not an invoice issued by a seller. The button label still reads "Generate invoice".
- Blocks: Use of the receipt as a compliant invoice for input VAT deduction or bookkeeping that requires a seller-issued invoice. This is a limit of the source data, not a code defect. It is recorded here so that accounting use stays within the stated scope.

**No export besides print:**
- Problem: The only output is the browser print dialog. No file is written, and no batch export exists for several orders.
- Blocks: Bulk processing of a year of orders into one folder without manual printing.

## Test Coverage Gaps

**Page-level flow:**
- What's not tested: Button and gear injection, the popup flow in `generate`, the save and clear paths of the settings dialog through a real `close` event, and the placeholder update after `fetchReceipt`.
- Files: `aliexpress-invoice.user.js` (lines 144-195, 228-276); `aliexpress-invoice.test.js`
- Risk: A break on the live site reaches users before the author notices.
- Priority: High

**VAT detection edge cases:**
- What's not tested: Names that must not match (company registration codes, lowercase VAT numbers, a VAT number at the start, middle, or end of the name).
- Files: `aliexpress-invoice.user.js` (lines 50-58); `aliexpress-invoice.test.js` (lines 22-32)
- Risk: Wrong VAT line on the receipt, printed with no warning.
- Priority: Medium

**Escaping of response fields:**
- What's not tested: HTML characters in `sellerName`, `paymentInfo`, `deliveryAddress`, and `orderId`. Only `itemTitle` is tested (`aliexpress-invoice.test.js` lines 58-64).
- Files: `aliexpress-invoice.user.js` (lines 119-141); `aliexpress-invoice.test.js`
- Risk: An escaping regression in one field reaches the receipt window.
- Priority: Medium

**Date output:**
- What's not tested: The generated date line near local midnight (see Known Bugs above).
- Files: `aliexpress-invoice.user.js` (line 129)
- Risk: Wrong date printed on the receipt.
- Priority: Low

---

*Concerns audit: 2026-11-01*
