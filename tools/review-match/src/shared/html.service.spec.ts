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

    it('joins a string-array cell with a line break, escaping each segment', () => {
      const html = service.table(['A'], [[['x & y', '<z>']]]);

      expect(html).toContain('<td>x &amp; y<br>&lt;z&gt;</td>');
    });

    it('joins a string-array header with a line break, escaping each segment', () => {
      const html = service.table([['Action', 'Consequence & more']], [['x']]);

      expect(html).toContain('<th>Action<br>Consequence &amp; more</th>');
    });

    it('renders a pre-formatted cell in a <pre> block, escaped', () => {
      const html = service.table(['A'], [[{ pre: '{\n  "x": "<y>"\n}' }]]);

      expect(html).toContain(
        '<td><pre class="cell-pre">{\n  &quot;x&quot;: &quot;&lt;y&gt;&quot;\n}</pre></td>',
      );
    });
  });

  describe('details', () => {
    it('renders a collapsed disclosure with the escaped summary', () => {
      const html = service.table(['A'], [[service.details('expand', 'x & y')]]);

      expect(html).toContain(
        '<td><details><summary>expand</summary>x &amp; y</details></td>',
      );
    });

    it('escapes markup in the summary text', () => {
      const html = service.table(['A'], [[service.details('<b> & more', 'x')]]);

      expect(html).toContain('<summary>&lt;b&gt; &amp; more</summary>');
    });

    it('renders a pre body inside the disclosure, escaped as usual', () => {
      const html = service.table(
        ['A'],
        [[service.details('expand', { pre: '{\n  "x": "<y>"\n}' })]],
      );

      expect(html).toContain(
        '<td><details><summary>expand</summary>' +
          '<pre class="cell-pre">{\n  &quot;x&quot;: &quot;&lt;y&gt;&quot;\n}</pre>' +
          '</details></td>',
      );
    });

    it('is collapsed by default so long payloads do not dominate the panel', () => {
      const html = service.table(['A'], [[service.details('expand', 'body')]]);

      expect(html).not.toContain('<details open');
    });
  });

  describe('note', () => {
    it('renders escaped text in a note paragraph', () => {
      expect(service.note('missing <file>')).toBe(
        '<p class="note">missing &lt;file&gt;</p>',
      );
    });
  });

  describe('subheading', () => {
    it('renders the text in an h5, escaped', () => {
      expect(service.subheading('Source match 1830')).toBe(
        '<h5>Source match 1830</h5>',
      );
    });

    it('escapes markup in the subheading text', () => {
      expect(service.subheading('a & <b>')).toBe('<h5>a &amp; &lt;b&gt;</h5>');
    });
  });
});
