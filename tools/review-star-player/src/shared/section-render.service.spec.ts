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
    expect(
      await service.render('Identity', () => Promise.resolve('<b>ok</b>')),
    ).toBe('<b>ok</b>');
  });

  it('turns a rejection into a failure note naming the section and the error', async () => {
    expect(
      await service.render('Identity', () => Promise.reject(new Error('boom'))),
    ).toBe('<p class="note">Rendering failed (Identity): boom</p>');
  });

  it('stringifies a non-Error rejection and escapes it', async () => {
    // A non-Error rejection is the case under test.
    const rejectWithString = (): Promise<string> =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject('<bad>');

    expect(await service.render('Keywords', rejectWithString)).toBe(
      '<p class="note">Rendering failed (Keywords): &lt;bad&gt;</p>',
    );
  });
});
