import { describe, it, expect } from 'vitest';
import { 
  removeDiacritics, 
  removeDuplicates, 
  removeStopWords, 
  removeSpecialCharacters, 
  applyFilters,
  DEFAULT_STOP_WORDS 
} from './filters';

describe('Text Filters', () => {
  it('removeDiacritics removes czech diacritics and lowercases', () => {
    expect(removeDiacritics('Příliš žluťoučký kůň úpěl ďábelské ódy')).toBe('prilis zlutoucky kun upel dabelske ody');
  });

  it('removeDuplicates removes duplicate words (case-insensitive)', () => {
    expect(removeDuplicates(['pes', 'kočka', 'pes', 'myš', 'Pes', 'KOČKA'])).toEqual(['pes', 'kočka', 'myš']);
  });

  it('removeStopWords removes default stop words', () => {
    const input = ['pes', 'a', 'kočka', 'se', 'bude', 'mít', 'dobře'];
    const expected = ['pes', 'kočka', 'mít', 'dobře'];
    expect(removeStopWords(input, DEFAULT_STOP_WORDS)).toEqual(expected);
  });

  it('removeSpecialCharacters removes non-letter characters', () => {
    // Spec §4.2: "jen písmena" — no spaces, no hyphens
    expect(removeSpecialCharacters('pes, kočka!')).toBe('peskočka');
    expect(removeSpecialCharacters('hello-world')).toBe('helloworld');
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
  });
});
