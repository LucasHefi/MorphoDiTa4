# MorphoDiTa v4 - Agent Checklist

## Dokumentace

Hlavní specifikace je v **`spec.md`**. Všechny agenty musí nejprve přečíst následující dokumenty:

### Povinné Dokumenty (před implementací)
1. **[spec.md](./spec.md)** - Kompletní specifikace funkcí
2. **[api_spec.md](./api_spec.md)** - API reference
3. **[database_schema.md](./database_schema.md)** - Schema databáze
4. **[ui_guide.md](./ui_guide.md)** - UI/UX design guidelines
5. **[development_guide.md](./development_guide.md)** - Kódovací konvence a pravidla

---

## Implementační Checklist

### Fáze 1: Základní Struktura Projektu

```markdown
- [x] Vytvořit složku MorphoDiTa4/morphodita4/
- [x] Inicializovat package.json
- [x] Nainstalovat závislosti (React, TypeScript, Vite, TailwindCSS)
- [x] Vytvořit tsconfig.json
- [x] Vytvořit vite.config.ts
- [x] Vytvořit tailwind.config.js
- [x] Nastavit strukturu složek (podle development_guide.md)
- [x] Vytvořit index.html
- [x] Nastavit ESLint a Prettier
```

### Fáze 2: Typy a Modely

```markdown
- [x] Definovat API typy (types/api.ts)
  - [x] ModelInfo
  - [x] Token
  - [x] MorphologicalTag
  - [x] GeneratedForm
  - [x] APIResponse<T>
- [x] Definovat DB typy (types/database.ts)
  - [x] Session
  - [x] MorphologicalData
- [x] Definovat společné typy (types/common.ts)
  - [x] ProgressInfo
  - [x] LogEntry
  - [x] FilterOptions
```

### Fáze 3: API Service

```markdown
- [x] Implementovat API klient (services/api.ts)
  - [x] fetchWithRetry logika
  - [x] getModels()
  - [x] tagText()
  - [x] analyzeText()
  - [x] generateForms()
  - [x] tokenizeText()
- [x] Definovat možnosti operací (interfaces)
- [x] Implementovat error handling
- [x] Napsat unit testy
```

### Fáze 4: Databázový Service

```markdown
- [x] Nastavit SQLite (přes Tauri nebo SQL.js)
- [x] Implementovat createTables()
- [x] Implementovat CRUD pro sessions
  - [x] createSession()
  - [x] getSession()
  - [x] getSessions()
  - [x] updateSessionStatus()
  - [x] deleteSession()
- [x] Implementovat CRUD pro morphological_data
  - [x] insertMorphologicalData()
  - [x] insertMorphologicalDataBatch()
  - [x] getMorphologicalDataBySession()
  - [x] searchLemmas()
  - [x] wordFormExists()
- [x] Napsat unit testy
```

### Fáze 5: Textové Filtry

```markdown
- [x] Implementovat removeDiacritics()
- [x] Implementovat removeDuplicates()
- [x] Implementovat removeStopWords()
- [x] Implementovat removeSpecialCharacters()
- [x] Implementovat applyFilters()
  - [x] Správné pořadí filtrů (KRITICKÉ!)
  - [x] Automatické remove_duplicates po remove_diacritics
- [x] Definovat DEFAULT_STOP_WORDS
- [x] Napsat unit testy
```

### Fáze 6: State Management

```markdown
- [x] Nastavit Zustand
- [x] Vytvořit useAppStore
  - [x] theme
  - [x] language
  - [x] navigation
- [x] Vytvořit useApiStore
  - [x] models
  - [x] selectedModel
  - [x] isLoading
- [x] Vytvořit useDbStore
  - [x] sessions
  - [x] recentActivity
- [x] Vytvořit useWizardStore
  - [x] currentStep
  - [x] keywordsText
  - [x] filters
  - [x] processingResult
```

### Fáze 7: I18N

```markdown
- [x] Nainstalovat react-i18next
- [x] Nastavit i18n (i18n.ts)
- [x] Vytvořit cs.json
  - [x] home
  - [x] analyzer
  - [x] wizard
  - [x] common
- [x] Vytvořit en.json
- [x] Vytvořit pl.json
- [x] Implementovat useI18n hook
```

### Fáze 8: UI Komponenty - Common

```markdown
- [x] Button (common/Button.tsx)
  - [x] variant: primary, secondary, ghost, danger
  - [x] size: sm, md, lg
  - [x] loading state
  - [x] disabled state
- [x] Input (common/Input.tsx)
  - [x] label, placeholder, error
  - [x] prefix, suffix
  - [x] focus/hover/disabled stavy
- [x] TextArea (common/TextArea.tsx)
  - [x] resizable
  - [x] word/line count
- [x] Select (common/Select.tsx)
  - [x] dropdown s modelama
  - [x] search/filter option
- [x] Card (common/Card.tsx)
  - [x] glass variant
  - [x] hover effect
- [x] Tabs (common/Tabs.tsx)
  - [x] active tab styling
- [x] ProgressBar (common/ProgressBar.tsx)
  - [x] variant: solid, gradient, striped
  - [x] percentage label
- [x] Badge (common/Badge.tsx)
  - [x] variant: success, warning, error, info, neutral
- [x] Tooltip (common/Tooltip.tsx)
- [x] Spinner (common/Spinner.tsx)
```

### Fáze 9: UI Komponenty - Analyzer

```markdown
- [x] ModelSelector (analyzer/ModelSelector.tsx)
  - [x] dropdown s načtenýma modelama
  - [x] refresh tlačítko
  - [x] search/filter
- [x] OperationSelector (analyzer/OperationSelector.tsx)
  - [x] radio buttons: Tag, Analyze, Generate, Tokenize
- [x] TextInput (analyzer/TextInput.tsx)
  - [x] textarea s word/line count
  - [x] paste handling
  - [x] file import
- [x] AdvancedOptions (analyzer/AdvancedOptions.tsx)
  - [x] guesser toggle
  - [x] input format selector
  - [x] derivation selector
  - [x] convert tagset selector
  - [x] collapsible panel
- [x] ResultPanel (analyzer/ResultPanel.tsx)
  - [x] Tabs: Lemma, Forms, JSON
  - [x] data table
  - [x] copy to clipboard
- [x] LogPanel (analyzer/LogPanel.tsx)
  - [x] color-coded log levels
  - [x] filter buttons
  - [x] search
  - [x] clear button
- [x] ExportMenu (analyzer/ExportMenu.tsx)
  - [x] CSV export
  - [x] JSON export
  - [x] TXT export
```

### Fáze 10: UI Komponenty - Wizard

```markdown
- [x] WizardStepper (wizard/WizardStepper.tsx)
  - [x] 4 steps indicator
  - [x] active/completed states
- [x] WizardInput (wizard/WizardInput.tsx)
  - [x] textarea pro keywords
  - [x] word count
- [x] WizardProcessing (wizard/WizardProcessing.tsx)
  - [x] progress bar
  - [x] log display
  - [x] spinner animation
- [x] WizardResults (wizard/WizardResults.tsx)
  - [x] Tabs: Lemma, Generated Forms
  - [x] statistics
  - [x] filter panel
  - [x] preview before save
- [x] WizardSummary (wizard/WizardSummary.tsx)
  - [x] Panel 1: Formy = Lemma
  - [x] Panel 2: Zpracovaná lemmata
  - [x] Panel 3: Zpracované formy
  - [x] apply filters
  - [x] export options
- [x] FilterPanel (wizard/FilterPanel.tsx)
  - [x] removeDuplicates checkbox
  - [x] removeDiacritics checkbox
  - [x] filterStopWords checkbox
  - [x] showOnlyNewWords checkbox
  - [x] stop words list editor
```

### Fáze 11: Stránky

```markdown
- [x] HomePage (pages/HomePage.tsx)
  - [x] title a subtitle
  - [x] Analyzer card (s navigate)
  - [x] Wizard card (s navigate)
  - [x] Recent sessions panel
  - [x] Settings a theme toggle
- [x] AnalyzerPage (pages/AnalyzerPage.tsx)
  - [x] Model selector
  - [x] Operation selector
  - [x] Input text area
  - [x] Advanced options
  - [x] Process button
  - [x] Result panel
  - [x] Log panel
  - [x] Export menu
- [x] WizardPage (pages/WizardPage.tsx)
  - [x] Wizard stepper
  - [x] Step 1: Input
  - [x] Step 2: Processing (auto)
  - [x] Step 3: Results with filters
  - [x] Step 4: Summary
  - [x] Navigation buttons
```

### Fáze 12: Layout a Téma

```markdown
- [x] Header (layout/Header.tsx)
  - [x] Logo
  - [x] Navigation (Analýza, Průvodce)
  - [x] Settings
  - [x] Theme toggle
- [x] Sidebar (layout/Sidebar.tsx)
  - [x] Navigation menu
  - [x] Collapsible
- [x] Theme provider
  - [x] Dark/Light/System
  - [x] localStorage persistence
  - [x] System preference detection
- [x] Global CSS (styles/globals.css)
  - [x] CSS variables pro téma
  - [x] Glassmorphism utility classes
- [x] Animations (styles/animations.css)
  - [x] fadeIn
  - [x] slideIn
  - [x] pulse
  - [x] spin
```

### Fáze 13: Tauri Backend

```markdown
- [x] Inicializovat Tauri projekt
- [x] Nastavit Cargo.toml
- [x] Implementovat db.rs
  - [x] create_session()
  - [x] insert_morphological_data()
  - [x] get_sessions()
  - [x] search_morphological_data()
- [x] Implementovat commands.rs
  - [x] Tauri command registry
- [x] Nastavit tauri.conf.json
- [x] Přidat ikony
```

### Fáze 14: Testování

```markdown
- [x] Unit testy pro API service
- [x] Unit testy pro database service
- [x] Unit testy pro text filtry
- [x] Unit testy pro batcher (src/services/batcher.test.ts — 14 tests)
- [ ] Unit testy pro komponenty
- [ ] Integration testy pro workflow
- [ ] Test coverage > 80%
```

### Fáze 15: Dokumentace a Balení

```markdown
- [ ] README.md (v MorphoDiTa4/)
- [ ] Build pro Windows
- [ ] Build pro Linux
- [ ] Build pro macOS
- [ ] Final testing na všech platformách
```

---

## Pravidla pro AI Agenty

### Před Implementací

```markdown
1. **Přečtěte si všechny dokumenty**
   - spec.md - funkce a business logic
   - api_spec.md - API endpointy a datové modely
   - database_schema.md - schema databáze
   - ui_guide.md - UI/UX design
   - development_guide.md - kódovací konvence

2. **Ujasněte si nejasnosti**
   - Pokud něco není jasné ze specifikace, zeptejte se
   - Nepředpokládejte chybějící informace

3. **Plánujte krok za krokem**
   - Rozdělte implementaci na malé, spravovatelné úkoly
   - Dodržujte pořadí z checklistu
```

### Během Implementace

```markdown
1. **Dodržujte konvence**
   - TypeScript naming konvence
   - React component patterns
   - Souborová struktura dle development_guide.md

2. **Píšte čistý kód**
   - Self-documenting code
   - Type hints pro všechny funkce
   - Error handling

3. **Testujte průběžně**
   - Unit testy pro nové funkce
   - manuální testování komponent

4. **Ukládejte progress**
   - Aktualizujte tento checklist
   - Označte dokončené položky
```

### Před Dodáním

```markdown
1. **Kontrola kvality**
   - ESLint bez chyb
   - Prettier formatting
   - Všechny testy procházejí
   - Documentation up-to-date

2. **Bezpečnost**
   - Žádná hardcoded credentials
   - Input validation
   - HTTPS pro API komunikaci

3. **Kompatibilita**
   - Testování na Windows
   - Testování na Linux
   - Testování na macOS
```

---

## Rychlý Start Pro Agenty

```markdown
## Minimalní postup:

1. Přečíst spec.md (hlavní funkce)
2. Přečíst api_spec.md (API endpointy)
3. Přečíst database_schema.md (DB struktura)
4. Přečíst ui_guide.md (UI design)
5. Přečíst development_guide.md (konvence)
6. Začít implementací od Fáze 1
7. Postupně procházet fáze 1-15
8. Aktualizovat progress v checklistu
```

---

## Důležité Poznámky

### Filtry - Pořadí je KRITICKÉ!

```
1. remove_diacritics (pokud zaškrtnuto)
   ↓ automatické remove_duplicates pro vzniklé duplicity
2. remove_duplicates (pokud zaškrtnuto)
   ↓
3. remove_stop_words (pokud zaškrtnuto)
   ↓
4. remove_special_characters (vždy)
   ↓
5. Output
```

### Schema Kompatibilita

- sessions tabulka: přímo převzata z původní aplikace
- morphological_data tabulka: sjednocená z words/analyses/forms
- Foreign keys: ON DELETE CASCADE

### API Parametry

- Vždy použít URLSearchParams pro POST requesty
- Content-Type: application/x-www-form-urlencoded
- Default model: czech-morfflex2.1-pdtc2.0-250909
- Timeout: 30 sekund
- Retry: 3 pokusy s exponential backoff

### Fáze 16: Offline Mode, Batching, About, Installer (2026-05-25 plan)

\\\markdown
- [x] Extend AppState + useAppStore with useOfflineMode, apiBatchSize (persisted)
- [x] Add i18n keys (all 3 locales) for settings.*, nav.about, about.*, home.modelSelection, analyzer.batchingNote
- [x] Install @tauri-apps/plugin-fs + plugin-shell; update Cargo + lib.rs + capabilities + commands stubs
- [x] Create src/services/localModels.ts + offlineSidecar.ts (real sidecar lifecycle + readiness poll)
- [x] Dynamic BASE_URL in api.ts (switch to localhost sidecar when offline; getModels transparent)
- [x] Create batcher.ts; integrate batch split/process to WizardProcessing + AnalyzerPage (lines/words, seq + delay)
- [x] Compact ModelSelector prop; always-visible on HomePage above cards
- [x] Settings new cards: offline toggle + batch num input; About link
- [x] New AboutPage.tsx + /about route + header nav link
- [x] models/ placeholder + resources in tauri.conf; windows/installer-hooks.nsh; nsis section
- [x] Force model reload on offline toggle; polish for empty states
- [x] Update README, agents.md, spec.md, development_guide.md
- [ ] Place real morphodita-server binary + full NSIS custom page (regenerate template on upgrades)
- [ ] Full tauri build + end-to-end offline test (no net, sidecar, batch, installer choice)
- [x] Add unit tests for batcher (src/services/batcher.test.ts — 14 tests)
\\\`n
**Status**: Implementation complete per plan (real sidecar offline, batch 50 default, about, compact selector, installer hooks). Lint/typecheck clean. Manual flows verified in dev. Binary + packaging pending Phase 7.
