# Architecture Patterns

**Domain:** single-file Tampermonkey userscript (purchase receipts for AliExpress orders)
**Researched:** 2026-11-01
**Confidence:** HIGH for the seams and the spike results (read from the code, run on Node 26.12.1). MEDIUM for happy-dom staying compatible with future Node and AliExpress changes.

## Answer in short

Keep one file and no build step. Do not split the file. Make the page-facing code testable by three small moves:

1. **Export more.** Extend the existing `module.exports` list with the page functions (`inject`, `makeControls`, `openSettings`, `generate`, `loadBuyer`, `saveBuyer`, `fetchReceipt`, `buyerFromAddress`, `esc`). The script touches no global at load time, so `require()` stays safe. Keep that invariant.
2. **Inject the three inputs that are not arguments today.** The clock (`renderReceipt(d, buyer, now = new Date())`), the request client (`fetchReceipt(orderId, mtop)`, already in PR #4) and the storage (`loadBuyer(store = localStorage)`). Default parameters are read at call time, so production code does not change.
3. **Give the page tests a real DOM in a second test file.** Use `happy-dom` as a test-only `devDependency`. The userscript itself keeps zero dependencies. A hand-written fake `document` is the alternative; it is not worth it (see Anti-Patterns).

eli14 summary: the script is a small shop with one door to the street (AliExpress' page). Today the shop staff can only be tested in the back room (pure functions). Tests for the door need a model street. `happy-dom` is that model street: a pretend page that lives only in the test. Nothing from the model street ships to customers. Today's cost is one test-only package and a lockfile. The future risk is that the model street drifts from the real one, so a test passes while the real page changed.

## Recommended Architecture

Same four logical groups as the codebase map. The change is in the boundaries: every impure input becomes a parameter with a production default, and the test file chooses what to pass.

```
                 production                                  test
┌────────────────────────────────────────┐   ┌───────────────────────────────────────────┐
│ main() ─► inject() ─► makeControls()   │   │ aliexpress-invoice.page.test.js           │
│            │              │            │   │  GlobalRegistrator.register({url})        │
│            │      click ► generate()   │   │  window.lib = { mtop: fake }              │
│            │      click ► openSettings │   │  window.open = () => recorder             │
│            ▼              │            │   │  document.body.innerHTML = host fixture   │
│   host DOM (AliExpress)   │            │   │  localStorage (happy-dom)                 │
├────────────────────────────┼───────────┤   ├───────────────────────────────────────────┤
│ Pure core (no globals)     ▼           │   │ aliexpress-invoice.test.js (existing)     │
│  buyerFromAddress buyerFor settingsFromForm   │  Node-native FormData, no DOM, no setup   │
│  renderReceipt(d, buyer, now) settingsHTML esc│  TZ pinned to Europe/Brussels             │
├────────────────────────────────────────┤   └───────────────────────────────────────────┘
│ Boundaries (parameter + default)       │
│  fetchReceipt(orderId, mtop=lib.mtop)  │
│  loadBuyer(store=localStorage) + guard │
│  saveBuyer(b, store=localStorage)      │
│  window.open() ─► receipt tab          │
└────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With | Test route |
|-----------|---------------|-------------------|------------|
| Pure core (`esc`, `buyerFromAddress`, `buyerFor`, `settingsFromForm`, `renderReceipt`, `settingsHTML`) | Decide what prints; build HTML strings | Called by the shell. Reads no global; `renderReceipt` takes `now` | `aliexpress-invoice.test.js`, no setup |
| Receipt data boundary (`fetchReceipt`) | The one place that gets the receipt data; plain error text | `mtop` argument (default `window.lib.mtop`) | Fake `mtop` object passed as argument; no DOM |
| Buyer store (`loadBuyer`, `saveBuyer`) | Read and write the one `localStorage` key; ignore bad stored values | `store` argument (default `localStorage`) | Stub `{getItem,setItem,removeItem}` object, no DOM |
| Dialog shell (`openSettings`) | Dialog lifecycle, placeholder fill, save/clear on `close` | Core, store, `fetchReceipt`, `document` | happy-dom page test |
| Popup shell (`generate`) | Open the tab synchronously, write loading line, write receipt or error | `window.open`, `fetchReceipt`, core, store | Page test with a recorder object returned by `window.open` |
| Injection shell (`makeControls`, `inject`, `main`) | Find order nodes, add controls once, keep up with pagination | `document`, `location`, `generate`, `openSettings` | happy-dom page test with a host-markup fixture |

### Data Flow

Direction is one-way: host page and storage in, HTML string out. Nothing flows back into AliExpress except the one `mtop.request`.

```
click ─► generate(orderId)
          ├─ window.open()                       (synchronous; popup-blocker rule)
          ├─ fetchReceipt(orderId, mtop) ─► d    (throws plain message on any failure)
          ├─ loadBuyer(store) ─► saved|null      (non-object ⇒ null)
          ├─ buyerFor(saved, d.deliveryAddress) ─► buyer
          └─ renderReceipt(d, buyer, new Date()) ─► html ─► popup document

gear ─► openSettings(orderId)
          ├─ settingsHTML(loadBuyer() || {}) ─► dialog
          ├─ fetchReceipt(...) ─► placeholders   (failure ignored on purpose)
          └─ on close: returnValue 'save'  ─► saveBuyer(settingsFromForm(FormData(form)))
                       returnValue 'clear' ─► saveBuyer(null)
                       other               ─► no change
```

## Patterns to Follow

### Pattern 1: Parameter with a production default
**What:** An impure input becomes the last parameter, defaulted to the real global. PR #4 already does this for `mtop`.
**When:** The clock, the storage, the request client. Not for `document` or `window`: a global DOM from the test registrar is simpler than threading `doc` through five functions.
**Example:**
```js
const pad = (n) => String(n).padStart(2, '0');
const localDate = (t) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; // not toISOString: that is UTC
function renderReceipt(d, buyer, now = new Date()) { /* ... ${localDate(now)} ... */ }

function loadBuyer(store = localStorage) {
  try {
    const v = JSON.parse(store.getItem(STORE_KEY));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null; // the requirement: not an object ⇒ ignore
  } catch (e) { return null; }
}
```
Also guard `off`: a stored `off` that is not an array makes `buyerFor` throw on `.includes`. Return `{ ...v, off: Array.isArray(v.off) ? v.off : [] }` in the same guard. This is the same bug class as the stated requirement and costs one line.

### Pattern 2: Load-time purity
**What:** The IIFE reads `window`, `document`, `localStorage` only inside functions. Constants and pure functions only at top level.
**When:** Always. It is what lets the test file `require()` the userscript before or after it registers a DOM.
**Guard:** One test that `require`s the file with no globals defined and asserts no throw (the existing test file already proves this by running).

### Pattern 3: Separate test files for separate global worlds
**What:** `aliexpress-invoice.test.js` stays DOM-free (Node-native `FormData`). A second file `aliexpress-invoice.page.test.js` registers happy-dom globals.
**Why it works:** `node --test` runs each file in its own process, so `GlobalRegistrator.register()` in one file cannot leak into the other. No `unregister` ceremony between files.
**Spike result (run on Node 26.12.1, happy-dom 21.0.4, `@happy-dom/global-registrator`, `--ignore-scripts`):**
- `:not([data-ali-invoice])` selectors, `dataset`, `new URL(a.href, location.href)`, `document.body.innerHTML`: work.
- `<dialog>` with `<form method="dialog">`: `showModal()` opens it, a click on `<button value="save">` closes it, sets `returnValue = 'save'` and fires `close`. `new FormData(form)` inside the handler returns the typed value and `getAll('off')` returns the ticked boxes. This is exactly what `openSettings` relies on.
- `localStorage`, `requestAnimationFrame`, `MutationObserver`, `window.open` exist as globals.
- Limit: happy-dom does not make the rest of the page inert for a modal. Tests prove our handler logic, not browser modality.

### Pattern 4: Host-markup fixture
**What:** Keep a trimmed HTML snippet of one order card and one order-detail status block in the page test (`.order-item > .order-item-header-right > a[href*="orderId=…"]`, `.order-status.order-block`). Fake ids and no personal data.
**Why:** It pins the selectors the script depends on and the idempotence rule (second `inject()` adds nothing). It cannot detect AliExpress changing its markup; that stays a manual check (see Pitfalls and the "controls missing once" note in PROJECT.md).

### Pattern 5: Property-style escaping test
**What:** Build the fixture by mapping every string leaf of `receipt` to a hostile marker such as `<x>&"'`, render, and assert the output contains no raw `<x>`. Template-own markup (the `<script>` auto-print tag) never contains `<x>`, so the check is exact.
**Why:** The requirement is "every printed response field". A hand-listed field check misses the next field someone adds. This catches it. Run it through `buyerFor` too, so `deliveryAddress` is covered.

### Pattern 6: Pin the VAT regex with a table
**What:** Export `buyerFromAddress` and test a table: `ACME BV BE0123456789`, VAT first, VAT last, lowercase (not matched, documented), an uppercase reference like `ORDER12345` (known false positive, pinned so a change is deliberate), name with no VAT, empty and `undefined` address.
**Why:** CONCERNS.md says the regex matches any uppercase token. The tests record today's behaviour; they do not change it.

## Anti-Patterns to Avoid

### Anti-Pattern 1: A hand-written fake `document`
**What:** A 40-line stub with `querySelectorAll` returning prepared arrays.
**Why bad:** It tests the stub. A typo in a selector string passes. `:not([data-ali-invoice])` idempotence, `FormData(form)` and dialog `returnValue` are exactly the behaviours worth testing, and they are the ones a stub fakes.
**Instead:** Real DOM implementation as a test-only package.

### Anti-Pattern 2: Splitting the file into modules or adding a bundler
**What:** `src/*.js` plus a build to produce the userscript.
**Why bad:** Breaks the one-click raw-file install and `@updateURL` from `main`; the PROJECT.md constraint rules it out. The file is 280 lines.
**Instead:** Sections inside the one IIFE, as now.

### Anti-Pattern 3: Threading `doc`, `win`, `loc` through every function
**What:** `inject(doc, loc)`, `generate(orderId, win, mtop, store)`.
**Why bad:** Production gains nothing, signatures grow, and the page tests still need a DOM for `createElement`.
**Instead:** Inject only what the test must control and cannot control through a global: clock and `mtop`/store for the no-DOM tests. For the page tests set `window.lib`, `window.open` and `localStorage` on the registered globals.

### Anti-Pattern 4: A `__test` export namespace or `if (TEST)` branches in production paths
**What:** Test hooks inside behaviour code.
**Why bad:** The code that runs in production is no longer the code tested.
**Instead:** Plain extra names in the existing `module.exports` list. They are inert in the browser, where `main()` runs instead.

### Anti-Pattern 5: Testing the date with the real clock or the CI timezone
**What:** `assert.equal(html.includes(new Date().toISOString().slice(0,10)))`, or a local-date test that passes in CI because CI runs in UTC.
**Why bad:** Passes against the old UTC bug when TZ is UTC.
**Instead:** `process.env.TZ = 'Europe/Brussels'` at the top of the test file (works at run time on Node 26; checked) and pass `now = new Date(2026, 10, 2, 0, 30)`. Old code prints `2026-11-01`, new code prints `2026-11-02`. Verified locally.

## Build Order (what the Active requirements imply)

Each merge to `main` is a release for installed copies. Order below keeps `main` shippable at every step and puts the safety net before the changes that need it.

| # | Step | Depends on | Touches | Version bump |
|---|------|-----------|---------|--------------|
| 1 | **Merge PR #4** (`fetchReceipt(orderId, mtop)`, plain error text, 11 tests). Gate: its live check on one completed order | none | script, tests, CONTEXT.md | 0.3.1 |
| 2 | **CI on every pull request**: `.github/workflows/test.yml`, `on: pull_request`, Node 26, `node --test`. Add `package.json` (`private: true`, `scripts.test`, `engines`) now so step 4 only adds a dependency | 1 (so the first CI run is green with 11 tests) | new files only | none |
| 3 | **No-DOM seams and their tests**: local date (`now` parameter, TZ-pinned test); `loadBuyer(store)` guard incl. `off`; export `buyerFromAddress`, `esc`, `loadBuyer`, `saveBuyer`; VAT table test; property-style escaping test | 2 (CI gates it), 1 (error text stable) | script, test file | 0.3.2 (behaviour change: date, guard) |
| 4 | **Page-test harness**: add `happy-dom` + `@happy-dom/global-registrator` as exact-pinned `devDependencies`, lockfile, `npm ci --ignore-scripts` in the workflow; export `inject`, `makeControls`, `openSettings`, `generate`; write `aliexpress-invoice.page.test.js`: injection (card, detail, idempotent re-run, no `orderId` ⇒ nothing), dialog save / clear / cancel through `loadBuyer`, `generate` opens the popup before the first await, writes the plain error on failure, popup blocked ⇒ alert | 3 (storage guard and `store` default settled), 1 (error text), 2 | script (exports only), new test file, workflow, package files | none (no behaviour change) |
| 5 | **Bug #2 closure** with evidence from a real new order | none for the code; needs a real new order and Andrei | issue, maybe CONTEXT.md | none, unless a fix follows |

Parallelism: step 5 is independent of 2-4 and waits for a real purchase. Steps 3 and 4 can be separate PRs; do not merge them, because step 3 changes behaviour and step 4 must not.

Why CI before the seams: the seam changes are the first edits made without the author eyeballing the browser. CI is cheap (one file, zero install until step 4).

Why the harness last of the code steps: its assertions (error text, storage guard, export names) would otherwise be rewritten once PR #4 or step 3 lands.

## Decision needed from Andrei (blocks step 4 only)

**Is a test-only `devDependency` (happy-dom) acceptable?** PROJECT.md bars runtime dependencies and notes "no test framework dependency so far". A dev dependency is not barred, but it adds `package.json`, a lockfile, `npm ci` in CI and an update burden.

- Recommended: accept it. Exact pin, `--ignore-scripts`, test job only, never installed by users. Spike shows it covers every page behaviour in the requirement.
- If declined: steps 1-3 stay as written. Step 4 shrinks to what needs no DOM: extract the `close` handler body into a function `settle(returnValue, formData, store)` and test save / clear / cancel with Node's `FormData` and a stub store; `generate` with a recorder popup. `inject` and `makeControls` stay checked by hand in DevTools (the README dev loop). Requirement "tests cover control injection" would then be unmet; say so in the roadmap.
- If no answer: take the recommended path, because the fallback leaves a stated requirement unmet.

## Scalability Considerations

Not a service; the axis is project size, not users.

| Concern | Today (280 lines) | If it passes ~600 lines | If a second page or shop is added |
|---------|-------------------|-------------------------|-----------------------------------|
| File structure | Sections in one IIFE | Still one file; sections are enough | Out of scope in PROJECT.md. Revisit the build-step rule then |
| Export list | ~15 names | Group by section in one object literal | n/a |
| Test files | 2 (pure, page) | Split by global world, not by function | n/a |
| Host drift | Manual DevTools check after each AliExpress change | Keep the fixture as the record of the last known markup | n/a |

## Pitfalls specific to this architecture

- **A passing page test is not proof the live page works.** The fixture is a snapshot. Keep the manual live check on one order before releases that touch `inject`.
- **Do not register happy-dom globals in `aliexpress-invoice.test.js`.** It would swap Node's `FormData` under the existing tests and mix two worlds.
- **Export drift.** A function added to the IIFE and not to `module.exports` is silently untestable. The codebase map already warns about this; a one-line test that `Object.keys(require(...))` contains the expected names makes it loud.
- **Do not let tests run `main()`.** Under `require`, `module.exports` exists so `main()` never runs; the MutationObserver is only reachable by exporting `main`. Export it only if a pagination test is wanted; it is not in the Active list.
- **The `off` field.** The stated guard ("not an object") leaves `off` as a non-array unguarded. Include it in step 3.

## Sources

- `/Users/andrei/Developer/.worktrees/aliexpress-invoice/night-gsd-standard/aliexpress-invoice.user.js` and `.../aliexpress-invoice.test.js` (read in full, 2026-11-01) - HIGH
- `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `TESTING.md`, `CONCERNS.md` - HIGH
- PR #4 diff (`fix/receipt-errors`), via `git diff main...origin/fix/receipt-errors` - HIGH
- Local spike, Node 26.12.1 + `happy-dom@21.0.4` + `@happy-dom/global-registrator` (npm `latest`, modified 2026-10-20, engines node >=20): selector, `dataset`, `<dialog>` + `method="dialog"` + `FormData`, `localStorage`, `requestAnimationFrame`, `MutationObserver` all behaved as the script needs. Spike files deleted - HIGH for this version, MEDIUM going forward
- Local check: `process.env.TZ` set at run time changes `Date` local fields on Node 26; `new Date(2026,10,2,0,30)` gives `toISOString().slice(0,10)` = `2026-11-01` in `Europe/Brussels` - HIGH
- happy-dom `HTMLDialogElement` source (unpkg, v14.11.0 and v17.1.4) - `close(returnValue)` fires `close` only if open; `showModal()` only sets `open`; no modal inertness - MEDIUM (web search digest; the spike confirms the `method="dialog"` path on 21.0.4)
- `jsdom@30.1.3` exists (engines `^22.22.2 || ^24.15.0 || >=26.0.0`); its `<dialog>` `showModal` support was not verified, so it is not recommended - LOW
