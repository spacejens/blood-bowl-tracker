import {
  ExternalSystemBootstrapService,
  KeywordsImportService,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpKeywordCatalogService } from './tp-keyword-catalog.service';

describe('TpKeywordCatalogService', () => {
  let service: TpKeywordCatalogService;
  let keywordsImport: MockProxy<KeywordsImportService>;
  let bootstrap: MockProxy<ExternalSystemBootstrapService>;

  beforeEach(async () => {
    keywordsImport = mock<KeywordsImportService>();
    bootstrap = mock<ExternalSystemBootstrapService>();
    bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [5] } as never);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpKeywordCatalogService,
        { provide: KeywordsImportService, useValue: keywordsImport },
        { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      ],
    }).compile();
    service = moduleRef.get(TpKeywordCatalogService);
  });

  it('keys the catalogue by its numeric tourplay.net code', async () => {
    keywordsImport.listKeywords.mockResolvedValue([
      { keywordId: 7, name: 'Goblin', kind: 'species', externalId: '111' },
      { keywordId: 8, name: 'Big Guy', kind: 'positional', externalId: '134' },
    ]);
    const catalog = await service.load([]);
    expect(catalog.byCode.get(111)).toEqual({ keywordId: 7, name: 'Goblin' });
    expect(catalog.byCode.get(134)).toEqual({ keywordId: 8, name: 'Big Guy' });
    expect(bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: TP_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' },
    ]);
    expect(keywordsImport.listKeywords).toHaveBeenCalledWith(5, []);
  });

  it('skips a curated external id that is not a number', async () => {
    keywordsImport.listKeywords.mockResolvedValue([
      { keywordId: 7, name: 'Goblin', kind: 'species', externalId: 'Goblin' },
    ]);
    const catalog = await service.load([]);
    expect(catalog.byCode.size).toBe(0);
  });

  it('returns an empty catalogue when the read failed', async () => {
    keywordsImport.listKeywords.mockResolvedValue(undefined);
    const catalog = await service.load([]);
    expect(catalog.byCode.size).toBe(0);
  });

  it('returns an empty catalogue and records the error when bootstrap fails', async () => {
    bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: { item: {}, message: 'no system' },
    } as never);
    const errors: unknown[] = [];
    const catalog = await service.load(errors as never);
    expect(catalog.byCode.size).toBe(0);
    expect(errors).toHaveLength(1);
  });
});
