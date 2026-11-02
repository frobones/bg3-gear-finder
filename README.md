# BG3 gear finder

A local webpage for finding Baldur's Gate 3 gear: what each item does, and
where and when you can pick it up.

- **Journey** lists every find in play order: Prologue, then Acts 1 to 3,
  each split into areas you can expand.
- **All items** is a sortable table: name, slot, rarity, first place found,
  AC or damage, value, and weight.
- Search matches item names, places, how-to-get text, and the wiki's notes,
  such as a merchant's name. Filter by slot, act, rarity, or items with a
  known place.
- Select any item to see its stats, passives, actions, every way to get it,
  and the wiki's notes on it, with links back to bg3.wiki.
- Hover over or focus a passive, weapon action or spell to see what it does;
  click or tap to keep it open. Escape closes it.
- **Party** shows each character in the co-op party. A filled-in profile has
  tabs for:
  - **Level up**: what to pick at the next level, in the order the game asks,
    then which Wizard spells to prepare and which scrolls to scribe.
  - **Gear plan**: the items the character wants, in play order, with
    checkboxes for what's been picked up, plus a loadout for the end of
    each act with alternates. Picks that come from the wiki data rather
    than the character's build guide are tagged "Not in the guide".
  - **Scrolls**: which spell scrolls to scribe, hold back, or skip.
  - **Illithid**: suggested illithid powers, in order.
  - **Playbook**: a turn in combat, theft steps, and reaction settings.
- An item's panel shows which party members plan around it, and who gets it
  when it's contested.

Current level, picked-up items, scribed scrolls and taken powers are saved in
the browser you use. They aren't shared between browsers or devices, and
clearing the site's data resets them.

## Run it

The page loads its data with `fetch`, so serve the folder rather than opening
`index.html` directly:

```bash
python3 -m http.server 8642 --bind 127.0.0.1
```

Then open <http://localhost:8642>.

## Data

All item data comes from [bg3.wiki](https://bg3.wiki/)'s Cargo tables
(`equipment`, `weapons`, `item_locations`, `locations`, `passives`,
`actions`, `spells`) via `Special:CargoExport`. Item notes are not in
Cargo, so they are read from each item page's source and expanded through
`api.php`. The page never contacts the wiki for data; item and spell icons
load from the wiki's image server.

| File | Contents |
| --- | --- |
| `data/items.json` | Every item, all wiki fields, notes, game `variants` |
| `data/acquisitions.json` | Each way to get an item, with place and act |
| `data/locations.json` | Every place with its act and parent places |
| `data/abilities.json` | Passives, weapon actions and spells for pop-outs |
| `data/region_order.json` | Hand-kept play order of areas in each act |
| `data/meta.json` | Snapshot time, source, license, and counts |
| `data/party/party.json` | Hand-kept party roster |
| `data/party/<name>.json` | Hand-kept character profile |

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

In a profile, names under `item`, `items` and `alternates` are bg3.wiki item
pages. Names under `abilities`, `replace`, `scribe` and `hold` are bg3.wiki
spell or passive pages, so use the page title (for example
`Shield (spell)`). Then rebuild: the script adds those spells to
`data/abilities.json` and stops with a list of any name the wiki doesn't
have.

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
