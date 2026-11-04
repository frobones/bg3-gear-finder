# Our Baldur's Gate 3 party

A webpage for our co-op Baldur's Gate 3 run: who's in the party, how each
character levels, the story so far in screenshots, and a finder for every
piece of gear. A switch at the top of every page moves between its two
sections, **Our party** and **Gear finder**.

## Our party

- **Home** opens first. The party name sits over a banner that fades
  between album shots every few seconds; **Pause** stops it, and it holds
  still while you point at it. Below come the last session's newest
  screenshots and the party roster.
- **Party** shows each character in the co-op party. Select a character's
  portrait on their page to see the full painting. **Party gear by act**
  puts everyone's picks for each slot side by side, one act at a time, so
  you can see where every piece of gear is going. A
  filled-in profile has tabs for:
  - **Level up**: what to pick at the next level, in the order the game asks,
    then which Wizard spells to prepare.
  - **Gear plan**: the items the character wants, in play order, with
    checkboxes for what's been picked up, after a loadout for the end of
    each act with alternates.
  - **Illithid**: suggested illithid powers, in order. Select a power to read
    it in the side panel.
  - **Playbook**: a jump bar to each section; the combat loop as three
    steps, then what to do when things change; a start-of-day checklist;
    theft in phases; reaction settings marked Always or Ask; and Mage Hand
    jobs.
  - **Backstory**: the character's story so far, when the profile has one.
- Friends' profiles are suggestions rather than a plan, on one page: **Good
  picks by act** (gear per slot, tagged by what it's good for), **Good
  spells** grouped by spell level, then **Good picks by level** (feats and
  class choices). Select a spell, feat or class choice to read it in the side
  panel, like an item.
- **Album** shows screenshots from our sessions, newest session first, each
  with a caption. Select one to see it full size; use the arrow keys or swipe
  to move between shots, and Escape to close.

The party's name goes in `"name"` in `data/party/party.json`. Until it's
set, the page shows a "Party name" placeholder.

## Gear finder

- **Journey** lists every find in play order: Prologue, then Acts 1 to 3,
  each split into areas you can expand. Finds someone in the party plans to
  use say who they're for, and each act opens with a **Don't miss** box of
  planned items a story choice can lose, and when that act's places close.
- **All items** is a sortable table: name, slot, rarity, first place found,
  AC or damage, value, and weight.
- Search matches item names, places, how-to-get text, and the wiki's notes,
  such as a merchant's name. Filter by slot, act, rarity, items with a known
  place, or only your party's picks.
- Select any item to see its stats, passives, actions, every way to get it,
  and the wiki's notes on it, with links back to bg3.wiki. The panel opens
  with **Party plans**: who plans around it, what it does for their build,
  which act and slot it fills in their loadout, and who gets it when it's
  contested.
- An item's passives are written out in its panel. Hover over or focus a
  weapon action or spell to see what it does; click or tap to keep it open.
  Escape closes it.

Current level, picked-up items and taken powers are saved in
the browser you use. They aren't shared between browsers or devices, and
clearing the site's data resets them.

## Run it

The page loads its data with `fetch`, so serve the folder rather than opening
`index.html` directly:

```bash
python3 scripts/serve.py
```

Then open <http://localhost:8642>. The script tells the browser not to cache
anything, so a normal reload always shows the latest data and code.

## Publish on GitHub Pages

The site is static and loads everything with relative paths, so GitHub Pages
can serve it from the repository root of any branch:

1. Push the branch to GitHub.
2. In the repository's **Settings › Pages**, set **Source** to **Deploy from a
   branch**, pick the branch and `/ (root)`, and save.
3. The site appears at `https://<user>.github.io/<repository>/` after the
   first deploy, usually within a minute or two.

`.nojekyll` tells Pages to serve the files as they are, without a Jekyll
build. Pages lets browsers cache files for up to 10 minutes, so a change can
take that long to show after a push. A free GitHub account can only publish
Pages from a public repository.

## Album

Screenshots go in `album/`, using Steam's file names (such as
`20261101202756_1.jpg`), which give the date and time each shot was taken.
`album/` holds the full-size originals and is kept out of git, so back it up
yourself. After adding screenshots, run:

```bash
python3 scripts/build_album.py
```

The script uses `sips`, which comes with macOS. It writes a 1600 px copy of
each shot to `assets/album/` and a thumbnail to `assets/album/thumbs/`, and
lists the shots in `data/album.json`. New shots get an empty `caption`;
write one there, and rebuilds keep it. Set `"banner": true` on the shots
Home's banner should rotate through; with none set, it uses every shot.
Removing a screenshot from `album/` removes it from the site the next time
the script runs.

Each shot adds about 0.37 MB to the site. GitHub Pages allows a 1 GB site, so
there is room for roughly 2,500 shots, and git keeps removed shots in the
repository's history.

## Data

All item data comes from [bg3.wiki](https://bg3.wiki/)'s Cargo tables
(`equipment`, `weapons`, `item_locations`, `locations`, `passives`,
`actions`, `spells`) via `Special:CargoExport`. Item notes are not in
Cargo, so they are read from each item page's source and expanded through
`api.php`. Image addresses are looked up through `api.php` as well, so files
the wiki has renamed still resolve. The page never contacts the wiki for
data; item and spell icons load from the wiki's image server.

| File | Contents |
| --- | --- |
| `data/items.json` | Every item, all wiki fields, notes, game `variants` |
| `data/acquisitions.json` | Each way to get an item, with place and act |
| `data/locations.json` | Every place with its act and parent places |
| `data/abilities.json` | Passives, weapon actions and spells for pop-outs |
| `data/region_order.json` | Hand-kept play order of areas in each act |
| `data/meta.json` | Snapshot time, source, license, and counts |
| `data/party/party.json` | Hand-kept party name, roster and Don't miss list |
| `data/party/<name>.json` | Hand-kept character profile |
| `data/album.json` | Album shots, with hand-written captions and banner picks |

Each acquisition holds the how-to-get text, the wiki pages it mentions, the
place and its parent places, the act, the Journey area, and map coordinates.

Rebuild `data/` with:

```bash
python3 scripts/fetch_wiki.py
```

Raw wiki responses are kept in `cache/wiki/`, so a rebuild only contacts the
wiki for what is missing. Add `--refresh` to pull fresh data. The wiki
rate-limits bursts, so the script spaces requests a second apart and honours
`Retry-After`.

## Party profiles

Profiles are written by hand and are never overwritten by a rebuild. To add
one, copy `data/party/vesper.json`, put the portrait in `assets/portraits/`,
and point the roster entry in `data/party/party.json` at it with
`"profile": "<file name without .json>"`.

`portrait` is a 405×480 crop shown on cards and profile pages;
`portrait_full`, in `assets/portraits/full/`, is the whole painting that opens
when you select it. The tests check that both files exist.

A profile can also carry a `bio`, a list of paragraphs that a full build
plan shows in a **Backstory** tab. It's optional; see
`data/party/vesper.json`.

A profile with `"style": "options"` is a friend's page of good picks (see
`data/party/alene.json`): `spells` lists good spells per spell level (with
the character level it opens at), each level lists its feat and class
`picks` as `entries` (an `ability` wiki page or plain `text`, plus a short
`note`), gear entries carry `tags` instead of a `priority`, and each
act's slots list their `items` as a bucket of good picks.

In a profile, names under `item`, `items` and `alternates` are bg3.wiki item
pages. Names under `abilities`, `ability` and `replace` are bg3.wiki spell or
passive pages, so use the page title (for example
`Shield (spell)`). Then rebuild: the script adds those spells to
`data/abilities.json` and stops with a list of any name the wiki doesn't
have.

Items can be gear or miscellaneous items such as the Resonance Stone: the
script pulls in any miscellaneous item a profile names from the wiki's
`misc_items` table, so it gets an icon, places and a panel like gear. A full
build plan's tests check that every checklist item appears in at least one
act's loadout, so nothing on the list gets forgotten. A `Carried` slot holds
things that matter to the character but aren't worn.

To change the Journey order, edit `data/region_order.json` and rebuild. If the
script stops with "Places missing from region_order.json", add each listed
area to the right act and run it again.

## Tests

```bash
python3 -m unittest discover -s tests
```

```bash
node --test tests/
```

## License

Item data and icons are from bg3.wiki under CC BY-NC-SA 4.0 or CC BY-SA 4.0,
and the page credits the wiki in its footer. Keep this project
non-commercial. Not affiliated with Larian Studios.
