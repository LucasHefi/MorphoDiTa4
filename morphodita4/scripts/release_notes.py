"""Release notes come from the tagged changelog; no invented historical versions."""
from pathlib import Path
import re
import sys
version = sys.argv[1]
changelog = (Path(__file__).resolve().parents[2] / 'CHANGELOG.md').read_text()
match = re.search(r'^## ' + re.escape(version) + r'[^\n]*\n(.*?)(?=^## |\Z)', changelog, re.M | re.S)
if not match:
    raise SystemExit(f'Missing changelog entry for {version}')
print(match.group(1).strip())
print('''

Instalační balíčky pro Linux amd64 a Windows x64. Windows ZIP obsahuje instalátor a český návod. Kontrolní součty jsou v SHA256SUMS.txt.

Modely nejsou součástí balíčků; instalují se po přečtení licence v Nastavení. Program je MIT, přibalený upravený server MPL-2.0; licenční a zdrojové podklady jsou v instalaci.

Balíčky nejsou digitálně podepsané. Automatické sestavení a testy nenahrazují ruční akceptaci instalace a grafického rozhraní, zejména na Windows.
''')
