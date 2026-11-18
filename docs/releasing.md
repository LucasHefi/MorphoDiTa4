# CI/CD a vydávání instalátorů

Repozitář: https://github.com/LucasHefi/MorphoDiTa4

## Kontroly

`.github/workflows/quality.yml` se spouští pro push do `master`, pull request a ruční spuštění. Je také opakovaně použitý release workflowm:

- npm lockfile, verze, ESLint/TypeScript, frontendové testy, audit a produkční frontend;
- Rust 1.97.1: formátování, locked check, clippy bez varování a testy na Linuxu;
- RustSec audit závislostí.

Actions jsou připnuté na ověřené SHA. Běžné sestavení má oprávnění pouze ke čtení obsahu. Jen zveřejňovací job dostává `contents: write`.

### Konkrétní dočasná výjimka npm auditu

Upstream [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) k 18. 11. 2026 nemá opravenou npm verzi picomatch. Je používán výhradně sestavovacími/testovacími nástroji s globy definovanými v repozitáři. `@tailwindcss/vite` a `tailwindcss` jsou správně zařazené mezi devDependencies.

`scripts/audit-dependencies.mjs` povolí pouze toto konkrétní upozornění u uzlů označených v lockfile jako vývojové. Výjimka končí **18. 12. 2026** (`scripts/audit-exceptions.json`). Jiná závažná upozornění, kritická závažnost, běhové závislosti, neúplný audit i vypršení výjimky CI zablokují. Výjimka a všechny související metavulnerabilities se vypisují, audit se nevydává za čistý. Po vydání opravené upstream verze aktualizujte lockfile a výjimku odstraňte.

## Vydání

Před označením verze lze ručně spustit `gh workflow run release.yml --ref master`. Sestaví a otestuje balíčky, ale bez verzového tagu nic nepublikuje. To umožňuje ověřit obě platformy před vytvořením neměnného release tagu.

1. Aktualizujte aplikaci, changelog a sjednoťte verzi v `package.json`, `package-lock.json`, `release-metadata.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `src/App.tsx`, `src/pages/AboutPage.tsx` a očekávání testu `scripts/releaseMetadata.test.mjs` (cesty jsou relativní k `morphodita4`).
2. Commitněte změny do `master`, pushněte je a ověřte Quality gates.
3. Označte stejný commit verzí, například `git tag -a v0.1.21 -m "MorphoDiTa Client 0.1.21"`, a pushněte konkrétní tag `git push origin v0.1.21`. Již publikované tagy ani soubory nepřepisujte.
4. Workflow **Release installers** ověří shodu tagu s manifesty, znovu provede kontroly a sestaví obě platformy. Po úspěchu vytvoří draft, nahraje všechny soubory a teprve kompletní release zveřejní.

Linux amd64 DEB se sestavuje na Ubuntu 24.04. Linuxový server se sestavuje z kontrolním součtem připnutého upstream zdroje s přiloženým loopback patchem.

Windows x64 NSIS se sestavuje na nativním Windows runneru s MSVC a spouští Rust knihovní testy. Standalone Windows server je stávající staticky sestavený GNU PE, jehož SHA-256 se před použitím kontroluje; přejmenování na MSVC sidecar je pouze pojmenování podle cíle klienta, nikoli tvrzení o jiném kompilátoru serveru. Změna serveru vyžaduje nové sestavení, ověření a aktualizaci připnutého hashe. Manuální křížové sestavení Windows z Linuxu zůstává alternativou popsanou v `release-windows.md`.

Publikují se DEB, Windows EXE, Windows ZIP s návodem, návody a manifesty platforem a SHA256SUMS. Před zveřejněním se ověřuje přítomnost obou instalátorů, shoda verzí, velikosti, SHA-256 a integrita ZIP.

Modely, lokální databáze, soukromé QA reporty a zálohy se do repozitáře ani release neposílají. Jazykové modely uživatel stahuje po licenčním souhlasu v Nastavení. Instalátory nejsou digitálně podepsané. Nativní sestavení a automatické testy nenahrazují ruční test instalace/odinstalace a grafického rozhraní. Aplikační updater není nastavený; CD vydává balíčky na GitHub Releases.
