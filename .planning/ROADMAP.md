# Roadmap: AliExpress Invoice

## Overview

The script is released (0.3.0) and in use. This roadmap covers the next 0.3.x releases. It first lands the open
error-message fix (PR #4), then adds a CI gate so later edits cannot break installed copies, then fixes and pins
the receipt and buyer-data defects, then adds tests for the page code. Closing bug #2 is separate: it waits on a
real new AliExpress order and runs in parallel with Phases 2 to 4.

Every merge to `main` is a release, because installed copies update from `main`. Each phase that changes the
script raises `@version` in the same change.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Land PR #4 (0.3.1)** - Failed receipt requests show one plain message with AliExpress' code; the fix is live on `main`
- [ ] **Phase 2: CI and release gate** - Every pull request and push to `main` runs the tests and the release-contract checks
- [ ] **Phase 3: Receipt and buyer-data correctness** - Local receipt date, VAT split, escaping and stored-details guard, each pinned by a test that can fail
- [ ] **Phase 4: Page-code tests** - Control injection, the buyer-details dialog and the Generate invoice flow are covered by tests
- [ ] **Phase 5: Bug #2 evidence and close** - A real new order produces the evidence that closes issue #2

## Phase Details

### Phase 1: Land PR #4 (0.3.1)
**Goal:** A failed receipt request shows one plain message that contains AliExpress' code, a page without `lib.mtop` gets its own message, and 0.3.1 is live on `main` after a live check on a completed order.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: ERR-01, ERR-02
**Success Criteria** (what must be TRUE):
  1. When AliExpress returns no receipt data, the receipt tab shows one plain message that advises trying again later and ends with AliExpress' code. The message names no cause.
  2. On a page without `lib.mtop`, the receipt tab tells the user to open an order page and reload it.
  3. On one completed order, Generate invoice still prints a correct receipt from the orders list and from the order page, in Chrome and in Zen, and the print dialog opens by itself in the receipt tab.
  4. `main` carries the 0.3.1 `@version`, and `node --test` passes with the 11 tests of PR #4.
**Open decisions (Andrei)**: Decision 2, merge style for multi-commit PRs. PR #4 has a commit that changes the script under 0.3.0, so a rebase-merge puts a live release on `main` without a version bump. Andrei chooses squash-merge or a bump in every script-changing commit before the merge. Research recommends squash-merge and a one-line record in AGENTS.md.
**Plans**: TBD

### Phase 2: CI and release gate
**Goal:** Every pull request and every push to `main` is tested and checked for release mistakes, so a change that would strand or silently break installed copies shows a failed check before it merges.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CI-01, CI-02, CI-03
**Success Criteria** (what must be TRUE):
  1. A pull request that makes `node --test` fail shows a failed check on GitHub, and a passing one shows a green check, on Node 26.
  2. A pull request that changes the file path, `@name`, `@namespace`, `@updateURL`, `@downloadURL`, `@match` or `@grant none` shows a failed check.
  3. A pull request that changes the script without a higher `@version` shows a failed check, and a pull request that changes only tests or docs passes without a bump.
  4. A push to `main` runs the same checks.
**Open decisions (Andrei)**:
  - Decision 3, a CI ruleset on `main`. Without a required status check, a red check only warns, and `gh pr merge` right after `gh pr create` can merge before the run ends. Only Andrei can set the ruleset. Research recommends: require the job name and pull requests, block force-push and deletion, and use `gh pr merge --auto` or `gh pr checks --watch`.
  - Decision 1, dev-only `package.json`. It touches this phase only as an optional `test` script and `engines` field. CI-01 to CI-03 do not need it.
  - Decision 6, confirm or drop the "codebase map" requirements. CI-01 to CI-03 are in that group.
**Plans**: TBD

### Phase 3: Receipt and buyer-data correctness
**Goal:** The receipt prints the user's local date, a correctly split VAT line and only escaped response values, a damaged stored-buyer value no longer breaks it, and each of these is pinned by a test that fails on the old code.
**Mode:** mvp
**Depends on**: Phase 1, Phase 2
**Requirements**: RCPT-01, RCPT-02, RCPT-03, BUY-01
**Success Criteria** (what must be TRUE):
  1. A receipt generated in the first hours after local midnight shows the local date in "Generated … on", and a test pinned to `Europe/Brussels` fails on the old UTC line.
  2. A contact name such as `ACME BV BE0123456789` prints as `ACME BV` plus a `VAT BE0123456789` line, and a name that holds no VAT number keeps its full text. A must-match and must-not-match table pins both.
  3. A receipt whose every string field holds HTML characters prints them as text, and no raw tag reaches the page. A test over every string field proves it.
  4. With a stored value that is a string, an array, `null` or an object with a malformed Leave off list, Generate invoice prints a receipt from the order values. Details saved by 0.2.0 and 0.3.0 still load unchanged.
**Open decisions (Andrei)**:
  - Decision 4, which VAT prefixes to accept (EU list, `EL` not `GR`, `XI`, per-country shapes). Andrei also names the countries he meets, to seed the test table. This blocks RCPT-02 only.
  - Decision 5, `GB` kept or dropped. The current pattern accepts it; an EU list drops it. This blocks RCPT-02 only.
  - Decision 6, confirm or drop the "codebase map" requirements. RCPT-01 to RCPT-03 and BUY-01 are in that group.
  - RCPT-01, RCPT-03 and BUY-01 do not wait on decisions 4 and 5. Plan RCPT-02 last.
**Plans**: TBD

### Phase 4: Page-code tests
**Goal:** The script's page code (control injection, the buyer-details dialog and the Generate invoice flow) is covered by tests that run the shipped file against saved AliExpress page fixtures, so an edit cannot silently remove the controls.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: QA-01, QA-02, QA-03
**Success Criteria** (what must be TRUE):
  1. On an orders-list fixture every order card gets one Generate invoice button and one gear, and an order-page fixture gets one of each. Running injection again, or adding cards as the list paginates, adds no duplicate.
  2. Saving the buyer-details dialog stores the trimmed values, Use delivery address clears them, and Cancel changes nothing.
  3. Clicking Generate invoice opens the receipt tab before the request starts, a failed request writes its message into that tab, and a blocked popup shows an alert.
  4. The tests run in CI on every pull request.
**Open decisions (Andrei)**:
  - Decision 1, dev-only happy-dom with a `package.json` and lockfile. Research recommends accepting it (exact pin, `--ignore-scripts`, test job only, never shipped). If declined, injection stays a manual DevTools check and QA-01 is unmet. If there is no answer, take the recommended path.
  - Decision 6, confirm or drop the "codebase map" requirements. QA-01 to QA-03 are in that group.
  - The fixtures need a saved real orders-list page and order page from Andrei's signed-in account. The fixture file names its capture date.
**Plans**: TBD

### Phase 5: Bug #2 evidence and close
**Goal:** Issue #2 (a fresh order fails in the first minutes after checkout) is closed on evidence captured from a real new order, not on a guess.
**Mode:** mvp
**Depends on**: Phase 1 (the receipt tab shows the code only from 0.3.1). Runs in parallel with Phases 2 to 4. It waits on Andrei's next real AliExpress order, not on code.
**Requirements**: ERR-03, ERR-04
**Success Criteria** (what must be TRUE):
  1. Issue #2 holds, for the new order: the receipt tab text with its code, the order status, the minutes since checkout and the first time the click works.
  2. Either a distinct "not ready" code has its own receipt message and a test, or issue #2 records the evidence that the plain ERR-01 message covers the case.
  3. Issue #2 is closed, and the closing comment points to that evidence. A new order that does not fail adds timing data but does not close the issue.
**Open decisions (Andrei)**: None block this phase. It needs Andrei's real new order and a click on it in the first minutes after checkout. A code change from ERR-04 raises `@version` like any other release.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5. Phase 5 can run at any time after Phase 1.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Land PR #4 (0.3.1) | 0/0 | Not started | - |
| 2. CI and release gate | 0/0 | Not started | - |
| 3. Receipt and buyer-data correctness | 0/0 | Not started | - |
| 4. Page-code tests | 0/0 | Not started | - |
| 5. Bug #2 evidence and close | 0/0 | Not started | - |
