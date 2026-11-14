# Wordle dictionary audit

Audit date: 2026-11-14

Scope: `js/wordle-words.js`, `wordle-locales/*.js`, the loaders, the service
worker, and the project’s attribution files.

## Current status

The strict audit passes:

```sh
npm run audit:wordle:strict
```

| Locale | Answers | Valid guesses | Input | Structural | Invariants | Provenance | Policy hits |
| --- | ---: | ---: | --- | --- | --- | --- | ---: |
| English (`en`) | 781 | 14,855 | base rows | ok | ok | ok | 0 |
| Arabic (`ar`) | 352 | 12,000 | IME | ok | ok | ok | 0 |
| German (`de`) | 377 | 2,382 | rows | ok | ok | ok | 0 |
| Spanish (`es`) | 384 | 2,696 | rows | ok | ok | ok | 0 |
| French (`fr`) | 381 | 2,724 | rows | ok | ok | ok | 0 |
| Hindi (`hi`) | 79 | 1,039 | IME | ok | ok | ok | 0 |
| Kannada (`kn`) | 106 | 2,138 | IME | ok | ok | ok | 0 |
| Japanese (`ja`) | 279 | 566 | IME | ok | ok | ok | 0 |
| Korean (`ko`) | 272 | 312 | IME | ok | ok | ok | 0 |
| Brazilian Portuguese (`pt-BR`) | 382 | 2,801 | rows | ok | ok | ok | 0 |
| Simplified Chinese (`zh-Hans`) | 212 | 587 | IME | ok | ok | ok | 0 |
| Traditional Chinese (`zh-Hant`) | 212 | 587 | IME | ok | ok | ok | 0 |

The answer pools are filtered against `scripts/wordle-audit-policy.json`.
That removes profanity, proper names, brands, political and religious terms,
loanwords, technical entries, numeric phrases and named-entity/administrative
patterns from the answers. The valid-guess lists remain intentionally broad;
they are not the answer pool.

## Provenance

Every dictionary header now records its sources, source URLs, retrieval date
and license notes.

- **English** — the repository’s existing list. Its upstream revision is not
  pinned, and the header says so. The repository does not claim a formal
  public-domain or upstream license for that list. The file and its
  modifications are distributed as part of this GPL-3.0-only repository.
- **Wordle Global** — MIT code at
  <https://github.com/Hugo0/wordle>. Contributed word lists may carry their own
  terms; the MIT code license is not treated as a blanket data license.
- **wordfreq** — Apache-2.0 code and CC BY-SA 4.0 data at
  <https://github.com/rspeer/wordfreq>. The headers record both licenses.
- **Wordle JP** — MIT at <https://github.com/sen-ltd/wordle-jp>.
- **Wordle Kannada** — MIT, Copyright (c) 2022 Hannah Park, at
  <https://github.com/Omkar-Shetkar/wordle-kannada>. Kannada uses this source
  rather than the Wordle Global/wordfreq/Wordle JP lineage.

`README.md` and `licenses.html` carry the same attribution. Source revisions
are not pinned in this tree; a future source refresh should record the exact
commit or release used for each pack.

## Answer-pool review

The policy filter is reproducible and lives in
`scripts/wordle-audit-policy.json`. The audit checks each locale’s curated
denylist plus the configured named-entity/administrative patterns. The current
run reports zero policy hits.

The removed entries include the examples previously flagged in this audit:
English brand/proper-name and technical entries; Arabic, German, Spanish,
French, Hindi, Japanese, Korean, Portuguese and Chinese names, places,
political/religious terms, profanity and administrative phrases. Those entries
may remain in the valid-guess lists, which are deliberately wider than the
answer pool.

Passing the policy gate is not a claim that every remaining answer is ideal.
The non-English pools still originate from frequency lists, and a
native-speaker editorial pass remains recommended for word choice and
standalone-word quality. That is a residual editorial risk, not a current
audit finding.

## Checks

`npm run audit:wordle` fails on structural or invariant errors. It reports
provenance and policy findings separately. `npm run audit:wordle:strict` is the
release gate and currently exits 0.

The audit validates:

- non-empty answer and valid-guess arrays;
- exactly five grapheme clusters per entry;
- NFC normalization, lower-casing and no duplicates;
- every answer present in the valid-guess list;
- IME packs with no keyboard rows and non-IME rows covering every used
  grapheme;
- dictionary locale coverage and keyboard-key uniqueness;
- recorded source, source URL/revision and license;
- the curated answer-pool policy.

## Residual work

- Pin a source revision or snapshot for each dictionary and regenerate from
  that record.
- Run a native-speaker editorial review of the non-English answer pools.
- Decide whether the broad valid-guess lists should have their own product
  policy; the current audit treats only answers as the answer pool.
- Add a reproducible generator once the source snapshots are checked in.

The service worker caches the dictionaries that a player actually selects, so
a dictionary update should bump the cache version when the data changes.
