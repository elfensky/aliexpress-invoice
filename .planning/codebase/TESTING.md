---
last_mapped_commit: 9989513756f0f2812e4dc65bc89820d256e691e6
last_mapped_at: 2026-11-01
---
# Testing Patterns

**Analysis Date:** 2026-11-01

## Test Framework

**Runner:**
- Node.js built-in test runner, `node:test`. No third-party test framework.
- Node version in use on the development machine: v26.12.1. The test file needs a runtime with the global `FormData` (Node 18 or later).
- Config: none. The runner needs no config file.

**Assertion Library:**
- `node:assert/strict`, imported as `assert`. Use `assert.equal`, `assert.deepEqual`, `assert.ok`. The strict variant makes `equal` behave like `strictEqual`.

**Run Commands:**
```bash
node --test                          # Run all tests (the documented command, from README.md)
node --test aliexpress-invoice.test.js  # Run the single test file explicitly
```
- No watch mode is configured. Use `node --test --watch` if needed; it is a runner flag, not a repo script.
- No coverage command is configured.
- No `package.json` exists, so there is no `npm test` script.

## Test File Organization

**Location:**
- One test file at the repo root, co-located with the script it tests: `aliexpress-invoice.test.js` next to `aliexpress-invoice.user.js`.

**Naming:**
- `<script-basename>.test.js`.

**Structure:**
```
aliexpress-invoice.user.js       # the userscript; exports pure helpers when loaded as a module
aliexpress-invoice.test.js       # the self-check; requires the script directly
```

No `tests/` or `__tests__/` directory exists. A second test file should follow the same pattern: co-locate it at the root with a `.test.js` suffix, or ask first before creating a directory.

## What the Tests Cover

The test file has eight tests. They cover only the pure parts of the script. The page-injection and network code are not tested.

| Area | Function under test | Tests |
|------|--------------------|-------|
| Order values | `buyerFor` (via `buyerFromAddress`) | VAT split from contact name; plain name; saved value over order value; Leave off; 0.2.0 saves without marks |
| Settings form | `settingsFromForm` | trim, marks kept, empty form returns `null` |
| Receipt | `renderReceipt` | buyer, amounts, VAT line, HTML escaping, absent keys skipped |
| Dialog markup | `settingsHTML` | dialog label id, `data-1p-ignore` count, escaped values, placeholders, checkbox ticks |

Not covered: `fetchReceipt` (network), `generate` (popup), `openSettings` (DOM dialog behavior), `inject` / `makeControls` / `main` (page injection), `loadBuyer` / `saveBuyer` (localStorage), and the CSS strings.

## Test Structure

**Suite Organization:**
- No `describe` blocks. Each `test(...)` call is a top-level test.
- Test titles are full sentences that state the behavior and the rule. Examples:
  - `'buyerFor: a saved value replaces the order value, an empty one keeps it, and Leave off prints nothing'`
  - `'settingsFromForm trims the fields, keeps the Leave off marks, and returns null for an empty form'`
- Titles name the function under test first, so a failure reads as a rule.

**Pattern:**
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buyerFor, settingsFromForm, renderReceipt, settingsHTML } = require('./aliexpress-invoice.user.js');

test('buyerFor without buyer details uses the order values and splits the VAT number out of the contact name', () => {
  const b = buyerFor(null, receipt.deliveryAddress);
  assert.equal(b.name, 'ACME BV');
  assert.equal(b.vat, 'BE0123456789');
  // ...
});
```

**Patterns:**
- Arrange: build the input inline or reuse a shared fixture (see Fixtures).
- Act: call one exported function.
- Assert: one behavior per test, with several `assert` lines when the result is an object. Use the third argument of `assert.equal` or `assert.ok` as the failure message when a check is not obvious:
  ```js
  assert.equal(buyerFor({ name: 'Other BV', off: ['name'] }, receipt.deliveryAddress).name, '', 'Leave off wins over a saved value');
  assert.ok(!html.includes('Discount'), 'absent keys must not render');
  ```
- Prefer `assert.deepEqual` for whole objects and arrays. Prefer `assert.equal` for one value.
- Use a loop with a message for a list of expected substrings: `for (const s of [...]) assert.ok(html.includes(s), 'missing: ' + s);`.

**Setup and teardown:**
- None. The functions are pure, so no test needs setup or cleanup.
- The test file does not touch `localStorage`, `document`, or `window`.

## Fixtures and Factories

**Shared receipt fixture:**
- A module-level `const receipt` at the top of the test file. It is a trimmed copy of the response shape of `mtop.global.finance.taxation.invoice.queryOrderReceiptInfo`, read from `data.data`. Comment above it says so:
  ```js
  // Trimmed shape of mtop.global.finance.taxation.invoice.queryOrderReceiptInfo → data.data
  const receipt = { orderId: '3000000000000001', ..., deliveryAddress: { contactName: 'ACME BV BE0123456789', ... }, subOrders: [...] };
  ```
- The fixture uses fake data: order id `3000000000000001`, the VAT number `BE0123456789`, `Example street 1`, `+32 400000000`. Keep real customer data out of fixtures.
- Include HTML-special characters in the fixture when a test checks escaping (the item title `Widget <b>PCIe</b>`).

**FormData helper:**
- A local helper `form(o)` builds a `FormData` from a plain object. Array values become repeated keys, which models checkbox groups:
  ```js
  const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [].concat(v)) f.append(k, x); return f; };
  settingsFromForm(form({ name: ' ACME BV ', vat: '', address: 'Street 1\n', extra: '', off: ['extra', 'vat'] }));
  ```

**Inline fixtures:**
- Small inputs are written inline: `buyerFor(null, { contactName: 'Jane Doe' })`.
- Saved buyer details are written inline as the 0.2.0 or 0.3.0 storage shape, for example `{ name: 'Other BV', vat: '', address: '', extra: '' }`.

**Location:**
- All fixtures live in `aliexpress-invoice.test.js`. There is no fixture directory.

## Mocking

**Framework:** None. The test file does not use `node:test` mocks (`mock.fn`, `mock.method`).

**Patterns:**
- Not needed. The tested functions take their inputs as arguments and return strings or objects. The test file uses the real `FormData` global.
- If a test must touch the page globals, provide them on `globalThis` before the call and restore them after. No test does this today.

**What to Mock:**
- If a future test covers `fetchReceipt`, mock `window.lib.mtop.request` by defining `globalThis.window = { lib: { mtop: { request: async () => ({ data: { data: receipt } }) } } }`. Restore `globalThis.window` in a `finally` block.
- If a future test covers `loadBuyer` or `saveBuyer`, mock `localStorage` with a plain object that has `getItem`, `setItem`, and `removeItem`.

**What NOT to Mock:**
- The pure functions. Test `buyerFor`, `settingsFromForm`, `renderReceipt`, and `settingsHTML` with real inputs.
- `FormData`. It is available in Node and the tests already use it.

## Assertions on Generated Markup

The tests check generated HTML by substring, not by parsing the DOM:

```js
assert.ok(html.includes('id="ali-invoice-dialog-title"'));
assert.equal((html.match(/data-1p-ignore/g) || []).length, 4);
assert.ok(html.includes('value="A &quot;quoted&quot; &lt;name&gt;"'));
```

- Count occurrences with `(html.match(/pattern/g) || []).length`. The `|| []` guards a zero match.
- Check escaping by looking for the escaped form (`&lt;`, `&quot;`) and by checking the unescaped form is absent when needed.
- Keep the substrings exact, including attribute order. If the markup changes, update the expected substring in the same commit.

## Coverage

**Requirements:** None enforced. No coverage tool is configured, and no threshold exists.

**View Coverage:**
```bash
node --test --experimental-test-coverage aliexpress-invoice.test.js
```
- This is a Node runner flag. It is not a repo script.

## Test Types

**Unit Tests:**
- All eight tests are unit tests of pure functions in the userscript.

**Integration Tests:**
- None. Nothing runs the script in a browser.

**E2E Tests:**
- Not used. The manual check is described in `README.md`: set `AUTO_PRINT` to `false`, paste the script into the DevTools console on an orders page, and inspect the receipt tab.

## Manual Verification

- For changes to page injection, dialog behavior, or the popup, verify in a browser. The README documents the manual loop.
- Use `AUTO_PRINT = false` while you inspect the receipt. Set it back to `true` before you ship. `AUTO_PRINT` is a constant at the top of `aliexpress-invoice.user.js` (line 20).

## Common Patterns

**Adding a test for a new buyer rule:**
```js
test('buyerFor <new rule in one sentence>', () => {
  assert.deepEqual(
    buyerFor({ /* saved buyer */ }, receipt.deliveryAddress),
    { name: '...', vat: '...', address: '...', extra: '...' },
  );
});
```
- Put the new test next to the existing `buyerFor` tests.
- Use the `receipt.deliveryAddress` fixture.

**Adding a test for a new amount row:**
- Add the key and label to `TOTAL_ROWS` in the script. Then add the key and a formatted value to the `receipt` fixture and to the substring list in the `renderReceipt` test.

**Async Testing:**
- Not used. The tested functions are synchronous. If an async test is needed, declare the callback `async` and `await` the call. `node:test` waits for the returned promise.

**Error Testing:**
- Test the absence of output, not a thrown error. Examples: `settingsFromForm` returns `null` for an empty form (`assert.equal(..., null)`), and `renderReceipt` omits absent keys (`assert.ok(!html.includes('Discount'))`).
- No existing test checks a thrown error. If one is added, use `assert.throws(() => fn(), /message/)`.

**Test Data Rules:**
- Use the `€` format and the Belgian VAT pattern (`BE` followed by digits) in fixtures. These match the real AliExpress data the script handles.
- Use plain ASCII for names and addresses in fixtures, except where the test checks a special character.

## Adding a Test

1. Add a `test('<function> <behavior in one sentence>', () => { ... })` call at the bottom of `aliexpress-invoice.test.js`, or next to the tests for the same function.
2. Export the function from the module's export guard if it is not exported yet. Keep the export list short; export only what tests need.
3. Run `node --test` and confirm the new test passes and the other eight still pass.
4. If the change adds non-trivial logic (a branch, a loop, a parser), a test is required, not optional.

---

*Testing analysis: 2026-11-01*
