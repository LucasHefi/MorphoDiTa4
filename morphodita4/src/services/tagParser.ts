import { TagComponents } from '../types/api';
import i18n from '../locales/i18n';

export class TagParser {
  static WORD_CLASSES: Record<string, string> = {
    'N': 'tagset.wordClass.N',
    'V': 'tagset.wordClass.V',
    'A': 'tagset.wordClass.A',
    'P': 'tagset.wordClass.P',
    'C': 'tagset.wordClass.C',
    'D': 'tagset.wordClass.D',
    'R': 'tagset.wordClass.R',
    'J': 'tagset.wordClass.J',
    'T': 'tagset.wordClass.T',
    'I': 'tagset.wordClass.I',
    'Z': 'tagset.wordClass.Z',
    'X': 'tagset.wordClass.X'
  };

  static NOUN_SUBTYPES: Record<string, string> = {
    'N': 'tagset.subtype.noun.N',
    'H': 'tagset.subtype.noun.H'
  };

  static VERB_SUBTYPES: Record<string, string> = {
    'B': 'tagset.subtype.verb.B',
    'c': 'tagset.subtype.verb.c',
    'e': 'tagset.subtype.verb.e',
    'f': 'tagset.subtype.verb.f',
    'i': 'tagset.subtype.verb.i',
    'p': 'tagset.subtype.verb.p',
    'q': 'tagset.subtype.verb.q',
    't': 'tagset.subtype.verb.t',
    'w': 'tagset.subtype.verb.w',
    'I': 'tagset.subtype.verb.I',
    'F': 'tagset.subtype.verb.F',
    'R': 'tagset.subtype.verb.R'
  };

  static ADJECTIVE_SUBTYPES: Record<string, string> = {
    '2': 'tagset.subtype.adj.2',
    'N': 'tagset.subtype.adj.N',
    'W': 'tagset.subtype.adj.W'
  };

  static PRONOUN_SUBTYPES: Record<string, string> = {
    '1': 'tagset.subtype.pron.1',
    '2': 'tagset.subtype.pron.2',
    '3': 'tagset.subtype.pron.3',
    '4': 'tagset.subtype.pron.4',
    '5': 'tagset.subtype.pron.5',
    '6': 'tagset.subtype.pron.6',
    '7': 'tagset.subtype.pron.7',
    '8': 'tagset.subtype.pron.8',
    '9': 'tagset.subtype.pron.9'
  };

  static GENDERS: Record<string, string> = {
    'M': 'tagset.gender.M',
    'F': 'tagset.gender.F',
    'N': 'tagset.gender.N',
    'I': 'tagset.gender.I',
    'Y': 'tagset.gender.Y',
    'T': 'tagset.gender.T',
    'H': 'tagset.gender.H',
    'Q': 'tagset.gender.Q',
    'U': 'tagset.gender.U'
  };

  static CASES: Record<string, string> = {
    '1': 'tagset.case.1',
    '2': 'tagset.case.2',
    '3': 'tagset.case.3',
    '4': 'tagset.case.4',
    '5': 'tagset.case.5',
    '6': 'tagset.case.6',
    '7': 'tagset.case.7',
    'X': 'tagset.case.X',
    'Y': 'tagset.case.Y',
    'Z': 'tagset.case.Z'
  };

  static NUMBERS: Record<string, string> = {
    'S': 'tagset.number.S',
    'P': 'tagset.number.P',
    'D': 'tagset.number.D',
    'W': 'tagset.number.W',
    'X': 'tagset.number.X'
  };

  static parseTag(tag: string): TagComponents {
    if (!tag || tag.length !== 15) {
      return {
        rawTag: tag || "",
        wordClass: "",
        subtype: "",
        gender: "",
        case: "",
        number: "",
        possessivity: i18n.t('tagset.possessivity.none')
      };
    }

    const pos1 = tag[0];
    const pos2 = tag[1];
    const pos3 = tag[2]; // Gender in Python was tag[2]
    const pos4 = tag[3]; // Number in Python was tag[3]
    const pos5 = tag[4]; // Case in Python was tag[4]
    
    // Note: Python code used:
    // word_class = cls._parse_word_class(tag[0])
    // subtype = cls._parse_subtype(tag[0], tag[1])
    // gender = cls._parse_gender(tag[2])
    // number = cls._parse_number(tag[3])
    // case = cls._parse_case(tag[4])
    // possessivity = cls._parse_possessivity(tag[5:15])

    return {
      rawTag: tag,
      wordClass: this.WORD_CLASSES[pos1] ? i18n.t(this.WORD_CLASSES[pos1]) : i18n.t('tagset.unknown', { val: pos1 }),
      subtype: this.getSubtype(pos1, pos2),
      gender: pos3 === '-' ? "" : (this.GENDERS[pos3] ? i18n.t(this.GENDERS[pos3]) : i18n.t('tagset.unknown', { val: pos3 })),
      number: pos4 === '-' ? "" : (this.NUMBERS[pos4] ? i18n.t(this.NUMBERS[pos4]) : i18n.t('tagset.unknown', { val: pos4 })),
      case: pos5 === '-' ? "" : (this.CASES[pos5] ? i18n.t(this.CASES[pos5]) : i18n.t('tagset.unknown', { val: pos5 })),
      possessivity: this.parsePossessivity(tag.substring(5, 15))
    };
  }

  private static getSubtype(pos1: string, pos2: string): string {
    if (pos2 === '-') return "";
    
    let key = "";
    if (pos1 === 'N') key = this.NOUN_SUBTYPES[pos2];
    else if (pos1 === 'V') key = this.VERB_SUBTYPES[pos2];
    else if (pos1 === 'A') key = this.ADJECTIVE_SUBTYPES[pos2];
    else if (pos1 === 'P') key = this.PRONOUN_SUBTYPES[pos2];
    
    return key ? i18n.t(key) : (pos1 === 'N' || pos1 === 'V' || pos1 === 'A' || pos1 === 'P' ? i18n.t('tagset.unknown', { val: pos2 }) : "");
  }

  private static parsePossessivity(pos6_15: string): string {
    if (pos6_15 === '----------') return i18n.t('tagset.possessivity.none');
    
    const person = pos6_15[0];
    const number = pos6_15[1];
    const gender = pos6_15[2];
    const caseVal = pos6_15[5];

    if (caseVal !== '-' && caseVal !== 'A') {
      const details: string[] = [];
      if (person !== '-') {
        details.push(i18n.t(`tagset.possessivity.person.${person}`, { defaultValue: `osoba ${person}` }));
      }
      if (number !== '-') {
        details.push(i18n.t(`tagset.possessivity.number.${number}`, { defaultValue: `číslo ${number}` }));
      }
      if (gender !== '-') {
        details.push(i18n.t(`tagset.possessivity.gender.${gender}`, { defaultValue: `rod ${gender}` }));
      }
      if (caseVal !== '-') {
        details.push(i18n.t(`tagset.possessivity.case.${caseVal}`, { defaultValue: `pád ${caseVal}` }));
      }
      return `${i18n.t('tagset.possessivity.title')} (${details.join(', ')})`;
    }

    return i18n.t('tagset.possessivity.none');
  }

  static formatTagCompact(tag: string): string {
    const components = this.parseTag(tag);
    const parts: string[] = [];
    if (components.wordClass) parts.push(components.wordClass);
    if (components.subtype) parts.push(components.subtype);
    if (components.gender) parts.push(components.gender);
    if (components.case) parts.push(components.case);
    if (components.number) parts.push(components.number);
    if (components.possessivity && components.possessivity !== i18n.t('tagset.possessivity.none')) {
      parts.push(`(${components.possessivity})`);
    }

    return parts.length > 0 ? parts.join(', ') : i18n.t('tagset.unknown_tag');
  }
}
