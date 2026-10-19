# `tournament_<slug>.json` (base file — parsed)

See [file-format.md](./file-format.md) for the other pages.

`TournamentParserService.parse()` in
`packages/parse-tp/src/tournament-parser.service.ts` defines the extracted
fields.

The body carries much more — location, state, flags, and each category's full
ruleset configuration — that is deliberately unparsed until something needs it.
Of those, `nameNormalized` is the slug TP uses for the competition
subdirectory name.
