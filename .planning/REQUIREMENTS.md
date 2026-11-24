# Requirements: AliExpress Invoice

**Defined:** 2026-11-01
**Core Value:** One click on an AliExpress order gives a printable purchase receipt with a correct buyer block and
the included VAT, made only from what AliExpress reports.

## v1 Requirements

Requirements for the next releases (0.3.x). Each maps to a roadmap phase. Sources: ERR comes from issue #2 and
PR #4. RCPT, BUY, QA and CI come from the codebase map (`.planning/codebase/CONCERNS.md`) and the research
(`.planning/research/SUMMARY.md`); no issue is filed for them yet, and Andrei confirms or drops them (PROJECT.md,
Key Decisions).

### Receipt errors

- [ ] **ERR-01**: When AliExpress returns no receipt data, the receipt tab shows one plain message with the advice
  to try again later, followed by AliExpress' code (PR #4)
- [ ] **ERR-02**: On a page without `lib.mtop`, the receipt tab tells the user to open an order page and reload it
  (PR #4)
- [ ] **ERR-03**: The real failure of a fresh order is captured at the next new order and recorded in issue #2: the
  receipt tab text with its code, the order status, the minutes since checkout, and the first time the click works
- [ ] **ERR-04**: Issue #2 closes on that evidence: a distinct "not ready" code gets its own message and test, or the
  evidence shows that the plain message of ERR-01 covers the case

### Receipt content

- [ ] **RCPT-01**: The "Generated … on" date on the receipt is the user's local date, also in the first hours after
  local midnight (a test pinned to `Europe/Brussels` fails on the old UTC line)
- [ ] **RCPT-02**: A contact name that holds a VAT number is split into the name and a VAT line, and a contact name
  without one keeps its full text — pinned by a must-match and must-not-match test table. The accepted country
  prefixes (EU list, `EL`, `XI`, `GB` kept or dropped) follow Andrei's decision
- [ ] **RCPT-03**: Every response value printed on the receipt is HTML-escaped, proven by a test that puts HTML
  characters into every string field of the receipt data

### Buyer details

- [ ] **BUY-01**: Stored buyer details that are not an object, or that hold a malformed Leave off list, are ignored
  field by field, so the receipt falls back to the order values; details saved by 0.2.0 and 0.3.0 still load
  unchanged

### Page tests

- [ ] **QA-01**: Tests show that the controls appear once on an orders-list fixture and once on an order-page
  fixture, also when injection runs again
- [ ] **QA-02**: Tests show that the buyer-details dialog stores the trimmed details on Save, clears them on Use
  delivery address, and changes nothing on Cancel
- [ ] **QA-03**: Tests show that Generate invoice opens the receipt tab before the request, writes a failed request
  into that tab, and alerts when the popup is blocked

### CI and release

- [ ] **CI-01**: Every pull request and every push to `main` runs `node --test` on Node 26 in GitHub Actions
- [ ] **CI-02**: CI fails when the install contract changes: file path, `@name`, `@namespace`, `@updateURL`,
  `@downloadURL`, `@match` or `@grant none`
- [ ] **CI-03**: CI fails a pull request that changes the script without a higher `@version`

## v2 Requirements

Deferred. Tracked, not in the current roadmap.

### Receipt content

- **RCPT-V2-01**: A receipt for an order without a reported VAT amount says "AliExpress reported no VAT amount for
  this order" instead of leaving the VAT row out
- **RCPT-V2-02**: VAT detection accepts a label (`VAT`, `BTW`, `TVA`), separators (`BE 0123.456.789`) and a
  lowercase prefix
- **RCPT-V2-03**: A Belgian VAT number passes its modulo-97 check before it moves to the VAT line

### Robustness and release

- **ROB-V2-01**: The page selectors live in one constant block, and the script logs one console warning when an
  order page has no order card or no `lib.mtop`
- **ROB-V2-02**: Each version has one line in a changelog
- **ROB-V2-03**: Dependabot keeps the pinned GitHub Actions current

## Out of Scope

| Feature | Reason |
|---------|--------|
| Seller-issued or tax-compliant invoice | The document is a purchase receipt from order data (CONTEXT.md) |
| Computed VAT | The receipt prints only the amount AliExpress reports; computing it breaks the Core Value |
| Reading or sending tokens or signatures | The page's own `lib.mtop` signs every request |
| Auto-retry or polling of the receipt request | Hides the evidence bug #2 needs and repeats a signed request |
| An error message that guesses a cause | The real failure code is not captured yet |
| Live VIES lookup, checksum validation for every country | Network calls and per-country rules nobody asked for |
| A build step, a bundler or runtime dependencies | The project is one userscript file |
| Storage outside the browser, telemetry | Buyer details stay in `localStorage` for aliexpress.com |
| An error text inside the gear's dialog | PR #4 keeps the 0.3.0 behaviour: generic placeholders when the request fails |
| Other AliExpress pages or other shops | The script matches the order pages only |
| Batch export, file output other than print, invoice numbering, per-order buyer profiles | Nobody asked for them |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ERR-01 | Phase 1 | Pending |
| ERR-02 | Phase 1 | Pending |
| ERR-03 | Phase 5 | Pending |
| ERR-04 | Phase 5 | Pending |
| RCPT-01 | Phase 3 | Pending |
| RCPT-02 | Phase 3 | Pending |
| RCPT-03 | Phase 3 | Pending |
| BUY-01 | Phase 3 | Pending |
| QA-01 | Phase 4 | Pending |
| QA-02 | Phase 4 | Pending |
| QA-03 | Phase 4 | Pending |
| CI-01 | Phase 2 | Pending |
| CI-02 | Phase 2 | Pending |
| CI-03 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-11-01*
*Last updated: 2026-11-01 after roadmap creation*
