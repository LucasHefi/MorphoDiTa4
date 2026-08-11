import { describe, it, expect } from 'vitest';
import { 
  removeDiacritics, 
  removeDuplicates, 
  removeStopWords, 
  removeSpecialCharacters,
  applyFilters,
  DEFAULT_STOP_WORDS,
  cleanLemma,
  canonicalKey,
} from './filters';

describe('Text Filters', () => {
  it('removeDiacritics removes czech diacritics and lowercases', () => {
    expect(removeDiacritics('Příliš žluťoučký kůň úpěl ďábelské ódy')).toBe('prilis zlutoucky kun upel dabelske ody');
  });

  it('removeDiacritics transliterates Polish L slash', () => {
    expect(removeDiacritics('Zażółć gęślą jaźń, Łódź')).toBe('zazolc gesla jazn, lodz');
  });

  it('normalizes equivalent NFC and NFD input identically', () => {
    const nfc = 'Příliš Łódź';
    expect(removeDiacritics(nfc.normalize('NFC'))).toBe(removeDiacritics(nfc.normalize('NFD')));
  });

  it('removeDuplicates removes duplicate words (case-insensitive)', () => {
    expect(removeDuplicates(['pes', 'kočka', 'pes', 'myš', 'Pes', 'KOČKA'])).toEqual(['pes', 'kočka', 'myš']);
  });

  it('canonicalKey is NFC-normalized and locale-independent', () => {
    for (const input of ['I\u0307', 'PÉS', 'pe\u0301s']) {
      const output = canonicalKey(input);
      expect(output).toBe(output.normalize('NFC'));
    }
    expect(canonicalKey('I\u0307')).toBe('i\u0307');
    expect(canonicalKey('i\u0307')).toBe(canonicalKey('İ'));
    expect(canonicalKey('I')).not.toBe(canonicalKey('ı'));
  });

  it('canonicalKey applies locale-independent Unicode case folding', () => {
    expect(canonicalKey('ΟΣ')).toBe(canonicalKey('οσ'));
    expect(canonicalKey('Straße')).toBe(canonicalKey('STRASSE'));
    expect(canonicalKey('ΟΣ')).toBe(canonicalKey('ος'));
    expect(canonicalKey('ſ')).toBe(canonicalKey('S'));
    expect(canonicalKey('ﬀ')).toBe(canonicalKey('FF'));
    expect(removeDuplicates(['ΟΣ', 'οσ', 'ος', 'Straße', 'STRASSE'])).toEqual(['ΟΣ', 'Straße']);
  });

  it('removeStopWords removes default stop words', () => {
    const input = ['pes', 'a', 'kočka', 'se', 'bude', 'mít', 'dobře'];
    const expected = ['pes', 'kočka', 'mít', 'dobře'];
    expect(removeStopWords(input, DEFAULT_STOP_WORDS)).toEqual(expected);
  });

  it('matches custom stopwords by diacritics only when requested', () => {
    const options = {
      removeDiacritics: false,
      removeStopWords: true,
      stopWordsList: ['či'],
    };
    expect(applyFilters(['či', 'ci'], options)).toEqual(['ci']);
    expect(applyFilters(['či', 'ci'], { ...options, removeDiacritics: true })).toEqual([]);
  });

  it('removeSpecialCharacters keeps letters from supported Unicode scripts only', () => {
    expect(removeSpecialCharacters('pes, kočka!')).toBe('peskočka');
    expect(removeSpecialCharacters('Zażółć gęślą jaźń')).toBe('Zażółćgęśląjaźń');
    expect(removeSpecialCharacters('Ελληνικά Привет 中文')).toBe('ΕλληνικάПривет中文');
  });

  it('removes combining marks, numbers, symbols, punctuation, and whitespace at boundaries', () => {
    expect(removeSpecialCharacters('1 é\u0301 2')).toBe('é');
    expect(removeSpecialCharacters('😀A😀')).toBe('A');
    expect(removeSpecialCharacters('123—A_B.')).toBe('AB');
  });

  it('normalizes canonically before retaining Unicode letters', () => {
    expect(removeSpecialCharacters('e\u0301')).toBe('é');
  });

  it('removes a Unicode combining mark outside the basic combining block', () => {
    const token = 'a\u1ab0'.normalize('NFC');
    expect(removeDiacritics(token)).toBe('a');
  });

  describe('applyFilters', () => {
    it('applies filters in the correct order', () => {
      const text = 'Příliš, příliš žluťoučký. Kůň a pes!';
      
      const options = {
        removeDiacritics: true,
        removeDuplicates: true,
        removeStopWords: true,
        removeSpecialCharacters: true
      };

      const result = applyFilters(text, options);
      // prilis, prilis zlutoucky kun a pes -> [prilis, prilis, zlutoucky, kun, a, pes]
      // removeDuplicates -> [prilis, zlutoucky, kun, a, pes]
      // removeStopWords -> [prilis, zlutoucky, kun, pes]
      
      expect(result).toEqual(['prilis', 'zlutoucky', 'kun', 'pes']);
    });

    it('removes duplicates created by diacritics removal', () => {
      const words = ['kočka', 'kocka'];
      const options = {
        removeDiacritics: true,
        removeDuplicates: true,
        removeStopWords: false,
        removeSpecialCharacters: false
      };
      const result = applyFilters(words, options);
      expect(result).toEqual(['kocka']);
    });

    it('keeps duplicates when diacritics are removed independently', () => {
      expect(applyFilters(['kočka', 'kocka'], {
        removeDiacritics: true,
        removeDuplicates: false,
        removeStopWords: false,
        removeSpecialCharacters: false,
      })).toEqual(['kocka', 'kocka']);
    });

    it('removes duplicates created by special character removal', () => {
      const words = ['kocka.', 'kocka'];
      const options = {
        removeDiacritics: false,
        removeDuplicates: true,
        removeStopWords: false,
        removeSpecialCharacters: true
      };
      const result = applyFilters(words, options);
      expect(result).toEqual(['kocka']);
    });
    it('preserves spaces and hyphens when special-character filtering is disabled', () => {
      expect(applyFilters(['česko-slovenský', 'Nový Sad'], {
        removeDiacritics: false,
        removeDuplicates: false,
        removeStopWords: false,
        removeSpecialCharacters: false,
      })).toEqual(['česko-slovenský', 'Nový Sad']);
    });

    it('handles Czech and Polish diacritics without corrupting Unicode', () => {
      expect(applyFilters(['Příliš', 'żółć', 'Łódź'], {
        removeDiacritics: true,
        removeDuplicates: true,
        removeStopWords: false,
        removeSpecialCharacters: false,
      })).toEqual(['prilis', 'zolc', 'lodz']);
    });

    it('handles a long token list without changing order', () => {
      const words = Array.from({ length: 5000 }, (_, index) => `slovo-${index}`);
      expect(applyFilters(words, {
        removeDiacritics: false,
        removeDuplicates: false,
        removeStopWords: false,
        removeSpecialCharacters: false,
      })).toEqual(words);
    });

    it('preserves first-seen order and does not mutate array input', () => {
      const words = ['Žába', 'pes!', 'žába', 'kočka', 'pes!'];
      const original = [...words];
      expect(applyFilters(words, {
        removeDiacritics: true,
        removeDuplicates: true,
        removeStopWords: false,
        removeSpecialCharacters: true,
      })).toEqual(['zaba', 'pes', 'kocka']);
      expect(words).toEqual(original);
    });

    it('handles empty inputs', () => {
      expect(applyFilters('', {})).toEqual([]);
      expect(applyFilters([], { removeDiacritics: true, removeSpecialCharacters: true })).toEqual([]);
    });

    it('keeps deterministic invariants across bounded option combinations', () => {
      const words = ['Čáp', 'čáp', 'hello-world', 'Hello World', '123', 'Łódź'];
      const original = [...words];
      for (const removeDiacriticsOption of [false, true]) {
        for (const removeDuplicatesOption of [false, true]) {
          for (const removeStopWordsOption of [false, true]) {
            for (const removeSpecialCharactersOption of [false, true]) {
              const options = {
                removeDiacritics: removeDiacriticsOption,
                removeDuplicates: removeDuplicatesOption,
                removeStopWords: removeStopWordsOption,
                removeSpecialCharacters: removeSpecialCharactersOption,
              };
              const result = applyFilters(words, options);
              expect(result).toEqual(applyFilters(words, options));
              expect(words).toEqual(original);
              if (removeDuplicatesOption) {
                expect(new Set(result.map(canonicalKey)).size).toBe(result.length);
              }
            }
          }
        }
      }
    });
  });

  describe('cleanLemma', () => {
    it('cleans suffixes, underscores, whitespace, and empty values idempotently', () => {
      for (const [input, expected] of [
        ['  pes-2  ', 'pes'],
        ['kočka_extra', 'kočka'],
        ['  žluťoučký_extra-12  ', 'žluťoučký'],
        ['pes-2-3', 'pes'],
        ['', ''],
        ['   ', ''],
      ]) {
        expect(cleanLemma(input)).toBe(expected);
        expect(cleanLemma(cleanLemma(input))).toBe(expected);
      }
    });

    it('handles very long tokens', () => {
      const token = `${'a'.repeat(100_000)}-42`;
      expect(cleanLemma(token)).toBe('a'.repeat(100_000));
    });
  });
});
