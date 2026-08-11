export const canonicalKey = (text: string): string => text
  .normalize('NFKC')
  .toLowerCase()
  .replace(/\u03C2/gu, '\u03C3')
  .replace(/\u00DF/gu, 'ss')
  .normalize('NFC');

export const removeDiacritics = (text: string): string => {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[Łł]/g, match => match === 'Ł' ? 'L' : 'l')
    .toLowerCase();
};

export const removeDuplicates = (words: string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const key = canonicalKey(word);
    if (!seen.has(key)) {
      result.push(word);
      seen.add(key);
    }
  }
  return result;
};

export const removeStopWords = (words: string[], stopWords: string[], ignoreDiacritics = false): string[] => {
  const stopWordsSet = new Set(stopWords.map(canonicalKey));
  const stopWordsNoDiacritics = ignoreDiacritics
    ? new Set(stopWords.map(w => removeDiacritics(w)))
    : undefined;

  return words.filter(word => {
    const lowerWord = canonicalKey(word);
    if (stopWordsSet.has(lowerWord)) return false;
    return !stopWordsNoDiacritics?.has(removeDiacritics(word));
  });
};

export const removeSpecialCharacters = (text: string): string => {
  return text.normalize('NFC').replace(/[^\p{L}]/gu, '');
};

export const DEFAULT_STOP_WORDS = [
  'a', 'i', 'ani', 'nebo', 'či', 'přímo', 'ba', 'dokonce', 'aby', 'až', 'ale', 'avšak', 'však', 'níbrž',
  'jenže', 'sice', 'že', 'proto', 'totiž', 'z', 'do', 'na', 'v', 'k', 'o', 'po', 'při', 'se', 'za',
  'bez', 'podle', 'od', 'místo', 'kolem', 'okolo', 'během', 'vedle', 'pomocí', 'kromě', 'mimo', 'podél',
  'proti', 'naproti', 'navzdory', 'blízko', 'nedaleko', 'prostřednictvím', 'skrze', 'navzdor', 'být',
  'jsem', 'jsi', 'je', 'jsme', 'jste', 'jsou', 'byl', 'byla', 'bylo', 'byli', 'byly', 'bude', 'budou',
  'ten', 'ta', 'to', 'ti', 'ty', 'tento', 'tato', 'toto', 'zde', 'tam', 'tak'
];

export const parseInputText = (text: string): string[] => {
  return text.split(/[\s,;.]+/u).filter((word) => word.length > 0);
};

export const applyFiltersToArray = (words: string[], options: {
  removeDiacritics?: boolean;
  removeDuplicates?: boolean;
  removeStopWords?: boolean;
  removeSpecialCharacters?: boolean;
  stopWordsList?: string[];
}): string[] => {
  let result = [...words];
  
  if (options.removeDiacritics) {
    result = result.map(removeDiacritics);
  }
  
  if (options.removeDuplicates) {
    result = removeDuplicates(result);
  }
  
  if (options.removeStopWords) {
    result = removeStopWords(result, options.stopWordsList || DEFAULT_STOP_WORDS, options.removeDiacritics);
  }
  
  if (options.removeSpecialCharacters) {
    result = result.map(removeSpecialCharacters).filter(w => w.length > 0);
  }
  
  if (options.removeDuplicates) {
    result = removeDuplicates(result);
  }
  
  return result;
};

export const applyFilters = (text: string | string[], options: {
  removeDiacritics?: boolean;
  removeDuplicates?: boolean;
  removeStopWords?: boolean;
  removeSpecialCharacters?: boolean;
  stopWordsList?: string[];
}): string[] => {
  if (typeof text === 'string') {
    const words = parseInputText(text);
    return applyFiltersToArray(words, options);
  }
  return applyFiltersToArray(text, options);
};

export const cleanLemma = (lemma: string): string => {
  let cleaned = lemma.trim();
  const underscorePos = cleaned.indexOf('_');
  if (underscorePos !== -1) {
    cleaned = cleaned.substring(0, underscorePos);
  }
  return cleaned.replace(/(?:-\d+)+$/u, '').trim();
};
