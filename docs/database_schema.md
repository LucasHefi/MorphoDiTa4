# MorphoDiTa Database Schema

## Přehled

Aplikace využívá SQLite databázi pro ukládání výsledků morfologického zpracování. Schema bylo navrženo s ohledem na normalizaci, výkon a kompatibilitu s původní Python aplikací.

---

## Schema Definice

### SQL CREATE Statements

```sql
-- =====================================================
-- Vytvoření tabulky sessions (relace zpracování)
-- =====================================================
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL CHECK (operation IN ('tag', 'analyze', 'generate', 'tokenize')),
    model TEXT NOT NULL,
    input_text TEXT NOT NULL,
    parameters TEXT,                          -- JSON serialized
    result_count INTEGER DEFAULT 0,
    processing_time REAL,                     -- v sekundách
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- =====================================================
-- Vytvoření tabulky morphological_data (sjednocená)
-- =====================================================
CREATE TABLE IF NOT EXISTS morphological_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL CHECK (source_type IN ('analysis', 'generation')),
    original_form TEXT,                       -- Pro analýzu: forma z textu
    lemma TEXT NOT NULL,
    tag TEXT NOT NULL,
    generated_form TEXT,                      -- Pro generování: výstupní forma
    probability REAL,
    session_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- =====================================================
-- Indexy pro výkon
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_model ON sessions(model);
CREATE INDEX IF NOT EXISTS idx_morphological_data_session_id ON morphological_data(session_id);
CREATE INDEX IF NOT EXISTS idx_morphological_data_lemma ON morphological_data(lemma);
CREATE INDEX IF NOT EXISTS idx_morphological_data_source_type ON morphological_data(source_type);
CREATE INDEX IF NOT EXISTS idx_morphological_data_generated_form ON morphological_data(generated_form);
CREATE INDEX IF NOT EXISTS idx_morphological_data_lemma_tag ON morphological_data(lemma, tag);
```

---

## Tabulky Detailně

### 1. sessions

Ukládá informace o každé operaci zpracování textu.

| Sloupec | Typ | Popis | Příklad |
|---------|-----|-------|---------|
| `id` | INTEGER | Primární klíč (autoincrement) | 1 |
| `operation` | TEXT | Typ operace | 'tag' |
| `model` | TEXT | Název modelu | 'czech-morfflex2.1-pdtc2.0-250909' |
| `input_text` | TEXT | Vstupní text | 'kočka\npes\nběžet' |
| `parameters` | TEXT | JSON parametrů | '{"guesser":true,"derivation":"none"}' |
| `result_count` | INTEGER | Počet výsledků | 3 |
| `processing_time` | REAL | Čas zpracování (s) | 1.234 |
| `status` | TEXT | Status zpracování | 'completed' |
| `error_message` | TEXT | Chyba (pokud failed) | null |
| `created_at` | TIMESTAMP | Čas vytvoření | '2026-05-22 18:00:00' |
| `completed_at` | TIMESTAMP | Čas dokončení | '2026-05-22 18:00:01' |

**Status hodnoty:**
- `pending`: Čeká na zpracování
- `processing`: Zpracovává se
- `completed`: Úspěšně dokončeno
- `failed`: Chyba při zpracování

**Operace hodnoty:**
- `tag`: Morfologické tagování
- `analyze`: Detailní analýza
- `generate`: Generování forem
- `tokenize`: Tokenizace

### 2. morphological_data

Sjednocená tabulka pro morfologická data z analýzy i generování.

| Sloupec | Typ | Popis | Příklad (analysis) | Příklad (generation) |
|---------|-----|-------|-------------------|---------------------|
| `id` | INTEGER | Primární klíč | 1 | 101 |
| `source_type` | TEXT | Typ zdroje | 'analysis' | 'generation' |
| `original_form` | TEXT | Původní forma | 'kočka' | null |
| `lemma` | TEXT | Lemma | 'kočka' | 'kočka' |
| `tag` | TEXT | Tag | 'NNFS1-----A----' | 'NNFS1-----A----' |
| `generated_form` | TEXT | Vygenerovaná forma | null | 'kočky' |
| `probability` | REAL | Pravděpodobnost | 0.95 | 0.85 |
| `session_id` | INTEGER | FK → sessions | 1 | 1 |
| `created_at` | TIMESTAMP | Čas vytvoření | '2026-05-22 18:00:00' | '2026-05-22 18:00:00' |

**source_type hodnoty:**
- `analysis`: Data z analýzy/tagování (original_form je vyplněn, generated_form je null)
- `generation`: Data z generování (original_form je null, generated_form je vyplněn)

---

## TypeScript Typy

### Session

```typescript
interface Session {
  id?: number;                      // Unikátní identifikátor
  operation: 'tag' | 'analyze' | 'generate' | 'tokenize';
  model: string;                    // Název modelu
  input_text: string;               // Vstupní text
  parameters: Record<string, any>;  // Parametry jako JSON
  result_count: number;             // Počet výsledků
  processing_time?: number;         // Čas zpracování v sekundách
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;           // Chybová zpráva
  created_at?: string;              // ISO timestamp
  completed_at?: string;            // ISO timestamp
}

// Helper metody
interface SessionMethods {
  /** Označí session jako zpracovávanou */
  markProcessing(): void;
  
  /** Označí session jako dokončenou */
  markCompleted(resultCount: number, processingTime: number): void;
  
  /** Označí session jako selhanou */
  markFailed(errorMessage: string): void;
  
  /** Převádí parameters na JSON string */
  getParametersJson(): string;
  
  /** Nastaví parameters z JSON stringu */
  setParametersJson(value: string): void;
}
```

### MorphologicalData

```typescript
interface MorphologicalData {
  id?: number;                      // Unikátní identifikátor
  source_type: 'analysis' | 'generation';
  original_form?: string;           // Původní forma (pouze pro analysis)
  lemma: string;                    // Lemma
  tag: string;                      // PDT tag
  generated_form?: string;          // Vygenerovaná forma (pouze pro generation)
  probability?: number;             // Pravděpodobnost
  session_id?: number;              // FK → sessions.id
  created_at?: string;              // ISO timestamp
}

// Helper metody
interface MorphologicalDataMethods {
  /** Je to data z analýzy? */
  isAnalysis(): boolean;
  
  /** Je to data z generování? */
  isGeneration(): boolean;
}
```

---

## Datové Vztahy

```
┌─────────────────────────────────────┐
│           sessions                  │
├─────────────────────────────────────┤
│ id (PK)    │ operation │ model     │
│            │ input_text│ parameters│
│            │ result_count │ status │
│            │ processing_time │ ... │
└────────────┴───────────┴───────────┘
                      │
                      │ 1
                      │
                      │
              ┌───────┴────────┐
              │ ON DELETE CASCADE│
              └───────┬────────┘
                      │
                      │ N
                      │
┌─────────────────────────────────────────────────────────────┐
│          morphological_data                                 │
├─────────────────────────────────────────────────────────────┤
│ id (PK) │ source_type │ original_form │ lemma │ tag        │
│         │             │ generated_form │ probability │ session_id (FK) │
└─────────┴─────────────┴───────────────┴─────────┴──────────┘
```

### Vztahy a Omezení

1. **sessions → morphological_data**: One-to-Many
   - Jedna session může mít mnoho morfologických záznamů
   - Při smazání session se smažou i všechny související záznamy (ON DELETE CASCADE)

2. **source_type diskriminace**:
   - `analysis`: original_form je vyplněn, generated_form je NULL
   - `generation`: original_form je NULL, generated_form je vyplněn

3. **Indexy**:
   - `idx_sessions_status`: Rychlé filtrování podle statusu
   - `idx_sessions_created_at`: Řazení podle času
   - `idx_morphological_data_session_id`: Join operace
   - `idx_morphological_data_lemma`: Vyhledávání lemma
   - `idx_morphological_data_generated_form`: Vyhledávání forem
   - `idx_morphological_data_lemma_tag`: Unikátnost kontrola

---

## CRUD Operace

### CREATE

```typescript
// Vytvoření nové session
async function createSession(session: Session): Promise<number> {
  const result = await db.run(`
    INSERT INTO sessions (operation, model, input_text, parameters, status)
    VALUES (?, ?, ?, ?, ?)
  `, [
    session.operation,
    session.model,
    session.input_text,
    JSON.stringify(session.parameters || {}),
    session.status || 'pending'
  ]);
  return result.lastID;
}

// Vytvoření morphological_data záznamu
async function insertMorphologicalData(data: MorphologicalData): Promise<number> {
  const result = await db.run(`
    INSERT INTO morphological_data 
      (source_type, original_form, lemma, tag, generated_form, probability, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    data.source_type,
    data.original_form || null,
    data.lemma,
    data.tag,
    data.generated_form || null,
    data.probability,
    data.session_id || null
  ]);
  return result.lastID;
}

// Hromadný INSERT
async function insertMorphologicalDataBatch(
  data: MorphologicalData[]
): Promise<number> {
  const stmt = db.prepare(`
    INSERT INTO morphological_data 
      (source_type, original_form, lemma, tag, generated_form, probability, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  let count = 0;
  const transaction = db.transaction(() => {
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
  });
  transaction();
  return count;
}
```

### READ

```typescript
// Získání session podle ID
async function getSession(sessionId: number): Promise<Session | undefined> {
  const row = await db.get(`
    SELECT * FROM sessions WHERE id = ?
  `, [sessionId]);
  
  if (!row) return undefined;
  
  return {
    ...row,
    parameters: JSON.parse(row.parameters || '{}')
  };
}

// Získání všech sessions s filtry
async function getSessions(filters?: {
  operation?: string;
  status?: string;
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<Session[]> {
  let query = 'SELECT * FROM sessions WHERE 1=1';
  const params: any[] = [];
  
  if (filters?.operation) {
    query += ' AND operation = ?';
    params.push(filters.operation);
  }
  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters?.model) {
    query += ' AND model = ?';
    params.push(filters.model);
  }
  if (filters?.limit) {
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(filters.limit, filters.offset || 0);
  } else {
    query += ' ORDER BY created_at DESC';
  }
  
  const rows = await db.all(query, params);
  return rows.map(row => ({
    ...row,
    parameters: JSON.parse(row.parameters || '{}')
  }));
}

// Získání morfologických dat podle session
async function getMorphologicalDataBySession(
  sessionId: number,
  sourceType?: 'analysis' | 'generation'
): Promise<MorphologicalData[]> {
  let query = 'SELECT * FROM morphological_data WHERE session_id = ?';
  const params: any[] = [sessionId];
  
  if (sourceType) {
    query += ' AND source_type = ?';
    params.push(sourceType);
  }
  
  return await db.all(query, params);
}

// Vyhledávání lemma
async function searchLemmas(query: string, limit: number = 100): Promise<MorphologicalData[]> {
  return await db.all(`
    SELECT DISTINCT lemma, tag, source_type
    FROM morphological_data
    WHERE lemma LIKE ?
    ORDER BY lemma
    LIMIT ?
  `, [`%${query}%`, limit]);
}

// Kontrola existence slova v DB
async function wordFormExists(
  lemma: string,
  tag: string,
  sourceType: 'analysis' | 'generation',
  generatedForm?: string
): Promise<boolean> {
  let query = `
    SELECT COUNT(*) as count 
    FROM morphological_data 
    WHERE lemma = ? AND tag = ? AND source_type = ?
  `;
  const params: any[] = [lemma, tag, sourceType];
  
  if (generatedForm) {
    query += ' AND generated_form = ?';
    params.push(generatedForm);
  }
  
  const result = await db.get(query, params);
  return (result.count || 0) > 0;
}
```

### UPDATE

```typescript
// Aktualizace session status
async function updateSessionStatus(
  sessionId: number,
  status: Session['status'],
  extra?: {
    result_count?: number;
    processing_time?: number;
    error_message?: string;
  }
): Promise<void> {
  const updates: string[] = ['status = ?'];
  const params: any[] = [status];
  
  if (extra?.result_count !== undefined) {
    updates.push('result_count = ?');
    params.push(extra.result_count);
  }
  if (extra?.processing_time !== undefined) {
    updates.push('processing_time = ?');
    params.push(extra.processing_time);
  }
  if (extra?.error_message !== undefined) {
    updates.push('error_message = ?');
    params.push(extra.error_message);
  }
  
  // Přidat completed_at při dokončení
  if (status === 'completed' || status === 'failed') {
    updates.push('completed_at = CURRENT_TIMESTAMP');
  }
  
  params.push(sessionId);
  
  await db.run(`
    UPDATE sessions SET ${updates.join(', ')} WHERE id = ?
  `, params);
}
```

### DELETE

```typescript
// Smazání session a všech souvisejících dat (CASCADE)
async function deleteSession(sessionId: number): Promise<void> {
  await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

// Smazání starých sessions (cleanup)
async function deleteOldSessions(days: number = 30): Promise<number> {
  const result = await db.run(`
    DELETE FROM sessions 
    WHERE created_at < datetime('now', ?)
  `, [`-${days} days`]);
  return result.changes;
}

// Smazání všech morfologických dat pro session
async function deleteMorphologicalDataBySession(
  sessionId: number
): Promise<void> {
  await db.run('DELETE FROM morphological_data WHERE session_id = ?', [sessionId]);
}
```

---

## Statistické Dotazy

```typescript
// Celkové statistiky
async function getDatabaseStats(): Promise<{
  totalSessions: number;
  sessionsByOperation: Record<string, number>;
  sessionsByStatus: Record<string, number>;
  totalMorphologicalData: number;
  morphologicalBySource: Record<string, number>;
  recentActivity: Array<{date: string; count: number}>;
}> {
  const totalSessions = await db.get(
    'SELECT COUNT(*) as count FROM sessions'
  );
  
  const sessionsByOperation = await db.all(`
    SELECT operation, COUNT(*) as count 
    FROM sessions 
    GROUP BY operation
  `);
  
  const sessionsByStatus = await db.all(`
    SELECT status, COUNT(*) as count 
    FROM sessions 
    GROUP BY status
  `);
  
  const totalMorphologicalData = await db.get(
    'SELECT COUNT(*) as count FROM morphological_data'
  );
  
  const morphologicalBySource = await db.all(`
    SELECT source_type, COUNT(*) as count 
    FROM morphological_data 
    GROUP BY source_type
  `);
  
  return {
    totalSessions: totalSessions.count,
    sessionsByOperation: Object.fromEntries(
      sessionsByOperation.map((r: any) => [r.operation, r.count])
    ),
    sessionsByStatus: Object.fromEntries(
      sessionsByStatus.map((r: any) => [r.status, r.count])
    ),
    totalMorphologicalData: totalMorphologicalData.count,
    morphologicalBySource: Object.fromEntries(
      morphologicalBySource.map((r: any) => [r.source_type, r.count])
    ),
    recentActivity: []
  };
}

// Nejčastější lemma
async function getTopLemmas(limit: number = 50): Promise<Array<{lemma: string; count: number}>> {
  return await db.all(`
    SELECT lemma, COUNT(*) as count
    FROM morphological_data
    GROUP BY lemma
    ORDER BY count DESC
    LIMIT ?
  `, [limit]);
}

// Nejčastější tagy pro lemma
async function getTopTagsForLemma(lemma: string, limit: number = 10): Promise<Array<{tag: string; count: number}>> {
  return await db.all(`
    SELECT tag, COUNT(*) as count
    FROM morphological_data
    WHERE lemma = ?
    GROUP BY tag
    ORDER BY count DESC
    LIMIT ?
  `, [lemma, limit]);
}
```

---

## Migrace Schema

### Verze 1.0 (Současné schema)

```sql
-- Základní schema (viz výše CREATE TABLE statements)
-- První verze s sessions a morphological_data tabulkami
```

### Budoucí Migrace

```sql
-- Příklad migrace na verzi 1.1 (offline cache)
-- ALTER TABLE morphological_data ADD COLUMN cached_at TIMESTAMP;
-- ALTER TABLE morphological_data ADD COLUMN api_hash TEXT;

-- Příklad migrace na verzi 1.2 (vícejazyčnost)
-- CREATE TABLE IF NOT EXISTS language_models (
--     id INTEGER PRIMARY KEY,
--     language TEXT NOT NULL,
--     model_name TEXT NOT NULL,
--     is_active INTEGER DEFAULT 1
-- );
```

### Aplikace Migrací

```typescript
interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
  down?: (db: Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'Initial schema',
    up: (db) => {
      db.exec(CREATE_TABLES_SQL);  // Viz výše
    }
  }
  // Přidat další migrace podle potřeby
];

async function applyMigrations(): Promise<void> {
  const currentVersion = await db.get(
    'SELECT value FROM pragma_user_version'
  );
  
  for (const migration of migrations) {
    if (migration.version > (currentVersion?.value || 0)) {
      console.log(`Applying migration ${migration.version}: ${migration.name}`);
      migration.up(db);
      await db.run(`PRAGMA user_version = ${migration.version}`);
    }
  }
}
```

---

## Výkon a Optimalizace

### Doporučené Indexy

| Index | Účel | Výkon |
|-------|------|-------|
| `idx_sessions_status` | Filtrování session podle statusu | Rychlé query pro "completed" sessions |
| `idx_sessions_created_at` | Řazení session | Rychlé stránkování |
| `idx_morphological_data_session_id` | Join se sessions | Rychlé načtení výsledků |
| `idx_morphological_data_lemma` | Vyhledávání lemma | Rychlé full-text search |
| `idx_morphological_data_lemma_tag` | Unikátnost kontrola | Rychlé duplicit check |

### Wakuum a Údržba

```typescript
// Pravidelné vacuum (např. měsíčně)
async function vacuumDatabase(): Promise<void> {
  await db.run('VACUUM');
}

// Optimalizace indexů
async function optimizeIndexes(): Promise<void> {
  await db.run('REINDEX');
}

// Kontrola integrity
async function checkIntegrity(): Promise<boolean> {
  const result = await db.get('PRAGMA integrity_check');
  return result.integrity_check === 'ok';
}
```

---

## Kompatibilita s Původní Aplikací

### Zachované Prvky

1. **Tabulky**: sessions a morphological_data jsou přímo převzaty
2. **Sloupce**: Všechny sloupce jsou kompatibilní
3. **Indexy**: Stejné indexy pro kompatibilní výkon
4. **Foreign Keys**: Stejné vztahy a cascade chování

### Rozdíly oproti Původní Aplikaci

| Původní | Nové | Důvod |
|---------|------|-------|
| Oddělené tabulky words/analyses/forms | Sjednocená morphological_data | Jednodušší správa |
| Python sqlite3 | Tauri SQLx/Dexie.js | Multi-platform |
| File-based config | Built-in config | Tauri standard |

### Migrace z Původní DB

```sql
-- Migrace z původního schema (pokud existuje)
-- Přejít z words/analyses/forms na morphological_data

-- 1. Vytvořit novou tabulku
CREATE TABLE morphological_data_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    original_form TEXT,
    lemma TEXT NOT NULL,
    tag TEXT NOT NULL,
    generated_form TEXT,
    probability REAL,
    session_id INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- 2. Migrace analýz
INSERT INTO morphological_data_new (source_type, original_form, lemma, tag, probability, session_id)
SELECT 'analysis', form, lemma, tag, probability, session_id
FROM words;

-- 3. Migrace generování
INSERT INTO morphological_data_new (source_type, lemma, tag, generated_form, probability, session_id)
SELECT 'generation', lemma, tag, generated_form, probability, session_id
FROM forms;