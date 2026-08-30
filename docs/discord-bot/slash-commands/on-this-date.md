# `/onthisdate`

`/onthisdate` reports what happened on one calendar date across every
recorded year — see [On this date](../../insights/on-this-date.md) for the
underlying date and scoping rules.

## Arguments

The command takes one optional string argument, `date`, in `MM-DD` form,
defaulting to today. A value that is not a real calendar date — the wrong
shape, a month past December, or an impossibility such as `02-30` — is
rejected with a message rather than silently treated as today, because a
coach who named a date deserves to know their input was not understood.

The command also takes the same four scope options `/insights` describes —
`league`, `era`, `competition` and `match-category` — with the same
autocomplete, mutual exclusivity, and not-found replies. See
[`/insights`](insights.md) for the details: `/onthisdate` uses the literal
same option definitions and the same resolution code, so the two commands
cannot drift apart.

## The reply

One embed, titled with the named date and suffixed with the scope the same
way other insight embeds are, carries the match count, the event breakdown,
and the list of players who died on the date with who killed them. Every
identifiable player or team on those rows gets its own drill-down button into
[`/deepdive`](deepdive.md), subject to the usual button cap and dropdown
fallback.

A date on which nothing was ever played replies with a short message instead
of a breakdown. A database timeout falls back to a plain message with no
embed.

## Random insights

The same insight, always resolved against today's date, is one of the facts
the scheduled random-insights poster can pick — see
[`/insights`](insights.md).
