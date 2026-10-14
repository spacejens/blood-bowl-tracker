import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { WorkflowUsesExtractorService } from '../extract/workflow-uses-extractor.service';
import { UsesRefClassifierService } from '../uses-ref/uses-ref-classifier.service';
import {
  DEFAULT_WORKFLOWS_DIR,
  WorkflowLintService,
  WORKFLOWS_DIR,
} from './workflow-lint.service';

describe('WorkflowLintService', () => {
  let dir: string;
  let extractor: MockProxy<WorkflowUsesExtractorService>;
  let classifier: MockProxy<UsesRefClassifierService>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workflow-lint-'));
    extractor = mock<WorkflowUsesExtractorService>();
    classifier = mock<UsesRefClassifierService>();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function makeService(
    workflowsDir: string = dir,
  ): Promise<WorkflowLintService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowLintService,
        { provide: WORKFLOWS_DIR, useValue: workflowsDir },
        { provide: WorkflowUsesExtractorService, useValue: extractor },
        { provide: UsesRefClassifierService, useValue: classifier },
      ],
    }).compile();
    return moduleRef.get(WorkflowLintService);
  }

  function givenFile(name: string, content: string): void {
    writeFileSync(join(dir, name), content);
  }

  it('reports no problems and counts files and uses when every reference is pinned', async () => {
    givenFile('a.yml', 'a-content');
    givenFile('b.yaml', 'b-content');
    extractor.extract.mockReturnValue([{ uses: 'pinned', line: 3 }]);
    classifier.isPinned.mockReturnValue(true);

    const result = (await makeService()).run();

    expect(result).toEqual({ filesChecked: 2, usesChecked: 2, problems: [] });
    expect(classifier.isPinned).toHaveBeenCalledWith('pinned');
  });

  it('reads only .yml and .yaml files directly in the directory', async () => {
    givenFile('ci.yml', 'ci-content');
    givenFile('README.md', 'not a workflow');
    mkdirSync(join(dir, 'nested'));
    writeFileSync(join(dir, 'nested', 'inner.yml'), 'nested-content');
    mkdirSync(join(dir, 'dir.yml'));
    extractor.extract.mockReturnValue([]);

    const result = (await makeService()).run();

    expect(result.filesChecked).toBe(1);
    expect(extractor.extract).toHaveBeenCalledTimes(1);
    expect(extractor.extract).toHaveBeenCalledWith('ci-content');
  });

  it('reports each unpinned reference with file, line and value', async () => {
    givenFile('ci.yml', 'ci-content');
    extractor.extract.mockReturnValue([
      { uses: 'actions/checkout@abc', line: 7 },
      { uses: 'actions/setup-node@v7', line: 12 },
    ]);
    classifier.isPinned.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const result = (await makeService()).run();

    expect(result.usesChecked).toBe(2);
    expect(result.problems).toEqual([
      ".github/workflows/ci.yml:12: 'actions/setup-node@v7' is not pinned to a full 40-character commit SHA",
    ]);
  });

  it('asks for a sha256 image digest, not a commit SHA, when a docker reference is unpinned', async () => {
    givenFile('ci.yml', 'ci-content');
    extractor.extract.mockReturnValue([
      { uses: 'docker://alpine:3.20', line: 9 },
    ]);
    classifier.isPinned.mockReturnValue(false);

    const result = (await makeService()).run();

    expect(result.problems).toEqual([
      ".github/workflows/ci.yml:9: 'docker://alpine:3.20' is not pinned to a sha256 image digest",
    ]);
  });

  it('reports a file that fails to parse and keeps checking the rest, in file-name order', async () => {
    givenFile('b.yml', 'b-content');
    givenFile('a.yml', 'a-content');
    extractor.extract
      .mockImplementationOnce(() => {
        throw new Error('Invalid YAML: bad indentation');
      })
      .mockReturnValueOnce([{ uses: 'actions/checkout@v7', line: 4 }]);
    classifier.isPinned.mockReturnValue(false);

    const result = (await makeService()).run();

    expect(extractor.extract).toHaveBeenNthCalledWith(1, 'a-content');
    expect(extractor.extract).toHaveBeenNthCalledWith(2, 'b-content');
    expect(result).toEqual({
      filesChecked: 2,
      usesChecked: 1,
      problems: [
        '.github/workflows/a.yml: Invalid YAML: bad indentation',
        ".github/workflows/b.yml:4: 'actions/checkout@v7' is not pinned to a full 40-character commit SHA",
      ],
    });
  });

  it('fails when the workflows directory does not exist', async () => {
    const service = await makeService(join(dir, 'missing'));

    expect(() => service.run()).toThrow(/Workflows directory not found/);
  });

  it('fails, naming the directory, when it contains no workflow files', async () => {
    givenFile('README.md', 'not a workflow');

    const service = await makeService();

    expect(() => service.run()).toThrow(`No workflow files found in ${dir}`);
  });

  it("defaults to this checkout's .github/workflows", () => {
    expect(existsSync(join(DEFAULT_WORKFLOWS_DIR, 'ci.yml'))).toBe(true);
  });
});
