# Source Fixtures

These files are immutable regression inputs. Tests may create derived artifacts elsewhere, but MUST
NOT normalize or overwrite the source files in this directory.

## `sources/1_page.pdf`

- One visual PDF page with a two-column layout.
- Five exercise groups.
- 34 answerable items: 6 single choice, 7 word order, 7 bracket gaps, 7 odd-one-out, and 7
  word-bank gaps.
- No publisher answer key is present on the supplied page. `tests/golden/1_page.expected.json`
  contains answers curated from standard English norms, marked `needsReview` until human approval.

## `sources/raw.txt`

- Pasted text with line wraps and split words.
- 18 numbered items.
- 29 verb expressions in parentheses, including two expressions split across line breaks.
- 4 explicit short-answer ellipses, for 33 answer fields in total.
- `tests/golden/raw.expected.json` contains grammar-based answers marked `needsReview` until human
  approval.
- Item 18 is intentionally truncated and must produce `SOURCE_TRUNCATED`; the pipeline must not
  generate a continuation.

Expected structured outputs belong in `tests/golden/` and are governed by
`specs/001-reliable-source-ingestion/spec.md`.
