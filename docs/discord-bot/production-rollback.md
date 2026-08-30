# Rolling back

See [Production hosting](production-hosting.md) for the other pages.

Fly retains release history, so a bad deploy is undone by redeploying a
previous release rather than by any tooling of ours:

```bash
fly releases              # list previous releases with their versions
fly deploy --image <image-ref-from-an-earlier-release>
```

`fly releases --json` shows the exact image reference for each release.

The `deploy-production` skill automates this: it lists recent releases with
their image references, asks which one to roll back to, and runs the
`fly deploy --image` for you. Note that a rollback deploys from a developer
machine and so sits outside the GitHub Actions deploy path — the next merge
to `main` redeploys the newest code over it. A rollback buys time; the
offending change still has to be reverted or fixed on `main`.
