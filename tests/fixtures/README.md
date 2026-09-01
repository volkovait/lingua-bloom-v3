# Source Fixtures

These files are immutable regression inputs. Tests may create derived artifacts elsewhere, but MUST
NOT normalize or overwrite the source files in this directory.

## Universal PDF extraction acceptance fixtures

- `sources/vocab.pdf`: SHA-256 `0d0a07161a2aac4bfc87b8dd0612d10483238bcfd04bfd60a1bc1063fb3a7ab5`; one page; readable text layer; copied byte-for-byte from the supplied source.
- `sources/placement_test.pdf`: SHA-256 `0ed6ea13c458bad7476b41c586a924e41937bfb497bfe168c219818cfc493e6f`; five pages; readable text layer; copied byte-for-byte from the supplied source.

These files are immutable acceptance evidence for feature 002. Do not update either file silently;
introduce a new fixture and manifest revision when source evidence changes.

## `sources/1_page.pdf`

- One visual PDF page with a two-column layout.
- Five exercise groups.
- 34 answerable items: 6 single choice, 7 word order, 7 bracket gaps, 7 odd-one-out, and 7
  word-bank gaps.
- No publisher answer key is present on the supplied page. `tests/golden/1_page.expected.json`
  contains answers curated from standard English norms, marked `needsReview` until human approval.

## `sources/articles_4_pages.pdf`

- Four landscape pages with article-insertion exercises 48-58.
- Exercise 48 begins before the supplied pages and is expected as a separate partial group.
- Exercises 52, 53, 56 and 57 test cross-column or cross-page continuation stitching.
- Six reference-information blocks must preserve every source text-layer line without normalization.
- The golden manifest fixes 11 groups, 36 answerable items and 369 answer fields.

## `sources/reading_text_questions_4_pages.pdf`

- Four portrait pages with two reading passages, a linked one-word gap exercise and a separate
  multiple-choice exercise.
- Both reading passages are preserved line-for-line as reference blocks and linked as evidence for
  exercises 5 and 6, including the passage that follows its questions on the next PDF page.
- Both exercise groups are complete and must not produce `SOURCE_TRUNCATED`.
- Worked examples numbered 0 are preserved in the source PDF but are not student answer fields.
- The golden manifest fixes 2 groups, 8 answerable items, 8 answer fields and 2 reference blocks.

## `sources/reading_text_questions_missing_passage_3_pages.pdf`

- Negative edge fixture derived from the previously incomplete reading upload; it is not a release
  golden and is intentionally absent from `fixtures.json`.
- Exercise 6 questions are present, but their `My favourite place` passage is absent.
- Extraction must retain the source questions only in a `partial` group, emit a blocking
  `SOURCE_TRUNCATED`, and prevent the group from becoming publishable until it is excluded.

## `sources/raw.txt`

- Pasted text with line wraps and split words.
- 18 numbered items.
- 29 verb expressions in parentheses, including two expressions split across line breaks.
- Dialogue ellipses remain source context and do not become answer fields in a `bracketGap` group;
  the fixture therefore has 29 answer fields in total.
- `tests/golden/raw.expected.json` contains grammar-based answers marked `needsReview` until human
  approval.
- Item 18 is intentionally truncated and must produce `SOURCE_TRUNCATED`; the pipeline must not
  generate a continuation.

Expected structured outputs belong in `tests/golden/` and are governed by
`specs/001-reliable-source-ingestion/spec.md`.
