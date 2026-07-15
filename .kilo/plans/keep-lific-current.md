# LIFIC Tracker — MorphoDiTa Client

Poslední aktualizace: 2026-06-11

| Stav | Popis |
|------|-------|
| 🟢 | Uzavřeno / vyřešeno |
| 🟡 | Částečně vyřešeno |
| 🔴 | Otevřeno |

## 🔴 [OPEN] Dokumentace: fáze 15/16 stale vs kód
- **Soubor:** `docs/agents.md`
- **Soubor:** `docs/development_guide.md`
- **Priorita:** střední
- **Poznámky:** `docs/agents.md` označuje fázi 15 jako nedokončenou, ale Fáze 16 uvádí hotovo s 3 nezaškrtnutými položkami (binary, offline test, batcher testy). Fáze 15 obsahuje README a multiplatformní buildy, které nejsou explicitně vyřešeny.

## 🔴 [OPEN] Timeout rozpor (kód vs dokumentace)
- **Soubor:** `morphodita4/src/services/api.ts:25`, `docs/development_guide.md:434`
- **Priorita:** vysoká
- **Poznámky:**
  - Specifikace: 30s (`Timeout: 30 sekund`)
  - Implementace: 15s (`setTimeout(() => controller.abort(), 15000)`)
  - **Akce:** Zarovnat kód na 30 000 ms nebo aktualizovat specifikaci. (Navrhuji kód.)

## 🔴 [OPEN] Retry backoff rozpor (kód vs dokumentace)
- **Soubor:** `morphodita4/src/services/api.ts:23`, `docs/development_guide.md:435`
- **Priorita:** vysoká
- **Poznámky:**
  - Specifikace: `1s, 2s, 4s` (`1000 * Math.pow(2, i)`)
  - Implementace: `300ms, 600ms, 1200ms`
  - **Akce:** Zarovnat na specifikované hodnoty. (Navrhuji kód.)

## 🔴 [OPEN] Batcher unit testy chybí
- **Soubor:** `morphodita4/src/services/batcher.ts`
- **Priorita:** střední
- **Poznámky:** Batcher existuje a je integrně použit, ale chybí jímka (`src/services/__tests__/batcher.test.ts`).

## 🟡 [PARTIAL] Filter `removeSpecialCharacters` regression risk
- **Soubor:** `morphodita4/src/services/filters.ts:32-34`
- **Priorita:** střední
- **Poznámky:**
  - `removeSpecialCharacters` používá regex `[^a-zA-Z\u00C0-\u017F\s-]` — povoluje mezery a pomlčky.
  - Pokud specifikace vyžaduje striktní alfanumerický výstup bez mezer/pomlček, je to regresní riziko.
  - **Akce:** Ověřit spec.md; upravit regex podle schválené specifikace nebo zakomentovat jako výsledek.

## 🟡 [PARTIAL] DB `update_session_status` parametrizace
- **Soubor:** `morphodita4/src-tauri/src/db.rs:101-126`
- **Priorita:** střední
- **Poznámky:** Funkce dynamicky skládá SQL s `format!` a používá `params![status, rc/pt/err, id]`. Při více aktualizacích může dojít k pádu kvůli proměnému počtu argumentů. Doporučeno rozebít na jednotlivé `conn.execute` volání nebo použít pojmenované parametry.

---

## Řešení

### Vyřešeno v této iteraci
1. 🟢 Vytvořen tento issues-driven plán jako centrální tracker.
2. 🟢 Upřesněny konkrétní soubory, řádky a rozdíly oproti specifikaci.

### Následné kroky (doporučeno)
1. Opravit timeout na 30 000 ms v `src/services/api.ts`.
2. Opravit backoff na `1000 * Math.pow(2, i)` ms v `src/services/api.ts`.
3. Rozebrat `update_session_status` ve `src-tauri/src/db.rs`.
4. Ověřit `removeSpecialCharacters` proti `docs/spec.md` a případně upravit.
5. Přidat `src/services/__tests__/batcher.test.ts`.
6. Aktualizovat `docs/agents.md` a `docs/development_guide.md` po dokončení výše uvedených položek.
