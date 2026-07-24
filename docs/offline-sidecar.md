# Offline sidecar

## Contract

The Linux bundle ships the upstream MorphoDiTa REST server built from the
UFAL MorphoDiTa `v1.11.3` source release. Tauri invokes the platform-named
external binary as:

```text
morphodita-server <port> czech-250909 <models>/czech.tagger https://hdl.handle.net/11234/1-5985
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

## Bundled files

The Tauri resource mapping currently flattens files from `morphodita4/models`
into the packaged `models/` directory. The runtime intentionally addresses the
resulting path `models/czech.tagger`.

- `morphodita4/src-tauri/binaries/morphodita-server-x86_64-unknown-linux-gnu`
  - target: Linux x86_64
  - SHA-256: `99ac5a75fc931b2820321219a45e223f6771c44309439ae0e86af7fe1be44579`
  - source: UFAL MorphoDiTa `v1.11.3`, built with `make -C src server PLATFORM=linux MODE=release BITS=64`
- `morphodita4/models/czech-250909/czech.tagger`
  - packaged as `models/czech.tagger`
  - SHA-256: `173ea80a38d4ebb53a3e85a74f91ad02827738472809f155d965ce225d27cc3e`
  - source: `https://hdl.handle.net/11234/1-5985`
  - release: `czech-morfflex2.1-pdtc2.0-250909`
  - license: CC BY-NC-SA 4.0; see the bundled `LICENSE.txt`
- `model.json`, `README.txt`, and `LICENSE.txt` are bundled provenance/notices.

The `.mor` files handled by `localModels.ts` are a separate user-local model
inventory contract. They are not silently treated as REST tagger files and are
not substituted for the bundled `.tagger` artifact.

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

For a packaged sidecar smoke, extract the Debian package and run the bundled
binary with the bundled model. Verify that `/models` lists `czech-250909`,
`/tag?data=Kočka%20běží.&output=json` returns lemma `kočka`, then terminate
the process and verify the loopback port is closed and no sidecar process
remains.

## Platform boundary

Only the Linux x86_64 sidecar artifact is currently present and verified in
this checkout. Windows and macOS sidecar binaries, installers, and runtime
smoke remain OPEN until direct target-platform artifacts and hosts are
available. Linux evidence must not be reported as Windows or production
acceptance.
