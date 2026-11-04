# AGENTS.md

Guidance for working in this repository. What the site does, how to run it,
the data files and how to add profiles or screenshots are in the
[README](README.md); this file covers the conventions that the code doesn't
make obvious.

## The party

- Vesper is the one full build plan: levels, gear, illithid powers, playbook
  and backstory.
- Alene, Pearl and Zetharis belong to friends. Their pages are suggestions
  (good picks, spells and feats), never builds made for them.
- Refer to party members by name, not by class: "Ask Pearl", not "Ask the
  Gloom Stalker".

## Git and publishing

- Commits use the repository's own identity, `frobones <frobones@gmail.com>`.
  Never commit under a work address.
- Work on a short-lived branch. To publish, fast-forward `main` without
  checking it out, then push it from the branch; the BRS guard hook blocks
  pushing while `main` is checked out:

  ```bash
  git fetch . <branch>:main
  ```

  ```bash
  git push origin main
  ```

- Pushing `main` publishes the site on GitHub Pages, so every push needs an
  explicit go-ahead.
- Keep reference documents out of the repository; `*.docx` is ignored.
- When one file's changes belong to different commits, stage each commit's
  version of the file directly (`git hash-object -w` plus
  `git update-index --cacheinfo`). Applying a partial patch with
  `git apply` can place hunks at the wrong lines.

## Profile data

- Names under `item`, `items` and `alternates` are bg3.wiki page titles, and
  `scripts/fetch_wiki.py` stops on any it can't find. Gear comes from the
  `equipment` and `weapons` tables; a miscellaneous item a profile names
  comes from `misc_items`.
- Every item on a full plan's checklist must appear in at least one act's
  loadout. `tests/test_profiles.py` enforces this, and a `Carried` slot holds
  things that matter but aren't worn.
- When restructuring profile text (such as the playbook), keep each sentence
  as written unless the change is to the advice itself.
- Each item has one owner across the profiles. Two people can only list the
  same item if it's in `SHARED_ITEMS` in `tests/test_profiles.py`, with the
  reason. Mark a hand-off with `"priority": "yield"` and a `claim`.
- When a slot keeps the same main pick into the next act, its Or choices carry
  forward with it. Deliberate exceptions go in `ORS_NOT_CARRIED` in the same
  test file.

## Checking changes

- Run both suites before calling anything done:

  ```bash
  node --test tests/
  ```

  ```bash
  python3 -m unittest discover -s tests
  ```

- Look at user-facing changes in a browser through `python3 scripts/serve.py`,
  at desktop and phone widths and in both light and dark themes.
- Keep each stylesheet under 1,000 lines by splitting along features
  (`party.css`, `levelup.css`, `playbook.css`, `home.css`, `album.css`).
- Run `ruff check` on Python changes, but don't run `ruff format` on existing
  files: `scripts/fetch_wiki.py` and its tests use lines longer than ruff's
  default, and the formatter would rewrap them whole.
