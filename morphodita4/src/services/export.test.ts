import { describe, expect, it } from 'vitest';
import type { Token } from '../types/api';
import {
  exportMorphologicalTagsToCsv,
  exportStringArrayToCsv,
  exportToCsv,
  exportToJson,
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
  it.each(['=1+1', '+SUM(A1:A2)', '-cmd', '@payload', ' =hidden', '\t+hidden']) (
    'neutralizes formula-like text %j',
    (value) => {
      expect(exportToCsv([{ value }], ['value'])).toBe(`value\r\n'${value}`);
      expect(exportStringArrayToCsv([value])).toBe(`value\r\n'${value}`);
    },
  );

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
    }])).toBe("token,lemma,tag,form,probability\r\n'=danger,lemma,NN,,0");
  });

  it('exports tokenization items as CSV rows', () => {
    const token: Token = { token: 'word', space: ' ' };

    expect(exportMorphologicalTagsToCsv([[token]])).toBe(
      'token,lemma,tag,form,probability\r\nword,,,,',
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

  it('serializes a target-size dataset without losing rows', () => {
    const rows = Array.from({ length: 10000 }, (_, index) => ({
      token: `slovo-${index}`,
      lemma: `lemma-${index % 100}`,
      tag: 'Ncms1',
      form: `forma-${index}`,
    }));
    const csv = exportToCsv(rows, ['token', 'lemma', 'tag', 'form']);

    expect(parseCsv(csv)).toHaveLength(rows.length + 1);
    expect(csv.length).toBeGreaterThan(100000);
  });
});
