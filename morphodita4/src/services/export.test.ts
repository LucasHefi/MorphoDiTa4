import { describe, expect, it, vi } from 'vitest';
import type { Token } from '../types/api';
import {
  exportMorphologicalTagsToCsv,
  exportStringArrayToCsv,
  exportToCsv,
  exportToJson,
  downloadFile,
} from './export';

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      index += 1;
    } else {
      cell += character;
    }
  }

  row.push(cell);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

describe('CSV exports', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-cmd', '@payload', ' =hidden', '\t+hidden', '\u00a0=nbsp', '\uFEFF+header']) (
    'neutralizes formula-like text %j',
    (value) => {
      expect(exportToCsv([{ value }], ['value'])).toBe(`value\r\n'${value}`);
      expect(exportStringArrayToCsv([value])).toBe(`value\r\n'${value}`);
    },
  );

  it('preserves ordinary text that only contains whitespace', () => {
    expect(exportToCsv([{ value: ' ordinary text' }], ['value'])).toBe('value\r\n ordinary text');
  });

  it('neutralizes a formula after a newline and retains CSV quoting', () => {
    expect(exportToCsv([{ value: '\n@newline' }], ['value'])).toBe('value\r\n"\'\n@newline"');
    expect(exportStringArrayToCsv(['\n@newline'])).toBe('value\r\n"\'\n@newline"');
  });

  it('quotes commas, quotes and line breaks after neutralization', () => {
    expect(exportToCsv([{ value: '=A1,"quoted"\r\nnext' }], ['value']))
      .toBe('value\r\n"\'=A1,""quoted""\r\nnext"');
  });

  it('preserves negative numbers and zero', () => {
    expect(exportToCsv([{ negative: -1, zero: 0 }], ['negative', 'zero']))
      .toBe('negative,zero\r\n-1,0');
  });

  it('exports tagged tokens and preserves zero probability', () => {
    expect(exportMorphologicalTagsToCsv([{
      token: '=danger',
      lemma: 'lemma',
      tag: 'NN',
      probability: 0,
    }])).toBe("token,lemma,tag,form,probability,space\r\n'=danger,lemma,NN,,0,");
  });

  it('exports tokenization items as CSV rows', () => {
    const token: Token = { token: 'word', space: ' ' };

    expect(exportMorphologicalTagsToCsv([[token]])).toBe(
      'token,lemma,tag,form,probability,space\r\nword,,,,, ',
    );
  });

  it('exports string tokenization rows without object-only checks', () => {
    expect(exportMorphologicalTagsToCsv([['word']])).toBe(
      'token,lemma,tag,form,probability,space\r\nword,,,,,',
    );
  });

  it('round-trips quoted Unicode and formula-containing domain rows', () => {
    const columns = ['token', 'lemma', 'tag', 'form'];
    const rows = [
      { token: 'psa', lemma: 'pes', tag: 'Ncms1', form: 'psa' },
      { token: 'žluťoučký, "kůň"', lemma: 'kůň', tag: 'Ncms1', form: 'žluťoučký\r\nkůň' },
      { token: '=HYPERLINK("https://evil.test")', lemma: 'kočka', tag: 'N', form: 'kočky' },
    ];

    const parsed = parseCsv(exportToCsv(rows, columns));

    expect(parsed[0]).toEqual(columns);
    expect(parsed.slice(1)).toEqual([
      ['psa', 'pes', 'Ncms1', 'psa'],
      ['žluťoučký, "kůň"', 'kůň', 'Ncms1', 'žluťoučký\r\nkůň'],
      ["'=HYPERLINK(\"https://evil.test\")", 'kočka', 'N', 'kočky'],
    ]);
    expect(JSON.parse(exportToJson(rows))).toEqual(rows);
  });

  it('exports a lazy generator across block boundaries with one header and no lost records', () => {
    function* rows() {
      for (let i = 0; i < 2501; i++) yield { index: i, value: i === 999 ? 'žlutý, "kůň"\nřádek' : `value-${i}` };
    }
    const parsed = parseCsv(exportToCsv(rows(), ['index', 'value']));
    expect(parsed).toHaveLength(2502);
    expect(parsed[0]).toEqual(['index', 'value']);
    expect(parsed[1000]).toEqual(['999', 'žlutý, "kůň"\nřádek']);
    expect(parsed[2501]).toEqual(['2500', 'value-2500']);
  });

  it('serializes a target-size dataset without losing rows', () => {
    const start = performance.now();
    const rows = Array.from({ length: 10000 }, (_, index) => ({
      token: `slovo-${index}`,
      lemma: `lemma-${index % 100}`,
      tag: 'Ncms1',
      form: `forma-${index}`,
    }));
    const csv = exportToCsv(rows, ['token', 'lemma', 'tag', 'form']);

    expect(parseCsv(csv)).toHaveLength(rows.length + 1);
    expect(csv.length).toBeGreaterThan(100000);
    expect(csv.length).toBeLessThan(4 * 1024 * 1024);
    expect(performance.now() - start).toBeLessThan(5000);
  });

  it('cleans up the download DOM and URL when clicking throws', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('blocked'); });

    await expect(downloadFile('data', 'result.txt', 'text/plain')).rejects.toThrow('blocked');
    vi.runAllTimers();
    vi.useRealTimers();
    expect(document.querySelector('a[download="result.txt"]')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');

    click.mockRestore();
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
  });

  it('represents a multi-section wizard export as one round-trippable table', () => {
    const csv = exportToCsv([
      { section: 'formsToLemmas', value: 'žluťoučký = kůň' },
      { section: 'filteredForms', value: '=danger, "quoted"\nřádek' },
    ], ['section', 'value']);

    expect(parseCsv(csv)).toEqual([
      ['section', 'value'],
      ['formsToLemmas', 'žluťoučký = kůň'],
      ['filteredForms', "'=danger, \"quoted\"\nřádek"],
    ]);
    expect(csv.split('\r\n')[0]).toBe('section,value');
  });
});
