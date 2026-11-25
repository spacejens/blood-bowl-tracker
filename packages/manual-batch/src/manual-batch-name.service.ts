import { Injectable } from '@nestjs/common';

const BATCH_NAME = /^(\d{3})-([a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** The `NNN-<slug>` batch directory name: three digits, then a lowercase hyphenated slug. */
@Injectable()
export class ManualBatchNameService {
  parse(name: string): { number: number; slug: string } | null {
    const match = BATCH_NAME.exec(name);
    return match === null ? null : { number: Number(match[1]), slug: match[2] };
  }

  format(number: number, slug: string): string {
    if (!Number.isInteger(number) || number < 0 || number > 999) {
      throw new Error(`Batch number ${number} does not fit three digits`);
    }
    if (!SLUG.test(slug)) {
      throw new Error(`Batch slug "${slug}" is not lowercase hyphenated`);
    }
    return `${String(number).padStart(3, '0')}-${slug}`;
  }
}
