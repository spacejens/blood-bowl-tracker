import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalIdMap } from './external-id-map';
import { ReferenceResolverService } from './reference-resolver.service';

describe('ReferenceResolverService', () => {
  let service: ReferenceResolverService;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    importResults = mock<ImportResultService>();
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
        { provide: ImportResultService, useValue: importResults },
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

  describe('resolveRef', () => {
    it('returns the id when the ref resolves', () => {
      const idMap = new ExternalIdMap();
      idMap.add([{ system: 'Name', id: 'name:l' }], 5);
      const errors: ImportError[] = [];
      const id = service.resolveRef({
        ref: { system: 'Name', id: 'name:l' },
        idMap,
        errors,
        item: { name: 'era' },
        label: 'Cannot import era "E"',
      });
      expect(id).toBe(5);
      expect(errors).toHaveLength(0);
    });

    it('records one error and returns undefined when unresolved', () => {
      const errors: ImportError[] = [];
      const id = service.resolveRef({
        ref: { system: 'Name', id: 'name:missing' },
        idMap: new ExternalIdMap(),
        errors,
        item: { name: 'era' },
        label: 'Cannot import era "E"',
      });
      expect(id).toBeUndefined();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Cannot import era "E"');
      expect(errors[0].message).toContain('Name|name:missing');
    });
  });

  describe('resolveRefs', () => {
    it('returns the resolved ids in order', () => {
      const idMap = new ExternalIdMap();
      idMap.add([{ system: 'Name', id: 'name:a' }], 1);
      idMap.add([{ system: 'Name', id: 'name:b' }], 2);
      const errors: ImportError[] = [];
      const ids = service.resolveRefs({
        refs: [
          { system: 'Name', id: 'name:a' },
          { system: 'Name', id: 'name:b' },
        ],
        idMap,
        errors,
        item: {},
        label: 'race "R"',
      });
      expect(ids).toEqual([1, 2]);
      expect(errors).toHaveLength(0);
    });

    it('records one error per unresolved ref and returns undefined', () => {
      const idMap = new ExternalIdMap();
      idMap.add([{ system: 'Name', id: 'name:a' }], 1);
      const errors: ImportError[] = [];
      const ids = service.resolveRefs({
        refs: [
          { system: 'Name', id: 'name:a' },
          { system: 'Name', id: 'name:missing' },
          { system: 'Name', id: 'name:gone' },
        ],
        idMap,
        errors,
        item: {},
        label: 'race "R"',
      });
      expect(ids).toBeUndefined();
      expect(errors).toHaveLength(2);
    });
  });

  describe('resolveOptionalRef', () => {
    it('reports ok with no id when the entry supplied no ref', () => {
      const errors: ImportError[] = [];
      const idMap = new ExternalIdMap();

      const result = service.resolveOptionalRef({
        ref: undefined,
        idMap,
        errors,
        item: {},
        label: 'Cannot import thing "X"',
      });

      expect(result).toEqual({ ok: true, id: undefined });
      expect(errors).toEqual([]);
    });

    it('reports ok with the resolved id when the ref resolves', () => {
      const errors: ImportError[] = [];
      const idMap = new ExternalIdMap();
      idMap.add([{ system: 'Name', id: 'first-era' }], 3);

      const result = service.resolveOptionalRef({
        ref: { system: 'Name', id: 'first-era' },
        idMap,
        errors,
        item: {},
        label: 'Cannot import thing "X"',
      });

      expect(result).toEqual({ ok: true, id: 3 });
      expect(errors).toEqual([]);
    });

    it('reports not-ok and records an error when a supplied ref cannot be resolved', () => {
      importResults.error.mockReturnValue({ item: {}, message: 'boom' });
      const errors: ImportError[] = [];

      const result = service.resolveOptionalRef({
        ref: { system: 'Name', id: 'missing' },
        idMap: new ExternalIdMap(),
        errors,
        item: {},
        label: 'Cannot import thing "X"',
      });

      expect(result).toEqual({ ok: false });
      expect(errors).toHaveLength(1);
    });
  });

  describe('resolveOptionalCompetitionGroup', () => {
    it('passes an omitted group through with no error', () => {
      const errors: ImportError[] = [];

      expect(
        service.resolveOptionalCompetitionGroup({
          name: undefined,
          groupIds: new Map(),
          errors,
          item: {},
          label: 'Cannot import trophy "Major Gold"',
        }),
      ).toEqual({ ok: true, id: undefined });
      expect(errors).toHaveLength(0);
    });

    it('resolves a known group name to its id', () => {
      expect(
        service.resolveOptionalCompetitionGroup({
          name: 'Major Season',
          groupIds: new Map([['Major Season', 4]]),
          errors: [],
          item: {},
          label: 'Cannot import trophy "Major Gold"',
        }),
      ).toEqual({ ok: true, id: 4 });
    });

    it('records one error and reports failure for an unknown group name', () => {
      const errors: ImportError[] = [];
      importResults.error.mockReturnValue({ message: 'recorded' } as never);

      expect(
        service.resolveOptionalCompetitionGroup({
          name: 'Nonexistent',
          groupIds: new Map(),
          errors,
          item: { name: 'Major Gold' },
          label: 'Cannot import trophy "Major Gold"',
        }),
      ).toEqual({ ok: false });
      expect(errors).toHaveLength(1);
      expect(importResults.error).toHaveBeenCalledWith({
        item: { name: 'Major Gold' },
        message:
          'Cannot import trophy "Major Gold": unknown competition group "Nonexistent".',
      });
    });
  });
});
