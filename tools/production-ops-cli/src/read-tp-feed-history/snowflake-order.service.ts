import { Injectable } from '@nestjs/common';

/**
 * Orders Discord snowflake ids, which grow with time. Compared as BigInts,
 * since they exceed the safe integer range and differ in length.
 */
@Injectable()
export class SnowflakeOrderService {
  /** Negative, zero or positive, like an `Array.prototype.sort` comparator. */
  compare(a: string, b: string): number {
    const difference = BigInt(a) - BigInt(b);
    if (difference < 0n) return -1;
    return difference > 0n ? 1 : 0;
  }

  /** The latest of a non-empty list of ids. */
  newest(ids: readonly string[]): string {
    return ids.reduce((a, b) => (this.compare(a, b) >= 0 ? a : b));
  }

  /** The earliest of a non-empty list of ids. */
  oldest(ids: readonly string[]): string {
    return ids.reduce((a, b) => (this.compare(a, b) <= 0 ? a : b));
  }
}
