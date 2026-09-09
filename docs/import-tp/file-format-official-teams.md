# `teams/<rulesSet>/rosters_masters?ruleSet=<n>.json` (official team list)

Temporary notes on TP's official team list response, used to coordinate
between development sessions. **Remove an entry once its detail is fully
encoded in code** — the code is the source of truth at that point.

See [file-format.md](./file-format.md) for the other pages. Unlike every other
file documented there, this one is not per competition: it is TP's canonical,
league-independent list of the races, positions and star players a rules set
allows.

## Where it comes from

TP's teams page (`https://tourplay.net/en/blood-bowl/teams`) issues exactly one
API request, `rosters/masters?ruleSet=<n>`, and every race, position and star
player of that rules set arrives in it. Clicking a race on the page issues no
further request — the page only re-renders what it already has — so there is
nothing to scrape per race.

The page's four rules-set tabs (Angular Material toggles matched by
`.mat-button-toggle-button`) map to the `ruleSet` query parameter:

- `Blood Bowl Official BB2025 · BB7` → `ruleSet=25` (BB2025)
- `Secret Bowl Unofficial BB2025 · BB7` → `ruleSet=25` (BB2025)
- `Blood Bowl Official BB2020 · BB7 · GutterBowl` → `ruleSet=20` (BB2020)
- `Dungeon Bowl OfficialDB2021` → `ruleSet=21` (DB2021)

Two consequences:

- The tab labels are marketing copy, not rules set names, so
  `OfficialTeamsDownloaderService` selects a rules set by the `ruleSet` id it
  maps each configured rules set name to (`TP_RULES_SET_IDS`) and requests that
  URL from inside the open page, rather than by clicking a tab. Nothing in the
  downloader depends on the page's DOM.
- The official BB2025 list and the unofficial "Secret Bowl" one are **the same
  response**; the page splits them client-side by each roster's
  `teamRosterType`. There is no separate Secret Bowl download.

Opening the teams page always loads the default tab's rules set (currently
BB2025), so the downloader stores only the response for the rules set it is
downloading. Each `teams/<rulesSet>/` folder therefore holds exactly one file.

## Response shape

Top level, three arrays (all always present; DB2021's `starplayerMasters` is
empty):

```json
{ "rosterMasters": [], "starplayerMasters": [], "inducementsMasters": [] }
```

Observed sizes: BB2025 — 125 rosters / 568 positions / 66 stars / 17
inducements; BB2020 — 39 / 192 / 67 / 49; DB2021 — 8 / 96 / 0 / 10.

### `rosterMasters[]` — one race/team roster

- `id` — `152`, TP's roster master id (not the per-team roster id).
- `name` — `"Black Orc"`, the race's display name.
- `teamRace` — `"BlackOrc_BB2025"`, the race code the rest of the TP import
  keys races by.
- `teamRosterType` — `0` official, `1` legacy, `3` Secret Bowl (unofficial),
  `4` experimental. BB2025 has 30 / 1 / 93 / 1 of them.
- `ruleSet` — `25`, the same value on every entry in one response.
- `tier` — `3`. Always present.
- `prizeReRoll` — `60000`, the re-roll cost. Always present.
- `apothecary`, `necromancer` — `true` / `false`. Always present.
- `maxBigGuys` — `1`. Optional (absent on rosters with no cap).
- `teamSpecialRules`, `selectableTeamSpecialRules` — `262400`, `0`. Bitmasks,
  always present.
- `leagues`, `selectableLeagues` — `1`. Bitmasks, optional (mostly absent
  under BB2020 and DB2021).
- `lineUpMasters[]` — the roster's positions, see below.

`teamRace` carries a rules-set suffix only under BB2025 (`Dwarf_BB2025`,
`HighElf_BB2025_Legacy`); BB2020 and DB2021 codes are bare (`Dwarf`,
`CollegeOfFire`), with `Bretonnian_2020` the one BB2020 exception. This matches
what [`rosters_<id>.json`](./file-format-rosters.md) already sees.

### `rosterMasters[].lineUpMasters[]` — one position

- `id` — `929`, **the numeric TP position id**. The same id space
  `lineUpMasterId` uses in match rosters, so registering these ids makes
  roster-embedded players resolvable.
- `rosterMasterId` — `152`, back-reference to the owning roster.
- `position` — `"Goblin Bruiser"`, the position name, unique within a roster.
- `quantity` — `16`, the maximum allowed on a team.
- `cost` — `45000` gold pieces.
- `ma`, `st`, `ag`, `av`, `pa` — `6`, `2`, `3`, `8`, `4`. Always present
  integers; `pa: 0` means "cannot pass".
- `skills[]` — always present, may be empty. See below.
- `skillNormal`, `skillDouble` — `129`, `26`. Bitmasks of the skill categories
  the position may take.
- `iconClass`, `iconVariation` — `"Goblin-Bruiser-Linemen"`, `6`. Presentation
  only.
- `isBigGuy` — `true`. Optional; absent means false.
- `race[]` — `[111]`, or `[112, 121, 110]` for a position open to several
  species. BB2025 only: numeric ids in the 100–133 range identifying the
  player's **species** (100 Dwarf, 101 Elf, 102 Orc, 106 Halfling, 112 Human,
  113 Ogre, 116 Treeman, …), not the team races the entry belongs to.
- `positionTypes` — `1`. Bitmask, optional under BB2025 and absent throughout
  BB2020.
- `availableRaces` — `32`. A one-bit-per-team-race bitmask, BB2020 and DB2021
  only (absent under BB2025). Identical on every position of one roster, so it
  is redundant with `rosterMasterId` and carries nothing the import needs.
- `specialRuleName` — `"Lycanthrope"`. Optional.

### `starplayerMasters[]` — star players, a separate top-level array

Same field set as a `lineUpMasters[]` entry (`id`, `position`, `cost`,
`ma`/`st`/`ag`/`av`/`pa`, `skills[]`, `quantity`, icon fields) plus
`isStarPlayer: true`, and without `rosterMasterId` — a star belongs to no
single roster. Star ids share the same space as position ids (no overlap
observed between the two arrays, nor between rules sets), so a star's `id` is
usable as a TP position external id exactly like a regular position's.

`specialRuleName` (the star's own special rule, e.g. `"Catch of the Day"`) is
always present. `linkedWith` (another star's `id`, for stars hired as a pair)
is optional — 6 of 66 BB2025 stars have it.

#### Which races may hire a star

Two parallel bitmasks, AND-ed against the matching pair on each roster. A race
may hire the star when **either** overlaps:

- `star.availableLeagues & (roster.leagues | roster.selectableLeagues)` —
  BB2025's mechanism (60 of its 66 stars).
- `star.availableTeamSpecialRules &
  (roster.teamSpecialRules | roster.selectableTeamSpecialRules)` — BB2020's
  mechanism (all 67 stars), and still BB2025's for the 7 chaos/Chaos-Dwarf
  stars whose availability stayed a team special rule.

The `selectable*` halves matter: a rule a race merely _may choose_ still makes
the star hireable by it (BB2025 Norse has `teamSpecialRules: 0` and
`selectableTeamSpecialRules: 1024`, and does get the Favoured-of-Khorne stars).

Both mask spaces use the same bit assignments as Blood Bowl's published team
special rules — bit 0 Badlands Brawl, 1 Elven Kingdoms League, 2 Halfling
Thimble Cup, 3 Lustrian Superleague, 4 Old World Classic, 5 Sylvanian
Spotlight, 6 Underworld Challenge, 7 Worlds Edge Superleague, 8 Bribery and
Corruption, 10 Favoured of Khorne, 11 Favoured of Nurgle — which is how the
decode was confirmed: every star in both files resolves to a non-empty race
list matching its published availability (e.g. Griff Oberwald → the Old World
Classic teams, Deeproot Strongbranch → Halfling/Wood Elf/Gnome).

Two fields that look like availability and are **not**:

- `star.race[]` (BB2025) is the star's own **species**, the same id space
  `lineUpMasters[].race` uses — Morg 'n' Thorg is `[113]` (Ogre), Deeproot
  Strongbranch `[116]` (Treeman). It says nothing about hireability.
- `star.availableRaces` (BB2020) is a literal `0` on all 67 stars, so it
  carries no information at all.

### `skills[]` — one skill on a position or star

`{ lineUpMasterId, skillMasterId, id }`, where `skillMasterId` identifies the
skill and `lineUpMasterId` points back at the position. Skills that carry a
value add `skillAttributeMasterId` and `skillAttributeMaster`, e.g.
`{ "type": 0, "value": "4+", "id": 3 }` (Loner 4+) or
`{ "type": 1, "value": "+1", "id": 6 }`. Skill _names_ are not in this
response — only the numeric `skillMasterId` — so a skill name lookup is not
available from this file alone.

### `inducementsMasters[]`

Not consumed by the import. Shape:
`{ id, name, cost, maxQuantity, inducementType, ruleSet, isInfamous, isWizard }`,
optionally `staffName`, `availableRaces`, `availableSpecialRules`.
