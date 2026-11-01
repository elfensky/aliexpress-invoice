# Project Research Summary

**Project:** AliExpress Invoice
**Domain:** Single-file, auto-updating Tampermonkey userscript that prints AliExpress orders as purchase receipts
**Researched:** 2026-11-01
**Confidence:** MEDIUM-HIGH (tooling and code seams verified by local runs on Node 26.12.1; AliExpress failure behaviour and VAT formats are secondary or unobserved)

## Executive Summary

This is a released, one-file userscript (0.3.0, PR #4 for 0.3.1 in flight). Every merge to `main` is a release, because installed copies update from `main`. The research covers the Active requirements only: error messages, local date, VAT detection, escaping tests, a stored-details guard, page-code tests and CI. The shipped file stays one plain-JavaScript file with no build step, no runtime dependency and `@grant none`.

The recommended approach is "safety net first, then change". Merge PR #4 after its live check. Add CI with a release gate (version bump, metadata check). Pin VAT detection and escaping with tests. Then make the small fixes (date, buyer guard, VAT). Then add page-code tests with a dev-only DOM library. Close bug #2 last, because it waits on a real new order. Use `node:test` for everything. Use happy-dom (exact pin, dev-only) for the page tests, because jsdom and linkedom lack `<dialog>.showModal()`.

The main risks are release mistakes, not code mistakes. A revert does not roll back users (managers update only to a higher `@version`). A metadata or URL change strands every installed copy. A date test can pass on a UTC runner against the buggy code. A tightened VAT pattern can drop real numbers from a document an accountant files. An error message can claim a cause nobody has observed. Each risk has a cheap test or CI gate in the phases below.

## Key Findings

### Recommended Stack

No runtime stack change. Only test and CI tooling is added. All items were verified by running them against the real script.

**Core technologies:**
- Node 26 (26.13.0 is the first LTS build): test runtime locally and in CI — matches the project rule; read from `.node-version`.
- `node:test` + `node:assert/strict`: runner and assertions — already in use; has `t.mock.timers`, `t.mock.method`; zero install.
- happy-dom 21.0.4 (exact pin, dev-only): DOM for page tests — the only small DOM library with working `showModal`, `close(returnValue)` and the `close` event; versions below 20.0.2 have a VM-escape CVE.
- `actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0, pinned by commit SHA: CI — a moved tag cannot change what runs; Dependabot keeps pins current.
- Local-date formatting: `getFullYear/getMonth/getDate` + `padStart` — locale-independent; no date library; avoid `Temporal` (browser floor unchecked).

Rejected: jsdom (no `showModal`/`close`, verified on 30.1.3), linkedom (no `showModal`), Jest/Vitest/Playwright, `toISOString().slice(0,10)`, `pull_request_target`, `cache: npm`, a coverage gate.

### Expected Features

**Must have (table stakes):**
- One plain error message with AliExpress' code, escaped; separate message when `lib.mtop` is missing; retry is a second click (PR #4).
- Local receipt date, correct just after local midnight.
- VAT detection by country prefix and shape (not "any 2 capitals + 8-12 alphanumerics"), with must-match and must-not-match tables.
- Per-field escaping test that poisons every string leaf.
- Stored buyer details that are not a plain object are ignored.
- Page-code tests (injection, dialog save and clear) and CI on every pull request.
- Bug #2 closed with evidence from a real new order.

**Should have (competitive):**
- "Not ready yet" hint, gated on the real captured code (blocked on #2).
- VAT label stripping (`VAT`, `BTW`, `TVA`), separator tolerance (`BE 0123.456.789`), lowercase prefix.
- Explicit "AliExpress reported no VAT amount for this order" line when `includedTaxDisplay` is absent (a receipt that silently omits the VAT row looks complete).

**Defer (v2+):**
- Belgian modulo-97 check, non-EU tax IDs (CH, NO), console warning for missing selectors (a selector constant block is a cheap precursor).
- Never build: auto-retry or polling, guessed causes in messages, computed VAT, live VIES lookup, checksum validation for all countries, telemetry, batch export.

### Architecture Approach

Keep one file; do not split it. Every impure input becomes a last parameter with a production default: clock (`renderReceipt(d, buyer, now = new Date())`), request client (`fetchReceipt(orderId, mtop)`, already in PR #4) and storage (`loadBuyer(store = localStorage)`). Pure functions are tested in a DOM-free file. Page code is tested in a second file, so global worlds do not mix.

The researchers differ on how to load the page code. STACK.md evaluates the unmodified file text inside a fresh happy-dom `Window` (`win.eval(SRC)`), so the shipped bytes and `main()` run and the export list does not grow. ARCHITECTURE.md exports `inject`, `makeControls`, `openSettings`, `generate` and registers happy-dom globals. Recommendation: use `win.eval(SRC)` for page tests (it also covers the Pitfall 8 gap that `main()` never runs under `require`), and export only the pure and boundary names that the DOM-free tests need (`esc`, `buyerFromAddress`, `loadBuyer`, `saveBuyer`, `fetchReceipt`).

**Major components:**
1. Pure core (`esc`, `buyerFromAddress`, `buyerFor`, `settingsFromForm`, `renderReceipt`, `settingsHTML`) — decide what prints; no globals.
2. Receipt data boundary (`fetchReceipt`) — the one place that gets receipt data; plain errors.
3. Buyer store (`loadBuyer`, `saveBuyer`) — one `localStorage` key; ignores bad stored values.
4. Dialog shell (`openSettings`) and popup shell (`generate`) — open the tab synchronously; write receipt or error.
5. Injection shell (`makeControls`, `inject`, `main`) — add controls once; follow pagination.

### Critical Pitfalls

1. **A merge to `main` is a release; a revert is not a rollback** — bump `@version` in every script-changing commit or squash-merge; roll back by shipping a higher version; add a CI check that a script diff raises `@version`.
2. **Metadata or update-URL changes strand installed users** — freeze path, `@name`, `@namespace`, `@updateURL`, `@downloadURL`, `@match`, `@grant none`, class and `data-ali-invoice` names; pin them with a header-parsing test.
3. **A date test that cannot fail on a UTC runner** — pin `process.env.TZ`, pass a fixed instant, and run the test red against the old line first.
4. **VAT tests that freeze bugs, or a strict allow-list that drops real numbers** — table first (must-match and must-not-match, include `EL`, `XI`, `ATU`, NL `B01`, IE), then the fix; leave the name untouched when nothing matches; no checksum validation.
5. **Error messages that claim a cause or mask script bugs** — one neutral sentence plus the raw escaped code; catch only the request; guard a closed receipt tab; no "not ready" branch before a real code is captured; invented fixtures labelled "assumed".
6. **CI that exists but does not gate** — no `paths:` filter, required status check in a ruleset, `permissions: contents: read`, SHA-pinned actions, no `"type": "module"`.
7. **Buyer guard that destroys data** — accept a plain object only, normalise per field (keep valid fields, `off` must be an array), do not write back on load, keep the 0.2.0 shape (no `off`) working, keep key and shape unchanged.

## Implications for Roadmap

Suggested phase structure (6 phases; gate first, pin before changing, evidence last):

### Phase 1: Land PR #4 (0.3.1)
**Rationale:** Error text and `fetchReceipt(orderId, mtop)` are the base that later tests assert on. Merge it before anything else, but only after its live check on one completed order (list and order page, Chrome and Zen).
**Delivers:** Plain error with AliExpress code, own no-`lib.mtop` message, 11 tests.
**Addresses:** Error-message table stakes.
**Avoids:** Pitfall 3 (no staging), Pitfall 6 (wording; the "A new order can take a few minutes" sentence claims a cause; make it cause-neutral; guard a closed tab), Pitfall 12 (manual CSP check on the receipt tab), Pitfall 1 (decide merge style first; see open decisions).

### Phase 2: CI and release gate
**Rationale:** Every later edit is made without the author eyeballing the browser. CI is cheapest early and must exist before behaviour changes.
**Delivers:** `.github/workflows/test.yml` (`pull_request` + `push` to `main`, Node from `.node-version`, SHA-pinned actions, read-only token), `node --check`, `node --test`, `@version`-bump check, header-metadata test, `AUTO_PRINT === true` check, a minimal `package.json`, README "Development" note, PR template with live-check boxes, optional Dependabot.
**Uses:** Node 26, `node:test`, `actions/checkout`, `actions/setup-node`.
**Avoids:** Pitfalls 1, 2, 13.

### Phase 3: Pin by tests (no behaviour change)
**Rationale:** Tests are the specification for the fixes in Phase 4. The date and VAT tests must be able to fail.
**Delivers:** DOM-free seams and exports; TZ-pinned date test with injectable `now`; VAT must-match and must-not-match table (known-wrong rows marked); poison-every-leaf escaping test including the error-code line; absent-`includedTaxDisplay` test; buyer-store tests with a string-storing fake; export-drift test.
**Implements:** Pure core and boundary seams.
**Avoids:** Pitfalls 4, 5, 11, 7 (test part).

### Phase 4: Small fixes (behaviour change, 0.3.2)
**Rationale:** The Phase 3 tests now turn red-to-green. Keep it a separate PR from Phase 5, because this one changes behaviour and Phase 5 must not.
**Delivers:** Local date; `loadBuyer` plain-object guard with per-field normalisation and `off` array guard; VAT detection by country prefix and shape; optional label stripping, separator tolerance and lowercase prefix; explicit "no VAT amount reported" line.
**Addresses:** Local date, stored-details guard, VAT detection, VAT-row honesty.
**Avoids:** Pitfalls 4, 5, 7, 10. Bump `@version` in the same commit.

### Phase 5: Page-code tests
**Rationale:** Needs the storage guard and error text settled, and the dev-dependency decision made.
**Delivers:** `aliexpress-invoice.dom.test.js` using happy-dom 21.0.4 (exact pin, lockfile, `npm ci --ignore-scripts`): injection on list and detail fixtures, idempotent second `inject()`, no `orderId` adds nothing, gear opens the dialog, save/clear/cancel through `loadBuyer`, `generate` opens the tab before the first await, error written to the tab, popup blocked. Selector constant block and one `console.warn` when no card is found on an order page. Fixture file names its capture date.
**Uses:** happy-dom, `win.eval(SRC)`, fresh `Window` per test.
**Avoids:** Pitfalls 8, 9.

### Phase 6: Bug #2 evidence and close
**Rationale:** Blocked on a real new order and on Andrei; independent of Phases 2-5 and can run in parallel.
**Delivers:** Captured code, timing and present fields pasted into issue #2; a fixture from the real response; the "not ready yet" hint only if the code proves it; otherwise leave #2 open as "mitigated".
**Avoids:** Pitfalls 6, 7.

### Phase Ordering Rationale

- PR #4 first: its error text and `fetchReceipt` signature are asserted by later tests.
- CI before behaviour changes: gates release mistakes (Pitfalls 1, 2, 13).
- Pin before fix: tests that fail first prove the date and VAT fixes (Pitfalls 4, 5).
- Page tests after fixes: they assert the final storage guard and error text.
- Bug #2 is a calendar dependency, not a repo dependency.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5:** short spike or fixture capture needed. Both the STACK and ARCHITECTURE spikes passed on happy-dom 21.0.4, but fixtures must come from a saved real order list and order page, and happy-dom does not model browser modality.
- **Phase 4 (VAT part):** needs Andrei's sample of real VAT formats and countries (see open decisions). Country shapes come from Wikipedia and Avalara (MEDIUM); confirm against the VIES FAQ when building the table.
- **Phase 6:** cannot be researched in advance; needs a real new order.

Phases with standard patterns (skip research-phase):
- **Phase 1:** merge and live check only.
- **Phase 2:** standard GitHub Actions pattern; only the ruleset settings need a look.
- **Phase 3:** `node:test` and TZ pinning verified locally.

## Open Decisions for Andrei

These are not decided here. Each shows the researchers' recommendation.

1. **Dev-only happy-dom plus `package.json` and lockfile.** Recommended: accept (exact pin, `--ignore-scripts`, test job only, never shipped). If declined: Phase 5 shrinks to extracting the dialog `close` handler into a pure function tested with Node's `FormData`; injection stays a manual DevTools check, and the "tests cover control injection" requirement is unmet. A `package.json` is also useful in Phase 2 (`test` script, `engines`) even without happy-dom. If no answer: take the recommended path.
2. **Merge style for multi-commit PRs.** Rebase-merge puts each commit on `main`, and each is a live release (PR #4 commit 1 changes the script under 0.3.0). Recommended (PITFALLS): squash-merge so one PR is one version, or bump `@version` in every script-changing commit. Record the choice in AGENTS.md. This changes the current AGENTS.md flow (`gh pr merge --rebase`).
3. **A CI ruleset on `main`.** Without a required status check, CI is advisory, and `gh pr merge` right after `gh pr create` can merge before the run ends. Recommended: require the job name, require PRs, block force-push and deletion; use `gh pr merge --auto` or `gh pr checks --watch`.
4. **Which VAT prefixes to accept.** Recommended: the EU list plus `EL` (not `GR`) and `XI`, with per-country shape (RO 2-10 digits, NL `B01`/`B02`, IE and ES variants). An unrecognised token stays in the name. Andrei names the countries he meets, to seed the test table.
5. **GB kept or dropped.** The current pattern accepts `GB`; an EU allow-list drops it. Recommended (FEATURES): name the choice in the requirement. PITFALLS adds: prefer the rule that cannot lose data (leave the name untouched when nothing matches).
6. **Active items marked "codebase map" (PROJECT.md).** Already marked pending: they come from CONCERNS.md, not from filed issues. Andrei confirms or drops them.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | DOM-library choice, CI file, date approach and TZ testing all verified by running them on Node 26.12.1 against the real script. The "add a package.json" trade-off is a project decision (MEDIUM). |
| Features | MEDIUM | Error-UX and VAT formats cross-checked on 2-3 secondary sources (Wikipedia, Avalara); the VIES page gave no usable text; no source covers "upstream not ready" UX for userscripts. |
| Architecture | HIGH | Seams read from the code; happy-dom spike run. MEDIUM for happy-dom compatibility over time and for the fixture drifting from the live page. |
| Pitfalls | MEDIUM | Repo-specific findings HIGH (local probes). Manager update rules and CDN cache timing MEDIUM-LOW (secondary). `lib.mtop` failure shapes LOW (never observed). |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Real `lib.mtop` failure code and shape for a fresh order:** unobserved. Keep the neutral message; collect the capture in issue #2; label current fixtures "assumed".
- **Which fields a fresh order lacks (VAT row risk):** unknown until the capture; add the explicit "no VAT amount reported" line meanwhile.
- **CSP effect on the inline print script, per browser (Chrome, Zen):** unverified. Manual check on the receipt tab in Phase 1; no code change without a failing case.
- **Live selector drift (the controls missing once on 2026-11-01):** CI cannot see it. Manual release checklist; selector constant and warning in Phase 5.
- **Raw-URL update window and manager defaults:** minutes to a day, from secondary sources. Plan for it; check by installing from the raw URL after merge.
- **Real VAT formats in use:** need Andrei's sample list; shapes are MEDIUM until checked against VIES.
- **Date-format mix on the receipt:** the generated-on date becomes ISO while `orderTime` and `paymentDate` stay in the site's language. Accept it or state it in the README; do not normalise (out of scope).
- **Temporal browser floor:** not checked (LOW); avoided.

## Sources

### Primary (HIGH confidence)
- Local experiments on Node 26.12.1 against the real `aliexpress-invoice.user.js`: jsdom and linkedom lack `showModal`; happy-dom 21.0.4 runs injection, MutationObserver re-injection, dialog save and clear; runtime `process.env.TZ` switch; `t.mock.timers` Date; `node --test` ignores `.worktrees/`.
- Node.js release index (`nodejs.org/dist/index.json`): v26.13.0 LTS 2026-10-28.
- Node.js v26 test runner docs; `npm view` registry data; `gh api` for action versions and SHAs.
- Repo files: `.planning/PROJECT.md`, `.planning/codebase/*`, the script and its tests, PR #4 and issue #2 via `gh`.

### Secondary (MEDIUM confidence)
- Wikipedia (VAT identification number) and Avalara (EU VAT formats): country shapes, `EL` and `XI`.
- Tampermonkey docs: `@version` required for update checks; `none` disables them.
- jsdom issue #3294 (HTMLDialogElement unimplemented); OSV CVE-2025-61927 (happy-dom).
- AliVAT listing and the Aliexpress Invoice Downloader post (competitors); GOV.UK error-message guidance (by analogy).
- endoflife.date and InfoQ for the Node 26 and 27 schedule.

### Tertiary (LOW confidence)
- GitHub community threads on `raw.githubusercontent.com` caching (5 minutes to 24 hours, no official statement).
- Unofficial scraping write-up naming mtop token-expiry codes; no official AliExpress source.
- WCPOS error-code docs via search summary (retry left to the user).
- `Temporal` browser support (not checked); Belgian modulo-97 rule (domain knowledge).
- Context7 was not available in the research runs.

---
*Research completed: 2026-11-01*
*Ready for roadmap: yes*
