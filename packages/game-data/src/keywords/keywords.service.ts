import type {
  ExternalId,
  KeywordKind,
  ResolveResult,
  UpsertKeyword,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Keyword } from '@blood-bowl-tracker/db';
import {
  asc,
  DB,
  eq,
  keywordExternalIds,
  keywords,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class KeywordUpsertConflictError extends UpsertConflictError {}

/** One catalogue row as a given external system names it. */
export interface KeywordCatalogRow {
  keywordId: number;
  name: string;
  kind: KeywordKind;
  /** This keyword's external id under the requested system. */
  externalId: string;
}

/**
 * Owns the `keywords` catalogue: the BB2025 labels a position can carry.
 *
 * No `detectSemanticConflict`, unlike PositionsService: the catalogue has a
 * single writer (the curated tools/import-manual file), so an external-id
 * match can never be two different sources claiming one row.
 *
 * `listByExternalSystem` exists because keyword names cannot be derived from
 * imported data: an import tool holds only numeric codes, and needs the whole
 * 41-row catalogue keyed by those codes in one read rather than a resolve
 * call per code.
 */
@Injectable()
export class KeywordsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertKeyword,
  ): Promise<{ keyword: Keyword; created: boolean }> {
    const { row: keyword, created } = await upsertByExternalIds<
      typeof keywords,
      typeof keywordExternalIds
    >({
      db: this.db,
      entityTable: keywords,
      entityIdColumn: keywords.id,
      values: { name: data.name, kind: data.kind },
      externalIdTable: keywordExternalIds,
      ownerIdColumn: keywordExternalIds.keywordId,
      externalSystemIdColumn: keywordExternalIds.externalSystemId,
      externalIdColumn: keywordExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: KeywordUpsertConflictError,
      entityLabelPlural: 'keywords',
      buildExternalIdRow: (keywordId, pair) => ({ keywordId, ...pair }),
    });

    return { keyword, created };
  }

  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: keywordExternalIds,
      ownerIdColumn: keywordExternalIds.keywordId,
      externalSystemIdColumn: keywordExternalIds.externalSystemId,
      externalIdColumn: keywordExternalIds.externalId,
      externalIds,
    });
  }

  /**
   * Every keyword that carries an external id under this system, with that
   * id. Ordered by external id so the result is stable across calls. A
   * keyword with two ids under one system (none today) yields two rows; the
   * caller keys by external id, so that is the useful shape.
   */
  listByExternalSystem(externalSystemId: number): Promise<KeywordCatalogRow[]> {
    return this.db
      .select({
        keywordId: keywords.id,
        name: keywords.name,
        kind: keywords.kind,
        externalId: keywordExternalIds.externalId,
      })
      .from(keywordExternalIds)
      .innerJoin(keywords, eq(keywords.id, keywordExternalIds.keywordId))
      .where(eq(keywordExternalIds.externalSystemId, externalSystemId))
      .orderBy(asc(keywordExternalIds.externalId));
  }
}
