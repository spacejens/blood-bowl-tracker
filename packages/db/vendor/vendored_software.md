# Vendored software

Third-party source code copied verbatim into this repository, rather than
pulled in as a package dependency. Each entry is checksum-tested
(`packages/db/src/schema/*.spec.ts`) to catch accidental edits — an
intentional upgrade means replacing the vendored file and updating its
checksum test's recorded hash in the same commit.

| Component | Source | License | Local path |
|---|---|---|---|
| `versioning()` trigger function (v1.2.1) | [nearform/temporal_tables](https://github.com/nearform/temporal_tables) | MIT (`LICENSE` in the same directory) | `packages/db/vendor/nearform/temporal_tables/versioning_function.sql` |
