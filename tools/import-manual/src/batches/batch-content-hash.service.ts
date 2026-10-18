import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

/**
 * The content hash a batch is recorded under: SHA-256, hex, of the batch's
 * pooled raw content (see ManualDataReader.readRaw) as canonical JSON --
 * object keys sorted at every depth, array order kept, empty sections
 * dropped. Comments, formatting, key order and an added empty section leave
 * it unchanged; any change to a value, or to the order of entries, changes
 * it. Every long-lived database's ledger stores hashes computed this way, so
 * the canonical form must never change.
 */
@Injectable()
export class BatchContentHashService {
  hash(raw: Record<string, unknown[]>): string {
    const sections = Object.fromEntries(
      Object.entries(raw).filter(([, entries]) => entries.length > 0),
    );
    return createHash('sha256').update(this.canonical(sections)).digest('hex');
  }

  private canonical(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonical(item)).join(',')}]`;
    }
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;
      const members = Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.canonical(record[key])}`);
      return `{${members.join(',')}}`;
    }
    return JSON.stringify(value);
  }
}
