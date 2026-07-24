# MorphoDiTa v4 - UI/UX Design Guide

## Přehled

Tento dokument popisuje UI/UX design pro MorphoDiTa Client v4. Aplikace používá moderní design s glassmorphism efekty, dark/light tématy a plynulými animacemi pro nejlepší uživatelský zážitek.

---

## Design Principy

### 1. Jednoduchost
- Minimální počet kliknutí k cíli
- Intuitivní navigace
- Jasná hierarchie informací

### 2. Konzistence
- Stejné komponenty napříč aplikací
- jednotné barvy, fonty, mezery
- Prediktabilní chování

### 3. Přehlednost
- Čitelné typografie
- dostatečný whitespace
- Vizuální hierarchie

### 4. Rychlost
- Okamžitá odezva na interakce
- Plynulé animace
- Lazy loading pro velké datové soubory

---

## Barevný Schéma

### Dark Theme

```css
/* Dark Theme - Primary Colors */
:root {
  /* Background */
  --bg-primary: #0a0a0f;          /* Hlavní pozadí */
  --bg-secondary: #1a1a2e;        /* Karty, panely */
  --bg-tertiary: #16213e;         /* Inputy, dropdowny */
  
  /* Text */
  --text-primary: #e0e0e0;        /* Hlavní text */
  --text-secondary: #a0a0a0;      /* Secondary text */
  --text-muted: #666666;          /* Disabled, placeholder */
  
  /* Accent */
  --accent: #4c9aff;              /* Primární akcent */
  --accent-hover: #3a86ff;        /* Hover stav */
  --accent-active: #2970e0;       /* Active/pressed stav */
  
  /* Border */
  --border: #2a2a3e;              /* Základní border */
  --border-light: #3a3a4e;        /* Light border */
  
  /* Success / Warning / Error */
  --success: #4caf50;
  --warning: #ff9800;
  --error: #f44336;
  
  /* Glassmorphism */
  --glass-bg: rgba(26, 26, 46, 0.8);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-shadow: rgba(0, 0, 0, 0.3);
}
```

### Light Theme

```css
/* Light Theme - Primary Colors */
:root.light {
  /* Background */
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #e8e8e8;
  
  /* Text */
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --text-muted: #999999;
  
  /* Accent */
  --accent: #4c9aff;
  --accent-hover: #3a86ff;
  --accent-active: #2970e0;
  
  /* Border */
  --border: #d0d0d0;
  --border-light: #e0e0e0;
  
  /* Success / Warning / Error */
  --success: #4caf50;
  --warning: #ff9800;
  --error: #f44336;
  
  /* Glassmorphism */
  --glass-bg: rgba(255, 255, 255, 0.8);
  --glass-border: rgba(0, 0, 0, 0.1);
  --glass-shadow: rgba(0, 0, 0, 0.1);
}
```

### Barvy Pro Použití

| Kontext | Barva | Hodnota |
|---------|-------|---------|
| Primární akcent | Modrá | `#4c9aff` |
| Success | Zelená | `#4caf50` |
| Warning | Oranžová | `#ff9800` |
| Error | Červená | `#f44336` |
| Info | Modrá | `#2196f3` |
| Disabled | Šedá | `#999999` |

---

## Typografie

### Font Family

```css
:root {
  --font-primary: 'Inter', 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
}
```

### Font Sizes

```css
/* Heading sizes */
h1 { font-size: 32px; font-weight: 700; }
h2 { font-size: 24px; font-weight: 600; }
h3 { font-size: 20px; font-weight: 600; }
h4 { font-size: 16px; font-weight: 600; }

/* Body sizes */
body-lg { font-size: 16px; }
body { font-size: 14px; }
body-sm { font-size: 12px; }
body-xs { font-size: 11px; }

/* Code */
code { font-size: 13px; font-family: var(--font-mono); }
```

### Line Heights

```css
h1, h2, h3 { line-height: 1.2; }
h4 { line-height: 1.3; }
body { line-height: 1.5; }
code { line-height: 1.4; }
```

---

## Glassmorphism Efekty

### Základní Glass Panel

```css
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  box-shadow: 
    0 4px 30px var(--glass-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
```

### Glass Button

```css
.glass-button {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  border: none;
  border-radius: 8px;
  color: white;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 10px rgba(76, 154, 255, 0.3);
  position: relative;
  overflow: hidden;
}

.glass-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: left 0.5s ease;
}

.glass-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(76, 154, 255, 0.4);
}

.glass-button:hover::before {
  left: 100%;
}

.glass-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(76, 154, 255, 0.3);
}
```

### Glass Card

```css
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 32px var(--glass-shadow);
  transition: all 0.3s ease;
}

.glass-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px var(--glass-shadow);
  border-color: var(--accent);
}
```

---

## Animace a Přechody

### Fade In

```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in {
  animation: fadeIn 0.3s ease forwards;
}

.fade-in-delay-1 { animation-delay: 0.1s; }
.fade-in-delay-2 { animation-delay: 0.2s; }
.fade-in-delay-3 { animation-delay: 0.3s; }
```

### Slide In

```css
@keyframes slideInLeft {
  from {
    transform: translateX(-20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideInRight {
  from {
    transform: translateX(20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideInUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.slide-in-left { animation: slideInLeft 0.3s ease forwards; }
.slide-in-right { animation: slideInRight 0.3s ease forwards; }
.slide-in-up { animation: slideInUp 0.3s ease forwards; }
```

### Pulse (Pro Progress)

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.pulse {
  animation: pulse 1.5s ease-in-out infinite;
}
```

### Spinner

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
```

### Smooth Transitions Pro Všechny Komponenty

```css
* {
  transition-property: background-color, border-color, color;
  transition-duration: 0.2s;
  transition-timing-function: ease-in-out;
}

/* Faster transitions pro transform */
button, a, .interactive {
  transition-property: transform, box-shadow;
  transition-duration: 0.15s;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## Layout a Rozložení

### HomePage (Rozcestník)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                    ┌─────────────────────┐                      │
│                    │    MorphoDiTa       │                      │
│                    │  v4.0.0             │                      │
│                    └─────────────────────┘                      │
│                                                                 │
│              Morphological Analyzer for Czech Language          │
│                                                                 │
│                                                                 │
│         ┌───────────────────────────────────────────┐          │
│         │                                           │          │
│         │      ┌─────────────────────────────┐     │          │
│         │      │                             │     │          │
│         │      │    Analýza textu            │     │          │
│         │      │                             │     │          │
│         │      │   ┌─────────────────────┐   │     │          │
│         │      │   │ Morphological       │   │     │          │
│         │      │   │ tagging, analysis   │   │     │          │
│         │      │   │ and form generation │   │     │          │
│         │      │   └─────────────────────┘   │     │          │
│         │      │                             │     │          │
│         │      │      [Spustit →]            │     │          │
│         │      │                             │     │          │
│         │      └─────────────────────────────┘     │          │
│         │                                           │          │
│         │      ┌─────────────────────────────┐     │          │
│         │      │                             │     │          │
│         │      │    Průvodce klíčových slov  │     │          │
│         │      │                             │     │          │
│         │      │   ┌─────────────────────┐   │     │          │
│         │      │   │ Batch processing    │   │     │          │
│         │      │   │ with form generation│   │     │          │
│         │      │   │ and filters         │   │     │          │
│         │      │   └─────────────────────┘   │     │          │
│         │      │                             │     │          │
│         │      │      [Spustit →]            │     │          │
│         │      │                             │     │          │
│         │      └─────────────────────────────┘     │          │
│         │                                           │          │
│         └───────────────────────────────────────────┘          │
│                                                                 │
│                    ┌─────────────────────┐                      │
│                    │  [Nastavení] [Téma] │                      │
│                    └─────────────────────┘                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### AnalyzerPage

```
┌─────────────────────────────────────────────────────────────────┐
│ MorphoDiTa            [Analýza] [Průvodce]  [Nastavení] [🌙]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Model:    [czech-morfflex2.1 ▼]  [⟳]                         │
│                                                                 │
│  Operace:                                                            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                           │
│  │ Tag  │ │Analyz│ │Genere│ │Tokeni│                           │
│  └──────┘ └──────┘ └──────┘ └──────┘                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Text vstupu                                             │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ kočka                                               │ │   │
│  │ │ pes                                                 │ │   │
│  │ │ běžet                                               │ │   │
│  │ │                                                     │ │   │
│  │ │ [Zadejte text k zpracování...]                      │ │   │
│  │ │                                                     │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  │ 3 slova · 15 řádků                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Pokročilé nastavení  [▼]                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ☐ Guesser                        [untokenized ▼]       │   │
│  │ Derivation:                    [none ▼]                │   │
│  │ Convert tagset:                [none ▼]                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                    ┌─────────────────────┐                      │
│                    │    [Zpracovat]      │                      │
│                    └─────────────────────┘                      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Výsledky                           [Lemma] [Formy] [JSON]│   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │                                                     │ │   │
│  │ │  Výsledky se zobrazí po zpracování...               │ │   │
│  │ │                                                     │ │   │
│  │ │                                                     │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Log: [▼]  [INFO ●] [WARNING ○] [ERROR ○]  [Clear] [🔍 ___]  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [18:00:01] INFO: Začínám zpracování...                  │   │
│  │ [18:00:02] INFO: Tagování dokončeno: 3 tokeny           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### WizardPage

```
┌─────────────────────────────────────────────────────────────────┐
│ MorphoDiTa            [Analýza] [Průvodce]  [Nastavení] [🌙]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Průvodce klíčových slov                                         │
│  ─────────────────────────────────────────────────────────      │
│  ─────────────────────────────────────────────────────────      │
│  ─────────────────────────────────────────────────────────      │
│  [◉───○───○───○] Krok 1 z 4: Zadání klíčových slov            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Zadání klíčových slov                                    │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ kočka                                               │ │   │
│  │ │ pes                                                 │ │   │
│  │ │ běžet                                               │ │   │
│  │ │                                                     │ │   │
│  │ │ [Zadejte klíčová slova... (oddělená novými          │ │   │
│  │ │  řádky, čárkami nebo středníky)]                    │ │   │
│  │ │                                                     │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  │ 3 slova                                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Model: [czech-morfflex2.1 ▼]  [⟳]                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Filtry pro zpracování                                    │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ ☐ Odstranit duplicity                                │ │   │
│  │ │ ☐ Výstup bez diakritiky                              │ │   │
│  │ │ ☐ Odstranit spojky/předložky/speciální znaky         │ │   │
│  │ │ ☐ Zobrazit jen slova která nejsou v databázi         │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                    [Zpět]      [Další →]                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Komponenty

### Button

```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

// Variants:
// primary: gradient background, white text
// secondary: border only, no background
// ghost: no border, hover background
// danger: red background/border
```

### Input/TextArea

```typescript
interface InputProps {
  label?: string;
  placeholder?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  helperText?: string;
}

// Styling:
// - Border: 1px solid var(--border)
// - Hover: border-color var(--accent)
// - Focus: border-color var(--accent), box-shadow 0 0 0 3px rgba(76,154,255,0.2)
// - Disabled: opacity 0.5, cursor not-allowed
```

### Card

```typescript
interface CardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  hoverable?: boolean;
  glass?: boolean;
}

// Glass variant:
// - backdrop-filter: blur(12px)
// - background: var(--glass-bg)
// - border: 1px solid var(--glass-border)
```

### Tabs

```typescript
interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

// Active tab:
// - border-bottom: 2px solid var(--accent)
// - color: var(--accent)
// - font-weight: 600
```

### Progress Bar

```typescript
interface ProgressBarProps {
  value: number;      // 0-100
  max?: number;       // default 100
  variant: 'solid' | 'gradient' | 'striped';
  size: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  status?: 'normal' | 'warning' | 'error';
}
```

### Status Badge

```typescript
interface BadgeProps {
  variant: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  size: 'sm' | 'md';
  children: React.ReactNode;
}
```

---

## Responsive Design

### Breakpoints

```css
/* Mobile */
@media (max-width: 640px) { ... }

/* Tablet */
@media (min-width: 641px) and (max-width: 1024px) { ... }

/* Desktop */
@media (min-width: 1025px) { ... }
```

### Mobile Layout

```
┌─────────────────────────┐
│ [☰] MorphoDiTa    [🌙] │
├─────────────────────────┤
│                         │
│   ┌─────────────────┐   │
│   │   Analýza       │   │
│   │   [Spustit →]   │   │
│   └─────────────────┘   │
│                         │
│   ┌─────────────────┐   │
│   │   Průvodce      │   │
│   │   [Spustit →]   │   │
│   └─────────────────┘   │
│                         │
└─────────────────────────┘
```

---

## Dark/Light Theme Toggle

### Theme Provider

```typescript
interface ThemeContext {
  theme: 'dark' | 'light' | 'system';
  resolvedTheme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
}

// Storage: localStorage key 'morphodita-theme'
// System preference: window.matchMedia('(prefers-color-scheme: dark)')
```

### CSS Variables Mapping

```css
/* Automatická změna podle tématu */
:root[data-theme='dark'] {
  /* Dark theme vars */
}

:root[data-theme='light'] {
  /* Light theme vars */
}
```

---

## Accessibility

### Keyboard Navigation

```
Tab/Shift+Tab:    Navigace mezi interaktivními elementy
Enter/Space:      Aktivace tlačítka/focus
Escape:           Zavření modalu/dialogu
Arrow keys:       Navigace v tabs/radiobuttons
```

### ARIA Labels

```html
<!-- Příklad správného ARIA -->
<button
  aria-label="Zpracovat text"
  aria-disabled={isProcessing}
  aria-busy={isProcessing}
>
  {isProcessing ? 'Zpracovávám...' : 'Zpracovat'}
</button>

<div
  role="progressbar"
  aria-valuenow={progress}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-label="Postup zpracování"
>
```

### Focus Styles

```css
/* Viditelný focus outline */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Hide outline pro mouse users */
:focus:not(:focus-visible) {
  outline: none;
}
```

---

## Iconography

### Použité Ikony

| Ikona | Popis | Použití |
|-------|-------|---------|
| ⟳ | Obnovit | Refresh modelů |
| 📁 | Otevřít soubor | File open |
| 💾 | Uložit | Save |
| 📤 | Export | Export results |
| 🔍 | Vyhledávání | Search |
| ⚙️ | Nastavení | Settings |
| 🌙 | Dark mode | Theme toggle |
| ☀️ | Light mode | Theme toggle |
| ✕ | Zavřít | Close |
| → | Další | Next step |
| ← | Zpět | Previous step |
| ✓ | Success | Success indicator |
| ⚠️ | Warning | Warning indicator |
| ✗ | Error | Error indicator |

---

## Design Tokens

### Spacing

```css
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
--spacing-2xl: 48px;
```

### Border Radius

```css
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-full: 9999px;
```

### Shadows

```css
--shadow-sm: 0 1px 2px var(--glass-shadow);
--shadow-md: 0 4px 12px var(--glass-shadow);
--shadow-lg: 0 8px 24px var(--glass-shadow);
--shadow-xl: 0 16px 48px var(--glass-shadow);
```

---

## Komponent API Reference

### HomePage

```typescript
interface HomePageProps {
  onNavigateToAnalyzer: () => void;
  onNavigateToWizard: () => void;
  recentSessions?: Session[];
}
```

### AnalyzerPage

```typescript
interface AnalyzerPageProps {
  onExport: (format: 'csv' | 'json' | 'txt') => void;
  onSessionSelect: (sessionId: number) => void;
}

interface AnalyzerState {
  operation: 'tag' | 'analyze' | 'generate' | 'tokenize';
  model: string;
  inputText: string;
  outputFormat: 'json' | 'xml' | 'vertical';
  advancedOptions: {
    guesser: boolean;
    inputFormat: 'untokenized' | 'vertical';
    derivation: 'none' | 'root' | 'path' | 'tree';
    convertTagset: string;
  };
  result: any;
  isProcessing: boolean;
  progress: ProgressInfo;
  logMessages: LogEntry[];
}
```

### WizardPage

```typescript
interface WizardPageProps {
  onComplete: (results: WizardResults) => void;
  onCancel: () => void;
}

interface WizardState {
  currentStep: 1 | 2 | 3 | 4;
  model: string;
  keywordsText: string;
  filters: {
    removeDuplicates: boolean;
    removeDiacritics: boolean;
    filterStopWords: boolean;
    showOnlyNewWords: boolean;
    stopWordsList: string;
  };
  processingResult: {
    taggedTokens: Token[];
    generatedForms: GeneratedForm[];
    statistics: ProcessingStatistics;
  };
}
```

### ResultDisplay

```typescript
interface ResultDisplayProps {
  result: any;
  format: 'lemma' | 'forms' | 'json';
  onExport: (format: 'csv' | 'json' | 'txt') => void;
}
```

### LogPanel

```typescript
interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
  onFilter: (level: LogLevel) => void;
  searchQuery?: string;
}

interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  message: string;
}