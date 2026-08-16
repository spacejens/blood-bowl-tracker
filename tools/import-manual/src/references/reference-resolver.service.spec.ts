import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ExternalIdResolverService,
  ImportResultService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ReferenceResolverService } from './reference-resolver.service';

describe('ReferenceResolverService', () => {
  let service: ReferenceResolverService;
  let importResults: MockProxy<ImportResultService>;
  let nameExternalId: MockProxy<NameExternalIdService>;

  beforeEach(async () => {
    importResults = mock<ImportResultService>();
    nameExternalId = mock<NameExternalIdService>();
    // Identity field copy (`{ item, message }` in, the same out): no branching,
    // no formatting, nothing that can drift out of sync with the real
    // ImportResultService — exempt from the canned-response rule.
    importResults.error.mockImplementation(({ item, message }) => ({
      item,
      message,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReferenceResolverService,
        {
          provide: ExternalIdResolverService,
          useValue: mock<ExternalIdResolverService>(),
        },
        { provide: ImportResultService, useValue: importResults },
        { provide: NameExternalIdService, useValue: nameExternalId },
      ],
    }).compile();
    service = moduleRef.get(ReferenceResolverService);
  });

  describe('toExternalIds', () => {
    it('maps refs to { externalSystemId, externalId } pairs', () => {
      const systemIds = new Map([
        ['BBL', 1],
        ['Name', 2],
      ]);
      expect(
        service.toExternalIds(
          [
            { system: 'BBL', id: 'id:47' },
            { system: 'Name', id: 'name:x' },
          ],
          systemIds,
        ),
      ).toEqual([
        { externalSystemId: 1, externalId: 'id:47' },
        { externalSystemId: 2, externalId: 'name:x' },
      ]);
    });

    it('throws when a system name is unknown', () => {
      expect(() =>
        service.toExternalIds([{ system: 'Nope', id: 'id:1' }], new Map()),
      ).toThrow('Unknown external system "Nope"');
    });
  });

  describe('competitionGroupRef', () => {
    it("builds the group's Name-system ref from its curated name", () => {
      nameExternalId.forCompetitionGroup.mockReturnValue('Major Season');

      expect(service.competitionGroupRef('Major Season')).toEqual({
        system: 'Name',
        id: 'Major Season',
      });
      expect(nameExternalId.forCompetitionGroup).toHaveBeenCalledWith(
        'Major Season',
      );
    });
  });
});

const systemIds = new Map([['BBL', 7]]);
const ref = { system: 'BBL', id: 'id:47' };
const other = { system: 'BBL', id: 'id:48' };

describe('ReferenceResolverService resolution', () => {
  let service: ReferenceResolverService;
  let resolver: MockProxy<ExternalIdResolverService>;
  let importResults: MockProxy<ImportResultService>;
  let errors: ImportError[];

  beforeEach(async () => {
    resolver = mock<ExternalIdResolverService>();
    importResults = mock<ImportResultService>();
    importResults.error.mockImplementation((args) => ({
      item: args.item,
      message: args.message,
    }));
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReferenceResolverService,
        { provide: ExternalIdResolverService, useValue: resolver },
        { provide: ImportResultService, useValue: importResults },
        {
          provide: NameExternalIdService,
          useValue: mock<NameExternalIdService>(),
        },
      ],
    }).compile();
    service = moduleRef.get(ReferenceResolverService);
  });

  it('resolves a ref through the api, translating the system name to its id', async () => {
    resolver.resolve.mockResolvedValue(9);

    await expect(
      service.resolveRef({
        ref,
        systemIds,
        errors,
        item: {},
        label: 'L',
        kind: 'race',
      }),
    ).resolves.toBe(9);
    expect(resolver.resolve).toHaveBeenCalledWith('race', {
      externalSystemId: 7,
      externalId: 'id:47',
    });
    expect(errors).toEqual([]);
  });

  it('records one error naming the external system by name on a miss', async () => {
    resolver.resolve.mockResolvedValue(undefined);

    await expect(
      service.resolveRef({
        ref,
        systemIds,
        errors,
        item: { a: 1 },
        label: 'L',
        kind: 'race',
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      { item: { a: 1 }, message: 'L: could not resolve reference BBL|id:47.' },
    ]);
  });

  it('throws on an unknown external system name rather than resolving', async () => {
    await expect(
      service.resolveRef({
        ref: { system: 'Nope', id: 'x' },
        systemIds,
        errors,
        item: {},
        label: 'L',
        kind: 'race',
      }),
    ).rejects.toThrow('Unknown external system "Nope".');
  });

  it('resolves a whole list in one batched call', async () => {
    resolver.resolveBatch.mockResolvedValue([9, 10]);

    await expect(
      service.resolveRefs({
        refs: [ref, other],
        systemIds,
        errors,
        item: {},
        label: 'L',
        kind: 'era',
      }),
    ).resolves.toEqual([9, 10]);
    expect(resolver.resolveBatch).toHaveBeenCalledWith('era', [
      { externalSystemId: 7, externalId: 'id:47' },
      { externalSystemId: 7, externalId: 'id:48' },
    ]);
  });

  it('records one error per unresolved ref in a list and returns undefined', async () => {
    resolver.resolveBatch.mockResolvedValue([undefined, undefined]);

    await expect(
      service.resolveRefs({
        refs: [ref, other],
        systemIds,
        errors,
        item: {},
        label: 'L',
        kind: 'era',
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      { item: {}, message: 'L: could not resolve reference BBL|id:47.' },
      { item: {}, message: 'L: could not resolve reference BBL|id:48.' },
    ]);
  });

  it('resolves an empty list to an empty array without calling the api', async () => {
    await expect(
      service.resolveRefs({
        refs: [],
        systemIds,
        errors,
        item: {},
        label: 'L',
        kind: 'era',
      }),
    ).resolves.toEqual([]);
    expect(resolver.resolveBatch).not.toHaveBeenCalled();
  });

  it('passes an omitted optional ref through with no error', async () => {
    await expect(
      service.resolveOptionalRef({
        ref: undefined,
        systemIds,
        errors,
        item: {},
        label: 'L',
        kind: 'league',
      }),
    ).resolves.toEqual({ ok: true, id: undefined });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it('reports a present-but-unresolvable optional ref as not ok', async () => {
    resolver.resolve.mockResolvedValue(undefined);

    await expect(
      service.resolveOptionalRef({
        ref,
        systemIds,
        errors,
        item: {},
        label: 'L',
        kind: 'league',
      }),
    ).resolves.toEqual({ ok: false });
    expect(errors).toHaveLength(1);
  });

  it('reports a resolved optional ref as ok with its id', async () => {
    resolver.resolve.mockResolvedValue(4);

    await expect(
      service.resolveOptionalRef({
        ref,
        systemIds,
        errors,
        item: {},
        label: 'L',
        kind: 'league',
      }),
    ).resolves.toEqual({ ok: true, id: 4 });
  });
});
