# download-tp

Downloads data from TP as a one-time operation for each historical season, and
stores it locally as JSON for later import by `tools/import-tp`.

This tool is designed to be run locally by a developer, not deployed.

> **Status:** ported as-is from an older repository and not currently known to
> work against the live TP site. Fixing it, and using it to download Major
> Season 30, is tracked separately.

## Configuration

Copy `.env.example` to `.env` in this directory and fill in the values:

| Variable | Meaning |
|---|---|
| `TP_FRONTEND_URL` | Base URL of the TP frontend, including a trailing slash |
| `TP_BACKEND_API_URL` | Base URL of the TP API, including a trailing slash — responses whose URL starts with this are recorded |
| `HIDE_BROWSER_UI` | `true` to run the browser headless, anything else to show it |
| `TOURNAMENTS` | Comma-separated tournament names, as they appear in the frontend path |
| `OUTPUT_DIR` | Subdirectory of `tp-site/` to write into |

Downloaded files land in `tools/download-tp/tp-site/<OUTPUT_DIR>/`, which is
gitignored.

## Running

The tool drives a real Chrome via puppeteer. pnpm does not run puppeteer's
install script (its browser download is deliberately not in the workspace's
`allowBuilds` list, to keep CI installs fast), so provision a browser once:

```bash
pnpm exec puppeteer browsers install chrome
```

Then build and run:

```bash
pnpm run build
pnpm run start
```

## Development

```bash
pnpm run test        # unit tests with coverage
pnpm run test:watch  # unit tests in watch mode
pnpm run verify      # build + lint + typecheck + format + test
```
