# MorphoDiTa v4 - Development Guide

## Přehled

Tento dokument obsahuje pravidla a konvence pro vývoj nové aplikace MorphoDiTa Client v4.

---

## Technologický Stack

### Frontend
- **React 18+**: UI framework s hooks
- **TypeScript 5+**: Statická typová kontrola
- **Vite**: Build tool a dev server
- **TailwindCSS**: Utility-first CSS framework
- **shadcn/ui**: Přístupné komponenty
- **Zustand**: State management
- **react-i18next**: Internacionalizace

### Backend
- **Tauri**: Desktop framework (náhrada za Electron)
- **Rust**: Backend logika
- **SQLx**: SQLite database pro Rust

### Vývojářské Nástroje
- **pnpm**: Package manager
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Vitest**: Unit testing

---

## Struktura Projektu

```
MorphoDiTa4/
├── docs/                          # Dokumentace
│   ├── spec.md                    # Kompletní specifikace funkcí
│   ├── api_spec.md                # API reference
│   ├── database_schema.md         # Schema a migrace
│   ├── ui_guide.md                # UI/UX design guidelines
│   ├── development_guide.md       # Tento dokument
│   ├── agents.md                  # Checklist pro agenty
│   └── README.md                  # Úvod do dokumentace
│
├── morphodita4/                   # Nová aplikace
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── index.html
│   │
│   ├── src/
│   │   ├── main.ts                # Tauri entry point
│   │   ├── App.tsx                # Hlavní React komponenta
│   │   ├── main.tsx               # React entry point
│   │   ├── env.d.ts               # TypeScript env types
│   │   │
│   │   ├── pages/                 # Hlavní stránky
│   │   │   ├── HomePage.tsx       # Rozcestník
│   │   │   ├── AnalyzerPage.tsx   # Analýza textu
│   │   │   └── WizardPage.tsx     # Průvodce klíčových slov
│   │   │
│   │   ├── components/            # React komponenty
│   │   │   ├── layout/            # Layout komponenty
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Footer.tsx
│   │   │   │
│   │   │   ├── common/            # Společné komponenty
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── TextArea.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Tabs.tsx
│   │   │   │   ├── ProgressBar.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Tooltip.tsx
│   │   │   │   └── Spinner.tsx
│   │   │   │
│   │   │   ├── analyzer/          # Analyzer komponenty
│   │   │   │   ├── ModelSelector.tsx
│   │   │   │   ├── OperationSelector.tsx
│   │   │   │   ├── TextInput.tsx
│   │   │   │   ├── AdvancedOptions.tsx
│   │   │   │   ├── ResultPanel.tsx
│   │   │   │   ├── LogPanel.tsx
│   │   │   │   └── ExportMenu.tsx
│   │   │   │
│   │   │   ├── wizard/            # Wizard komponenty
│   │   │   │   ├── WizardStepper.tsx
│   │   │   │   ├── WizardInput.tsx
│   │   │   │   ├── WizardProcessing.tsx
│   │   │   │   ├── WizardResults.tsx
│   │   │   │   ├── WizardSummary.tsx
│   │   │   │   └── FilterPanel.tsx
│   │   │   │
│   │   │   └── database/          # Database komponenty
│   │   │       ├── SessionList.tsx
│   │   │       └── DataBrowser.tsx
│   │   │
│   │   ├── services/              # Business logic services
│   │   │   ├── api.ts             # API klient pro MorphoDiTa
│   │   │   ├── database.ts        # SQLite operace
│   │   │   ├── filters.ts         # Textové filtry
│   │   │   ├── validators.ts      # Validace vstupů
│   │   │   ├── formatters.ts      # Formátování výstupů
│   │   │   └── models.ts          # Datové modely
│   │   │
│   │   ├── store/                 # Zustand stores
│   │   │   ├── useAppStore.ts     # Globální stav
│   │   │   ├── useApiStore.ts     # API stav
│   │   │   ├── useDbStore.ts      # Stav databáze
│   │   │   └── useWizardStore.ts  # Stav průvodce
│   │   │
│   │   ├── hooks/                 # Custom React hooks
│   │   │   ├── useMorphoDiTa.ts   # Hook pro API operace
│   │   │   ├── useDatabase.ts     # Hook pro DB operace
│   │   │   ├── useModels.ts       # Hook pro modely
│   │   │   ├── useTheme.ts        # Hook pro téma
│   │   │   └── useI18n.ts         # Hook pro i18n
│   │   │
│   │   ├── locales/               # i18n jazykové soubory
│   │   │   ├── cs.json            # Čeština
│   │   │   ├── en.json            # Angličtina
│   │   │   └── pl.json            # Polština
│   │   │
│   │   ├── types/                 # TypeScript typy
│   │   │   ├── api.ts             # API typy
│   │   │   ├── database.ts        # DB typy
│   │   │   └── common.ts          # Společné typy
│   │   │
│   │   ├── utils/                 # Utility funkce
│   │   │   ├── constants.ts       # Konstanty
│   │   │   ├── helpers.ts         # Pomocné funkce
│   │   │   └── formatters.ts      # Formátovače
│   │   │
│   │   └── styles/                # Globální styly
│   │       ├── globals.css        # Globální CSS
│   │       └── animations.css     # Animace
│   │
│   └── src-tauri/                 # Tauri backend
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       ├── build.rs
│       ├── icons/
│       └── src/
│           ├── main.rs            # Tauri entry point
│           ├── db.rs              # Database operace
│           ├── api.rs             # API operace
│           └── commands.rs        # Tauri commands
│
└── README.md
```

---

## Kódovací Konvence

### TypeScript Konvence

#### 1. Interface Naming

```typescript
// POCAPITAL for interfaces
interface UserProfile {
  id: string;
  name: string;
  email: string;
}

// Type aliases use PascalCase
type Status = 'pending' | 'processing' | 'completed' | 'failed';

// Generic types use PascalCase with T
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
```

#### 2. Function Naming

```typescript
// camelCase pro funkce
function getUserProfile(id: string): Promise<UserProfile> {
  // ...
}

// use prefix pro hooks
function useMorphoDiTa() {
  // ...
}

// is/has/can prefix pro boolean funkce
function isValidInput(input: string): boolean {
  return input.length > 0;
}

function hasPermission(user: User, perm: Permission): boolean {
  // ...
}

// get/set prefix pro accessor funkce
function getDatabaseStats(): Promise<DbStats> {
  // ...
}

function setTheme(theme: Theme): void {
  // ...
}
```

#### 3. File Naming

```
# camelCase pro soubory s komponentami
UserProfile.tsx
useMorphoDiTa.ts

# PascalCase pro soubory s třídami/modely
ApiResponse.ts
DatabaseService.ts

# Index files
index.ts
index.tsx
```

#### 4. Import Konvence

```typescript
// 1. Built-in modules
import fs from 'fs';
import path from 'path';

// 2. Third-party
import React from 'react';
import { useState } from 'react';
import { create } from 'zustand';

// 3. Internal (s alias pro hluboké importy)
import { useAppStore } from '@/store/useAppStore';
import { tagText } from '@/services/api';
import type { Token } from '@/types/api';

// Group imports with blank lines
import React, { useState, useEffect } from 'react';
import { create } from 'zustand';

import { useAppStore } from '@/store/useAppStore';
import { tagText, analyzeText } from '@/services/api';
```

#### 5. Type Annotations

```typescript
// Always annotate function parameters
function processText(
  input: string,
  model: string,
  options: ProcessOptions
): Promise<ProcessResult> {
  // ...
}

// Annotate exports
export const DEFAULT_MODEL: string = 'czech-morfflex2.1-pdtc2.0-250909';

export interface ProcessOptions {
  guesser: boolean;
  derivation: DerivationType;
}

// Use type inference when obvious
const count = 0;  // No need for :number
const name = '';  // No need for :string

// Use never for exhaustive checks
function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}
```

#### 6. Error Handling

```typescript
// Custom error classes
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

// Try-catch with specific errors
async function fetchData(): Promise<Data> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new APIError(`HTTP ${response.status}`, response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof APIError) {
      logger.error(`API error: ${error.message}`);
      throw error;
    }
    throw new APIError('Unknown error');
  }
}
```

### React Konvence

#### 1. Component Definition

```typescript
// Favor function components with explicit props interface
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  children,
  onClick,
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }))}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {icon && <span className="icon">{icon}</span>}
      {children}
    </button>
  );
}
```

#### 2. Hook Rules

```typescript
// Custom hooks start with "use"
function useMorphoDiTa() {
  const [isProcessing, setIsProcessing] = useState(false);
  
  const process = useCallback(async (input: string) => {
    setIsProcessing(true);
    try {
      const result = await api.tagText(input, model);
      return result;
    } finally {
      setIsProcessing(false);
    }
  }, [model]);
  
  return { process, isProcessing };
}
```

#### 3. State Management

```typescript
// Zustand store
interface ApiState {
  models: ModelInfo[];
  selectedModel: string;
  setModels: (models: ModelInfo[]) => void;
  setSelectedModel: (model: string) => void;
}

export const useApiStore = create<ApiState>((set) => ({
  models: [],
  selectedModel: DEFAULT_MODEL,
  setModels: (models) => set({ models }),
  setSelectedModel: (model) => set({ selectedModel: model }),
}));
```

#### 4. Event Handler Naming

```typescript
// Handle prefix for event handlers
function handleSubmit() { ... }
function handleClick() { ... }
function handleInputChange() { ... }
function handleModelChange() { ... }

// On prefix is also acceptable
function onSubmit() { ... }
function onChange() { ... }
```

---

## API Service

### API Klient

```typescript
// src/services/api.ts
const API_BASE = 'https://lindat.mff.cuni.cz/services/morphodita/api/';

interface RequestOptions {
  timeout?: number;
  retries?: number;
}

class MorphoDiTaApi {
  private baseUrl: string;
  private timeout: number;
  private retries: number;

  constructor(options: RequestOptions = {}) {
    this.baseUrl = API_BASE;
    this.timeout = options.timeout ?? 30000;
    this.retries = options.retries ?? 3;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries: number = this.retries
  ): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(this.timeout),
        });
        
        if (!response.ok) {
          throw new APIError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status
          );
        }
        
        return await response.json();
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => 
          setTimeout(resolve, 1000 * Math.pow(2, i))
        );
      }
    }
    throw new APIError('Max retries exceeded');
  }

  // Models
  async getModels(): Promise<ModelInfo[]> {
    const data = await this.fetchWithRetry(`${this.baseUrl}models`, {
      method: 'GET',
    });
    
    return Object.entries(data.models).map(([name, info]) => ({
      name,
      language: (info as any).language,
      capabilities: (info as any).capabilities,
    }));
  }

  // Tag
  async tagText(
    text: string,
    model: string,
    options: TagOptions = {}
  ): Promise<Token[][]> {
    const formData = new URLSearchParams({
      data: text,
      model,
      output: 'json',
      guesser: options.guesser ? 'yes' : 'no',
      input: options.input ?? 'untokenized',
      derivation: options.derivation ?? 'none',
    });

    const data = await this.fetchWithRetry(`${this.baseUrl}tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    return data.result;
  }

  // Analyze
  async analyzeText(
    text: string,
    model: string,
    options: AnalyzeOptions = {}
  ): Promise<AnalyzeResult[]> {
    const formData = new URLSearchParams({
      data: text,
      model,
      output: 'json',
      guesser: options.guesser ? 'yes' : 'no',
      input: options.input ?? 'untokenized',
      derivation: options.derivation ?? 'none',
    });

    const data = await this.fetchWithRetry(`${this.baseUrl}analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    return data.result;
  }

  // Generate
  async generateForms(
    lemmas: string,
    model: string,
    options: GenerateOptions = {}
  ): Promise<GeneratedForm[][]> {
    const formData = new URLSearchParams({
      data: lemmas,
      model,
      output: 'json',
      guesser: options.guesser ? 'yes' : 'no',
    });

    const data = await this.fetchWithRetry(`${this.baseUrl}generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    return data.result;
  }

  // Tokenize
  async tokenizeText(
    text: string,
    model: string
  ): Promise<string[][]> {
    const formData = new URLSearchParams({
      data: text,
      model,
      output: 'json',
    });

    const data = await this.fetchWithRetry(`${this.baseUrl}tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    return data.result;
  }
}

export const api = new MorphoDiTaApi();
```

---

## Database Service

### SQLite Operace

```typescript
// src/services/database.ts
import { open } from 'sql.js';

class DatabaseService {
  private db: any;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    this.db = await open({
      // Load from file or create new
      locateFile: (filename: string) => 
        `https://sql.js.org/dist/${filename}`,
    });
    
    await this.createTables();
    this.initialized = true;
  }

  private async createTables(): Promise<void> {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        model TEXT NOT NULL,
        input_text TEXT NOT NULL,
        parameters TEXT,
        result_count INTEGER DEFAULT 0,
        processing_time REAL,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS morphological_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        original_form TEXT,
        lemma TEXT NOT NULL,
        tag TEXT NOT NULL,
        generated_form TEXT,
        probability REAL,
        session_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);
  }

  async createSession(session: Session): Promise<number> {
    const stmt = this.db.prepare(
      'INSERT INTO sessions (operation, model, input_text, parameters, status) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(
      session.operation,
      session.model,
      session.input_text,
      JSON.stringify(session.parameters || {}),
      session.status || 'pending'
    );
    return stmt.get('lastID');
  }

  async insertMorphologicalDataBatch(
    data: MorphologicalData[]
  ): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO morphological_data 
        (source_type, original_form, lemma, tag, generated_form, probability, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    let count = 0;
    this.db.transaction(() => {
      for (const item of data) {
        stmt.run(
          item.source_type,
          item.original_form || null,
          item.lemma,
          item.tag,
          item.generated_form || null,
          item.probability,
          item.session_id || null
        );
        count++;
      }
    })();
    
    return count;
  }
}

export const database = new DatabaseService();
```

---

## Text Filters

### Implementace Filtrů

```typescript
// src/services/filters.ts
export interface FilterOptions {
  removeDuplicates: boolean;
  removeDiacritics: boolean;
  filterStopWords: boolean;
  removeSpecialCharacters: boolean;
  stopWordsList?: string;
}

// Výchozí stop words
const DEFAULT_STOP_WORDS = new Set([
  'a', 'i', 'o', 'u', 'v', 's', 'na', 'do', 'od', 'po', 'za', 'pod',
  'k', 's', 'pro', 'při', 'bez', 'o', 'před', 'přes', 'se', 'si',
  'sebe', 'svůj', 'ten', 'tento', 'tato', 'toto', 'ti', 'tito',
  'každý', 'každá', 'každé', 'všechen', 'všechna', 'všechno',
  'který', 'která', 'které', 'co', 'že', 'jako', 'protože', 'aby',
  'když', 'pokud', 'nebo', 'ale', 'ani', 'buď', 'či',
]);

function removeDiacritics(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

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

function removeStopWords(
  texts: string[],
  stopWords: Set<string>
): string[] {
  const stopWordsLower = new Set(stopWords.map(w => w.toLowerCase()));
  const stopWordsNoDiac = new Set(
    stopWords.map(w => removeDiacritics(w).toLowerCase())
  );
  
  return texts.filter(text => {
    const textLower = text.toLowerCase();
    const textNoDiac = removeDiacritics(text).toLowerCase();
    return !stopWordsLower.has(textLower) && !stopWordsNoDiac.has(textNoDiac);
  });
}

function removeSpecialCharacters(texts: string[]): string[] {
  return texts
    .map(text => text.replace(/[^a-zA-Z\u00C0-\u017F]/g, ''))
    .filter(text => text.length > 0);
}

export function applyFilters(
  texts: string[],
  options: FilterOptions
): string[] {
  let result = [...texts];
  
  // 1. Odstranění diakritiky
  if (options.removeDiacritics) {
    result = result.map(text => removeDiacritics(text));
    // Automaticky remove_duplicates pro vzniklé duplicity
    result = removeDuplicates(result);
  }
  
  // 2. Odstranění duplicit
  if (options.removeDuplicates) {
    result = removeDuplicates(result);
  }
  
  // 3. Odstranění stop slov
  if (options.filterStopWords) {
    const stopWords = options.stopWordsList
      ? new Set(options.stopWordsList.split(',').map(w => w.trim()))
      : DEFAULT_STOP_WORDS;
    result = removeStopWords(result, stopWords);
  }
  
  // 4. Odstranění speciálních znaků (vždy)
  result = removeSpecialCharacters(result);
  
  return result;
}
```

---

## I18N Konfigurace

### react-i18next Setup

```typescript
// src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import cs from './locales/cs.json';
import en from './locales/en.json';
import pl from './locales/pl.json';

i18n.use(initReactI18next).init({
  resources: {
    cs: { translation: cs },
    en: { translation: en },
    pl: { translation: pl },
  },
  lng: undefined, // auto-detect
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
```

### Jazykové Soubory

```json
// src/locales/cs.json
{
  "home": {
    "title": "MorphoDiTa",
    "subtitle": "Morfologický analyzátor českého jazyka",
    "analyzer": {
      "title": "Analýza textu",
      "description": "Morfologické tagování, analýza a generování forem slov"
    },
    "wizard": {
      "title": "Průvodce klíčových slov",
      "description": "Hromadné zpracování slov s generováním forem a filtry"
    }
  },
  "analyzer": {
    "model": "Model",
    "operation": "Operace",
    "tag": "Tag",
    "analyze": "Analýza",
    "generate": "Generování",
    "tokenize": "Tokenizace",
    "input": "Text vstupu",
    "process": "Zpracovat",
    "export": "Export",
    "results": "Výsledky",
    "log": "Log"
  },
  "wizard": {
    "step1": "Zadání klíčových slov",
    "step2": "Zpracování",
    "step3": "Výsledky",
    "step4": "Souhrn",
    "filters": "Filtry",
    "removeDuplicates": "Odstranit duplicity",
    "removeDiacritics": "Výstup bez diakritiky",
    "removeStopWords": "Odstranit spojky/předložky",
    "showOnlyNew": "Zobrazit jen nová slova"
  }
}
```

---

## Testing

### Unit Testy

```typescript
// src/services/__tests__/filters.test.ts
import { describe, it, expect } from 'vitest';
import { applyFilters } from '../filters';

describe('applyFilters', () => {
  it('should remove duplicates', () => {
    const result = applyFilters(
      ['kočka', 'pes', 'kočka'],
      { removeDuplicates: true, removeDiacritics: false, filterStopWords: false }
    );
    expect(result).toEqual(['kočka', 'pes']);
  });

  it('should remove diacritics', () => {
    const result = applyFilters(
      ['kočka', 'čeština'],
      { removeDuplicates: false, removeDiacritics: true, filterStopWords: false }
    );
    expect(result).toEqual(['kocka', 'cestina']);
  });

  it('should remove stop words', () => {
    const result = applyFilters(
      ['kočka', 'a', 'pes'],
      { removeDuplicates: false, removeDiacritics: false, filterStopWords: true }
    );
    expect(result).toEqual(['kočka', 'pes']);
  });
});
```

### Component Testy

```typescript
// src/components/__tests__/Button.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../common/Button';

describe('Button', () => {
  it('should render children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalled();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Click</Button>);
    expect(screen.getByText('Click')).toBeDisabled();
  });
});
```

---

## Build a Deployment

### Vite Konfigurace

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
  },
});
```

### Tauri Konfigurace

```json
// src-tauri/tauri.conf.json
{
  "package": {
    "productName": "MorphoDiTa",
    "version": "4.0.0"
  },
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:3000",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "windows": [
      {
        "title": "MorphoDiTa",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src https://lindat.mff.cuni.cz; img-src 'self' data:;"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

---

## Agent Pravidla

### Pravidla pro AI Agenty

1. **Vždy čtěte spec.md před implementací**
   - Každý agent musí přečíst `docs/spec.md` před jakoukoliv implementací
   - Dodržujte definované funkce a datové modely

2. **Dodržujte konvence**
   - TypeScript konvence z tohoto dokumentu
   - Jmenné konvence pro komponenty, funkce, typy
   - Struktura souborů dle tohoto dokumentu

3. **Testování**
   - Všechny nové funkce musí mít unit testy
   - Test coverage > 80%
   - Integration testy pro API operace

4. **Dokumentace**
   - Nové funkce musí být zdokumentovány
   - Aktualizujte příslušné dokumentační soubory
   - JSDoc komentáře pro veřejné funkce

5. **Bezpečnost**
   - Žádná hardcoded credentials
   - Všechna API komunikace přes HTTPS
   - Input validation pro všechny uživatelské vstupy

6. **Kompatibilita**
   - Windows 10+
   - Linux (Ubuntu 20.04+)
   - macOS 12+
   - Testujte na všech platformách

### Checklist pro Agenty

```markdown
## Před implementací:
- [ ] Přečteno spec.md
- [ ] Přečteno api_spec.md
- [ ] Přečteno database_schema.md
- [ ] Přečteno ui_guide.md

## Během implementace:
- [ ] Dodrženy kódovací konvence
- [ ] Přidány typové definice
- [ ] Napsány unit testy
- [ ] Aktualizována dokumentace

## Před commit:
- [ ] Všechny testy procházejí
- [ ] ESLint bez chyb
- [ ] Prettier formatting aplikován
- [ ] Dokumentace aktualizována
## Tauri FS/Shell, NSIS, Batching (added Phase 6)
See plan 1779742715167-clever-panda.md for details on plugins, hooks.nsh, batcher.ts usage.
