# External Systems

An [external system](../../glossary.md#external-system) identifies an
upstream application or data source that [league](../leagues/index.md) data
can be imported from (e.g. BBL).

- An external system has a name, which must be unique.
- Each [era](../eras/index.md) references exactly one external system —
  callers must explicitly choose or create one when creating an era; there is
  no default.
- A [coach](../coaches/index.md) may be linked to any number of external
  systems via external IDs, which import tools use to recognize the same
  coach across separate import runs and across different import sources.
