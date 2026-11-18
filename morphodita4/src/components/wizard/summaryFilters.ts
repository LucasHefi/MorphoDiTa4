import { canonicalKey, cleanLemma, removeDiacritics } from '../../services/filters';
import type { GeneratedForm, TaggedToken } from '../../types/api';
import type { DatabasePayload } from '../../types/database';

export type ColumnId = 'relations' | 'lemmas' | 'forms';
export interface ColumnFilters { duplicates: boolean; diacritics: boolean; forbidden: boolean; functionWords: boolean; existing: boolean }
export interface SummarySettings { columns: Record<ColumnId, ColumnFilters>; forbiddenWords: string[] }
const defaults = (): ColumnFilters => ({ duplicates: false, diacritics: false, forbidden: false, functionWords: false, existing: false });
export const defaultSummarySettings = (): SummarySettings => ({ columns: { relations: defaults(), lemmas: defaults(), forms: defaults() }, forbiddenWords: [] });
const storageKey = 'morphodita.summary.filters.v1';
export function readSummarySettings(): SummarySettings {
  const base = defaultSummarySettings();
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!value || typeof value !== 'object') return base;
    for (const id of ['relations', 'lemmas', 'forms'] as const) for (const key of Object.keys(base.columns[id]) as Array<keyof ColumnFilters>) {
      if (typeof value.columns?.[id]?.[key] === 'boolean') base.columns[id][key] = value.columns[id][key];
    }
    if (Array.isArray(value.forbiddenWords)) base.forbiddenWords = value.forbiddenWords.filter((x: unknown): x is string => typeof x === 'string');
  } catch { /* Invalid or unavailable storage: safe defaults. */ }
  return base;
}
export function writeSummarySettings(settings: SummarySettings): void { try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* UI remains usable. */ } }

// Curated Czech function words. Word-form lists are necessarily incomplete and context dependent.
export const FUNCTION_WORDS = `v ve z ze s se k ke o u do od ode na nad nade pod pode před přede přes přese při pro po za bez beze mezi mimo místo kolem okolo vedle podle kvůli proti naproti skrze prostřednictvím během kromě až a i ani nebo anebo či avšak ale nýbrž jenže že aby abych abys abychom abyste protože poněvadž jelikož jelikožto pokud když kdyžto kdyby kdybych kdybys kdybychom kdybyste jestli jestliže jak jako jakmile sotva zatímco zatím však sice leč než dokud dokonce zda zdali neboť přičemž tudíž ač ačkoli ačkoliv pakliže sotvaže ledaže poněvadžto čili neboli jakž jakoby nežli jelikožto já mě mne mně mi mnou ty tebe tě tobě ti tebou on ona ono oni ony je jeho ho mu jemu jej ji jí jich jim jimi ním ní nich nimi nám nás námi vám vás vámi my vy se si sebe sobě svůj své svého svému svým svých svými svá svou svoji svoje ten ta to toho tomu tom tím té tu ti ty těch těm těmi tato tento toto tohoto tomuto tomto těmito této těhto tyto tento tenhle tahle tohle kdo koho komu kom kým co což čeho čemu čím který kteráž kterýž jehož jejíž jež jenž která které kterého kterému kterým kterých kterými kterou kteří jaký jaká jaké jakého jakému jakým jakých jakými jakou jakákoliv kdokoliv cokoli někdo někoho někomu někým něco něčeho něčemu něčím nikdo nikoho nikomu nikým nic ničeho ničemu ničím každý každá každé každého každému každým každých každými můj má mé moji moje mého mému mou mým mých mými tvůj tvá tvé tvoje tvého tvému tvou tvým tvých tvými náš naše našeho našemu naším našich našimi váš vaše vašeho vašemu vaším vašich vašimi jejich její jejího jejím jejích jejímu jejímž ach achich ouha au auvej jé jejej jéje jejda jupí hurá halo hej hola hop bác bum buch bác cink haf mňau brr fuj uf fňuk pšt pst tss ha hle vida nu což inu`.split(/\s+/u);
export interface SummaryRow { value: string; lemma?: string; source: string; tag?: string; probability?: number | null; sourceType?: 'analysis' | 'generation' }
export function summaryRows(tokens: TaggedToken[], forms: GeneratedForm[]): SummaryRow[] {
  return [...tokens.map(t => ({ value: t.token, lemma: cleanLemma(t.lemma), source: t.token, tag: t.tag, probability: t.probability, sourceType: 'analysis' as const })), ...forms.map(f => ({ value: f.form, lemma: cleanLemma(f.lemma), source: f.form, tag: f.tag, probability: f.probability, sourceType: 'generation' as const }))];
}
export function filterColumn(rows: SummaryRow[], id: ColumnId, options: ColumnFilters, forbidden: string[], existing: ReadonlySet<string>): string[] {
  const excluded = new Set([...(options.forbidden ? forbidden : []), ...(options.functionWords ? FUNCTION_WORDS : [])].map(x => canonicalKey(options.diacritics ? removeDiacritics(x) : x)));
  const seen = new Set<string>(); const out: string[] = [];
  for (const row of rows) {
    const raw = id === 'lemmas' ? row.lemma ?? '' : row.value;
    if (!raw) continue;
    const value = options.diacritics ? removeDiacritics(raw) : raw;
    if (options.existing && (existing.has(canonicalKey(raw)) || existing.has(canonicalKey(value)))) continue;
    const lemma = options.diacritics ? removeDiacritics(row.lemma ?? '') : row.lemma ?? '';
    const excludedLemma = lemma;
    if (excluded.has(canonicalKey(value)) || (id === 'relations' && excluded.has(canonicalKey(excludedLemma)))) continue;
    const key = canonicalKey(value);
    if (options.duplicates && seen.has(key)) continue;
    seen.add(key);
    out.push(id === 'relations' ? `${value} = ${lemma}` : value);
  }
  return out.sort((a,b) => a.localeCompare(b));
}

/** Persist the union of visible values. A form's original lemma and tag remain metadata. */
export function visibleDatabaseRows(results: Record<ColumnId, string[]>, rows: SummaryRow[], settings: SummarySettings): DatabasePayload[] {
  const payload: DatabasePayload[] = [];
  const keys = new Set<string>();
  const transform = (value: string, id: ColumnId) => settings.columns[id].diacritics ? removeDiacritics(value) : value;
  const add = (form: string | null, lemma: string, row: SummaryRow | undefined) => {
    if (!lemma || !row?.tag) return;
    const sourceType = form === null ? 'analysis' : row.sourceType ?? 'analysis';
    const key = JSON.stringify([form, lemma, row.tag, sourceType]);
    if (keys.has(key)) return;
    keys.add(key);
    payload.push({ session_id: null, source_type: sourceType, original_form: sourceType === 'analysis' ? form : null, lemma, tag: row.tag, generated_form: sourceType === 'generation' ? form : null, probability: row.probability ?? null });
  };
  const relationRows = new Map<string, SummaryRow>(), formRows = new Map<string, SummaryRow>(), lemmaRows = new Map<string, SummaryRow>();
  for (const row of rows) {
    const relation = `${transform(row.value, 'relations')} = ${transform(row.lemma ?? '', 'relations')}`;
    const form = transform(row.value, 'forms'), lemma = transform(row.lemma ?? '', 'lemmas');
    if (!relationRows.has(relation)) relationRows.set(relation, row);
    if (!formRows.has(form)) formRows.set(form, row);
    if (!lemmaRows.has(lemma)) lemmaRows.set(lemma, row);
  }
  for (const value of results.relations) {
    const separator = value.indexOf(' = ');
    if (separator < 0) continue;
    const form = value.slice(0, separator), lemma = value.slice(separator + 3);
    const row = relationRows.get(value);
    add(form, lemma, row);
  }
  for (const value of results.forms) {
    const row = formRows.get(value);
    if (row) add(value, row.lemma ?? '', row);
  }
  for (const value of results.lemmas) {
    const row = lemmaRows.get(value);
    add(null, value, row);
  }
  return payload;
}
