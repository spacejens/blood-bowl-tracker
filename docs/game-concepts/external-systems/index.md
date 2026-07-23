# External Systems

An [external system](../../glossary.md#external-system) identifies an
upstream application or data source that [league](../leagues/index.md) data
can be imported from (e.g. BBL).

- An external system has a name, which must be unique.
- An external system has a category, distinguishing artificial bookkeeping
  constructs we add ourselves (e.g. the synthetic Name fallback), which are
  never counted in statistics, from genuine external systems, which are
  further split into those we import structured data from (e.g. BBL) and
  those we merely reference an identifier for without importing structured
  data from (e.g. a coach's NAF number).
- An [era](../eras/index.md) may be linked to any number of external systems
  via external IDs, which import tools use to recognize the same era across
  separate import runs and across different import sources.
- A [coach](../coaches/index.md) may be linked to any number of external
  systems via external IDs, which import tools use to recognize the same
  coach across separate import runs and across different import sources.
