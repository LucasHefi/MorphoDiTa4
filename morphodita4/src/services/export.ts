import { MorphologicalTag } from '../types/api';

const isMorphologicalTagArray = (data: MorphologicalTag[] | MorphologicalTag[][]): data is MorphologicalTag[][] => {
  return Array.isArray(data) && data.length > 0 && Array.isArray(data[0]);
};

export const exportToCsv = (data: Record<string, any>[], columns: string[]): string => {
  const header = columns.join(',');
  const rows = data.map(item => 
    columns.map(col => {
      const value = item[col] ?? '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',')
  );
  return [header, ...rows].join('\n');
};

export const exportToJson = <T>(data: T): string => {
  return JSON.stringify(data, null, 2);
};

export const exportToTxt = (data: string[]): string => {
  return data.join('\n');
};

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

export const exportMorphologicalTagsToCsv = (data: MorphologicalTag[] | MorphologicalTag[][]): string => {
  const allItems: MorphologicalTag[] = isMorphologicalTagArray(data) 
    ? data.flat() as MorphologicalTag[] 
    : data;
  const columns = ['token', 'lemma', 'tag', 'form', 'probability'];
  const rows = allItems.map((item: MorphologicalTag) => ({
    token: (item as any).token ?? '',
    lemma: item.lemma,
    tag: item.tag,
    form: item.form ?? '',
    probability: item.probability ?? ''
  }));
  return exportToCsv(rows, columns);
};

export const exportMorphologicalTagsToTxt = (data: MorphologicalTag[] | MorphologicalTag[][]): string => {
  const allItems: MorphologicalTag[] = isMorphologicalTagArray(data) 
    ? data.flat() as MorphologicalTag[] 
    : data;
  const lines = allItems.map((item: MorphologicalTag) => {
    const token = (item as any).token ?? '';
    const lemma = item.lemma;
    const tag = item.tag;
    return [token, lemma, tag].filter(Boolean).join('\t');
  });
  return lines.join('\n');
};

export const exportStringArrayToCsv = (data: string[]): string => {
  const header = 'value';
  const rows = data.map(item => {
    const stringValue = String(item);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  });
  return [header, ...rows].join('\n');
};