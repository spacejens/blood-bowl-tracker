# Competitions

A [competition](../../glossary.md#competition) is an organized event in which teams compete within a league. Competitions are the primary unit of play within an [era](../eras/index.md).

- A competition has a name.
- A competition belongs to exactly one [era](../eras/index.md), and through it to one [league](../leagues/index.md).
- [Team eras](../team-eras/index.md) are explicitly enrolled in a competition before it begins; enrolled team eras are the authoritative participant list. A team era can only be enrolled in a competition belonging to its own era.
- A competition contains one or more [matches](../matches/index.md).
- A [coach](../coaches/index.md) may not have two of their teams enrolled in the same competition.

## Subtypes

[Seasons](../../glossary.md#season) and [cups](../../glossary.md#cup) are the two subtypes of competition. They share the same structure; no additional data distinguishes them at this time.

## Competition groups

A [competition group](../../glossary.md#competition-group) is the recurring track a competition instance belongs to — e.g. Major Season, Minor Season, Chaos Cup, or Ogretoberfest. Every competition belongs to exactly one group, and every group belongs to exactly one [league](../leagues/index.md).

Groups exist because a source system's label text isn't enough to tell instances of the same track apart from each other: a Major season's 1st place and a Minor season's 1st place can both be labelled `1st`, and only the group distinguishes which trophy applies. The group catalog is curated by hand in `tools/import-manual` rather than inferred from either source system — see [docs/import-manual](../../import-manual/index.md#competition-groups). BBL's numbered "Season N" and TP's Swedish "Säsong N" are the same recurring track under different names over time, and both fold into the single "Major Season" group.
