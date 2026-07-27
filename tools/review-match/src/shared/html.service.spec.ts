import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { HtmlService } from './html.service';

describe('HtmlService', () => {
  let service: HtmlService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [HtmlService],
    }).compile();
    service = moduleRef.get(HtmlService);
  });

  describe('escape', () => {
    it('escapes every character that could break out of markup', () => {
      expect(service.escape(`<a href="x">A & B's</a>`)).toBe(
        '&lt;a href=&quot;x&quot;&gt;A &amp; B&#39;s&lt;/a&gt;',
      );
    });

    it('leaves plain text untouched', () => {
      expect(service.escape('Round 3')).toBe('Round 3');
    });
  });

  describe('table', () => {
    it('renders escaped headers and cells', () => {
      const html = service.table(['A & B', 'C'], [['<x>', 'y']]);

      expect(html).toBe(
        '<table><thead><tr><th>A &amp; B</th><th>C</th></tr></thead>' +
          '<tbody><tr><td>&lt;x&gt;</td><td>y</td></tr></tbody></table>',
      );
    });

    it('renders an empty-row note instead of a table when there are no rows', () => {
      expect(service.table(['A'], [])).toBe('<p class="note">No rows.</p>');
    });
  });

  describe('note', () => {
    it('renders escaped text in a note paragraph', () => {
      expect(service.note('missing <file>')).toBe(
        '<p class="note">missing &lt;file&gt;</p>',
      );
    });
  });
});
