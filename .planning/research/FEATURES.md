# Feature Research

**Domain:** Browser userscript that turns a shop's order data into a printable purchase receipt (AliExpress, Tampermonkey/Violentmonkey)
**Researched:** 2026-11-01
**Confidence:** MEDIUM (error-UX and VAT-format claims are cross-checked on 2-3 sources; no source describes userscript-specific "upstream not ready" UX, so that part is derived from the code, bug #2 and general error-message guidance)

Scope: only the Active requirements in `.planning/PROJECT.md`. Out-of-scope items (tax-compliant invoice, tokens, build step, server storage, other shops, batch export, numbering, per-order profiles, error text in the gear dialog) are not proposed.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these makes the script feel broken or untrustworthy to a buyer who hands the PDF to an accountant.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| One plain error message when AliExpress returns no receipt data, showing AliExpress' own code verbatim | A silent blank tab or a raw `Unexpected receipt response: ["FAIL_..."]` dump reads as "script is broken". The code is the only handle for a bug report and for closing #2. | LOW | Already the shape of PR #4. Print the code escaped (`esc`). Show order id, one sentence, the code. No claimed cause (decision in PROJECT.md). Lives in the receipt tab, because the tab opens synchronously in the click handler (pop-up blocker). |
| Separate message when the page has no `lib.mtop` | Different cause, different fix: the user is on the wrong page, signed out, or AliExpress renamed the client. One shared "failed" text hides that. | LOW | Today `fetchReceipt` throws a developer-style string. Give it its own plain sentence ("This page does not offer AliExpress' request client. Reload the order page, or check for a script update."). Keep it distinct from the response-error text so tests can tell them apart. |
| The user can retry without loss | Error pages in print/receipt tools leave retry to the user: WCPOS documents "no automatic retry, use the manual action" for print and receipt-delivery errors. One click on the same button is the retry. | LOW | The message says "close this tab and click Generate invoice again". No new control needed. Buyer details are in `localStorage`, so nothing is lost. |
| Error text is escaped and survives odd codes | The code comes from a remote response and goes into `innerHTML`. | LOW | Already `esc`. Pin it in a test with a code containing `<`, `&`, quotes. |
| Receipt date is the local date, also just after local midnight | A Belgian user at 00:30 gets yesterday's date with `toISOString()`. An accountant files by date. | LOW | Build `YYYY-MM-DD` from `getFullYear/getMonth/getDate` (no locale dependence). `toLocaleDateString('en-CA')` also works but depends on the ICU locale data in the browser. Test with a fixed `Date` near midnight, in a non-UTC `TZ`. |
| VAT-number detection with a country list and per-country shape, not "any 2 capitals + 8-12 alphanumerics" | A name such as `ACME AB12345678` is moved to a VAT line today. A wrong VAT number on a document for an accountant is worse than no VAT number. | MEDIUM | See "VAT detection" below. Replace the regex by an allow-list of country prefixes with per-country length/shape. |
| Tests that pin VAT detection: both "must match" and "must not match" tables | The regex is the most failure-prone pure function. A table test is the cheapest guard. | LOW | `node:test`, one table per direction. Cases listed below. |
| Tests that pin the escaping of every printed response field | Receipt HTML is built by string templates; one future unescaped interpolation is an injection into the receipt tab. | LOW-MEDIUM | See "Escaping test" below. |
| Stored buyer details that are not a plain object are ignored | `JSON.parse('5')`, `'null'`, `'[]'`, `'"x"'` pass `loadBuyer` today. A hand-edited or corrupted entry must not throw on every receipt and gear click. | LOW | `loadBuyer` returns `null` unless `typeof v === 'object' && v && !Array.isArray(v)`. Test each shape. Fields inside the object that are not strings (e.g. `{"name": 5}`) are the next edge; decide in the same change. |
| Tests for page code (control injection, dialog save and clear) | Injection and the dialog save path are the code that breaks when AliExpress changes layout. 0.3.0 tests cover none of it. | MEDIUM-HIGH | No runtime dependency allowed. A dev-only DOM fixture is the open question for the stack researcher (`jsdom` as dev dependency vs. a minimal DOM stub). Keep it out of the shipped file. |
| CI runs `node --test` on every pull request | Distribution is "every merge to `main` is a release"; a red test must block it. | LOW | One workflow file, Node 26 (current LTS line per the user's runtime rule). No `package.json` needed for `node --test`; adding one for `engines` is optional. |

### Differentiators (Competitive Advantage)

Existing AliExpress receipt tools (AliVAT, AliBill, Alivoice and similar extensions; the "Aliexpress Invoice Downloader" userscript) compete on bulk export, ZIP, credit notes and translations. They are silent on failure behaviour in their listings. This project's edge is "made only from what AliExpress reports" plus a trustworthy buyer block, so the differentiators below sit in honesty and safety, not in more output.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| A "not ready yet" hint, shown only when evidence supports it | A new order can take minutes. If the code from a real new order is known (from #2), the message can say "AliExpress has no receipt data for this order yet. Try again in a few minutes." instead of a generic failure. | LOW (after evidence) | Gate on the captured code, not on a guess. Until #2 yields the code, keep the neutral message. Never match on the human message text AliExpress returns (it can be localised); match on the code token. |
| Closing #2 with a captured trace in the issue | Turns a maybe-timing bug into a documented behaviour: code, time since checkout, success time. Lets the hint above be exact. | LOW (effort is waiting for a real new order) | Evidence is a data task, not code. Needs a new order; blocked on the calendar, not the repo. Dependency for the hint. |
| Pre-built "must-not-match" corpus for VAT detection | Few receipt tools publish what they refuse to treat as a VAT number. A table in the test file documents the limits and stops regressions. | LOW | Same test as the table-stakes item; the value is the explicit negative list. |
| VAT label stripping (`VAT`, `BTW`, `TVA`, `MwSt`, `USt-IdNr`, `NIF`, `IVA`) before the number | Belgian and Dutch contact names often read `ACME BV BTW BE0123.456.789` or `ACME BV VAT: BE0123456789`. The current code removes only the token and leaves `ACME BV VAT:` in the name (derived from the regex: it replaces the matched text only). | LOW-MEDIUM | Optional label group in the same pattern. Test with and without colon. Skip languages not seen in real names. |
| Separator-tolerant matching (`BE 0123.456.789`, `NL 123456789 B01`), output normalised to the compact form | Belgium prints VAT as `BE 0123.456.789` or `BE0123.456.789`; the current pattern misses both (verified by running the pattern). Normalising also makes the receipt line uniform. | MEDIUM | Strip spaces, dots, dashes inside a candidate that starts with a country prefix, then validate the compact form. Risk: eating a real separator in a name. Limit to digit groups after a valid prefix. |
| Case-insensitive prefix (`be0123456789`) | People type lowercase; the current pattern ignores it (verified). | LOW | Uppercase on output. Raises false-positive risk slightly, which the per-country shape check offsets. |
| Per-field escaping test that walks the fixture | Instead of one `<b>` in one title (today), replace each string field in turn with a poison value and assert it never appears raw. A new unescaped field then fails by itself. | LOW-MEDIUM | Poison: `<img src=x onerror=1>&"'`. Walk `d`, `d.paymentInfo`, `d.subOrders[*]`, `d.deliveryAddress` and the buyer object. Also assert the error-tab text. |
| Belgian modulo-97 check as a tie-breaker | `BE` numbers carry a check (last 2 digits = 97 minus first 8 digits mod 97). It removes false positives for the user's own country. | LOW | Not verified in this session (domain knowledge, MEDIUM). Use only to reject a `BE` candidate that fails, never to rewrite. Cheap, but one more branch to test. Defer if the format table already covers the cases. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Automatic retry or polling until the receipt data appears | "A new order is not ready, so wait for it." | Hides the evidence #2 needs (first failure, code, timing). Loops against a signed endpoint that AliExpress may rate-limit or flag. Needs timers in a tab the user may close. Competing tools leave retry to the user. | One plain message, user clicks again. Add a hint only when the captured code proves "not ready". |
| Guessing a cause in the message ("your order is too new") | Sounds helpful. | Wrong guess misleads: the same failure can be sign-out, a renamed endpoint or a region block. PROJECT.md already decided on "claims no cause". | Show the AliExpress code and a neutral next step. |
| Computing VAT when AliExpress says only "VAT included" | AliVAT labels a standard-rate calculation for such cases. Users want a VAT line always. | Breaks the Core Value ("only what AliExpress reports"). An invented amount on an accounting document is a liability. | Print `includedTaxDisplay` when present, otherwise leave the row off. |
| Live VIES validation of the detected VAT number | "Prove the number is real." | Needs a network call to a third party from the AliExpress origin (CORS, privacy, an outage becomes a script error). Format checks only show a number could exist; only VIES shows it is registered. | Format and shape only. State the limit in the README: detection is by shape, the gear dialog overrides it. |
| Full checksum validation for all 27 countries | "A VAT number should be valid." | Large table to maintain; a typo in the buyer's own number would then be dropped from the VAT line instead of printed. Detection is a name-parsing aid, not a validator. | Shape per country; optional BE check only. |
| Stripping any unknown token that "looks like" an ID | Catches more VAT numbers. | This is today's bug: capitals plus digits in a name (`SHOP XX1234567`-style, `ACME AB12345678`) move to a VAT line. | Country allow-list; an unrecognised token stays in the name. The user can type the VAT in the gear dialog. |
| Showing the error inside the gear dialog | Dialog placeholders fall back silently when the request fails. | Out of scope: PR #4 keeps the 0.3.0 behaviour. | Keep generic placeholders. |
| A real DOM-test framework or build step for page tests | "Proper test setup." | Violates "no build step, no runtime dependencies". | Dev-only test helper; nothing ships in the `.user.js`. |
| Bulk "download all visible orders" like the Invoice Downloader userscript | Common ask in the category. | Out of scope; also multiplies the not-ready failure by N requests. | None. |
| Telemetry or a remote error report | "Know when AliExpress changes." | Server storage is out of scope; sends order data off the machine. | A `console.warn` with the code, and the code in the visible message so the user can paste it into an issue. |

## VAT detection: formats and limits

Formats (Wikipedia and Avalara agree; both MEDIUM, neither is the Commission):

| Country | Prefix | Shape after prefix |
|---------|--------|--------------------|
| Austria | AT | `U` + 8 digits |
| Belgium | BE | 10 digits (9-digit numbers get a leading 0) |
| Bulgaria | BG | 9 or 10 digits |
| Croatia | HR | 11 digits |
| Cyprus | CY | 8 digits + 1 letter |
| Czech Republic | CZ | 8, 9 or 10 digits |
| Denmark | DK | 8 digits |
| Estonia | EE | 9 digits |
| Finland | FI | 8 digits |
| France | FR | 2 key characters (digits, or letters except O and I) + 9 digits |
| Germany | DE | 9 digits |
| Greece | **EL** (not GR) | 9 digits |
| Hungary | HU | 8 digits |
| Ireland | IE | 7 digits + 1-2 letters; older style has a letter, `+` or `*` in position 2 |
| Italy | IT | 11 digits |
| Latvia | LV | 11 digits |
| Lithuania | LT | 9 or 12 digits |
| Luxembourg | LU | 8 digits |
| Malta | MT | 8 digits |
| Netherlands | NL | 9 digits + `B` + 2 digits (`B02` is used for VAT groups) |
| Poland | PL | 10 digits |
| Portugal | PT | 9 digits |
| Romania | RO | **2 to 10** digits |
| Slovakia | SK | 10 digits |
| Slovenia | SI | 8 digits |
| Spain | ES | 9 characters: letter+7 digits+letter, letter+8 digits, or 8 digits+letter |
| Sweden | SE | 12 digits (usually ends in 01) |
| Northern Ireland | **XI** | 9 or 12 digits (goods trade with the EU; not an EU member prefix) |

What the current pattern `\b[A-Z]{2}(?=[0-9A-Z]*\d)[0-9A-Z]{8,12}\b` does, checked by running it (Node, 2026-11-01):

| Input | Result | Verdict |
|-------|--------|---------|
| `ACME BV BE0123456789`, `ACME ATU12345678`, `NL123456789B01`, `ES12345678Z`, `EL123456789`, `XI123456789`, `FRAB123456789`, trailing `BE0123456789.` | matched | correct |
| `ACME AB12345678`, `ACME ID1234567890` (no such EU country) | matched | **false positive** |
| `BE 0123.456.789`, `BE0123.456.789`, `ACME be0123456789` | no match | **false negative** |
| `RO123456` (valid short Romanian number) | no match | **false negative** |
| `ACME BV VAT: BE0123456789` | matched; name keeps `VAT:` | **dangling label** (derived from the replace logic) |
| `SHOP XX1234567` | no match (only 7 chars after prefix) | correct, but only by length accident |

Test cases the requirement should name:

- Must match (compact form out): `BE0123456789`, `BE 0123.456.789`, `be0123456789`, `NL123456789B01`, `ATU12345678`, `EL123456789`, `RO12`, `RO1234567890`, `ES12345678Z`, `ESX1234567Z`, `IE1234567WA`, `FRAB123456789`, `XI123456789`, `SE123456789001`, `CZ12345678`.
- Must not match: `ACME AB12345678` (no such prefix), `ID1234567890`, `GR123456789` (Greece uses `EL`), a bare 10-digit number with no prefix, an order id, a phone number, `BE01234` (too short), a company name made of capitals only (`IBM`, `SAP SE`), a model code such as `RTX4090`, `BE0123456789X1` (trailing junk, no boundary).
- Name cleanup: `ACME BV BE0123456789` gives `ACME BV`; VAT first (`BE0123456789 ACME BV`) gives `ACME BV`; two spaces collapse; name that is only a VAT number gives an empty name.
- Two candidates in one name: the first valid one is the VAT number; the rest stays in the name. State the rule in the test.

Detection limits to state in README/CONTEXT:

- Detection by shape cannot tell that a number is registered, or that it belongs to the buyer. Only VIES can show registration (a live lookup is an anti-feature here).
- A reference code that has a valid prefix and a valid shape cannot be told apart from a VAT number. The fallback is the gear dialog, where a typed value replaces the order value.
- Non-EU tax IDs (GB `GB123456789`, Swiss `CHE-123.456.789 MWST`, Norwegian `NO123456785MVA`) are outside the EU list. The current pattern accepts `GB`; dropping it is a visible change, so name it in the requirement (keep or drop).

## Feature Dependencies

```
Bug #2 evidence (real new order, captured code)
    └──enables──> "Not ready yet" hint (code-gated)

Own message for missing lib.mtop ──requires──> fetchReceipt as the one place that gets receipt data (PR #4)
Plain error with AliExpress code ──requires──> fetchReceipt as the one place that gets receipt data (PR #4)
    └──requires──> escaping of the code (esc) ──pinned by──> per-field escaping test

VAT per-country detection ──requires──> country shape table
    └──enhanced by──> label stripping, separator tolerance, case-insensitive prefix
    └──pinned by──> must-match / must-not-match table test

Ignore non-object stored details ──requires──> loadBuyer returns null on bad shape
    └──pinned by──> unit test for each bad shape (also protects buyerFor and settingsHTML)

Page-code tests (injection, dialog save/clear) ──requires──> a DOM stand-in (dev-only) and the testable-export seam (already present)
CI on every pull request ──requires──> tests exist; ──enhanced by──> page-code tests (more to protect)

Local date ──independent──> (one function; test with a fixed Date and TZ)
```

### Dependency Notes

- **Both error messages require PR #4:** `fetchReceipt(orderId, mtop)` is the single place that decides "no client" versus "no data". Merge it first (its open check is a live run on one completed order).
- **The hint requires #2 evidence:** without a captured code, any "try again later" text is a guess and violates the "claims no cause" decision.
- **Detection hardening and its tests are one change:** the table test is the specification of the new pattern, so write the tests first.
- **CI is cheapest first:** a CI workflow with the current 11 tests is useful at once and gains value as page tests land. Put it early so later phases run under it.
- **Page-code tests conflict with "no dependencies"** only if the DOM stand-in ships. Keep it dev-only.

## MVP Definition

### Launch With (this milestone)

- [ ] Plain error with AliExpress code, separate no-`lib.mtop` message (PR #4 merged after the live check) — table stakes, already built
- [ ] Local date on the receipt, with a near-midnight test — one-line fix
- [ ] Non-object stored buyer details ignored, with tests — one-line fix
- [ ] VAT detection by country shape with must-match and must-not-match tests — the largest correctness risk
- [ ] Per-field escaping test (poison walk) and an escaped-error-code test
- [ ] CI running `node --test` on every pull request
- [ ] Page-code tests for injection and dialog save and clear
- [ ] Bug #2 closed with evidence from a real new order

### Add After Validation (v1.x)

- [ ] "Not ready yet" hint — once the code from a real new order is captured
- [ ] Label stripping, separator tolerance, lowercase prefix — after the base shape table is in and green
- [ ] Belgian check-digit tie-breaker — only if real names show collisions

### Future Consideration (v2+)

- [ ] Non-EU tax ID formats (CH, NO, GB) — only if a user asks
- [ ] A visible console warning when the injection selectors are missing (listed in CONCERNS.md; not in the Active set)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Plain error with code + own no-`lib.mtop` message | HIGH | LOW | P1 |
| CI on every pull request | HIGH | LOW | P1 |
| VAT detection by country shape + test tables | HIGH | MEDIUM | P1 |
| Per-field escaping test | HIGH | LOW-MEDIUM | P1 |
| Local date | MEDIUM | LOW | P1 |
| Ignore non-object stored details | MEDIUM | LOW | P1 |
| Page-code tests | MEDIUM | MEDIUM-HIGH | P2 |
| Bug #2 closed with evidence | HIGH | LOW (waits on a real order) | P1 |
| "Not ready yet" hint | MEDIUM | LOW | P2 (blocked on #2) |
| Label stripping, separator tolerance, lowercase | MEDIUM | MEDIUM | P2 |
| Belgian check digit | LOW | LOW | P3 |

**Priority key:** P1 must have this milestone; P2 should have when possible; P3 nice to have.

## Competitor Feature Analysis

| Feature | AliVAT (Firefox add-on) | AliExpress Invoice Downloader (userscript) | Our Approach |
|---------|-------------------------|--------------------------------------------|--------------|
| Output | Own PDF built from order data; states it is not issued by AliExpress | Downloads AliExpress' own invoice PDF | Own purchase receipt, same honesty statement (footer plus CONTEXT.md) |
| Buyer VAT and billing details | Yes, from user settings | None | Per-field details with Leave off; VAT parsed from contact name |
| VAT amount | Calculated at the standard rate when AliExpress says only "VAT included", and labelled so | n/a | Print only what AliExpress reports; never calculate |
| Bulk export | ZIP and date range | "All visible orders" button | Out of scope |
| Failure behaviour | Not described in the listing | Not described in the article | One plain message with the AliExpress code; no auto-retry |

## Sources

- Wikipedia, VAT identification number: [original](https://en.wikipedia.org/wiki/VAT_identification_number) · [🔖 2026-11-01](https://linkding.lav.ren/bookmarks?details=4205) — country formats, `EL` and `XI` notes (MEDIUM)
- Avalara, EU VAT number formats: [original](https://www.avalara.com/vatlive/en/eu-vat-rules/eu-vat-number-registration/eu-vat-number-formats.html) · [🔖 2026-11-01](https://linkding.lav.ren/bookmarks?details=4219) — cross-check: BE 10 digits, RO 2-10, NL `B01/B02`, ES forms, IE forms (MEDIUM; agrees with Wikipedia)
- European Commission VIES page: [original](https://ec.europa.eu/taxation_customs/vies/#/faq) · [🔖 2026-11-01](https://linkding.lav.ren/bookmarks?details=4207) — the page loaded without usable text; not relied on. The statement "format checks do not show registration" comes from the search summary and general knowledge (MEDIUM)
- AliVAT listing: [original](https://addons.mozilla.org/pl/firefox/addon/alivat/) · [🔖 2026-11-01](https://linkding.lav.ren/bookmarks?details=4212) — competitor features, standard-rate calculation, "not an AliExpress invoice" (MEDIUM, vendor listing)
- Aliexpress Invoice Downloader post: [original](https://www.petertanner.dev/posts/Aliexpress-Invoice-Downloader-userscript-released/) · [🔖 2026-11-01](https://linkding.lav.ren/bookmarks?details=4210) — no failure behaviour described (MEDIUM)
- GOV.UK Design System, error message: [original](https://design-system.service.gov.uk/components/error-message/) · [🔖 2026-11-01](https://linkding.lav.ren/bookmarks?details=4213) — be specific, say what happened and how to fix it, avoid blame and jargon (HIGH for the principle; the guide covers form input errors, so it applies here by analogy)
- WCPOS error-code docs (PRINT101, PRINT311), via search summary only: [docs.wcpos.com](https://docs.wcpos.com/error-codes/PRINT101) — receipt and print failures leave retry to the user (LOW-MEDIUM, secondary summary)
- Local evidence: running the current VAT pattern in Node on 2026-11-01 (table above); `aliexpress-invoice.user.js` lines 50-58, 87-94, 129, 144-156; `.planning/codebase/CONCERNS.md`; `.planning/PROJECT.md`; `CONTEXT.md` (HIGH)

---
*Feature research for: AliExpress purchase-receipt userscript, Active requirements*
*Researched: 2026-11-01*
