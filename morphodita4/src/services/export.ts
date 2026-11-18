import { invoke, isTauri } from '@tauri-apps/api/core';
import type { MorphologicalTag, TaggedToken, Token } from '../types/api';

type CsvValue = string | number | boolean | null | undefined;
export type MorphologicalExportItem = MorphologicalTag | TaggedToken | Token | string;
export type MorphologicalExportRow = {
  token: string;
  lemma: string;
  tag: string;
  form: string;
  probability: number | undefined;
  space: string;
};

const FORMULA_PREFIX = /^[\p{White_Space}\uFEFF]*[=+\-@]/u;
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

const collectMorphologicalData = (
  data: MorphologicalExportItem[] | MorphologicalExportItem[][],
): MorphologicalExportItem[] => {
  const result: MorphologicalExportItem[] = [];
  for (const item of data) {
    if (Array.isArray(item)) {
      for (const nested of item) result.push(nested);
    } else {
      result.push(item);
    }
  }
  return result;
};

const toMorphologicalRow = (item: MorphologicalExportItem): MorphologicalExportRow => {
  if (typeof item === 'string') {
    return { token: item, lemma: '', tag: '', form: '', probability: undefined, space: '' };
  }
  if ('token' in item && 'lemma' in item) {
    return {
      token: item.token,
      lemma: item.lemma,
      tag: item.tag,
      form: item.form ?? '',
      probability: item.probability,
      space: item.space ?? '',
    };
  }
  if ('lemma' in item) {
    return {
      token: '',
      lemma: item.lemma,
      tag: item.tag,
      form: item.form ?? '',
      probability: item.probability,
      space: item.space ?? '',
    };
  }
  return { token: item.token, lemma: '', tag: '', form: '', probability: undefined, space: item.space ?? '' };
};

export const exportToCsv = (
  data: Iterable<Record<string, CsvValue>>,
  columns: readonly string[],
): string => {
  // Retain bounded blocks rather than millions of temporary row strings.
  const blocks: string[] = [];
  let lines = [columns.map(encodeCsvCell).join(',')];
  for (const item of data) {
    lines.push(columns.map((column) => encodeCsvCell(item[column])).join(','));
    if (lines.length >= 1000) { blocks.push(lines.join(CSV_RECORD_SEPARATOR)); lines = []; }
  }
  if (lines.length) blocks.push(lines.join(CSV_RECORD_SEPARATOR));
  return blocks.join(CSV_RECORD_SEPARATOR);
};

export const exportToJson = <T>(data: T): string => JSON.stringify(data, null, 2);

export const exportToTxt = (data: string[]): string => data.join('\n');

export const downloadFile = async (content: string, filename: string, mimeType: string): Promise<string | undefined> => {
  if (isTauri()) {
    return invoke<string>('export_file', { content, filename });
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Let the browser consume the Blob before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

export const exportMorphologicalTagsToCsv = (
  data: MorphologicalExportItem[] | MorphologicalExportItem[][],
): string => {
  const allItems = collectMorphologicalData(data);
  const columns = ['token', 'lemma', 'tag', 'form', 'probability', 'space'];
  const rows = allItems.map(toMorphologicalRow);
  return exportToCsv(rows, columns);
};

export const exportMorphologicalTagsToTxt = (
  data: MorphologicalExportItem[] | MorphologicalExportItem[][],
): string => {
  const allItems = collectMorphologicalData(data);
  const lines = allItems.map((item) => {
    const row = toMorphologicalRow(item);
    return [row.token, row.lemma, row.tag, row.form, row.space]
      .filter((field) => field.length > 0)
      .join('\t');
  });
  return lines.join('\n');
};

export const exportStringArrayToCsv = (data: readonly string[]): string =>
  ['value', ...data].map(encodeCsvCell).join(CSV_RECORD_SEPARATOR);

export const downloadWizardCsv = async (
  sections: { section: string; values: string[] }[], model: string, schemaVersion: number, filename: string,
): Promise<string | undefined> => {
  if (isTauri()) return invoke<string>('export_csv_sections', { filename, model, schemaVersion, sections });
  function* rows() {
    for (const { section, values } of sections) {
      for (const value of values) yield { schemaVersion, model, section, value };
    }
  }
  return downloadFile(exportToCsv(rows(), ['schemaVersion', 'model', 'section', 'value']), filename, 'text/csv');
};
