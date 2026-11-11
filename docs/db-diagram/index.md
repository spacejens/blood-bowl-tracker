# db-diagram

`tools/db-diagram/db-diagram.sh` generates a
[SchemaSpy](https://schemaspy.org/) ER diagram and browsable schema docs for
the local docker-compose database into `docs/schemaspy-output/`. It is a shell
script, not an npm workspace package.

## Running it

The local stack must be running: start it with the `deploy-local` skill or
`docker compose up -d --build`. Then, from the repo root:

```bash
pnpm run db:diagram
```

The output directory is gitignored and regenerated on demand.
