# External Systems

An [external system](../../glossary.md#external-system) identifies an
upstream application or data source that [league](../leagues/index.md) data
can be imported from (e.g. BBL).

- An external system has a name, which must be unique.
- An external system has a category: `bookkeeping` (artificial, added by us —
  e.g. the synthetic `Name` fallback — and never counted in statistics),
  `imported_data_source` (a system we import structured data from, e.g. BBL),
  or `referenced_not_imported` (a system we reference but don't import from,
  e.g. a coach's NAF number).
- An [era](../eras/index.md) may be linked to any number of external systems
  via external IDs, which import tools use to recognize the same era across
  separate import runs and across different import sources.
- A [coach](../coaches/index.md) may be linked to any number of external
  systems via external IDs, which import tools use to recognize the same
  coach across separate import runs and across different import sources.
