import type { MorphologicalTag, TaggedToken, Token } from '../types/api';

type CsvValue = string | number | boolean | null | undefined;
type MorphologicalExportItem = MorphologicalTag | TaggedToken | Token;

const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;
const CSV_RECORD_SEPARATOR = '\r\n';

const encodeCsvCell = (value: CsvValue): string => {
  let text = value == null ? '' : String(value);
  if (typeof value === 'string' && FORMULA_PREFIX.test(value)) {
    text = `'${text}`;
  }

  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
};

const flattenMorphologicalData = (
  data: MorphologicalExportItem[] | MorphologicalExportItem[][],
): MorphologicalExportItem[] => data.flatMap((item) => Array.isArray(item) ? item : [item]);

export const exportToCsv = (
  data: ReadonlyArray<Record<string, CsvValue>>,
  columns: readonly string[],
): string => {
  const header = columns.map(encodeCsvCell).join(',');
  const rows = data.map((item) => columns.map((column) => encodeCsvCell(item[column])).join(','));
  return [header, ...rows].join(CSV_RECORD_SEPARATOR);
};

export const exportToJson = <T>(data: T): string => JSON.stringify(data, null, 2);

export const exportToTxt = (data: string[]): string => data.join('\n');

export const downloadFile = (content: string, filename: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const exportMorphologicalTagsToCsv = (
  data: MorphologicalExportItem[] | MorphologicalExportItem[][],
): string => {
  const allItems = flattenMorphologicalData(data);
  const columns = ['token', 'lemma', 'tag', 'form', 'probability'];
  const rows = allItems.map((item) => ({
    token: 'token' in item ? item.token : '',
    lemma: 'lemma' in item ? item.lemma : '',
    tag: 'tag' in item ? item.tag : '',
    form: 'form' in item ? item.form ?? '' : '',
    probability: 'probability' in item ? item.probability ?? '' : '',
  }));
  return exportToCsv(rows, columns);
};

export const exportMorphologicalTagsToTxt = (
  data: MorphologicalExportItem[] | MorphologicalExportItem[][],
): string => {
  const allItems = flattenMorphologicalData(data);
  const lines = allItems.map((item) => {
    const token = 'token' in item ? item.token : '';
    const lemma = 'lemma' in item ? item.lemma : '';
    const tag = 'tag' in item ? item.tag : '';
    return [token, lemma, tag].filter(Boolean).join('\t');
  });
  return lines.join('\n');
};

export const exportStringArrayToCsv = (data: readonly string[]): string =>
  ['value', ...data].map(encodeCsvCell).join(CSV_RECORD_SEPARATOR);
