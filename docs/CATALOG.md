# The factory parts catalogue

Jack has the official Porsche parts catalogue for the 996 — **Kat 521, USA/Canada edition,
type 996 MY1998–2005, dated 24.07.2017**. It is the authority on what a part *is*, what it
belongs to, and whether it fits a given model year.

It is **not** the authority on what number to order today. See "Supersessions" below.

## Where it lives, and why it is not in this repo

The catalogue is Porsche's copyrighted work and this repository is public. Neither the PDF
nor the parsed index is committed — both are gitignored:

```
reference/kat521-usa-996-05-katalog.pdf     the catalogue itself
reference/catalog-index.json                 the parsed lookup index
```

Both live in the `Porsche 996 Rebuild` folder in Drive, alongside `rebuild-state.json`, so
the agents can reach them without the repo redistributing them. Keep it that way.

## Rebuilding the index

```bash
pdftotext -layout reference/kat521-usa-996-05-katalog.pdf /tmp/catalog.txt
node scripts/parse-catalog.mjs /tmp/catalog.txt reference/catalog-index.json
```

That yields roughly 6,400 unique part numbers across 239 illustrations.

## Using it

```bash
node scripts/catalog.mjs pn 996-107-026-51      # look up an exact part number
node scripts/catalog.mjs find "oil separator"   # search descriptions
node scripts/catalog.mjs ill 104-10             # list one illustration
node scripts/catalog.mjs check                  # audit src/data/parts.json
```

A lookup returns the factory description, quantity per car, the illustrations the part
appears in, any cross-references, and the model-year limit.

When a number is **not found**, the tool prints every other suffix sharing the same 9-digit
stem. That list is usually the supersession chain:

```
996 106 011 51  Water pump   ⚠ -98
996 106 011 54  Water pump   ⚠ -04
996 106 011 55  Water pump
996 106 011 56  Water pump
996 106 011 57  Water pump
```

## Reading the model-year limit

This is the part that bites. From the catalogue's own legend:

| Remark | Means |
|---|---|
| `-04` | valid up to the end of MY2003 |
| `02-` | valid from MY2002 onward |
| *(blank)* | no model-year restriction |

Jack's car is a **2003 Targa, M96.03, 235 kW, VIN range 993S6 30061>35000**. A part marked
`-00` does not fit it, however attractive the price. Always check this column before
ordering — several of the parts in this engine changed mid-production.

Other columns worth knowing: a position number in parentheses, like `(12)`, means the part
is only *similar* to what the illustration shows; `-` means not illustrated at all. The
`model` column carries option codes (`M650`) — those apply only to cars built with that
option.

## Supersessions — the important caveat

This edition is a 2017 snapshot. Porsche replaces part numbers continuously, so a number
printed here may no longer be orderable, and the part you actually receive may be a later
revision under a different number.

Running `node scripts/catalog.mjs check` against the seed parts list found **22 of 33**
numbers absent from this edition. Some of those are legitimately absent — special tools
(`9699`, `9595`) are not parts, and LN Engineering numbers like `0PB-105-249` were never
Porsche numbers. But most are supersessions.

**The rule: the catalogue tells you what the part is and whether it fits a 2003. Gaudin
Porsche tells you what number to order today. Check both, and trust Gaudin on the number.**

Two live examples from the seed list:

- **AOS** — the seed list had `996-107-026-52`, which is not in this edition. The catalogue
  has `996-107-026-50` and `-51`, both marked `02-`, so both cover a 2003. Whether `-52` is
  a later supersession or simply wrong has to be settled at a dealer catalogue.
- **Water pump** — the seed list had `996-106-011-77`; the catalogue's chain ends at `-57`.
  Same question, same answer: confirm at Gaudin.

When a supersession is resolved, update `src/data/parts.json`: current number first in
`oem_part_numbers`, superseded number after it, and the chain written into `notes`.
