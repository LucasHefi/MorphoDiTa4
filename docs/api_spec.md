# MorphoDiTa API Reference

## Přehled

MorphoDiTa REST API poskytuje morfologickou analýzu, tagování a generování forem pro český jazyk.

**Base URL**: `https://lindat.mff.cuni.cz/services/morphodita/api/`

---

## Endpointy

### 1. GET /models

Načte seznam dostupných modelů a jejich schopností.

#### Request
```http
GET /models HTTP/1.1
Host: lindat.mff.cuni.cz
Accept: application/json
```

#### Response (200 OK)
```json
{
  "models": {
    "czech-morfflex2.1-pdtc2.0-250909": {
      "capabilities": ["tag", "analyze", "generate", "tokenize"],
      "language": "czech",
      "description": "Czech morphological analyzer v2.1"
    },
    "czech-combi2.0-pdtc2.0-230621": {
      "capabilities": ["tag", "analyze", "generate"],
      "language": "czech",
      "description": "Czech combinatorial tagger"
    },
    "slovak-ssj2.0-pdt-230621": {
      "capabilities": ["tag", "analyze", "generate"],
      "language": "slovak",
      "description": "Slovak morphological analyzer"
    }
  }
}
```

#### TypeScript Type
```typescript
interface ModelsResponse {
  models: {
    [modelName: string]: {
      capabilities: string[];
      language: string;
      description?: string;
    };
  };
}

// Nebo po parsování:
interface ModelInfo {
  name: string;
  language: string;
  capabilities: string[];
  description?: string;
}
```

---

### 2. POST /tag

Morfologické tagování textu. Vrátí nejlepší analýzu pro každý token.

#### Request
```http
POST /tag HTTP/1.1
Host: lindat.mff.cuni.cz
Content-Type: application/x-www-form-urlencoded

data=kočka%0Apes%0Aběžet&model=czech-morfflex2.1-pdtc2.0-250909&output=json&guesser=yes&input=untokenized&derivation=none
```

#### Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `data` | string | Yes | - | Input text (newline/comma/semicolon separated) |
| `model` | string | Yes | - | Model name |
| `output` | string | No | "json" | Output format: json/xml/vertical |
| `guesser` | string | No | "yes" | Use guesser: yes/no |
| `input` | string | No | "untokenized" | Input format: untokenized/vertical |
| `derivation` | string | No | "none" | Derivation type: none/root/path/tree |
| `convert_tagset` | string | No | null | Tagset conversion |

#### Response (200 OK)
```json
{
  "result": [
    [
      {
        "token": "kočka",
        "lemma": "kočka",
        "tag": "NNFS1-----A----"
      }
    ],
    [
      {
        "token": "pes",
        "lemma": "pes",
        "tag": "NNMS1-----A----"
      }
    ],
    [
      {
        "token": "běžet",
        "lemma": "běž",
        "tag": "VB-I-----A----"
      }
    ]
  ]
}
```

#### TypeScript Type
```typescript
interface TagResponse {
  result: Array<
    Array<{
      token: string;
      lemma: string;
      tag: string;
    }>
  >;
}

// Parsováno do aplikace:
interface Token {
  form: string;
  analyses: MorphologicalTag[];
  best_analysis?: MorphologicalTag;
}

interface MorphologicalTag {
  lemma: string;
  tag: string;
  probability?: number;
}
```

---

### 3. POST /analyze

Detailní morfologická analýza s odvozením.

#### Request
```http
POST /analyze HTTP/1.1
Host: lindat.mff.cuni.cz
Content-Type: application/x-www-form-urlencoded

data=B%\CZ%K%C4%8D&page=data&model=czech-morfflex2.1-pdtc2.0-250909&output=json&derivation=root
```

#### Parameters
Stejné jako /tag.

#### Response (200 OK)
```json
{
  "result": [
    [
      {
        "token": "B",
        "lemma": "B",
        "tag": "NS------1-----A----",
        "derivations": {
          "root": "B"
        }
      },
      {
        "token": "ČK",
        "lemma": "ČK",
        "tag": "NNIS1-----A----",
        "derivations": {
          "root": "ČK"
        }
      }
    ]
  ]
}
```

---

### 4. POST /generate

Generování slovních forem z lemmat a tagů.

#### Request
```http
POST /generate HTTP/1.1
Host: lindat.mff.cuni.cz
Content-Type: application/x-www-form-urlencoded

data=kočka%0Apes%0Aběž&model=czech-morfflex2.1-pdtc2.0-250909&output=json&guesser=yes
```

#### Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `data` | string | Yes | - | Lemmas (one per line, lemma<TAB>tag format) |
| `model` | string | Yes | - | Model name |
| `output` | string | No | "json" | Output format |
| `guesser` | string | No | "yes" | Use guesser |
| `convert_tagset` | string | No | null | Tagset conversion |

#### Response (200 OK)
```json
{
  "result": [
    [
      {
        "form": "kočka",
        "lemma": "kočka",
        "tag": "NNFS1-----A----",
        "probability": 0.95
      },
      {
        "form": "kočky",
        "lemma": "kočka",
        "tag": "NNFSG-----A----",
        "probability": 0.85
      },
      {
        "form": "kočce",
        "lemma": "kočka",
        "tag": "NNPSS-----A----",
        "probability": 0.80
      }
    ],
    [
      {
        "form": "pes",
        "lemma": "pes",
        "tag": "NNMS1-----A----",
        "probability": 0.98
      },
      {
        "form": "pejsk",
        "lemma": "pes",
        "tag": "NNMS1-----A----",
        "probability": 0.15
      }
    ],
    [
      {
        "form": "běžím",
        "lemma": "běž",
        "tag": "VB-I1SpA-P---",
        "probability": 0.90
      },
      {
        "form": "běžíš",
        "lemma": "běž",
        "tag": "VB-I2SpA-P---",
        "probability": 0.88
      }
    ]
  ]
}
```

#### TypeScript Type
```typescript
interface GenerateResponse {
  result: Array<
    Array<{
      form: string;
      lemma: string;
      tag: string;
      probability?: number;
    }>
  >;
}

// Parsováno do aplikace:
interface GeneratedForm {
  form: string;
  lemma: string;
  tag: string;
  probability?: number;
}
```

---

### 5. POST /tokenize

Tokenizace textu bez morfologické analýzy.

#### Request
```http
POST /tokenize HTTP/1.1
Host: lindat.mff.cuni.cz
Content-Type: application/x-www-form-urlencoded

data=To%20je%20test.&model=czech-morfflex2.1-pdtc2.0-250909&output=json
```

#### Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `data` | string | Yes | - | Input text |
| `model` | string | Yes | - | Model name |
| `output` | string | No | "json" | Output format |
| `guesser` | string | No | "yes" | Use guesser |
| `input` | string | No | "untokenized" | Input format |

#### Response (200 OK)
```json
{
  "result": [
    [
      "To",
      "je",
      "test",
      ".",
      "!"
    ]
  ]
}
```

#### TypeScript Type
```typescript
interface TokenizeResponse {
  result: string[][];
}

// Parsováno do aplikace:
type TokenizedText = string[][];  // [sentence][token]
```

---

## Datové Modely

### ModelInfo

```typescript
interface ModelInfo {
  name: string;              // "czech-morfflex2.1-pdtc2.0-250909"
  language: string;          // "czech"
  capabilities: string[];    // ['tag', 'analyze', 'generate', 'tokenize']
  description?: string;
}
```

### Token

```typescript
interface Token {
  form: string;                    // Původní forma slova
  analyses: MorphologicalTag[];    // Seznam možných analýz
  best_analysis?: MorphologicalTag; // Nejlepší analýza
  
  // Helper
  getBestAnalysis(): MorphologicalTag | null;
}
```

### MorphologicalTag

```typescript
interface MorphologicalTag {
  lemma: string;           // Základní tvar
  tag: string;             // PDT tag
  probability?: number;    // Pravděpodobnost
}
```

### GeneratedForm

```typescript
interface GeneratedForm {
  form: string;           // Vygenerovaná forma
  lemma: string;          // Původní lemma
  tag: string;            // Použitý tag
  probability?: number;   // Pravděpodobnost
}
```

---

## Formát Tagů (PDT Tagset)

### Struktura PDT tagu

```
NNFS1-----A----
│││││
││││└─ Rod (F = feminine, M = masculine, N = neuter)
│││└─── Číslo (S = singular, P = plural)
││└──── Pád (1=nom, 2=gen, 3=dat, 4=acc, 5=voc, 6=loc, 7=ins)
│└───── Rod (M1-M9 pro mužský rod, F, N)
└───── Slovní druh (N = substantivum, V = sloveso, A = adjektivum, ...)
```

### Kódy slovních druhů

| Kód | Slovní druh | Příklad |
|-----|-------------|---------|
| N | Substantivum | kočka, pes |
| V | Sloveso | běžet, být |
| A | Adjectivum | velký, dobrý |
| R | Příslovce | rychle, dobře |
| P | Predikativum | nový, mladý |
| S | zájmeno | ten, tento |
| C | Spojka | a, ale, nebo |
| I | Interjekce | ahoj, hajde |
| T | Částice | že, aby, přec |
| D | Číslovka | jeden, první |
| H | Přípona | -ský, -ovat |
| X | Zvláštní | . , ! |

### Kódy pádů

| Kód | Pád | Příklad |
|-----|-----|---------|
| 1 | Nominativ | kočka |
| 2 | Genitiv | kočky |
| 3 | Dativ | kočce |
| 4 | Akuzativ | kočku |
| 5 | Vokativ |enko |
| 6 | Lokál | kočce |
| 7 | Instrumentál | kočkou |

### Kódy rodů

| Kód | Rod |
|-----|-----|
| M1 | mužský životný |
| M2 | mužský neživotný |
| M3 | střední |
| F | ženský |
| N | střední |

---

## Error Handling

### Chybové Odpovědi

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Invalid model",
  "message": "Model 'invalid-model' does not exist"
}

HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{
  "error": "Rate limit exceeded",
  "message": "Please wait before sending another request"
}

HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "Server error",
  "message": "Internal error during processing"
}
```

### TypeScript Error Types

```typescript
class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseText?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Error codes
const ERROR_CODES = {
  INVALID_MODEL: 'invalid_model',
  INVALID_INPUT: 'invalid_input',
  RATE_LIMIT: 'rate_limit',
  SERVER_ERROR: 'server_error',
  TIMEOUT: 'timeout',
} as const;
```

---

## Příklady Použití

### JavaScript/TypeScript

```typescript
const API_BASE = 'https://lindat.mff.cuni.cz/services/morphodita/api/';

// Načtení modelů
async function getModels() {
  const response = await fetch(`${API_BASE}models`);
  const data = await response.json();
  return Object.entries(data.models).map(([name, info]) => ({
    name,
    language: (info as any).language,
    capabilities: (info as any).capabilities,
  }));
}

// Tagování textu
async function tagText(text: string, model: string) {
  const formData = new URLSearchParams();
  formData.append('data', text);
  formData.append('model', model);
  formData.append('output', 'json');
  formData.append('guesser', 'yes');
  formData.append('input', 'untokenized');
  formData.append('derivation', 'none');

  const response = await fetch(`${API_BASE}tag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new APIError(`HTTP ${response.status}`, response.status);
  }

  const data = await response.json();
  return data.result;  // Token[][]
}

// Generování forem
async function generateForms(lemmas: string, model: string) {
  const formData = new URLSearchParams();
  formData.append('data', lemmas);
  formData.append('model', model);
  formData.append('output', 'json');
  formData.append('guesser', 'yes');

  const response = await fetch(`${API_BASE}generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new APIError(`HTTP ${response.status}`, response.status);
  }

  const data = await response.json();
  return data.result;  // GeneratedForm[][]
}

// Použití
async function main() {
  // 1. Načíst modely
  const models = await getModels();
  console.log('Available models:', models);

  // 2. Tagovat text
  const text = 'kočka\npes\nběžet';
  const tags = await tagText(text, 'czech-morfflex2.1-pdtc2.0-250909');
  console.log('Tags:', tags);

  // 3. Extrahovat lemmata
  const lemmas = tags.flat().map(t => t.lemma).join('\n');
  console.log('Lemmas:', lemmas);

  // 4. Generovat formy
  const forms = await generateForms(lemmas, 'czech-morfflex2.1-pdtc2.0-250909');
  console.log('Forms:', forms);
}
```

---

## Rate Limiting

- Maximální počet požadavků: **100 za minutu**
- Doporučený interval mezi požadavky: **0.1s**
- Při překročení: HTTP 429 + retry po 1 sekundě

## Poznámky

- Vstupní text musí být **UTF-8 encoded**
- Pro vertical input format: `lemma<TAB>tag` na každém řádku
- Pro untokenized input: slova oddělená novými řádky, čárkami nebo středníky
- Výchozí timeout: **30 sekund**
- Retry logika: **3 pokusy** s exponenciálním backoff