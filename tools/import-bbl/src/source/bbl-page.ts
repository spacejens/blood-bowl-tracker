import type { CheerioAPI } from 'cheerio';

/** A single BBL source page: its type, filename params, and lazy parsed HTML. */
export interface BblPage {
  type: string;
  params: Record<string, string>;
  /** Parse the page's HTML on demand. Consumers that only need `params` never pay for parsing. */
  load(): CheerioAPI;
}

/**
 * Parse a wget mirror filename such as `default.asp?p=tm&t=knu`.
 * The `p` query param becomes `type`; the remaining params are returned in `params`.
 * Returns null for files that are not BBL pages (no `default.asp?` prefix, or no `p=`).
 *
 * Param values are normalized to NFC. Some filesystems (notably macOS APFS)
 * return directory-listing filenames with non-ASCII letters decomposed into
 * NFD (e.g. "a" + a combining ring above), while page *content* decoded from
 * the Latin-1 mirror is inherently NFC (Latin-1 only has precomposed forms).
 * Without normalizing here, a value read from a filename (like a team code)
 * would fail strict-equality lookups against the same value read from HTML.
 */
export function parsePageFilename(
  filename: string,
): { type: string; params: Record<string, string> } | null {
  const prefix = 'default.asp?';
  if (!filename.startsWith(prefix)) {
    return null;
  }

  const params: Record<string, string> = {};
  let type: string | undefined;
  for (const pair of filename.slice(prefix.length).split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1).normalize('NFC');
    if (key === 'p') {
      type = value;
    } else {
      params[key] = value;
    }
  }

  if (!type) {
    return null;
  }
  return { type, params };
}
