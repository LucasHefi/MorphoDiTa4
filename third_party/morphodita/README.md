# MorphoDiTa desktop loopback patch

Upstream: https://github.com/ufal/morphodita/tree/v1.11.3
Source archive: https://codeload.github.com/ufal/morphodita/tar.gz/refs/tags/v1.11.3
SHA-256: `1e75bc319f94d5f9ba6e381c940111d72c18a82970ac55d296ca26c64098bfd7`
License: MPL-2.0 (see `licenses/MPL-2.0.txt` in the client distribution).

The desktop client modifies `src/rest_server/microrestd/rest_server/rest_server.cpp`
to bind IPv4 `127.0.0.1` instead of every interface. The REST API and the model
are unchanged. `rest_server.cpp` is the full modified Source Code Form, with
upstream copyright and license notices retained. `loopback.patch` is the exact
patch against v1.11.3. These files are also included in the desktop package.

To rebuild the Linux x86_64 sidecar from a client repository checkout, run:

```sh
sh morphodita4/scripts/build-sidecar-linux.sh
```

The script checks the pinned source checksum, applies the patch and builds the
upstream `server` target. Requirements: curl, tar, patch, make and a C++ compiler.
No language model is downloaded by this script.

Windows x64 cross-build from Linux (MinGW-w64 POSIX compiler, static C++/GCC/pthread runtime):

```sh
sh morphodita4/scripts/build-sidecar-windows.sh
```

The same pinned source archive and loopback patch are used. The PE sidecar imports only Windows system libraries. Installer build instructions are in `docs/release-windows.md`.
