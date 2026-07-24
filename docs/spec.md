# MorphoDiTa Client v4 - Kompletní Specifikace Funkcí

## 1. Přehled Aplikace

MorphoDiTa Client v4 je multi-platformní desktopová aplikace pro morfologickou analýzu českého jazyka. Aplikace využívá MorphoDiTa REST API pro morfologické zpracování textu a lokální SQLite databázi pro ukládání výsledků.

### 1.1 Klíčové Vlastnosti

- **Dvě hlavní funkce**: Analýza textu + Průvodce klíčových slov
- **Multi-platform**: Windows, Linux, macOS (pomoću Tauri)
- **Témata**: Dark/Light mode s glassmorphism efekty
- **Jazyky**: Čeština (CZ), Angličtina (EN), Polština (PL)
- **Export**: CSV, JSON, TXT formáty
- **Offline režim**: Otevřeno pro budoucí implementaci

### 1.2 Technologický Stack

```json
{
  "frontend": "React 18+ / TypeScript 5+",
  "ui_framework": "TailwindCSS + shadcn/ui",
  "state_management": "Zustand",
  "database": "SQLite (přes Tauri backend)",
  "http_client": "fetch API",
  "backend": "Tauri (Rust)",
  "packaging": "Tauri CLI"
}
```

---

## 2. MorphoDiTa REST API

### 2.1 Konfigurace API

```typescript
interface APIConfig {
  base_url: string;  // "https://lindat.mff.cuni.cz/services/morphodita/api/"
  timeout: number;   // 30 (sekundy)
  retry_attempts: number;  // 3
}
```

### 2.2 Endpointy

| Endpoint | Metoda | Popis | Parametry |
|----------|--------|-------|-----------|
| `/models` | GET | Seznam dostupných modelů | - |
| `/tag` | POST | Morfologické tagování | data, model, output, guesser, input, derivation, convert_tagset |
| `/analyze` | POST | Detailní morfologická analýza | data, model, output, guesser, input, derivation, convert_tagset |
| `/generate` | POST | Generování forem slov | data, model, output, guesser, convert_tagset |
| `/tokenize` | POST | Tokenizace textu | data, model, output, guesser, input |

### 2.3 Parametry Operací

#### Společné parametry
| Parametr | Typ | Výchozí | Popis |
|----------|-----|---------|-------|
| `data` | string | - | Vstupní text (povinný) |
| `model` | string | - | Název modelu (povinný) |
| `output` | string | "json" | Formát výstupu: json/xml/vertical |
| `guesser` | boolean | true | Použít guesser pro neznámá slova |
| `input` | string | "untokenized" | Formát vstupu: untokenized/vertical |
| `derivation` | string | "none" | Typ odvození: none/root/path/tree |
| `convert_tagset` | string | null | Konverze tagsetu: pdt_to_conll2009/strip_lemma_comment/strip_lemma_id |

#### Operace Tag (Morfologické tagování)
```
Input:  Text (slova oddělená novými řádky, čárkami, středníky)
Output: Tokeny s nejlepší morfologickou analýzou

Pipeline:
1. Tokenizace vstupu
2. Morfologická analýza každého tokenu
3. Vrácení nejlepší analýzy (podle probability)

Použití: Rychlé získání lemma + tag pro slova v textu
```

#### Operace Analyze (Detailní morfologická analýza)
```
Input:  Text + derivation parameter
Output: Detailní analýza s odvozením

derivation options:
- none: pouze lemma + tag
- root: + kořen slova
- path: + cesta od kořene
- tree: + celý derivační strom

Rozdíl oproti Tag: Více kontextových informací
```

#### Operace Generate (Generování forem)
```
Input:  Seznam lemmat (jedno na řádek)
Output: Všechny možné morfologické formy

Pipeline:
1. Pro každé lemma získat tag z analýzy
2. Vygenerovat všechny skloňování/časování
3. Vrátit seznam forem s pravděpodobností

Příklad:
  Input:  "běžet"
  Output: "běžím, běžíš, běží, běžíme, běžíte, běží, ..."
```

#### Operace Tokenize (Tokenizace)
```
Input:  Text
Output: Seznam tokenů (slova, interpunkce)

Použití: Rozdělení textu na jednotlivé tokeny
```

### 2.4 Datové Modely API

```typescript
// Informace o modelu
interface ModelInfo {
  name: string;              // "czech-morfflex2.1-pdtc2.0-250909"
  language: string;          // "czech"
  capabilities: string[];    // ['tag', 'analyze', 'generate', 'tokenize']
  description?: string;
}

// Token z analýzy
interface Token {
  form: string;                    // Původní forma slova
  analyses: MorphologicalTag[];    // Seznam možných analýz
  best_analysis?: MorphologicalTag; // Nejlepší analýza
}

// Morfologický tag
interface MorphologicalTag {
  lemma: string;           // "běž"
  tag: string;             // "VB-S3DnA-P---"
  probability?: number;    // 0.95
}

// Vygenerovaná forma
interface GeneratedForm {
  form: string;           // "běžíme"
  lemma: string;          // "běžet"
  tag: string;            // "VB-I1PpA-P---"
  probability?: number;
}

// Odpověď z API
interface APIResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}
```

### 2.5 Defaultní Model

```
Výchozí model: czech-morfflex2.1-pdtc2.0-250909
Jazyk: czech
Poslední aktualizace: 2025-09-09
```

---

## 3. Databázová Struktura

### 3.1 SQLite Schema

```sql
-- Tabulka relací zpracování
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL,           -- 'tag', 'analyze', 'generate', 'tokenize'
    model TEXT NOT NULL,
    input_text TEXT NOT NULL,
    parameters TEXT,                   -- JSON
    result_count INTEGER DEFAULT 0,
    processing_time REAL,
    status TEXT DEFAULT 'pending',     -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Sjednocená tabulka morfologických dat
CREATE TABLE IF NOT EXISTS morphological_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL CHECK (source_type IN ('analysis', 'generation')),
    original_form TEXT,                -- Původní forma (pro analýzu)
    lemma TEXT NOT NULL,               -- Lemma
    tag TEXT NOT NULL,                 -- Tag
    generated_form TEXT,               -- Vygenerovaná forma (pro generování)
    probability REAL,
    session_id INTEGER,                -- FK → sessions(id)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indexy pro výkon
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_morphological_data_session_id ON morphological_data(session_id);
CREATE INDEX IF NOT EXISTS idx_morphological_data_lemma ON morphological_data(lemma);
CREATE INDEX IF NOT EXISTS idx_morphological_data_generated_form ON morphological_data(generated_form);
```

### 3.2 TypeScript Typy

```typescript
// Relace zpracování
interface Session {
  id?: number;
  operation: 'tag' | 'analyze' | 'generate' | 'tokenize';
  model: string;
  input_text: string;
  parameters: Record<string, any>;
  result_count: number;
  processing_time?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at?: string;
  completed_at?: string;
}

// Morfologická data (sjednocené)
interface MorphologicalData {
  id?: number;
  source_type: 'analysis' | 'generation';
  original_form?: string;    // Pro analýzu
  lemma: string;
  tag: string;
  generated_form?: string;   // Pro generování
  probability?: number;
  session_id?: number;
  created_at?: string;
}

// Helper metody pro Session
interface SessionMethods {
  markCompleted(resultCount: number, processingTime: number): void;
  markFailed(errorMessage: string): void;
  markProcessing(): void;
  getParametersJson(): string;
  setParametersJson(value: string): void;
}

// Helper metody pro MorphologicalData
interface MorphologicalDataMethods {
  isAnalysis(): boolean;
  isGeneration(): boolean;
}
```

### 3.3 Datové Vztahy

```
sessions (1) ──────< (N) morphological_data
                    │
                    ├─ source_type='analysis':
                    │   original_form = forma slova z textu
                    │   lemma = základní tvar
                    │   tag = morfologický tag
                    │
                    └─ source_type='generation':
                        lemma = původní lemma
                        tag = použitý tag
                        generated_form = vygenerovaná forma
```

---

## 4. Průvodce Klíčových Slov (Keyword Wizard)

### 4.1 4Krokový Proces

```
┌─────────────────────────────────────────────────────────────────────┐
│ KROK 1: Zadání klíčových slov                                      │
├─────────────────────────────────────────────────────────────────────┤
│ - Textové pole pro zadání slov (podporuje oddělovače: , ; \n)     │
│ - Výběr modelu z dropdownu                                          │
│ - Tlačítko pro obnovení seznamu modelů                             │
│ - Validace: text nesmí být prázdný, model musí být vybrán         │
│                                                                     │
│ Před zpracováním: kontrola která slova už v DB jsou                │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ KROK 2: Zpracování (automaticky)                                   │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Tagování klíčových slov → lemma + tag                           │
│ 2. Příprava lemma-tag párů pro generování                          │
│ 3. Generování všech forem                                          │
│ 4. Zobrazení progress bar + log                                    │
│                                                                     │
│ Pipeline detail:                                                   │
│ - tag_text(keywords, model) → Token[]                              │
│ - extrakce lemma z best_analysis                                   │
│ - generate_forms(lemmas, model) → GeneratedForm[]                  │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ KROK 3: Výsledky                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Záložka "Lemma":                                                   │
│   form → lemma (tag)                                               │
│   Příklad: "běží" → "běž" (VB-S3DnA-P---)                        │
│                                                                     │
│ Záložka "Generované formy":                                         │
│   Seskupeno podle lemma:                                           │
│   Lemma: běž (VB)                                                  │
│     ↳ běžím, běžíš, běží, běžíme, běžíte, ...                     │
│                                                                     │
│ Statistiky:                                                        │
│   - Počet klíčových slov                                           │
│   - Počet tokenů                                                   │
│   - Počet generovaných forem                                       │
│   - Model                                                         │
│   - Čas dokončení                                                  │
│                                                                     │
│ Filtry pro krok 4 (checkboxy):                                     │
│   ☐ Odstranit duplicity                                            │
│   ☐ Výstup bez diakritiky                                          │
│   ☐ Odstranit spojky/předložky/speciální znaky                     │
│   ☐ Zobrazit jen slova která nejsou v databázi                     │
│                                                                     │
│ Nastavení seznamu stop slov:                                       │
│   Nástroje → Nastavení → Průvodce                                  │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ KROK 4: Souhrnné výstupy                                            │
├─────────────────────────────────────────────────────────────────────┤
│ Panel 1: "Formy = Lemma" (forma → lemma mapping)                  │
│   Příklad: "běžíme = běž"                                          │
│   Filtry se aplikují konzistentně                                  │
│                                                                     │
│ Panel 2: "Zpracovaná lemmata" (všechna unikátní)                  │
│   Příklad: běž, kočka, pes, ...                                   │
│   Oddělené čárkami                                                 │
│                                                                     │
│ Panel 3: "Zpracované formy" (všechny unikátní)                    │
│   Příklad: běžím, běžíš, běží, kočka, ...                        │
│   Oddělené čárkami                                                 │
│                                                                     │
│ Po dokončení:                                                    │
│   1. Uložení do DB (sessions + morphological_data)                │
│   2. Otázka: "Chcete zpracovat další slova?"                      │
│      - Ano → reset wizardu, pokračování                           │
│      - Ne → zavření okna                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Filtry Textu

#### Pořadí aplikace filtrů (KRITICKÉ)

```
Input: Seznam slov/form

1. remove_diacritics (pokud zaškrtnuto)
   ↓
2. remove_duplicates (pokud zaškrtnuto)
   ↓
3. remove_stop_words (pokud zaškrtnuto)
   ↓
4. remove_special_characters (vždy)
   ↓
Output: Filtrovaný seznam
```

#### Detaily filtrů

```typescript
// 1. Odstranění diakritiky
function removeDiacritics(text: string): string {
  // Normalizace NFKD
  // Odstranění combining characters
  // Lowercase
  return asciiText.toLowerCase();
}

// 2. Odstranění duplicit (zachování pořadí)
function removeDuplicates(texts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const text of texts) {
    if (!seen.has(text)) {
      seen.add(text);
      result.push(text);
    }
  }
  return result;
}

// 3. Odstranění stop slov
function removeStopWords(texts: string[], stopWords: Set<string>): string[] {
  const stopWordsLower = new Set(stopWords.map(w => w.toLowerCase()));
  const stopWordsNoDiacritics = new Set(
    stopWords.map(w => removeDiacritics(w).toLowerCase())
  );
  
  return texts.filter(text => {
    const textLower = text.toLowerCase();
    const textNoDiac = removeDiacritics(text).toLowerCase();
    return !stopWordsLower.has(textLower) && !stopWordsNoDiac.has(textNoDiac);
  });
}

// 4. Odstranění speciálních znaků (vždy)
function removeSpecialCharacters(texts: string[]): string[] {
  return texts
    .map(text => text.replace(/[^a-zA-Z\u00C0-\u017F]/g, ''))  // jen písmena
    .filter(text => text.length > 0);
}
```

#### Výchozí Stop Words (seznam)
```
a, i, o, u, v, s, na, do, od, po, za, pod, k, s, pro, při, bez, o, 
před, přes, přede, přese, se, si, sebe, svůj, ten, tento, tato, toto, 
ti, tito, těchto, těmto, těmito, takový, taková, takové, takoví, 
takové, takových, takovým, takými, takými, každý, každá, každé, 
každí, každé, každých, každým, každými, každými, všechen, všechna, 
všechno, všichni, všechny, všech, všem, všemi, všemi, který, která, 
které, kteří, které, kterých, kterým, kterými, kterými, co, že, 
jako, protože, aby, když, pokud, nebo, a, ale, nebo, ani, buď, či
```

#### WizardConfig (nastavení filtrů)
```typescript
interface WizardConfig {
  remove_duplicates: boolean;      // false
  remove_diacritics: boolean;     // false
  filter_stop_words: boolean;     // false
  show_only_new_words: boolean;   // false
  stop_words_list: string;        // čárkou oddělený seznam
}
```

### 4.3 Uložení Výsledků do DB

```typescript
async function saveWizardResults(
  taggedTokens: Token[],
  generatedForms: GeneratedForm[],
  model: string,
  keywordsText: string
): Promise<number> {
  // 1. Vytvořit session
  const session: Session = {
    operation: 'analyze',  // Kombinovaná operace
    model,
    input_text: keywordsText,
    parameters: {},
    status: 'pending',
    result_count: 0,
  };
  const sessionId = await createSession(session);
  
  // 2. Uložit analýzu (z tagovaných tokenů)
  const morphData: MorphologicalData[] = [];
  for (const token of taggedTokens) {
    if (token.best_analysis) {
      morphData.push({
        source_type: 'analysis',
        original_form: token.form,
        lemma: cleanLemma(token.best_analysis.lemma),
        tag: token.best_analysis.tag,
        probability: token.best_analysis.probability,
        session_id: sessionId,
      });
    }
  }
  
  // 3. Uložit generování (z forem)
  for (const form of generatedForms) {
    morphData.push({
      source_type: 'generation',
      lemma: cleanLemma(form.lemma),
      tag: form.tag,
      generated_form: form.form,
      probability: form.probability,
      session_id: sessionId,
    });
  }
  
  // 4. Filtrovat duplicity
  const uniqueData = filterDuplicates(morphData);
  
  // 5. Hromadný INSERT
  await insertMorphologicalDataBatch(uniqueData);
  
  // 6. Aktualizovat session
  await updateSession(sessionId, {
    status: 'completed',
    result_count: uniqueData.length,
  });
  
  return uniqueData.length;
}

// Vyčištění lemma od anotací
function cleanLemma(lemma: string): string {
  // Odstranit anotace za podtržítkem
  const underscorePos = lemma.indexOf('_');
  if (underscorePos !== -1) {
    lemma = lemma.substring(0, underscorePos);
  }
  // Odstranit číselné přípony za pomlčkou (např. "na-1" → "na")
  lemma = lemma.replace(/-\d+$/, '');
  return lemma;
}
```

---

## 5. Hlavní Okno Analýzy (Analyzer)

### 5.1 Rozložení UI

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: Logo | Nástroje | Nastavení | Téma                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Model:    [Dropdown v8.0.0 ▼]  [⟳ Obnovit]                      │
│  Operace:  ◉ Tag   ○ Analyze   ○ Generate   ○ Tokenize            │
│                                                                     │
│  ┌─────────── Text vstupu ───────────┐                            │
│  │                                     │                            │
│  │  Zadejte text k zpracování...      │                            │
│  │                                     │                            │
│  └─────────────────────────────────────┘                            │
│                                                                     │
│  Pokročilé nastavení:  [▼]                                         │
│  ├─ Guesser: ☐ Yes/No                                              │
│  ├─ Input format: [untokenized ▼]                                  │
│  ├─ Derivation: [none ▼]                                           │
│  └─ Convert tagset: [none ▼]                                       │
│                                                                     │
│  [Zpracovat]                       │  [Export ▼]                   │
│                                     │  ├─ CSV                                                      │
│                                     │  ├─ JSON                                                    │
│                                     │  └─ TXT                                                    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Výsledky:                                                          │
│  [Lemma] [Formy] [JSON] [Statistiky]                               │
│  ┌─────────────────────────────────────┐                            │
│  │                                     │                            │
│  │  Výsledky se zobrazí...             │                            │
│  │                                     │                            │
│  └─────────────────────────────────────┘                            │
│                                                                     │
│  Log: [▼]                                                          │
│  [INFO] [WARNING] [ERROR] [Clear] [Search: ______]                │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Postup Zpracování

```typescript
async function processText(
  operation: 'tag' | 'analyze' | 'generate' | 'tokenize',
  model: string,
  inputText: string,
  options: AdvancedOptions
): Promise<OperationResult> {
  const startTime = Date.now();
  
  // 1. Vytvořit session
  const session = await createSession({
    operation,
    model,
    input_text: inputText,
    parameters: options,
    status: 'processing',
  });
  
  try {
    let result: any;
    
    // 2. Spustit operaci
    switch (operation) {
      case 'tag':
        result = await api.tagText(inputText, model, options);
        break;
      case 'analyze':
        result = await api.analyzeText(inputText, model, options);
        break;
      case 'generate':
        result = await api.generateForms(inputText, model, options);
        break;
      case 'tokenize':
        result = await api.tokenizeText(inputText, model, options);
        break;
    }
    
    // 3. Uložit do DB
    await saveToDatabase(result, session.id);
    
    // 4. Aktualizovat session
    await updateSession(session.id, {
      status: 'completed',
      result_count: result.length,
      processing_time: Date.now() - startTime,
    });
    
    return { success: true, data: result, session };
    
  } catch (error) {
    await updateSession(session.id, {
      status: 'failed',
      error_message: error.message,
    });
    return { success: false, error };
  }
}
```

### 5.3 Export Výsledků

```typescript
// Export do CSV
function exportToCSV(data: any[]): string {
  // Header řádek
  const headers = getHeaders(data);
  const rows = data.map(row => 
    headers.map(h => escapeCSV(row[h])).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

// Export do JSON
function exportToJSON(data: any[]): string {
  return JSON.stringify(data, null, 2);
}

// Export do TXT
function exportToTXT(data: any[]): string {
  return data.map(item => formatAsText(item)).join('\n\n');
}
```

---

## 6. Konfigurace Aplikace

### 6.1 Config struktura

```typescript
interface ApplicationConfig {
  api: {
    base_url: string;           // "https://lindat.mff.cuni.cz/services/morphodita/api/"
    timeout: number;            // 30
    retry_attempts: number;     // 3
  };
  gui: {
    theme: 'system' | 'light' | 'dark';
    window_size: [width: number, height: number];  // [1200, 800]
    font_size: number;          // 12
    font_family: string;        // "Segoe UI"
    tag_format: 'parsed' | 'raw';
  };
  database: {
    path: string;               // "morphodita.db"
    backup_enabled: boolean;    // true
    backup_interval_days: number;  // 7
    max_connections: number;    // 5
  };
  processing: {
    batch_size: number;         // 100
    max_workers: number;        // 4
    rate_limit_delay: number;   // 0.1
    enable_cache: boolean;      // true
    cache_ttl: number;          // 3600
  };
  logging: {
    level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
    file_enabled: boolean;      // true
    console_enabled: boolean;   // true
  };
  wizard: WizardConfig;
  default_model: string;        // "czech-morfflex2.1-pdtc2.0-250909"
}
```

### 6.2 Uložení Konfigurace

```
Konfigurace se ukládá do:
- Desktop: morphodita_config.json
- Linux: ~/.config/morphodita/config.json
- macOS: ~/Library/Application Support/com.morphodita/config.json
```

---

## 7. Model Management

### 7.1 Dynamické Načítání Modelů

```typescript
async function loadModels(): Promise<ModelInfo[]> {
  const response = await fetch(`${API_BASE_URL}/models`);
  const data = await response.json();
  
  // Parse models z response
  const models: ModelInfo[] = [];
  for (const [name, capabilities] of Object.entries(data.models)) {
    const language = name.split('-')[0];
    models.push({
      name,
      language,
      capabilities: capabilities as string[],
    });
  }
  
  return models;
}
```

### 7.2 Výběr Modelu

```typescript
// Najít nejnovější český model
function findLatestModel(models: ModelInfo[], language: string): string {
  const filtered = models.filter(m => m.language === language);
  if (filtered.length === 0) return DEFAULT_MODEL;
  
  // Seřadit podle data v názvu (nejnovější první)
  return filtered.sort((a, b) => {
    const dateA = a.name.split('-').pop();
    const dateB = b.name.split('-').pop();
    return dateB!.localeCompare(dateA!);
  })[0].name;
}
```

---

## 8. UI/UX Specifikace

### 8.1 Témata

```css
/* Dark Theme */
:root {
  --bg-primary: #0a0a0f;
  --bg-secondary: #1a1a2e;
  --bg-tertiary: #16213e;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --accent: #4c9aff;
  --accent-hover: #3a86ff;
  --border: #2a2a3e;
  --glass-bg: rgba(26, 26, 46, 0.8);
  --glass-border: rgba(255, 255, 255, 0.1);
}

/* Light Theme */
:root.light {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #e8e8e8;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --accent: #4c9aff;
  --accent-hover: #3a86ff;
  --border: #d0d0d0;
  --glass-bg: rgba(255, 255, 255, 0.8);
  --glass-border: rgba(0, 0, 0, 0.1);
}
```

### 8.2 Glassmorphism Efekty

```css
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
}

.glass-button {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  border: none;
  border-radius: 8px;
  color: white;
  transition: all 0.3s ease;
  box-shadow: 0 2px 10px rgba(76, 154, 255, 0.3);
}

.glass-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(76, 154, 255, 0.4);
}
```

### 8.3 Animace

```css
/* Fade in */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Slide in */
@keyframes slideIn {
  from { transform: translateX(-20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* Progress pulse */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Smooth transitions */
* {
  transition-property: background-color, border-color;
  transition-duration: 0.2s;
  transition-timing-function: ease-in-out;
}
```

### 8.4 Navigace

```
HomePage (rozcestník)
├── AnalyzerPage (Analýza textu)
│   ├── Model selector
│   ├── Operation selector (Tag/Analyze/Generate/Tokenize)
│   ├── Input text area
│   ├── Advanced options panel
│   ├── Action buttons (Process/Export)
│   ├── Result display
│   └── Log panel
│
└── WizardPage (Průvodce klíčových slov)
    ├── Step 1: Input keywords
    ├── Step 2: Processing (auto)
    ├── Step 3: Results with filters
    └── Step 4: Summary panels
```

---

## 9. I18N (Multi-language Podpora)

### 9.1 Jazykové Soubory

```typescript
// locales/en.ts
export const en = {
  home: {
    title: 'MorphoDiTa',
    subtitle: 'Morphological Analyzer for Czech Language',
    analyzer: 'Text Analyzer',
    analyzerDesc: 'Morphological tagging, analysis and form generation',
    wizard: 'Keyword Wizard',
    wizardDesc: 'Batch processing with form generation and filters',
  },
  analyzer: {
    model: 'Model',
    operation: 'Operation',
    tag: 'Tag',
    analyze: 'Analyze',
    generate: 'Generate',
    tokenize: 'Tokenize',
    input: 'Input Text',
    process: 'Process',
    export: 'Export',
  },
  wizard: {
    step1: 'Enter Keywords',
    step2: 'Processing',
    step3: 'Results',
    step4: 'Summary',
    filters: 'Filters',
    removeDuplicates: 'Remove duplicates',
    removeDiacritics: 'Remove diacritics',
    removeStopWords: 'Remove stop words',
    showOnlyNew: 'Show only new words',
  },
  // ... more sections
};

// locales/cs.ts (stejná struktura, české texty)
// locales/pl.ts (stejná struktura, polské texty)
```

### 9.2 Použití

```typescript
import { useTranslation } from 'react-i18next';

function Component() {
  const { t, i18n } = useTranslation();
  
  return <button>{t('analyzer.process')}</button>;
}
```

---

## 10. Tauri Backend

### 10.1 Rust Struktura

```rust
// src-tauri/src/db.rs
use sqlx::{SqlitePool, Pool};

#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    id: Option<i64>,
    operation: String,
    model: String,
    input_text: String,
    parameters: Option<String>,
    result_count: i32,
    processing_time: Option<f64>,
    status: String,
    error_message: Option<String>,
    created_at: Option<String>,
    completed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MorphologicalData {
    id: Option<i64>,
    source_type: String,
    original_form: Option<String>,
    lemma: String,
    tag: String,
    generated_form: Option<String>,
    probability: Option<f64>,
    session_id: Option<i64>,
    created_at: Option<String>,
}

#[tauri::command]
async fn create_session(pool: sqlx::Data<Pool<Sqlite>>, session: Session) -> Result<i64, String> {
    // Implementace
}

#[tauri::command]
async fn insert_morphological_data(
    pool: sqlx::Data<Pool<Sqlite>>,
    data: Vec<MorphologicalData>
) -> Result<i64, String> {
    // Implementace
}
```

### 10.2 Tauri Commands

```rust
// src-tauri/src/commands.rs
use tauri::State;
use sqlx::Pool;
use sqlx::sqlite::SqlitePool;

#[tauri::command]
pub async fn create_session(
    pool: State<DbPool>,
    session: Session
) -> Result<i64, String> {
    // Vytvoření session v DB
}

#[tauri::command]
pub async fn insert_morphological_data(
    pool: State<DbPool>,
    data: Vec<MorphologicalData>
) -> Result<i64, String> {
    // Hromadný INSERT
}

#[tauri::command]
pub async fn get_sessions(
    pool: State<DbPool>,
    limit: Option<i32>
) -> Result<Vec<Session>, String> {
    // Získání session
}

#[tauri::command]
pub async fn search_morphological_data(
    pool: State<DbPool>,
    query: Option<String>,
    source_type: Option<String>
) -> Result<Vec<MorphologicalData>, String> {
    // Vyhledávání v datech
}
```

---

## 11. Bezpečnost a Chybové Handling

### 11.1 Chybové Typy

```typescript
class MorphoDiTaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MorphoDiTaError';
  }
}

class APIError extends MorphoDiTaError {
  constructor(
    message: string,
    public statusCode?: number,
    public responseText?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

class ValidationError extends MorphoDiTaError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class DatabaseError extends MorphoDiTaError {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}
```

### 11.2 Retry Logika

```typescript
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new APIError(`HTTP ${response.status}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new APIError('Max retries exceeded');
}
```

---

## 12. Implementační Checklist

### Fáze 1: Základní Struktura
- [ ] Vytvořit projekt Tauri + React + TypeScript
- [ ] Konfigurace Vite
- [ ] Nastavení TailwindCSS
- [ ] Implementace šablony pro komponenty
- [ ] Nastavení Zustand store

### Fáze 2: API Integrace
- [ ] Implementace API klienta
- [ ] Načítání modelů
- [ ] Operace Tag
- [ ] Operace Analyze
- [ ] Operace Generate
- [ ] Operace Tokenize
- [ ] Error handling a retry

### Fáze 3: Databáze
- [ ] Nastavení SQLite přes Tauri
- [ ] Migrace schema
- [ ] CRUD operace pro sessions
- [ ] CRUD operace pro morphological_data
- [ ] Query funkce

### Fáze 4: UI - Analyzer
- [ ] HomePage (rozcestník)
- [ ] AnalyzerPage layout
- [ ] Model selector
- [ ] Operation selector
- [ ] Input text area
- [ ] Advanced options
- [ ] Result display
- [ ] Log panel

### Fáze 5: UI - Wizard
- [ ] WizardPage layout
- [ ] Step 1: Input
- [ ] Step 2: Processing
- [ ] Step 3: Results
- [ ] Step 4: Summary
- [ ] Filtry textu
- [ ] Uložení do DB

### Fáze 6: UI/UX
- [ ] Dark/Light téma
- [ ] Glassmorphism efekty
- [ ] Animace a přechody
- [ ] Responsive layout
- [ ] Progress indicators

### Fáze 7: Export a I18N
- [ ] Export CSV
- [ ] Export JSON
- [ ] Export TXT
- [ ] I18n CZ
- [ ] I18n EN
- [ ] I18n PL

### Fáze 8: Testování a Balení
- [ ] Unit testy
- [ ] Integration testy
- [ ] Build pro Windows
- [ ] Build pro Linux
- [ ] Build pro macOS
- [ ] Dokumentace

## Offline Mode via Sidecar (added 2026-05-25)

Offline mode (toggle in Settings) uses the official pre-compiled \morphodita-server\ REST binary (see https://ufal.mff.cuni.cz/morphodita/install , make server target) as Tauri sidecar.
- Local models scanned from \\/morphodita/models/<model-id>/\ (subdirs); .mor files user-provided or optionally bundled.
- Sidecar launched on-demand (port 8765) when offline + first API call; transparent switch of BASE_URL in services/api.ts.
- API shape identical to Lindat public endpoint; full parity for tag/analyze/generate/tokenize.
- Batching (default 50) applied to long Analyzer inputs + Wizard (split lines preferred, else words; sequential + 100ms delay).
- Installer (NSIS): always includes sidecar binary + models/ placeholder; post-install hook (registry-driven) removes models/ for 'online only' choice.
- No internet: fully functional if models present. Toggle seamless (re-fetch models on change).
- Future: support for multiple sidecar versions, custom ports.

## Batching & About (Phase 4/6)
- New /about route + nav + Settings link. Static info (author, MPL 2.0, version, tech, UFAL link).
- Home always shows compact ModelSelector + 'Výběr modelu' text above cards; cards never disabled.

