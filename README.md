# BG3 gear finder

A local webpage for finding Baldur's Gate 3 gear: what each item does, and
where and when you can pick it up.

- **Journey** lists every find in play order: Prologue, then Acts 1 to 3,
  each split into areas you can expand.
- **All items** is a sortable table: name, slot, rarity, first place found,
  AC or damage, value, and weight.
- Search matches item names, places, and how-to-get text, such as a
  merchant's name. Filter by slot, act, rarity, or items with a known place.
- Select any item to see its stats, passives, actions, and every way to get
  it, with links back to bg3.wiki.
- Hover over or focus a passive or weapon action to see what it does; click
  or tap to keep it open. Escape closes it.

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
`actions`) via `Special:CargoExport`. The page never contacts the wiki for
data; item icons load from the wiki's image server.

| File | Contents |
| --- | --- |
| `data/items.json` | Every item, all wiki fields, game `variants` |
| `data/acquisitions.json` | Each way to get an item, with place and act |
| `data/locations.json` | Every place with its act and parent places |
| `data/abilities.json` | Passives and weapon actions that items grant |
| `data/region_order.json` | Hand-kept play order of areas in each act |
| `data/meta.json` | Snapshot time, source, license, and counts |

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
