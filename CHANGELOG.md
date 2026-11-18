# Changelog

All notable changes to MorphoDiTa Client are recorded here.

## 0.1.21 — 2026-11-18

- Windows zálohy a obnova otevírají soubory i adresáře pro zápis při synchronizaci, jak vyžaduje FlushFileBuffers. Nativní regresní testy zavírají databáze před odstraněním dočasných složek.

- GitHub CI/CD kontroluje frontend, Rust i závislosti, sestavuje nativní Linux DEB a Windows NSIS a po úspěchu vydává balíčky z verzového tagu. Regresní jazykové vzorky jsou verzované odděleně od místních QA reportů.

- Nasazena schválená ikona MorphoDiTa: otevřená kniha / M s tyrkysovým větvením. Nové PNG, ICO a ICNS pro okno aplikace, systémový spouštěč, instalační balíčky a ikonu webové záložky.

## 0.1.20 — 2026-11-18

- Výběr období na Přehledu používá společnou rozbalovací nabídku aplikace. Zavřený ovladač i seznam možností respektují světlé a tmavé téma. Zachovány rozsahy 7/30/90 dní a klávesnicové ovládání.

## 0.1.19 — 2026-11-18

- Tagování v Analyzátoru podporuje guesser, netokenizovaný/vertikální vstup, derivaci a převod tagsetu. Volby se odesílají serveru a ukládají do metadat výsledku. Tagger dostává původní text v jednom požadavku pro zachování kontextu, mezer a oddělení vět.
- Tabulka Relací omezuje délku textových náhledů i tooltipů na 320 znaků, aby velké vstupy nezpomalovaly posouvání. Editace a uložení nadále používají celé hodnoty; odstraněno rozmazávání pod pevnou hlavičkou tabulky.

## 0.1.18 — 2026-11-18

- Nový Přehled podle schváleného návrhu: skutečné počty vstupních slov uložených dokončených běhů, unikátních forem a lemmat, velikost DB, denní zpracování, četnosti a nedávná aktivita. Výběr období 7/30/90 dní, přepínání veličin grafu a forem/lemmat, přístupné tabulky dat.
- Lokální denní snímky sledují skutečný vývoj DB od prvního použití této verze; chybějící historie se nevymýšlí. Staré běhy bez označení pracovního postupu mají vlastní řadu. Historie se zachová v úplné SQLite záloze, starší zálohy schema 4 zůstávají kompatibilní.
- Režim v záhlaví otevírá Nastavení. Nadbytečná věta o výslovném offline režimu odstraněna; informace o skutečném fallbacku zachována. Rozcestníkové karty nahrazeny statistikami, obě funkce zůstávají v menu.
- Statistiky se počítají mimo UI vlákno a vracejí pouze souhrn a metadata; formuláře s milionem slov se nepřenášejí do Přehledu. Četnosti se agregují před spojením s lemmaty a různé tagy jejich počet nenásobí.

## 0.1.17 — 2026-11-18

- Průvodce zůstává po prvním otevření aktivní na pozadí. Přepnutí na Přehled nebo jinou stránku nepřeruší požadavky ani nespustí nový běh; při návratu zůstává průběh, log i hotové výsledky.
- Katalog modelů se po výslovné změně režimu znovu načte i bez odpojení stránky. Změna modelu/režimu nadále zneplatní staré výsledky a výslovné zrušení zpracování zůstává funkční.

## 0.1.16 — 2026-11-17

- Filtr „Bez diakritiky“ ve sloupci Forma = lemma opět čistí obě strany vztahu podle upřesnění uživatele; stejné očištěné hodnoty se kopírují, exportují a ukládají. Bez filtru se zachovávají slovníková lemmata s diakritikou.
- Windows x64: NSIS instalační balíček, staticky linkovaný offline server a podpora diakritiky v uživatelských cestách.

## 0.1.15 — 2026-11-17

- Průvodce doplňuje česká lemmata ze slovníkové analýzy lokálním modelem no_dia, která vrací základní tvar s diakritikou i pro neakcentované formy. Homonyma rozlišuje podle zastoupených tvarů v celém zadání; při shodné podpoře ponechá původní volbu a uvede počet nerozhodnutých případů v logu.
- Česká instalace nově obsahuje dva ověřované modely ze stejného licencovaného balíčku. Nová instalace hlavního modelu stáhne i doplněk; starší instalaci lze doplnit v Nastavení.
- Filtr diakritiky ve sloupci vztahů upravuje levou formu a zachovává slovníkové lemma na pravé straně. Souhrn, ukládání i export používají opravené vztahy.
- Regresní sada pokrývá všech 155 uživatelem dodaných vztahů včetně záporů, stupňování a hovorových tvarů.

## 0.1.14 — 2026-11-17

- Změna modelu nebo režimu připojení zneplatní starý souhrn i checkpointy; původní zadání zůstává a lze je znovu zpracovat. Souhrn uvádí skutečný model, který vytvořil výsledky.
- Lokální server se spouští s pevným `--log_file=` bez pokusu o zápis do instalačního `/usr/bin`; opravuje spuštění ze systémové instalace bez práv správce.
- Regresní test základních tvarů akcionářský v souhrnu a uložení.

## 0.1.13 — 2026-11-17

- CSV export průvodce se v desktopové aplikaci zapisuje postupně v nativní části, bez sestavování celého CSV v paměti prohlížeče. Zachovává escapování, ochranu před tabulkovými vzorci a bezpečné názvy souborů.

- Velké zadání lze upravovat po částech do 50 000 znaků; vložení velkého textu zachytává paste handler před plným vykreslením textarea. Zpracování i uložení používají celý vstup.

- Při odmítnutém vstupu je tlačítko pokračování neaktivní; vizuální stav nyní odpovídá již existující validační blokaci.

- Průvodce přijímá až 1 000 000 slov a 10 MB (10 000 000 bajtů UTF-8), pro vložení i TXT import a uložení původního zadání.
- Databázové kontroly zůstávají v dávkách po 10 000, náhledy po 200 položkách. Výstupní paměťový rozpočet 128 MiB a limit exportu 256 MiB zůstávají zachovány.

## 0.1.12 — 2026-11-17

- Průvodce přijímá až 100 000 slov; limit velikosti vstupu zůstává 5 MiB.
- Kontrola databáze rozděluje velké vstupy do volání po 10 000 slovech.
- Výsledky i souhrn stránkují po 200 hodnotách s přímým přechodem na stránku. Kopírování, export a uložení používají celé výsledky.
- Pro větší běhy oddělen rozpočet výsledků od vstupu: až 1 600 000 databázových řádků / 128 MiB textových polí, souborový export do 256 MiB.

## 0.1.11 — 2026-11-17

- Lokální MorphoDiTa server nyní naslouchá výhradně na `127.0.0.1`, nikoli na všech síťových rozhraních. Součástí distribuce je úplný upravený MPL-2.0 zdroj, patch a návod k sestavení.

## 0.1.10 — 2026-11-17

- Opraven skutečný start offline modelu: Tauri nyní povoluje čtení a metadata otevřeného modelového souboru v existujícím omezeném modelovém prostoru.
- Opravena validace cesty lokálního serveru pro standardní linuxový adresář `.local`; nadále odmítá relativní cesty a segmenty `.` / `..`.

## 0.1.9 — 2026-11-17

- Jazyk dokumentu nyní odpovídá jazyku zvolenému v Nastavení, aby čtečky obrazovky používaly správnou výslovnost.

## 0.1.8 — 2026-11-17

- Opraven slovní výklad českých PDT tagů: rody, interpunkce, slovesné a zájmenné podtypy a pozice přivlastňování. Ověřeno proti dokumentaci ÚFAL ve všech třech jazycích.

## 0.1.7 — 2026-11-17

- Opraveno ukládání a export analyzátoru po změně zadání: metadata a zobrazení zůstávají svázána s dokončeným výpočtem.
- Desktopové exporty CSV/JSON/TXT se zapisují přímo do složky Stažené soubory; úspěch se hlásí až po dokončení zápisu. Existující soubory se nepřepisují.
- Průvodce zobrazuje cestu vytvořeného exportu a správně zachytí chybu zápisu.

## Release policy

- Versions use Semantic Versioning (`MAJOR.MINOR.PATCH`).
- `morphodita4/release-metadata.json` is the canonical release-version source.
- `npm run version:check` must pass before a package is produced.
- Every release entry records user-visible changes, verification evidence, and
  known platform or licensing limitations.
- A Linux `.deb` is a test artifact and is not evidence of Windows readiness.
- Model licenses and application licensing are reported separately.

## [Unreleased]

- Production distribution approval for the CC BY-NC-SA model and Windows
  release evidence remain open.
- The current Linux candidate has fresh frontend/Rust quality-gate, offline
  no-network, packaged-sidecar, and isolated native-launch evidence; see the
  Linux release procedure and Huly MDT-94 for the exact artifact readback.

## [0.1.6] - 2026-11-17

- Refreshed all application views with sidebar navigation, teal accents,
  accessible controls, a clearer wizard, database tables and settings.
- Preserved CS/EN/PL, light/dark/system themes and existing data workflows.
- Frontend: 383 tests pass; Linux DEB built and isolated startup verified.
  Installation evidence: docs/verification/2026-11-17-design-install/.
- Model consent and separate model/server licenses remain unchanged.
  Windows verification remains open.

## [0.1.0] - 2026-07-24

- Established the initial canonical release metadata and Linux test-package
  policy.
- Added explicit model provenance and license separation.
