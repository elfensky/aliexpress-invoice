# AliExpress Invoice

A userscript that turns one AliExpress order into a printable purchase receipt with a buyer block an accountant can use.

## Language

### The document

**Purchase receipt**:
The printable document made from one order: buyer, sellers, items, every amount AliExpress reports, and the included VAT. It is not an invoice issued by a seller.
_Avoid_: Invoice (only the button label says "Generate invoice"), bill

**Order**:
One AliExpress purchase, known by its order id. It can hold items from several sellers.
_Avoid_: Purchase, transaction

**Included VAT**:
The tax amount AliExpress reports as included in the order total.
_Avoid_: Tax, import charges (a different amount)

### The buyer

**Buyer block**:
The part of a purchase receipt that names the buyer, made of the four buyer fields.
_Avoid_: Customer block, billing address

**Buyer field**:
One of the four parts of the buyer block: name, VAT number, address, extra lines.

**Order values**:
The buyer fields as one order's delivery address gives them. The VAT number comes from the contact name, because AliExpress has no VAT field.
_Avoid_: Defaults, shipping info

**Buyer details**:
The values and Leave off marks the user saves for the buyer fields, one set per browser. A filled field replaces the order value on every receipt; an empty field keeps each order's own value.
_Avoid_: Buyer settings, override, profile

**Leave off**:
A mark on one buyer field that keeps its line off the purchase receipt, whatever its value.
_Avoid_: Hide, remove, exclude
