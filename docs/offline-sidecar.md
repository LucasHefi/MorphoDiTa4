# Offline sidecar

## Contract

The Linux bundle ships the MorphoDiTa REST server built from the
UFAL MorphoDiTa `v1.11.3` source release with the desktop loopback patch.
The full modified MPL-2.0 source and patch are in `third_party/morphodita/`
and in the installed resources. Rebuild with
`sh morphodita4/scripts/build-sidecar-linux.sh`. Tauri invokes the platform-named
external binary as:

```text
morphodita-server --log_file= <port> czech-250909 <models>/czech.tagger https://hdl.handle.net/11234/1-5985
```

The server listens on loopback and exposes the upstream REST paths directly:

- `GET /models`
- `GET/POST /tag`
- `GET/POST /analyze`
- `GET/POST /generate`
- `GET/POST /tokenize`

The frontend therefore uses `http://127.0.0.1:<port>` as the offline base URL.
It must not prepend `/services/morphodita/api`; that path belongs to the
remote LINDA deployment.

The sidecar lifecycle is typed in
`morphodita4/src/services/offlineSidecar.ts`:
`stopped -> starting -> ready`, with `failed` and `stopping` transitions.
Startup probes `/models`, records stdout/stderr/error diagnostics, retries a
bounded port range (`8765`–`8769`), and kills a child on failed startup or
shutdown. Offline startup errors remain fail-closed and expose explicit
recovery actions; `api.ts` never silently switches to LINDA while offline mode
is enabled.

## Packaged server and downloaded models

The installer contains the Linux server, MIT client LICENSE, NOTICE and the
upstream MPL-2.0 text. The server source is linked in NOTICE and About.
It contains no model. Settings downloads the official Czech model only after
explicit CC BY-NC-SA 4.0 acceptance, verifies hashes and retains LICENSE/README.
The active model lives under Tauri appDataDir()/models, with model.json and
provenance notices. Runtime activation validates the model before sidecar startup.
User import accepts .mor and .tagger artifacts; the inventory and compatibility
checks decide whether an artifact can be activated.

## Verification

From `morphodita4`:

```text
npm test -- --run
npm run check
npm run build
cargo fmt --check
cargo check
cargo test
npm run tauri -- build --bundles deb
```

For a packaged sidecar smoke, use the installed server and the separately
downloaded model (models are not bundled):

```sh
node morphodita4/scripts/verify-offline-no-network.mjs \
  --sidecar /usr/bin/morphodita-server \
  --model "$HOME/.local/share/cz.ufal.morphodita/models/czech-250909/czech.tagger"
```

This checks the Linux socket binds only to `127.0.0.1`, performs real tagging,
and starts/stops the server twice. For native frontend coverage and the external
connection audit, see `docs/verification/2026-11-17-offline-regression/`.

Alternatively extract the Debian package and run its bundled binary with the downloaded model. Verify that `/models` lists `czech-250909`,
`/tag?data=Kočka%20běží.&output=json` returns lemma `kočka`, then terminate
the process and verify the loopback port is closed and no sidecar process
remains.

## Platform boundary

Only the Linux x86_64 sidecar artifact is currently present and verified in
this checkout. Windows and macOS sidecar binaries, installers, and runtime
smoke remain OPEN until direct target-platform artifacts and hosts are
available. Linux evidence must not be reported as Windows or production
acceptance.

### Oprava systémové instalace 0.1.14

Spouštění používá pevný argument `--log_file=` (bez souborového logu požadavků), aby server nezapisoval vedle binárního souboru v `/usr/bin`. Shell capability povoluje tento jediný pevný argument. Diagnostika procesu zůstává v aplikaci. Změna online/offline režimu nebo modelu zneplatní rozpracované výsledky průvodce; původní vstup zůstává zachován pro nové zpracování.
