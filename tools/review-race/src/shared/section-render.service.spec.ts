import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SectionRenderService } from './section-render.service';

describe('SectionRenderService', () => {
  let service: SectionRenderService;

  beforeEach(async () => {
    // HtmlService is passed real: it is pure markup assembly, and the test
    // asserts the exact failure note markup.
    const moduleRef = await Test.createTestingModule({
      providers: [SectionRenderService, HtmlService],
    }).compile();
    service = moduleRef.get(SectionRenderService);
  });

  it('returns the section output unchanged on success', async () => {
    expect(await service.render(() => Promise.resolve('<b>ok</b>'))).toBe(
      '<b>ok</b>',
    );
  });

  it('turns a rejection into a failure note carrying the error message', async () => {
    expect(await service.render(() => Promise.reject(new Error('boom')))).toBe(
      '<p class="note">Rendering failed: boom</p>',
    );
  });

  it('stringifies a non-Error rejection and escapes it', async () => {
    // A non-Error rejection is the case under test.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    expect(await service.render(() => Promise.reject('<bad>'))).toBe(
      '<p class="note">Rendering failed: &lt;bad&gt;</p>',
    );
  });
});
