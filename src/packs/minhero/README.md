# Min Hero data pack

Generated factual data for *Min Hero: Tower of Sages*. All values are derived from
the decompiled ToyChestGames ActionScript source, which the project has permission
to use. The raw decompiled source and assets stay local and are gitignored; only the
JSON in `data/` is committed. Runtime never reads the source or the network.

## Regenerate

From the repo root:

```powershell
npm.cmd run data:import
npm.cmd run data:check
npm.cmd run assets:import
npm.cmd run assets:check
```

`data:import` reads `minhero-towerofsages-main/Source Files/scripts/` and writes the
JSON in `data/`. `data:check` runs `tests/data.test.ts`. `assets:import` copies the
art into `public/assets/` and writes `data/assets.json`; it must run after
`data:import` because the manifest is keyed by generated ids. `assets:check`
verifies the manifest against the committed files without needing the game source.

Do not hand-edit the generated JSON. Change the importer (or add an explicit
override step) and regenerate.

## Current counts

| Data | Count |
| --- | --- |
| Types | 14 |
| Minions | 102 (dex ids 0-101) |
| Families | 54 |
| Unique referenced trees | 159 |
| Defined moves | 888 |
| Declared move slots | 893 |
| Referenced/obtainable moves | 785 |

The source declares 893 move slots, but ids 135-139 are the known
undocumented/glitched slots with no move object; they are recorded in `meta.json`
but not fabricated. The unreferenced tree definitions `IceTree_Rock` and
`GetTestTalentTree` are excluded and listed in `meta.json`.

## Files

- `types.json` — 14 types, colors, type icons, and source type names.
- `typechart.json` — complete 14×14 attacker→defender matrix with `weak`, `resist`, or `neutral` codes.
- `minions.json` — 102 minions with dex numbers, families, types, base/L60 stats, gems, evolution level, starting moves, specialization moves, and 3 tree refs.
- `families.json` — 54 evolution families and their members.
- `trees.json` — referenced specialization trees. Each tree has 12 nodes in column-major order (`col * 4 + row`); each node lists its ordered move ids and whether it requires the previous row node to be fully purchased.
- `moves.json` — defined moves with class/tier, type, target counts, damage/DOT/healing fields (including random over-time and recoil numbers), cooldowns/energy, structured effects, the source `moveIcon_*` art name, and a `description` array in the game's own tooltip wording. `obtainable` is true when a tree, starting move, or specialization move references it.
- `assets.json` — generated art manifest: minion id → sprite, move icon name → icon, UI texture key → path, plus size totals. Paths are relative (`./assets/...`) and files live in `public/assets/`. The BurbinCasual font is written to `src/assets/fonts/` instead, because it is imported through `src/styles/fonts.css` and hashed by Vite.
- `meta.json` — source hash, attribution, rules, counts, ignored trees, unknown move ids, and import warnings.

## Extractor notes

- Minion methods are parsed from `AllMinionsContainer.as`; battle-mod minions (dex 102-104) and the test minion (105) are excluded.
- Trees use `AddMoveToTree(col, row, moveId, dependsOnPreviousRow?)`; source column/row order must not be transposed.
- Move records are built with a small sequential evaluator for `CreateMove`, `CopyMove`, `old_*CM`, and `PassiveCM`, including field and stat-effect assignments. Icons come from `CreateMove`'s fifth argument or the current `m_currMoveIconName`; `CopyMove` inherits them.
- `description` mirrors `BaseMinionMove.GetTextFieldForMoveDescription`, using the stat-stage tables from `StaticData` (+1 = 25%, -1 = -20%). Lines the game omits (crit, revive, % health) are appended so the text is complete.
- Source strings are read as raw text, so escaped quotes are unescaped when names are normalized (`Kel\'ba` → `Kel'ba`). Apostrophes slug to `-` so ids stay stable across that fix.
- Minion sprites are matched by display name from `images_source/` (with an alias for `Cerberus` → `Cerebus.png`); UI textures and gem shapes/masks are copied by `scripts/import-assets.mjs` into `public/assets/`, and the BurbinCasual font into `src/assets/fonts/`.
- L60 stats assume IVs 0, no gems, no stars, and no passives: health `(base*60)/10 + 5`, energy `((base*60)/20 + 5) * 1.5`, and attack/healing/speed `(base*60)/20 + 5`.
- Family grouping first tries identical tree-ref sets; if that does not yield 54 groups, it falls back to source function prefixes (`*_stageN`).
