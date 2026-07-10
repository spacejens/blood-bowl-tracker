import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EraConfig {
  name: string;
  rulesSet: string;
  startDate: string;
  endDate?: string;
}

/**
 * Validates a value is an ISO `YYYY-MM-DD` date string that refers to a real
 * calendar day (rejecting e.g. `2021-02-30`, which `Date` would otherwise roll
 * over). Round-trips through a UTC `Date` and compares the normalized date part.
 */
function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

@Injectable()
export class EraConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * The eras the BBL league played through, supplied via the BBL_ERAS
   * environment variable as a JSON array (not parsed from the source data).
   * Each era names its rules set and its date range; endDate is optional for an
   * era still ongoing at import time.
   */
  getEras(): EraConfig[] {
    const raw = this.configService.get<string>('BBL_ERAS');
    if (!raw) {
      throw new Error(
        'BBL_ERAS is not set. Set it to a JSON array of the eras the BBL ' +
          'league played through, e.g. ' +
          '[{"name":"Living rulebook","rulesSet":"Living rulebook",' +
          '"startDate":"2011-09-09","endDate":"2021-09-01"}].',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `BBL_ERAS is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('BBL_ERAS must be a non-empty JSON array of eras.');
    }

    return parsed.map((entry, index) => this.parseEra(entry, index));
  }

  private parseEra(entry: unknown, index: number): EraConfig {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`BBL_ERAS[${index}] must be an object.`);
    }
    const record = entry as Record<string, unknown>;

    const { name, rulesSet, startDate, endDate } = record;

    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(`BBL_ERAS[${index}].name must be a non-empty string.`);
    }
    if (typeof rulesSet !== 'string' || rulesSet.trim() === '') {
      throw new Error(
        `BBL_ERAS[${index}].rulesSet must be a non-empty string.`,
      );
    }
    if (!isValidIsoDate(startDate)) {
      throw new Error(
        `BBL_ERAS[${index}].startDate must be an ISO date (YYYY-MM-DD).`,
      );
    }
    if (endDate !== undefined && !isValidIsoDate(endDate)) {
      throw new Error(
        `BBL_ERAS[${index}].endDate must be an ISO date (YYYY-MM-DD) when present.`,
      );
    }

    return {
      name,
      rulesSet,
      startDate,
      ...(endDate !== undefined ? { endDate } : {}),
    };
  }
}
