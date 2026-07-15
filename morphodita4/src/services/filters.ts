export const removeDiacritics = (text: string): string => {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

export const removeDuplicates = (words: string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const lowerWord = word.toLowerCase();
    if (!seen.has(lowerWord)) {
      result.push(word);
      seen.add(lowerWord);
    }
  }
  return result;
};

export const removeStopWords = (words: string[], stopWords: string[]): string[] => {
  const stopWordsSet = new Set(stopWords.map(w => w.toLowerCase()));
  const stopWordsNoDiacritics = new Set(stopWords.map(w => removeDiacritics(w)));

  return words.filter(word => {
    const lowerWord = word.toLowerCase();
    const noDiacriticsWord = removeDiacritics(word);
    return !stopWordsSet.has(lowerWord) && !stopWordsNoDiacritics.has(noDiacriticsWord);
  });
};

export const removeSpecialCharacters = (text: string): string => {
  // Spec §4.2: "jen písmena" — only letters (a-z, A-Z, Latin Extended \u00C0-\u017F)
  // No spaces, no hyphens per docs/spec.md:417
  return text.replace(/[^a-zA-Z\u00C0-\u017F]/gu, '');
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
  return text.split(/[\s\n,;.]+/).filter(w => w.length > 0);
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
  
  if (options.removeDuplicates || options.removeDiacritics) {
    result = removeDuplicates(result);
  }
  
  if (options.removeStopWords) {
    result = removeStopWords(result, options.stopWordsList || DEFAULT_STOP_WORDS);
  }
  
  result = result.map(removeSpecialCharacters).filter(w => w.length > 0);
  
  if (options.removeDuplicates || options.removeDiacritics) {
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
  if (!lemma) return lemma;
  
  let cleaned = lemma;
  const underscorePos = lemma.indexOf('_');
  if (underscorePos !== -1) {
    cleaned = lemma.substring(0, underscorePos);
  }
  
  cleaned = cleaned.replace(/-\d+$/, '');
  
  return cleaned;
};