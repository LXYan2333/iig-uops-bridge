#!/usr/bin/env python3
"""Make small, attributed test fixtures from the downloaded official snapshots."""
from pathlib import Path
import re
import shutil
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
source, dest = root / 'research', root / 'tests/fixtures'
dest.mkdir(parents=True, exist_ok=True)
for name in ['uops-convert.html', 'uops-convert-broadcast.html', 'uops-convert-maskz.html', 'uops-gather.html', 'uops-shrdi.html']:
    shutil.copyfile(source / name, dest / name)
for old, new in [('intel-jquery-1_10_1.min.js', 'jquery.js'), ('intel-intrinsicsguide.min.js', 'intel-renderer.js'), ('intel-style.min.css', 'guide-style.css')]:
    shutil.copyfile(source / old, dest / new)
names = {'_mm512_shrdi_epi64', '_mm512_cvtepi64_pd', '_mm512_maskz_cvtepi64_pd', '_mm512_i64gather_pd', '_mm512_mask_i64gather_pd', '_mm_add_ps', '_mm256_add_ps', '_mm512_reduce_add_pd', '_mm256_fmadd_pd', '_mm256_cvtepi32_pd'}
intel = ET.parse(source / 'intel-data-3-6-9.xml').getroot()
small = ET.Element('intrinsics_list', intel.attrib)
for e in intel:
    if e.get('name') in names:
        small.append(e)
ET.ElementTree(small).write(dest / 'intel-small.xml', encoding='utf-8', xml_declaration=True)
html = (source / 'intel-guide.html').read_text()
start = html.index('<div id="ig_body">')
depth = 0
for match in re.finditer(r'</?div\b[^>]*>', html[start:]):
    depth += -1 if match[0].startswith('</') else 1
    if depth == 0:
        app = html[start:start + match.end()]
        break
(dest / 'guide.html').write_text('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Intel Guide fixture</title><link rel="stylesheet" href="/tests/fixtures/guide-style.css"></head><body>' + app + '<script src="/tests/fixtures/jquery.js"></script><script src="/tests/fixtures/intel-renderer.js"></script><script>perf2_js={};</script></body></html>')
(dest / 'SOURCES.txt').write_text('''Test fixtures only; retain upstream notices.
Intel Guide 3.6.9: https://www.intel.com/content/www/us/en/docs/intrinsics-guide/index.html
The guide HTML app fragment, renderer, stylesheet and selected XML records are copied from Intel's public Guide.
jQuery 1.10.1 is the Guide dependency; its MIT license notice is retained in jquery.js.
uops.info HTML snapshots (2026-10-21):
https://uops.info/html-instr/VCVTQQ2PD_ZMM_ZMM.html
https://uops.info/html-instr/VCVTQQ2PD_ZMM_M64_1to8.html
https://uops.info/html-instr/VCVTQQ2PD_Z_ZMM_K_ZMM.html
https://uops.info/html-instr/VGATHERQPD_ZMM_K_VSIB_ZMM.html
Additional uops.info HTML snapshot (2026-10-23):
https://uops.info/html-instr/VPSHRDQ_ZMM_ZMM_ZMM_I8.html
These snapshots support offline parser/regression tests; they are not executed in the production script.
''')
print('Extracted', len(small), 'intrinsic fixtures')
