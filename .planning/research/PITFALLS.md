# Pitfalls Research

**Domain:** Released Tampermonkey/Violentmonkey userscript (page context, `@grant none`) that prints AliExpress orders as purchase receipts; installed copies auto-update from `main`
**Milestone:** subsequent (Active requirements on top of 0.3.0; PR #4 / 0.3.1 in flight)
**Researched:** 2026-11-01
**Confidence:** MEDIUM. Repo-specific findings are HIGH (read from code, verified by local probe on Node 26.12.1). Userscript-manager update rules are MEDIUM (official doc is thin; behaviour confirmed by secondary sources). AliExpress `lib.mtop` failure shapes are LOW (not documented, not yet observed on AliExpress).

**eli14 summary.** The script is a recipe card that every user's kitchen copies from one shared drawer (`main`) each day. Whoever puts a new card in the drawer changes dinner for everybody, with no taste test. So: put a safety check at the drawer (CI, version bump), test the card against a bad day (a UTC clock, odd VAT strings), and do not write "the oven is broken" on the card when you only know the soup is cold. Today the blast radius is one author plus a few users. A wrong VAT line on a receipt that an accountant files is the expensive failure, and nothing flags it.

---

## Critical Pitfalls

### Pitfall 1: A merge to `main` is a release, and a revert is not a rollback

**What goes wrong:**
Userscript managers update only when the remote `@version` is higher than the installed one. A `git revert` that restores `@version 0.3.0` after a bad `0.3.1` ships nothing to users who already took 0.3.1. They keep the bad code. The reverse also holds: a merge that changes code but not `@version` reaches nobody who already has that version, and creates "ghost versions" (same number, different code) that make bug reports unmappable. PR #4 has this shape: commit 1 (`0b8beff`, refactor) keeps 0.3.0 and lands on `main` as its own commit under `gh pr merge --rebase`.

**Why it happens:**
`@version` is bumped by hand; no check ties code changes to a bump. Rebase-merge puts every PR commit on `main`, and each one is a release candidate.

**How to avoid:**
- Roll back by shipping a new higher version (0.3.2 with the 0.3.0 code), never by lowering the number.
- Bump `@version` in the same commit as any change to `aliexpress-invoice.user.js`, or squash-merge so one PR is one version. Choose one and write it in AGENTS.md.
- CI check on PRs: if the diff touches `aliexpress-invoice.user.js`, `@version` must differ from `origin/main` and be higher (3-line `git show` + `sort -V` step, no dependency).
- Keep a one-line-per-version `CHANGELOG.md` (CONCERNS.md already asks for it).

**Warning signs:**
A bug report from "0.3.0" that the current 0.3.0 source cannot produce. A user who says "I still see the old message" after a fix merged.

**Phase to address:** CI phase (version-bump gate) before any behaviour change merges; PR #4 merge phase (decide merge style first).

---

### Pitfall 2: Changing the metadata block or the update URLs strands installed users

**What goes wrong:**
`@updateURL`/`@downloadURL` point at `.../main/aliexpress-invoice.user.js`. Renaming the branch, renaming or moving the file (for example into `src/`), renaming the repo, or setting either URL to `none` stops updates for every installed copy, silently, forever. Changing `@name`/`@namespace` makes the manager treat the new script as a different script: the old copy stays installed and both inject buttons (duplicate controls, and the second copy sees the first's `data-ali-invoice` guard only if the attribute name is unchanged). Changing `@match` or adding `@grant` changes what the script may do and can trigger a manager permission prompt or a manual re-install. Tampermonkey's doc states `@version` is required for update checks and `none` disables them; it says nothing about permission changes on update, so treat those as manager-specific and untested.

**Why it happens:**
Housekeeping work (adding `package.json`, CI, a `src/` split, a rename) looks unrelated to distribution. The metadata block is easy to treat as a comment.

**How to avoid:**
- Freeze: file path, `@name`, `@namespace`, `@updateURL`, `@downloadURL`, `@match`, `@grant none`, and the `data-ali-invoice` / `ali-invoice-*` class names. Add a test that parses the `==UserScript==` block and asserts these (cheap, catches accidents).
- Keep the single file at the repo root. If a split into files is ever wanted, that is a build step and already Out of Scope.
- Do not add `@require`, `@connect`, or a second `@grant`. They would also break the "no credentials, page context" security stance.

**Warning signs:**
A PR that touches lines 1-15 of the script, or moves/renames `aliexpress-invoice.user.js`. A user reporting two sets of buttons.

**Phase to address:** CI phase (metadata assertions in the test file); every later phase as a review checklist item.

---

### Pitfall 3: Auto-update means no staging, and the update window is hours, not seconds

**What goes wrong:**
Every merge reaches live users on the next update check. `raw.githubusercontent.com` serves through a CDN cache (commonly `max-age=300`; some reports show up to 86400 for some repos), and the manager's own interval is user-configurable (default roughly daily; not confirmed in the official doc). A bad release is therefore live for hours to a day, and a fix takes the same time to arrive. There is no staging channel. CONCERNS.md already flags no tags and no release pinning.

**Why it happens:**
"Merged to `main`" feels like "done", not "shipped to every installed browser".

**How to avoid:**
- Treat the PR's live check as a release gate, not a follow-up. PR #4's open box ("Generate invoice on one completed order prints the receipt, and the gear shows placeholders") must be ticked before merge.
- Run the real script in the browser (paste with `AUTO_PRINT` as shipped) on both page types before merge. The test suite cannot see the page.
- Keep PRs small: one behaviour change per version, so a rollback is one bump.
- Consider (not required) a `release` branch or tag URL for `@updateURL` as the CONCERNS.md recommendation says. That is a one-time breaking change for installed users (Pitfall 2), so decide it once, early, or never.

**Warning signs:**
A merge on a Friday evening. A PR whose only verification is `node --test`.

**Phase to address:** PR #4 merge phase; applies to every release.

---

### Pitfall 4: A date test that cannot fail on a CI runner

**What goes wrong:**
The bug is `new Date().toISOString().slice(0, 10)` (UTC date). GitHub runners run in UTC, so on CI the UTC date and the local date are equal and a naive test passes against the buggy code. Verified on Node 26.12.1: an instant of 2026-11-02 00:30 Brussels time prints `2026-11-01` from `toISOString()` and `2026-11-02` from `toLocaleDateString('en-CA')` when `TZ=Europe/Brussels`, but both print `2026-11-01` when `TZ=UTC`. A test that builds the date with the local constructor (`new Date(2026, 10, 2, 0, 30)`) gives `2026-11-02` in a UTC runner for the buggy code too, so the test is green and proves nothing.

**Why it happens:**
The author's machine is in Belgium and the bug looks obvious; the test is written without checking that it fails on the old code in the CI environment.

**How to avoid:**
- Inject the clock: `renderReceipt(d, buyer, now = new Date())`. The test passes a fixed instant (`new Date('2026-11-01T23:30:00Z')`).
- Pin the zone inside the test file: `process.env.TZ = 'Europe/Brussels'` before the first `Date` use (verified to take effect at runtime in Node 26). Use a zone with a large offset (`Pacific/Kiritimati`, UTC+14) to make the failure unmistakable, plus one west zone (`Pacific/Honolulu`) because the bug flips direction there.
- Prove red first: run the new test against the old line and see it fail, then fix.
- Implement with local getters (`getFullYear()`, `getMonth()+1`, `getDate()`, `padStart(2,'0')`). `toLocaleDateString('en-CA')` also works in Node but depends on the browser's ICU/CLDR data; the hand-built string cannot drift across Chrome, Firefox and Zen.
- Do not touch `orderTime` / `paymentDate`: they are AliExpress strings in the user's site language (`Sep 18, 2026`). The receipt then mixes an ISO date and a site-format date. State this in the README or accept it; do not "normalise" it (Out of Scope: only what AliExpress reports).

**Warning signs:**
A date test with no `TZ` and no fixed instant. A test that passes before the fix.

**Phase to address:** Small-fixes phase (date), with the test written first.

---

### Pitfall 5: VAT-detection tests that pin bugs, or a tightened regex that silently drops real VAT numbers

**What goes wrong:**
The pattern `\b([A-Z]{2}(?=[0-9A-Z]*\d)[0-9A-Z]{8,12})\b` has false positives and false negatives, and the match is removed from the name (data loss on the receipt in both directions):
- False positive: any uppercase token of 10 to 14 characters with a digit, such as `ACME AB12345678`, or a model/reference code like `ABCD1234567` (`AB` + `CD1234567`). It moves to a `VAT` line and leaves the name.
- False negative: VAT numbers written with spaces, dots or dashes (`BE 0123.456.789`, `BE0123 456 789`, `CHE-123.456.789`), lowercase (`be0123456789`), or with a `VAT` / `BTW` / `TVA` prefix in the name.
- Two failure modes of the fix: (a) a "characterisation" test that records today's output for `ACME AB12345678` freezes the bug as expected behaviour; (b) a country-code whitelist that is too strict (Greece uses `EL`, Northern Ireland `XI`, Austria `ATU` + 8 digits, Netherlands `NL` + 9 digits + `B` + 2 digits, Ireland has letters in the number) drops real numbers that work today. A wrongly empty VAT line on a receipt is worse than a wrong extra token, because the accountant files it.

**Why it happens:**
"Pin VAT detection" (Active requirement) is ambiguous between "document current behaviour" and "define correct behaviour". Real VAT formats are many and the project has no sample set.

**How to avoid:**
- Split the work in two commits: first a table-driven test of the current behaviour with the known wrong rows marked `// known false positive, fixed in next commit` (or `test.todo`), then the fix flips those rows.
- Build the table from public EU VIES example formats, one row per member state the owner actually meets (BE, NL, DE, FR, plus EL, XI, ATU, IE), and rows that must not match (`ACME AB12345678`-style codes, lowercase, no digit, 7 or 13 chars).
- Prefer the change that cannot lose data: match case-insensitively and with optional separators, require a known country prefix, and when nothing matches leave the contact name untouched. Do not add checksum validation (BE mod 97 etc.); it rejects real numbers with typos that the buyer wants to see.
- The escape hatch exists: a typed VAT in the gear replaces the order value (`buyerFor`). Keep it working and tested.

**Warning signs:**
A test named "matches" with one example. A regex diff without negative rows. A receipt showing `VAT` followed by a non-VAT code.

**Phase to address:** Tests-pinning phase (table first), then the VAT fix phase.

---

### Pitfall 6: Error handling that claims a cause it does not know, or masks a bug as an AliExpress fault

**What goes wrong:**
In PR #4's `fetchReceipt`:
- The message says "A new order can take a few minutes. Try again later." for every failure, including a missing login, an expired session, a captcha/risk-control block, or a renamed endpoint. The PR text says the message "claims no cause", but the message does suggest one. A user with an expired session will wait and retry for nothing. Bug #2's own evidence points away from simple timing: the issue notes the data was already complete minutes after checkout.
- `.catch((e) => e)` turns any thrown `TypeError` from the script itself into "AliExpress returned no receipt data", and the code line then shows the JS error text as an "AliExpress code".
- On a resolved response whose data lacks `orderId`, `res.ret` is typically a success code, so the line reads `AliExpress code: SUCCESS::...`, which looks contradictory.
- A rejection that is a plain object (the response itself, as in Alibaba's client) gives `[object Object]` anywhere code does `(e && e.message) || e`. The `generate` catch block does exactly that for non-Error values.
- The fixtures in the 11 tests encode a guess ("mtop rejects with the response object; not yet observed on AliExpress"). Green tests then read as evidence.
- The `generate` catch writes to `w.document.body`; if the user closed the tab, that line throws inside the catch, unhandled and silent.

**Why it happens:**
The real failure code of bug #2 has not been captured, so every branch is invented. Mtop codes are undocumented; only unofficial sources (scraping write-ups) name `FAIL_SYS_TOKEN_EXPIRED`-style codes (LOW confidence).

**How to avoid:**
- One neutral sentence first ("AliExpress did not return receipt data for this order."), then the raw code line, then at most advice that is true for every cause ("Reload the page, check you are signed in, try again").
- Do not add a "not ready yet" branch until a real code is captured. When the capture exists, add the branch plus a test whose fixture is the pasted real response.
- Mark invented fixtures in the test file as `// assumed shape, not yet seen on AliExpress` so they are not mistaken for evidence.
- Catch only the request (`try { await mtop.request(...) } catch`), not the whole function, so script bugs surface as script bugs.
- Never retry in a loop. Auto-retry on a signed endpoint of someone else's site risks a rate-limit or risk-control block on the user's account. A manual second click is the retry.
- Guard the write: `if (w.closed) return;` before writing, and wrap the error write in its own try.

**Warning signs:**
A message mentioning "new order" for an order that is a week old. `[object Object]` anywhere. `SUCCESS` inside an error message.

**Phase to address:** PR #4 merge phase (message wording), then the bug #2 evidence phase.

---

### Pitfall 7: A receipt that prints without the VAT line looks successful

**What goes wrong:**
`renderReceipt` skips any total or VAT row whose key is absent. For a fresh order, a partly filled response (success code, `orderId` present, `includedTaxDisplay` or `orderTotal` still missing) passes the `d.orderId` check and prints a receipt with no "of which VAT (included)" line. The accountant gets a document that looks complete. This breaks the Core Value ("correct ... included VAT") without any error. Bug #2 says a fresh order "failed once"; a half-filled answer is one candidate that the current checks cannot tell apart from a good one.

**Why it happens:**
The "skip absent keys" rule is correct for optional rows (Discount) and was extended to the VAT row by the same helper (`row`).

**How to avoid:**
- Decide what "ready" means from evidence: the capture list in issue #2 should record which fields were present in the failing answer.
- Cheapest safe change: when `includedTaxDisplay` is absent, print an explicit line ("AliExpress reported no VAT amount for this order") instead of omitting the row. It claims nothing beyond the data. Add a test for the absent case.
- Do not infer VAT yourself from the total (Out of Scope: only what AliExpress reports).

**Warning signs:**
A saved PDF for a recent order with no VAT row. `orderTotal` empty in the totals table.

**Phase to address:** Bug #2 evidence phase; test added in the tests-pinning phase.

---

### Pitfall 8: Page-code tests that cannot exercise the real script, or that need a dependency the project forbids

**What goes wrong:**
- The script chooses its path with `typeof module === 'object' && module.exports`. In Node tests that is always true, so `main()`, `inject()`, `makeControls()`, and the MutationObserver are never run by `require`. A `ReferenceError` in `main` passes CI.
- jsdom does not implement `HTMLDialogElement` (`showModal`, `close`, `returnValue`); jsdom issue #3294 is still open. The gear dialog (the save and clear paths) cannot be tested as written without a stub. Other jsdom traps: `requestAnimationFrame` needs `pretendToBeVisual: true`; `new URL(link.href, location.href)` needs a `url` option; jsdom's `FormData` and Node's global `FormData` are different classes, so a jsdom form passed to Node's `FormData` fails; the existing tests rely on Node's global.
- Adding jsdom means a `package.json`, a lockfile, `npm ci` in CI, a dev dependency with its own advisories, and a bump-bot decision. The project says "no runtime dependencies" and "no test framework dependency so far"; a dev dependency is allowed but is a cost.
- Tests that assert on private structure (class names, exact HTML) break on every harmless edit and get disabled.

**Why it happens:**
"Add DOM tests" is taken as "add jsdom and mock everything".

**How to avoid:**
- Smallest first: extract the dialog's close handler into a pure function (`applyDialogResult(returnValue, form)` returning "save" / "clear" / nothing) and test it with Node's `FormData`. This covers "dialog save and clear" with no DOM library.
- For injection, load the real script source into a jsdom window (`runScripts: 'outside-only'`, `window.eval(source)`): there `module` is undefined, so the real `main()` path runs, exactly as in the browser. Use fixture HTML copied from a saved order list and order page. Add a one-line assertion that controls appear once and not twice after a forced second `inject()` (guards the `data-ali-invoice` dedupe).
- Stub `HTMLDialogElement.prototype.showModal/close` in the test setup only if the dialog flow is tested through jsdom.
- Fixtures are snapshots of AliExpress' markup and will go stale. Name the capture date in the fixture file; a stale fixture proves nothing about the live selectors. Live selector drift is only caught by a manual run (Pitfall 9).
- Keep jsdom in `devDependencies`, pinned by lockfile, never referenced by the userscript.

**Warning signs:**
A page-code test file that never mentions `main`. Mocks that return the value the test then asserts. A PR that adds `jsdom` and a 300-line setup file.

**Phase to address:** Page-code tests phase (extract-then-test before any jsdom).

---

### Pitfall 9: Fragile selectors fail silently, and CI cannot see it

**What goes wrong:**
`.order-item .order-item-header-right`, `a[href*="orderId="]`, `.order-status.order-block`, and `window.lib.mtop` are not public. When AliExpress changes them the buttons simply do not appear (it already happened once on 2026-11-01 in Chrome, cause unknown). Unit tests, jsdom fixtures and green CI all stay green. The `module.exports` check can also stop injection if a page defines a global `module`.

**Why it happens:**
CI tests the repo, not the live site. Silent no-ops give no signal to the author.

**How to avoid:**
- Move the selectors into one constant block (CONCERNS.md fix) and test the fixture against that block.
- Log one `console.warn('[aliexpress-invoice] ...')` when, on a `/p/order/` page, no card or status block is found after load, and when `lib.mtop` is missing at click time (the click path already has its own message in PR #4).
- Add a release-day manual checklist to the PR template: orders list, order page, gear, receipt tab, print dialog opens.
- Replace the `typeof module` test with a dedicated check (`typeof process !== 'undefined' && process.versions && process.versions.node` is the usual form) only together with a test that the page path starts; do not change it casually.

**Warning signs:**
Reports of "the button is gone" with no console output. A fixture older than the last site redesign.

**Phase to address:** Page-code tests phase (selector constant plus warning); manual checklist in the CI/PR-template phase.

---

### Pitfall 10: Stored buyer details guard that destroys data or hides the corruption

**What goes wrong:**
The guard for "stored value is not an object" is easy to over-apply:
- `typeof x === 'object'` is true for `null` and arrays; arrays and `[]` pass an object check but break `s.off.includes`.
- Rejecting the whole stored value because one field has a wrong type (for example `off` is a string, `name` is a number) throws away a user's saved company block. Users who saved under 0.2.0 have no `off` key; that shape must keep working (an existing test pins it).
- Silently deleting the bad entry on load (a `removeItem` in `loadBuyer`) is a write inside a read path, and hides the problem.
- `off` as a non-array makes `off.includes(k)` either throw or, for a string, do substring matching (`'name'.includes('na')` style bugs).

**Why it happens:**
A one-line fix ("return null when not an object") is read as the whole requirement.

**How to avoid:**
- In `loadBuyer`, accept only a plain object (`v && typeof v === 'object' && !Array.isArray(v)`), then normalise per field: strings only for the four fields, `off` an array filtered to known keys, anything else dropped for that field. Keep valid fields.
- Do not write back on load. The next Save or Use delivery address rewrites it.
- Tests: number, string, array, `null`, `{off: 'name'}`, `{name: 5}`, a 0.2.0-shaped object (no `off`), and a normal 0.3.0 object. `localStorage` needs a 5-line fake `getItem/setItem/removeItem` in the test; it does not exist in Node tests.
- Keep the storage key `aliexpress-invoice.buyer` and the stored JSON shape unchanged: renaming either silently resets every user's company block (the exact data the feature exists for).

**Warning signs:**
A guard diff with no 0.2.0 test row. A new storage key name.

**Phase to address:** Small-fixes phase (buyer guard).

---

### Pitfall 11: Escaping tests that miss the interpolation that matters

**What goes wrong:**
The test suite checks `<b>` in one item title only. `renderReceipt` interpolates many response fields, and the dangerous ones are the ones nobody tests: `sellerName` (appears twice: seller column and per-item), `relateInfo`, `orderId` (in `<title>` and footer), `orderTime`, every `TOTAL_ROWS` value, `includedTaxDisplay`, `paymentInfo.*`, and the buyer lines. Also: `esc` covers `& < > " '`, which is right for text and quoted attributes, but a future unquoted attribute or an interpolation into the inline `<script>`/`onclick` would not be safe. The labels in `TOTAL_ROWS` and the `AUTO_PRINT` ternary are trusted constants; a test that "escapes everything" must not flag them.

**Why it happens:**
One example test gives a feeling of coverage. Adding a field to the receipt later forgets `esc`.

**How to avoid:**
- Property-style test: deep-clone the sample `receipt`, replace every string leaf with `<i x="1">&'` plus a unique marker, render, then assert (a) the raw `<i x=` string never appears in the output and (b) the escaped form appears once per leaf that is printed. This catches a new field automatically and needs no dependency.
- Also render with the buyer fields poisoned the same way.
- Escape at the output boundary only; do not double-escape (a test with `&amp;` input must render `&amp;amp;`).
- The inline print script takes no data. Keep it that way; a test asserts the `<script>` content equals the constant string.

**Warning signs:**
A new `d.something` in the template without a `esc(`. A test list that names fields one by one.

**Phase to address:** Tests-pinning phase.

---

### Pitfall 12: Inline print script and `document.write` on a page with a Content-Security-Policy

**What goes wrong:**
The receipt tab is `window.open('')` plus `document.write`, with an inline `onclick="print()"` and an inline `<script>`. An `about:blank` window inherits the opener's CSP in Chromium, and Firefox-based browsers (Zen is in use) differ. If aliexpress.com serves a CSP without `'unsafe-inline'` for scripts, the auto-print and button silently fail. The README screenshots show the feature working, so today it works. It is unverified for each browser, and CSP changes on AliExpress' side can break it with no change in the repo. Also, `document.write` is deprecated and a console intervention target; a future browser change would break the receipt for all installed users at once.

**Why it happens:**
Works today, so nobody re-checks; CI cannot see CSP at all.

**How to avoid:**
- Do not "fix" this in this milestone without a failing case. Add the check to the manual release checklist: DevTools console on the receipt tab in Chrome and Zen, no CSP violation.
- If it ever breaks, the CONCERNS.md route (attach `addEventListener('click')` from the opener, or a `Blob` URL) is the change; test it live in both browsers before merging (Pitfall 3).
- Do not move the print trigger to run before the content is written; the 100 ms `setTimeout` was chosen so layout exists first.

**Warning signs:**
Receipt opens but no print dialog and no button response; a CSP error in the receipt tab's console.

**Phase to address:** Manual verification in PR #4 / bug #2 phase; no code change planned.

---

### Pitfall 13: CI that exists but does not protect `main`

**What goes wrong:**
- A workflow that runs on `pull_request` only gates merges if branch protection or a ruleset requires the check. The project's own flow ends with `gh pr merge --rebase --delete-branch` right after `gh pr create`, which can merge before the check finishes.
- A `paths:` filter on the workflow means docs-only PRs never report the required check, and a required check that never reports blocks the PR forever.
- `node --test` with no `package.json`: it works on Node 20+/26 (verified locally: it discovers `*.test.js` and skips dot-directories, so `.worktrees/` copies are not run), but nothing declares the Node version. `actions/setup-node` with an unpinned `lts/*` follows the LTS alias; pin the major to the project rule (26) via `.node-version` or `engines` and read it with `node-version-file`.
- A `package.json` with `"type": "module"` makes Node load `aliexpress-invoice.user.js` as ESM, where `module.exports` is undefined, and every test breaks. Keep CommonJS (omit `type`).
- Third-party actions referenced by tag are a supply-chain path into a repo whose `main` runs inside people's logged-in AliExpress sessions.
- Using `pull_request_target`, or giving the workflow a write-scoped `GITHUB_TOKEN`, to "let CI comment" turns a PR from a fork into code execution with repo secrets.
- CI that only runs the unit tests does not run the script's page path or the metadata block (Pitfalls 2, 8).

**Why it happens:**
"CI on every pull request" is satisfied by a workflow file, not by a merge gate.

**How to avoid:**
- Workflow: `on: pull_request` and `push` to `main`, no `paths:` filter, `permissions: contents: read`, actions pinned to full commit SHAs (only `actions/checkout`, `actions/setup-node`), steps `node --check aliexpress-invoice.user.js`, then `node --test`, plus the `@version`-bump and metadata assertions.
- Enable a ruleset on `main`: require the CI job name, require PRs, block force-push and deletion. Update AGENTS.md to `gh pr merge --auto --rebase` or wait on `gh pr checks --watch`.
- Minimal `package.json`: `name`, `private: true`, `engines.node`, `scripts.test = "node --test"`. No `type`, no dependencies until jsdom is justified. If jsdom arrives, use `npm ci` with the lockfile committed.
- Add a one-line test that `AUTO_PRINT === true` is the shipped value (CONCERNS.md): either assert in tests via an export or grep the source for `const AUTO_PRINT = true;`.

**Warning signs:**
A green badge on a PR that was merged before the run completed. A required check stuck on "Expected".

**Phase to address:** CI phase (first phase after PR #4; before any other behaviour change).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Test fixtures invented from a guess about `lib.mtop` failures | Fast green tests | Tests read as evidence for behaviour never seen on AliExpress | Only if labelled "assumed"; replace with a pasted real response after bug #2 capture |
| Characterisation test that records today's VAT output including known wrong rows | Quick "pinned" status | Freezes a bug; fix needs test edits that look like regressions | Only with the wrong rows marked and fixed in the next commit |
| Rebase-merge of multi-commit PRs with one `@version` bump in the last commit | Clean history | Intermediate commits are live releases under the old version | Never for commits that change the script; squash instead |
| Keep `document.write` receipt tab | No change, works today | Break on a CSP or browser change hits all users at once | Acceptable now; revisit when a failing case exists |
| `localStorage` fake in tests that returns what the test set | Short tests | Tests pass while real `JSON.parse` edge cases fail | Acceptable if the fake stores strings, as the real one does |
| jsdom for everything | One tool for all page tests | Dependency, lockfile, dialog stubs, stale fixtures | Only after the pure-function extraction has covered what it can |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `window.lib.mtop` | Assume `request` resolves on success and rejects with an `Error` on failure | Handle resolve with failure `ret`, reject with a non-Error object, and a missing client; read `ret` as an array; show the code verbatim |
| `lib.mtop` with `needLogin: true` | Treat a login prompt or expired session as "no data" | Keep the neutral message; mention sign-in as one possible cause among several |
| `queryOrderReceiptInfo` payload | Treat `res.data.data.orderId` as "receipt ready" | `orderId` presence is the only readiness test in use; capture which other fields a fresh order lacks (bug #2) before adding more |
| AliExpress order strings | Reformat `orderTime`, `paymentDate`, amounts | Print as reported (locale-dependent strings); only the generated-on date is the script's own |
| `raw.githubusercontent.com` update URL | Expect an update seconds after merge | Plan for minutes to a day; test the new version by installing from the raw URL after merge |
| Tampermonkey vs Violentmonkey | Test in one manager only | Run the manual checklist in both when the metadata block or the page-context behaviour changes |
| `window.open` popup | Open after `await` | Keep the synchronous open in the click handler (already so; do not move the `fetchReceipt` call before it) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Whole-body `MutationObserver` re-running `querySelectorAll` | Page jank on very long order lists | Already rAF-throttled and guarded by `data-ali-invoice`; narrow only if reported | Hundreds of cards in one session; not a current concern |
| A retry loop around the signed request | Account risk-control / captcha, throttling | No automatic retry; the user clicks again | The first time AliExpress rate-limits |
| Opening the gear fires one receipt request per open | Extra calls to the signed endpoint | Keep as is; do not prefetch for every card | If someone adds prefetch on injection (tens of requests per page) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Reading `m_h5_tk` cookies or building signatures "to avoid `lib.mtop`" | Credential handling in a script that updates itself from `main` | Out of Scope; keep calling the page client |
| Putting error text from the response into HTML unescaped (new error path) | Injection into the receipt tab from a hostile or odd response | Reuse `esc()`; the new `AliExpress code:` line must go through it; add it to the poison-string test |
| Adding `@grant GM_*`, `@require` or `@connect` for convenience (for example `GM_setValue` for buyer details) | Changes the permission model of an auto-updating script; move out of page context | Not in this milestone |
| CI with write token, `pull_request_target`, or unpinned third-party actions | A fork PR or a hijacked action tampers with `main`, which is a release | Read-only token, `pull_request`, SHA-pinned actions |
| Logging buyer details or the raw response in `console.warn` diagnostics | Personal and business data in logs and screenshots | Log fixed strings and the `ret` code only |
| Stored buyer details readable by any page script | Existing accepted risk (same JS world) | Do not store more than the four fields; no secrets such as full IBAN beyond what the user types |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Error shown only in the new tab, nothing on the page | User sees a blank flash, then an error in another tab | Keep (PR #4 scope); the message must be plain and carry the code |
| Message advice that is wrong for the cause | User waits for a fresh order that was never the problem | Cause-neutral text (Pitfall 6) |
| Gear placeholders fall back to the generic text with no reason | User cannot tell why the order's values are missing | Out of Scope for now (PR #4 keeps 0.3.0 behaviour); do not change silently |
| Receipt "Generated on" date one day off right after local midnight | Wrong date on a document for the accountant | Fix with local date (Pitfall 4) |
| Receipt prints with no VAT row | Accountant files an incomplete document | Explicit "no VAT amount reported" line (Pitfall 7) |
| Buyer details of a company applied to a private order | Wrong buyer on the receipt | Existing behaviour, documented; keep, do not widen |

## "Looks Done But Isn't" Checklist

- [ ] **Date fix:** passes with `TZ=UTC` and fails against the old line under `TZ=Europe/Brussels` — run the new test against the old code first.
- [ ] **VAT pinning:** has rows that must NOT match, rows with separators and lowercase, and rows for EL, XI, ATU, NL `B01` — check the table, not the count of tests.
- [ ] **Escaping tests:** poison every string leaf, not only `itemTitle` — grep the template for `${` without `esc(`.
- [ ] **Buyer guard:** a 0.2.0-shaped object (no `off`) and a 0.3.0 object still load — run both rows.
- [ ] **Error messages:** no `[object Object]`, no "new order" wording for non-new orders, the code line is escaped, a closed receipt tab does not throw.
- [ ] **PR #4 merged:** the live check box is ticked on one completed order, both on the list and on the order page, in Chrome and in Zen.
- [ ] **Bug #2 closed:** the real failure text and code from a fresh order is pasted in the issue and a fixture/test uses it — otherwise leave the issue open with "mitigated".
- [ ] **CI:** the check is required in the ruleset, has no `paths:` filter, runs `node --check` and `node --test` on Node 26, and a test run on a deliberately failing branch goes red.
- [ ] **Release:** `@version` is higher than on `main`, `AUTO_PRINT` is `true`, `@updateURL`/`@downloadURL`/`@name`/`@namespace`/`@match` unchanged, `@grant none` kept.
- [ ] **Page tests:** the real script source ran with no `module` defined, and controls appear once after two `inject()` calls.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Bad release on `main` | MEDIUM | Ship a new higher `@version` containing the previous good code; wait out CDN cache and manager interval; tell users to use the manager's "check for updates" |
| Metadata or update URL broken | HIGH | Old copies cannot be fixed remotely. Restore the old path/branch as a stub that holds the new code at the old URL, announce a manual reinstall in the README |
| Duplicate buttons after a `@name` change | LOW | Restore the old `@name`/`@namespace` in the next higher version; users remove the stray script |
| Buyer details lost by a storage key or shape change | HIGH | Not recoverable from the script; ship a migration reading the old key, release notes, ask users to re-enter |
| Wrong VAT line on printed receipts | MEDIUM | Re-print affected receipts after the fix; list affected order ids from the issue; typed VAT in the gear is the user-side workaround |
| Auto-print or button dead (CSP, browser change) | MEDIUM | Switch to `addEventListener` from the opener or a `Blob` URL; manual "Print / Save as PDF" button until then (also may be CSP-blocked, so tell users to use the browser's Ctrl+P) |
| CI required check stuck | LOW | Remove the `paths:` filter, or rename the job and update the ruleset |

## Pitfall-to-Phase Mapping

Suggested phase order (rationale: gate first, pin before changing, evidence last because it waits on a real new order):
1. Land PR #4 (0.3.1) after its live check. 2. CI and release gate. 3. Pin by tests (VAT, escaping, date harness). 4. Small fixes (date, buyer guard, VAT). 5. Page-code tests. 6. Bug #2 evidence and close.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Merge is a release; revert is no rollback | 2 (version-bump gate), 1 (merge style) | A PR that edits the script without a higher `@version` fails CI |
| 2. Metadata or URL change strands users | 2 (metadata assertions) | Test parses the header and pins name, namespace, URLs, match, grant |
| 3. No staging, slow update window | 1 and every release (manual checklist) | PR template has the live-check boxes, ticked before merge |
| 4. Date test passes on UTC runner | 3 (harness), 4 (fix) | Test fails against old line with `TZ=Europe/Brussels` |
| 5. VAT regex tests pin bugs / drop real numbers | 3 (table), 4 (fix) | Table has must-not-match and separator rows; known-wrong rows flipped by the fix commit |
| 6. Error message claims a cause / masks bugs | 1 (wording), 6 (real code) | No "new order" claim in generic path; fixture from a real capture |
| 7. Receipt without VAT line looks fine | 6 (evidence), 3 (test) | Test for absent `includedTaxDisplay`; line printed |
| 8. Page tests cannot run the real script | 5 | Test evals the script with no `module`, asserts controls once |
| 9. Silent selector failure | 5 (constant, warning), 2 (checklist) | One console warning on an order page with no controls |
| 10. Buyer guard destroys data | 4 | Rows for 0.2.0 and 0.3.0 shapes plus corrupt shapes |
| 11. Escaping tests miss fields | 3 | Poison-leaf test fails when one `esc(` is removed |
| 12. Inline script and CSP | 1 and 6 (manual check) | Console clean in Chrome and Zen on the receipt tab |
| 13. CI that does not gate | 2 | Ruleset requires the job; failing branch goes red and cannot merge |

## Research Flags for Phases

- Phase "Bug #2 evidence": needs a real new order; cannot be researched in advance. Success is the captured code and fields, not a code change.
- Phase "Page-code tests": needs a short spike (jsdom dialog stub versus extract-and-test) before planning.
- Phase "CI": standard patterns; unlikely to need research beyond the ruleset settings.
- Phase "VAT fix": needs a sample list of the owner's real VAT formats; ask Andrei which countries matter.

## Sources

- Repo: `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`, `.planning/codebase/TESTING.md`, `aliexpress-invoice.user.js` (0.3.0), `aliexpress-invoice.test.js`; PR #4 (`fix/receipt-errors`, head code read) and issue #2 via `gh` — HIGH
- Local probe on Node 26.12.1 (runtime `process.env.TZ` switch; `toISOString` vs `toLocaleDateString('en-CA')` under UTC and Europe/Brussels; `node --test` discovery skips dot-directories) — HIGH
- [Tampermonkey documentation: @updateURL, @downloadURL, @version](https://www.tampermonkey.net/documentation.php?locale=en&q=update_url) · [🔖 2026-11-01](https://linkding.lav.ren/bookmarks?details=4220): `@version` required for update checks; `none` disables them — MEDIUM (the higher-version rule and the default interval come from secondary sources)
- [jsdom issue 3294, Implement HTMLDialogElement](https://github.com/jsdom/jsdom/issues/3294) · [🔖 2026-11-01](https://linkding.lav.ren/bookmarks?details=4221): open; workaround is to stub `show`, `showModal`, `close` — MEDIUM
- GitHub community discussions on raw.githubusercontent.com caching (about 5 minutes, reports of up to 24 h): [#46691](https://github.com/orgs/community/discussions/46691), [#46758](https://github.com/orgs/community/discussions/46758); [Fluid FLUID-6626](https://issues.fluidproject.org/browse/FLUID-6626/) — LOW to MEDIUM (no official GitHub statement)
- mtop error codes: only an unofficial scraping write-up names token-expiry codes ([roundproxies m_h5_tk solver](https://roundproxies.com/blog/m_h5_tk-solver.md)); no official AliExpress/Alibaba source found — LOW
- VAT formats (EL, XI, ATU, NL B01, IE) from general knowledge of the EU VIES scheme, not re-verified in this pass — MEDIUM; confirm against the VIES FAQ when building the test table

---
*Pitfalls research for: released, auto-updating userscript (AliExpress purchase receipts)*
*Researched: 2026-11-01*
