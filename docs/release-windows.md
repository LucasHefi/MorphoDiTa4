# Windows x64 instalátor — 0.1.21

Automaticky sestavované EXE a ZIP s českým návodem se vydávají přes [GitHub Releases](https://github.com/LucasHefi/MorphoDiTa4/releases). CI sestavuje klienta nativně na Windows/MSVC a spouští knihovní testy; viz [CI/CD](releasing.md). Lokální křížově sestavené kandidáty lze připravit níže uvedeným postupem do ignorované složky `artifacts/windows/0.1.21/`. Balíčky nejsou digitálně podepsané. Publikované manifesty a SHA256SUMS popisují přesné soubory jednotlivých sestavení.

## Instalace

Spustit `MorphoDiTa-Client-0.1.21-Windows-x64-setup.exe`, vybrat jazyk a dokončit instalaci pro aktuálního uživatele. Balíček obsahuje klienta, staticky linkovaný lokální server, `WebView2Loader.dll` a oficiální WebView2 bootstrapper. Pokud počítač nemá runtime WebView2, jeho instalace může potřebovat internet. Určeno pro 64bitové Windows 10/11.

České modely nejsou součástí EXE. V Nastavení uživatel přečte licenci CC BY-NC-SA 4.0 a po souhlasu stáhne hlavní český model; aplikace nainstaluje také doplněk no_dia. Poté lze zapnout explicitní offline režim. Jazykové požadavky v tomto režimu zůstávají lokální, samotné stažení modelů vyžaduje síť.

## Sestavení z Linuxu

Použit cíl `x86_64-pc-windows-gnu` a MinGW-w64 POSIX C++ compiler. Tauri preferuje nativní Windows/MSVC sestavení; tento artefakt je křížově sestavený kandidát pro vyzkoušení. [Oficiální popis Windows instalátorů a křížového sestavení](https://v2.tauri.app/distribute/windows-installer/).

Požadavky: Node/npm s projektovým lockfile, Rust s Windows GNU cílem, MinGW-w64 GCC/G++ POSIX, NSIS včetně standardních pluginů, curl, tar, patch a make. Nástroje je potřeba mít v PATH.

```sh
cd morphodita4
npm ci
npm run check
npm run test -- --run
sh scripts/build-windows-linux.sh
```

Skript ověří SHA-256 připnutého upstream zdroje MorphoDiTa 1.11.3, použije stejnou loopback opravu jako Linux, staticky připojí GCC/C++/pthread runtime a vytvoří Windows sidecar. Ten importuje pouze systémové KERNEL32, msvcrt a WS2_32. Následuje kontrola release metadat a sestavení NSIS. `tauri.windows.conf.json` vybírá per-user instalaci, přibalený WebView2 bootstrapper a české/anglické/polské texty; speciální české a polské texty jsou v `src-tauri/installer/`.

Výstup Tauri: `src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/MorphoDiTa Client_0.1.21_x64-setup.exe`. Před předáním se zkopíruje do `artifacts`, doplní český návod a kontrolní součty.

Aktualizace 0.1.21 nasazuje schválenou ikonu aplikace, instalátoru a odinstalátoru. Zachovává opravu výběru období Přehledu z 0.1.20. Zachovává pokročilé volby tagování a omezené náhledy velkých textů z 0.1.19. Zachovává statistický Přehled z 0.1.18 a běh průvodce při navigaci. Aktuální balíčky, kontrolní součty a instalaci Linuxu dokládá `docs/verification/2026-11-18-release-0.1.21/`.

## Ověření a limity

- 417 frontendových testů a kontrola TypeScript/ESLint prošly. Oprava filtru diakritiky je společná s místní verzí 0.1.21.
- Instalátor úspěšně prošel `7z t`, obsah byl rozbalen a potřebné payload soubory porovnány pomocí SHA-256 se vstupy sestavení. Přítomné jsou klient, server, WebView2Loader, bootstrapper, MIT/MPL licence a upravený zdroj serveru s patchem.
- Windows PE sidecar má stejný SHA-256 jako v 0.1.18; pro tuto nezměněnou součást se přebírá dřívější ověření pod Wine všemi čtyřmi operacemi: tag, analyze, generate, tokenize. Slovníkové odpovědi všech 155 případů odpovídají přesně ověřené linuxové sadě; generování dvou cílových lemmat má 544 záznamů. Server naslouchal pouze na 127.0.0.1:8769. Prefix Wine byl oddělený a po testu ukončený.
- Validátor modelových cest nově přijímá Unicode písmena/číslice/značky, včetně uživatelů jako Lukáš Novák; zákazy průchodu `..`, neplatných modelů, NUL a nových řádků zůstaly ověřené. Týká se obou modelových cest.
- Plná instalace, odinstalace a grafická aplikace na skutečných Windows nebyly v tomto prostředí otestované. Wine test serveru nenahrazuje tuto kontrolu.

Důkazy: `docs/verification/2026-11-17-windows-installer/`. Nebyla vytvořena MSI varianta, podepsání ani vzdálené vydání.
