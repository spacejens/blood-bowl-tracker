import type { CheerioAPI } from 'cheerio';

/** A single BBL source page: its type, filename params, and lazy parsed HTML. */
export interface BblPage {
  type: string;
  params: Record<string, string>;
  /** Parse the page's HTML on demand. Consumers that only need `params` never pay for parsing. */
  load(): CheerioAPI;
}
