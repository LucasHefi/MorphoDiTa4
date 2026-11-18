import { afterAll, describe, expect, it } from 'vitest';
import i18n from '../locales/i18n';
import { TagParser } from './tagParser';
const original = i18n.language;
afterAll(async () => { await i18n.changeLanguage(original); });
describe('PDT tag explanations (ÚFAL positional-tag specification)', () => {
  it.each([
    ['cs', 'Střední', 'Mužský neživotný', 'Interpunkce', 'Infinitiv'],
    ['en', 'Neuter', 'Masculine inanimate', 'Punctuation', 'Infinitive'],
    ['pl', 'Nijaki', 'Męski nieżywotny', 'Interpunkcja', 'Bezokolicznik'],
  ])('explains basic codes correctly in %s', async (lang, neuter, inanimate, punctuation, infinitive) => {
    await i18n.changeLanguage(lang);
    expect(TagParser.parseTag('NNNS1-----A----').gender).toBe(neuter);
    expect(TagParser.parseTag('NNIS4-----A----').gender).toBe(inanimate);
    expect(TagParser.parseTag('Z:-------------').wordClass).toBe(punctuation);
    expect(TagParser.parseTag('Vf--------A----').subtype).toBe(infinitive);
  });
  it('does not turn negation into possessivity, and reads possessor gender and number at positions 6 and 7', async () => {
    await i18n.changeLanguage('cs');
    expect(TagParser.parseTag('NNIS1-----N----').possessivity).toBe('Žádná');
    expect(TagParser.parseTag('PSFS1FS1-------').possessivity).toContain('Ženský');
    expect(TagParser.parseTag('PSFS1FS1-------').possessivity).toContain('singulár');
    expect(TagParser.parseTag('PSFS1FS1-------').possessivity).not.toContain('osoba');
  });
  it('distinguishes present forms, transgressives, imperative and participles', async () => {
    await i18n.changeLanguage('cs');
    expect(TagParser.parseTag('VB-P---3P-AAI--').subtype).toBe('Přítomný nebo budoucí tvar');
    expect(TagParser.parseTag('VeYS------A-P-4').subtype).toBe('Přechodník přítomný');
    expect(TagParser.parseTag('Vi-S---2--A----').subtype).toBe('Rozkazovací způsob');
    expect(TagParser.parseTag('VsYS---XX-AP---').subtype).toBe('Příčestí trpné');
    expect(TagParser.parseTag('AAIS4----1A----').subtype).toBe('Běžné přídavné jméno');
    expect(TagParser.parseTag('P8FS1----------').subtype).toBe('Zvratné přivlastňovací (svůj)');
  });
});
