# MorphoDiTa Client v4

Multi-platformní desktopová aplikace pro morfologickou analýzu českého jazyka postavená na React + Tauri + TypeScript.

## Funkce

- **Analýza textu**: Morfologické tagování, detailní analýza a generování forem slov
- **Průvodce klíčových slov**: Hromadné zpracování slov s generováním forem a filtry
- **Databáze**: Lokální ukládání výsledků s SQLite
- **Export**: CSV, JSON, TXT formáty
- **Multi-platform**: Windows, Linux, macOS
- **Multi-language**: Čeština (CZ), Angličtina (EN), Polština (PL)
- **Témata**: Dark/Light mode s glassmorphism efekty

## Dokumentace

Kompletní dokumentace je v [docs/](docs/):

| Dokument | Popis |
|----------|-------|
| [spec.md](docs/spec.md) | Kompletní specifikace funkcí |
| [api_spec.md](docs/api_spec.md) | API reference pro MorphoDiTa REST API |
| [database_schema.md](docs/database_schema.md) | Schema databáze a CRUD operace |
| [ui_guide.md](docs/ui_guide.md) | UI/UX design guidelines |
| [development_guide.md](docs/development_guide.md) | Kódovací konvence a pravidla |
| [release-linux.md](docs/release-linux.md) | Linux testovací balíček a platformní release hranice |

## Aktuální release strategie

- Online LINDA MorphoDiTa API je výchozí transport.
- Lokální MorphoDiTa je explicitní offline režim nebo fallback při nedostupnosti online API.
- Linux `.deb` je testovací artefakt vytvářený na Linuxu.
- Windows release se vytváří na Windows runneru a vyžaduje Windows sidecar `x86_64-pc-windows-msvc.exe`.
- Linux build není důkazem Windows kompatibility.

## Technological Stack

### Frontend
- **React 18+** - UI framework
- **TypeScript 5+** - Statická typová kontrola
- **Vite** - Build tool
- **TailwindCSS** - CSS framework
- **shadcn/ui** - Komponenty
- **Zustand** - State management
- **react-i18next** - Internacionalizace

### Backend
- **Tauri** - Desktop framework
- **Rust** - Backend logika
- **SQLite** - Databáze

## Struktura Projektu

```
MorphoDiTa4/
├── docs/                          # Dokumentace
│   ├── spec.md
│   ├── api_spec.md
│   ├── database_schema.md
│   ├── ui_guide.md
│   ├── development_guide.md
│   └── README.md
│
├── morphodita4/                   # Nová aplikace
│   ├── src/
│   │   ├── pages/                 # Hlavní stránky
│   │   ├── components/            # React komponenty
│   │   ├── services/              # Business logic
│   │   ├── store/                 # Zustand stores
│   │   ├── hooks/                 # Custom hooks
│   │   ├── locales/               # i18n
│   │   ├── types/                 # TypeScript typy
│   │   └── styles/                # Globální styly
│   └── src-tauri/                 # Tauri backend
│
└── README.md
```

## Implementační Stav

Všechny specifikace jsou kompletní. Aplikace čeká na implementaci.

### Dokončené Dokumenty
- [x] spec.md - Kompletní specifikace všech funkcí
- [x] api_spec.md - Všechny endpointy s příklady
- [x] database_schema.md - Schema, CRUD, migrace
- [x] ui_guide.md - Design, animace, komponenty
- [x] development_guide.md - Konvence, příklady kódu

### Čeká na Implementaci
- [x] Základní struktura projektu (Fáze 1)
- [x] Typy a modely (Fáze 2)
- [x] API service (Fáze 3)
- [x] Database service (Fáze 4)
- [x] Text filters (Fáze 5)
- [x] State management (Fáze 6)
- [x] I18N (Fáze 7)
- [x] UI komponenty (Fáze 8-10)
- [x] Stránky (Fáze 11)
- [x] Layout a téma (Fáze 12)
- [x] Tauri backend (Fáze 13)
- [x] Testování (Fáze 14)
- [ ] Balení (Fáze 15)

## Rychlý Start Pro Vývojáře

1. **Přečtěte si dokumentaci v pořadí:**
   ```
   docs/spec.md → docs/api_spec.md → docs/database_schema.md
   → docs/ui_guide.md → docs/development_guide.md
   ```

2. **Implementujte fázi po fázi**

## Klíčové Funkce Z Původní Aplikace

### Operace MorphoDiTa API
| Operace | Popis |
|---------|-------|
| **Tag** | Morfologické tagování textu |
| **Analyze** | Detailní morfologická analýza s odvozením |
| **Generate** | Generování slovních forem z lemmat |
| **Tokenize** | Tokenizace textu |

### Průvodce Klíčových Slov
4krokový proces:
1. **Zadání** - Vstup klíčových slov
2. **Zpracování** - Automatické tagování + generování
3. **Výsledky** - Náhled s filtry
4. **Souhrn** - Finální výstupy s exportem

### Filtry Textu (Pořadí je KRITICKÉ!)
```
1. remove_diacritics → automatické remove_duplicates
2. remove_duplicates
3. remove_stop_words
4. remove_special_characters (vždy)
```

### Databázová Kompatibilita
- **sessions** tabulka: přímo převzata z původní aplikace
- **morphological_data** tabulka: sjednocená z words/analyses/forms
- Foreign keys s ON DELETE CASCADE

## License

Morfologická data podléhají licenci původního MorphoDiTa projektu.

## Acknowledgements

- MorphoDiTa / UFAL - Morfologický analyzor českého jazyka
- LINDAUT/ČVUT - REST API infrastruktura