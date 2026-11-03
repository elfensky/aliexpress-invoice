# Stack Research

**Domain:** Test and CI tooling for a dependency-free, single-file Tampermonkey userscript (aliexpress-invoice)
**Researched:** 2026-11-01
**Confidence:** HIGH for the DOM-library choice, CI setup and date formatting (all verified by running them on Node 26.12.1 against the real script). MEDIUM for the "add a package.json" trade-off (a project decision, not a technical fact).

Scope: only what the Active requirements add. The existing stack (see `.planning/codebase/STACK.md`) does not change. The shipped file stays one plain-JavaScript file with no build step, no runtime dependency and `@grant none`.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 26 (26.13.0 is the first LTS build, 2026-10-28) | Test runtime locally and in CI | Matches the project constraint. Verified in `nodejs.org/dist/index.json`: v26.13.0 has `lts: Lithium`. Active LTS to April 2029. |
| `node:test` + `node:assert/strict` | built in | Test runner and assertions | Already in use. Stable (Stability 2) since Node 20. Has `t.mock.timers` (fake `Date`), `t.mock.method`, `--test` glob discovery. Zero install. |
| happy-dom | 21.0.4 (exact pin, dev-only) | DOM for the page-code tests (injection, `<dialog>` save and clear) | The only small DOM library that implements `HTMLDialogElement.showModal()`, `close(returnValue)` and the `close` event. Verified by running the real userscript in it (see "DOM testing"). |
| GitHub Actions: `actions/checkout` | v7.0.1 (SHA `3d3c42e5aac5ba805825da76410c181273ba90b1`) | Fetch the PR | Latest release (2026-07-20). Pin by SHA, keep the tag in a comment. |
| GitHub Actions: `actions/setup-node` | v7.1.0 (SHA `949feb2413d6458794dcd2491c4babbbce0c15c1`) | Install Node 26 | Latest release (2026-10-08). Runs on node24 itself. Reads the version from `.node-version`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| none | | | The pure-function tests (VAT split, escaping, non-object storage, local date) need nothing beyond `node:test`. Only the DOM tests need happy-dom. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `.node-version` containing `26` | One source of truth for Node on the dev machine (mise) and in CI (`node-version-file`) | `setup-node` accepts `.node-version`. Needs no `package.json`. Bump the number by hand when Node 28 reaches LTS. |
| `package.json` (private, dev-only) | Holds the happy-dom pin and the `test` script | See "Installation" and the trade-off below. Not shipped. The userscript file never reads it. |
| `package-lock.json` | Reproducible, integrity-checked install | Commit it. CI uses `npm ci --ignore-scripts`. |
| Dependabot (`github-actions` and `npm`, weekly) | Keeps the SHA pins and the happy-dom pin current | Two small ecosystems. Optional but cheap. |

## DOM testing: what to use

Requirement: tests for page code (control injection into order cards, `<dialog>` save and clear). The code uses `querySelectorAll` with `:not([data-ali-invoice])`, `dataset`, `insertBefore`, `MutationObserver`, `requestAnimationFrame`, `<dialog>.showModal()`, `form method="dialog"`, `FormData(form)`, `URL`/`location` and `localStorage`.

| Option | Verdict | Evidence |
|--------|---------|----------|
| `node:test` built-ins only | Not possible for this code | The `node:test` docs list no DOM. Node has no `document`. A hand-written fake would need to reimplement selectors with `:not([...])`, `dataset`, dialog events and `FormData` of a form. That is a second, buggy DOM. |
| jsdom 30.1.3 | Rejected | Run on the real script: `dlg.showModal is not a function` and `dlg.close is not a function`. Dialog save/clear cannot be tested. Also 22 direct dependencies and 7 MB. |
| linkedom 0.18.15 | Rejected | `showModal` is `undefined`. Smallest (2.8 MB) but incomplete for forms and dialogs. |
| **happy-dom 21.0.4** | **Use** | Run on the real script: controls injected on the orders list and re-injected after a DOM append (MutationObserver plus rAF), gear click opens the dialog, clicking `button[value=save]` stores `{"name":"Q BV",...}` (trimmed) in `localStorage`, `button[value=clear]` removes the key, the `<dialog>` is removed afterwards. Needs Node >=20. |

happy-dom caveats:
- Use 20.0.2 or later. Versions before 20.0.0 (and 20.0.0-20.0.1) have a VM-context escape (CVE-2025-61927 and its incomplete fix). 21.0.4 is fixed. Test only your own script and your own fixture HTML, never untrusted markup.
- It is about 18 MB installed with 7 direct dependencies. That is acceptable for a dev-only tool that never reaches users.

### How to load the script under test (prescriptive)

Evaluate the unmodified file text inside a happy-dom `Window`. Do not `require` it for page tests.

```js
const { Window } = require('happy-dom');
const fs = require('node:fs');
const SRC = fs.readFileSync(require.resolve('./aliexpress-invoice.user.js'), 'utf8');

function page(html, url = 'https://www.aliexpress.com/p/order/index.html') {
  const win = new Window({ url });
  win.document.body.innerHTML = html;
  win.lib = { mtop: { request: async () => ({ data: { data: receipt } }) } }; // the page's own client
  win.eval(SRC); // inside the window `module` is undefined, so main() runs, as in Tampermonkey
  return win;
}
// afterEach: await win.happyDOM.close();
```

Why this way:
- It runs the shipped bytes. The existing `module.exports` guard is not changed, and the export list does not grow for `inject`, `makeControls` or `openSettings`.
- `win.lib.mtop` is exactly the seam the script uses (`window.lib.mtop`), so `fetchReceipt` success and failure paths (the PR #4 messages) are testable by swapping `request`.
- One new `Window` per test, closed in `afterEach`, gives clean `localStorage` and no shared state.
- Stub `win.open` for `generate()` if a test needs the receipt tab.
- Cost: code run through `win.eval` is not counted by `--experimental-test-coverage`. Coverage is not a requirement, and that flag is still Stability 1 (experimental). Do not gate CI on it.

Dialog test shape (verified working):

```js
win.document.querySelector('.ali-invoice-gear').click();
const dlg = win.document.querySelector('dialog');
dlg.querySelector('[name=name]').value = ' Q BV ';
dlg.querySelector('button[value=save]').click();   // form method=dialog sets returnValue, fires 'close'
await new Promise((r) => setTimeout(r, 30));        // the close handler is async in practice
assert.deepEqual(JSON.parse(win.localStorage.getItem('aliexpress-invoice.buyer')).name, 'Q BV');
```

## Local-date formatting without libraries

Current code: `new Date().toISOString().slice(0, 10)` returns the UTC date. At 00:30 in Brussels on 2026-11-01 it prints 2026-10-31. Verified.

Use the local getters with `padStart`:

```js
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
```

| Approach | Verdict | Why |
|----------|---------|-----|
| `getFullYear/getMonth/getDate` + `padStart` | **Use** | Locale-independent, deterministic ISO shape, works in every browser Tampermonkey runs in, 1 line. |
| `d.toLocaleDateString('sv-SE')` or `'en-CA'` | Works, not preferred | Gives `YYYY-MM-DD` today (verified in Node 26), but the format is an ICU/locale side effect. A browser or ICU update can change it. |
| `Intl.DateTimeFormat(undefined, {dateStyle})` | Only if a locale-style date is wanted | Output differs per user. The receipt is for an accountant, so a fixed ISO date is better. |
| `Temporal.Now.plainDateISO()` | Do not use yet | Exists in Node 26, but the script runs in browsers (Chrome and Zen/Firefox builds vary). Not safe for a userscript that must run everywhere. LOW confidence on the browser floor; re-check later. |
| dayjs, date-fns, luxon | Never | Violates "no runtime dependencies". |

How to test it (no library):
- Make the date injectable: `renderReceipt(d, buyer, now = new Date())`, or export `localDate`. A default argument keeps current callers unchanged.
- Set the timezone inside the test. Node 26 honours a runtime change of `process.env.TZ` (verified: the instant `2026-10-31T23:30:00Z` gives local date `2026-11-01` with `TZ=Europe/Brussels` and `2026-10-31` with `America/Los_Angeles`). Restore the old value in a `finally`.
- Pin the "just after local midnight" case: instant `2026-10-31T23:30:00Z`, `TZ=Europe/Brussels`, expect `2026-11-01`. The old code returns `2026-10-31`, so the test fails before the fix.
- `t.mock.timers.enable({ apis: ['Date'], now })` also works (verified) when the date is read inside the function and cannot be injected.

## CI: GitHub Actions on Node 26

`.github/workflows/test.yml`:

```yaml
name: test
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .node-version
      - run: npm ci --ignore-scripts
      - run: npm test
```

Rationale:
- `pull_request` meets the requirement. The `push` to `main` line re-runs tests after the rebase merge, which matters because every merge to `main` is a release (installed copies auto-update from `main`).
- `permissions: contents: read` and `persist-credentials: false`: the job needs no write token and no secrets. This is cheap hardening.
- SHA pins: a moved tag cannot change the code that runs. This follows the owner's rule on altered third-party code. Dependabot updates the pins.
- No `cache:` option: the install is small and the cache needs more config than it saves.
- `--ignore-scripts`: happy-dom needs no install scripts.
- Make `test` a required status check on `main` (repository ruleset). Without it the CI result is advisory and a merge can still go through red.
- The default reporter in Node 26 prints readable output on a non-TTY runner. No reporter flag is needed. Node has no built-in GitHub annotation reporter.

Discovery check: plain `node --test` finds `*.test.js` at the root and did not descend into a hidden `.worktrees/` directory (verified: a `.test.js` inside `.worktrees/x/` was not run). `node_modules` is also skipped.

## Installation

```bash
# Once, in the repo root (creates package.json and package-lock.json)
echo 26 > .node-version
npm init -y                       # then edit: "private": true, "scripts": {"test": "node --test"}, no "main"
npm install --save-dev --save-exact --ignore-scripts happy-dom@21.0.4
printf 'node_modules/\n' >> .gitignore

# Every checkout / CI
npm ci --ignore-scripts
npm test
```

Keep `package.json` minimal: `private: true`, the `test` script, one `devDependencies` entry. Do not set `"type": "module"` (the tests use `require`). No `dependencies` key. The userscript is still one file, installed from the raw URL.

Trade-off against "no package.json today": a package.json plus lockfile that holds only a dev tool does not touch the "no runtime dependencies, no build step" constraint, because Tampermonkey installs the `.user.js` file and nothing else. The real cost is that `node --test` alone now fails on the DOM test file with `MODULE_NOT_FOUND` until `npm ci` runs. Accept that cost and document it in README "Development". Do not add a "skip if happy-dom is missing" guard: a silent skip hides a red CI.

Keep two test files so the dependency stays contained:
- `aliexpress-invoice.test.js` stays dependency-free (pure functions, plus the new VAT, escaping, date and non-object-storage tests).
- `aliexpress-invoice.dom.test.js` is the only file that requires `happy-dom`.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| happy-dom (dev-only) | jsdom | If a future need is jsdom-only (for example `runScripts: 'dangerously'` fidelity), and the dialog tests still work through a manual `showModal` polyfill in the test. Today it fails the dialog requirement. |
| happy-dom (dev-only) | A hand-written fake `document` (no package.json) | Only if the page code shrinks to a few `createElement` calls. Today it needs selectors, dataset, MutationObserver and dialog events. |
| happy-dom (dev-only) | Playwright or real-browser tests | Only if CSS layout or the real `window.print` flow must be tested. Adds a browser download in CI. Overkill here. |
| Dev-only `package.json` | `npm i --no-save happy-dom` in CI only, no package.json | If the owner refuses any package.json. Loses the lockfile integrity check and local reproducibility. Not recommended. |
| `node-version-file: .node-version` | `node-version: 26` inline or `lts/*` | Inline `26` is fine if no mise/local file is wanted. `lts/*` moves silently to the next LTS and can break CI without a code change. |
| `ubuntu-latest` | A matrix of Node versions | Only if the script's users run tests. They do not. One version (the LTS floor) is enough. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| jsdom for the dialog tests | No `HTMLDialogElement.showModal` or `close` (verified on 30.1.3). | happy-dom 21.0.4 |
| linkedom | No `showModal`. Server-side-rendering focus, not a faithful browser DOM. | happy-dom |
| Jest, Vitest, Mocha, Playwright, Puppeteer | Heavy dev stack for one 280-line file. `node:test` already works. | `node:test` |
| `@happy-dom/global-registrator` | Puts DOM globals on Node's `globalThis`, which is shared across tests in a file and hides leaks. | A fresh `Window` per test |
| Adding `inject`, `makeControls`, `openSettings` to `module.exports` just for tests | Grows the public test surface and stops testing the shipped bytes and `main()`. | `win.eval(SRC)` in happy-dom |
| happy-dom below 20.0.2 | VM-context escape advisories (CVE-2025-61927). | 21.0.4, exact pin |
| `toISOString().slice(0, 10)` for a display date | UTC date, wrong near local midnight (the current bug). | Local getters + `padStart` |
| dayjs, date-fns, luxon, moment | Runtime dependency in a one-file script. | Local getters + `padStart` |
| `--experimental-test-coverage` as a CI gate | Still Stability 1 (experimental). Does not see `win.eval` code. | No gate. Use it locally if wanted. |
| Unpinned `actions/checkout@v7` tags | A moved tag changes the code that runs. | SHA pin plus Dependabot |
| `pull_request_target` | Runs with write token and secrets on fork code. | `pull_request` |
| `cache: npm` in setup-node | Extra config for no gain at this size. | Plain `npm ci` |

## Stack Patterns by Variant

**If the owner insists on no package.json at all:**
- Drop the page-code DOM tests, keep pure-function tests, and cover page code by the manual DevTools loop.
- Because the DOM requirement cannot be met well without a DOM library (see the table above). Record the gap.

**If a requirement needs the receipt tab (`window.open`, `document.write`):**
- Stub `win.open` to return a second happy-dom `Window` and assert on its `document.body.innerHTML`.
- Because happy-dom's `open` does not create a usable tab in tests.

**If `localStorage` holds a non-object (the "ignore a non-object value" requirement):**
- Set `win.localStorage.setItem('aliexpress-invoice.buyer', '"str"')` (also `'5'`, `'[]'`, `'null'`) and call the load path through the gear click or through `buyerFor`.
- Verified side finding: with `'"str"'` stored, the gear click does not throw today, but the value is still passed to `settingsHTML`. The fix belongs in `loadBuyer`.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| happy-dom@21.0.4 | Node >=20 | `engines.node` is `>=20.0.0`. Fine on 26. |
| jsdom@30.1.3 | Node `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` | Works on 26 but lacks dialog methods. |
| actions/setup-node@v7.1.0 | runs on node24, installs any Node from `node-version` or `.node-version` | `node-version-file` accepts `.node-version`, `.nvmrc`, `package.json`, `.tool-versions`, `mise.toml`. |
| Node 26.13.0 | `node:test` `t.mock.timers` (Date), `t.mock.method` | Verified working. Node 26 is the last release under the old model. Node 27 ships April 2027 and becomes LTS October 2027. |
| `process.env.TZ` runtime change | Node 26 | Verified: later `Date` getters use the new zone. |

## Sources

- Node.js release index `https://nodejs.org/dist/index.json`: v26.13.0 `lts: Lithium`, 2026-10-28 (HIGH, official, fetched 2026-11-01).
- [Node.js v26 test runner docs](https://nodejs.org/docs/latest-v26.x/api/test.html) · [🔖 2026-11-01](https://linkding.lav.ren/bookmarks?details=4211): `mock.timers` with `Date`, `mock.method`, default discovery patterns, coverage flag still Stability 1 (HIGH, official). The page was read up to character 100000 of 248333; no built-in DOM is documented in that part.
- `npm view` registry data (2026-11-01): jsdom 30.1.3, happy-dom 21.0.4, linkedom 0.18.15, engines fields, dependency counts (HIGH).
- Local experiments on Node 26.12.1 against the real `aliexpress-invoice.user.js`, in `/tmp/domtest` (HIGH): jsdom lacks `showModal` and `close`; linkedom lacks `showModal`; happy-dom runs injection, MutationObserver re-injection, dialog save and clear; `process.env.TZ` switching; `t.mock.timers` Date; `node --test` ignores `.worktrees/`.
- `gh api` for `actions/checkout` (v7.0.1, 2026-07-20) and `actions/setup-node` (v7.1.0, 2026-10-08), tag-to-SHA lookups, and `action.yml` of setup-node (`node-version-file`, `using: node24`) (HIGH, official).
- [OSV: CVE-2025-61927 happy-dom](https://osv.dev/vulnerability/CVE-2025-61927) and a search summary that 20.0.2 completes the fix (MEDIUM; the 20.0.2 detail comes from a single search summary, but 21.0.4 is above both).
- Node 26 LTS date and the one-release-a-year change from Node 27: [endoflife.date/nodejs](https://endoflife.date/nodejs), [InfoQ](https://infoq.com/news/2026/06/nodejs-release-changes) (MEDIUM, secondary; the LTS date itself is confirmed by the dist index above).
- Browser support for `Temporal` was not checked against a primary source (LOW); the recommendation avoids it.
- Context7 was not used: its MCP server needed authentication and was not authorised in this run. Official docs and direct experiments replaced it.

---
*Stack research for: test and CI tooling of a dependency-free userscript*
*Researched: 2026-11-01*
