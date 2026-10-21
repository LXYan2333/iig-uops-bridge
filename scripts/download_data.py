#!/usr/bin/env python3
"""Refresh official source files. urllib honors HTTPS_PROXY / HTTP_PROXY."""
import hashlib
import json
import re
import shutil
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://www.intel.com'
GUIDE = BASE + '/content/www/us/en/docs/intrinsics-guide/index.html'


def fetch(url, path):
    print('Downloading', url, flush=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'iig-uops-bridge data updater'})
    with urllib.request.urlopen(req, timeout=180) as response, path.open('wb') as out:
        shutil.copyfileobj(response, out)
    return {'url': url, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    dest = ROOT / 'research'
    dest.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=dest) as tmp:
        stage = Path(tmp)
        manifest = {}
        manifest['intel-guide.html'] = fetch(GUIDE, stage / 'intel-guide.html')
        html = (stage / 'intel-guide.html').read_text()
        script = re.search(r'src="([^"]*/intrinsicsguide\.min\.js[^\"]*)"', html)
        if not script:
            raise RuntimeError('Intel renderer URL not found; previous data retained')
        manifest['intel-intrinsicsguide.min.js'] = fetch(urllib.request.urljoin(GUIDE, script[1]), stage / 'intel-intrinsicsguide.min.js')
        js = (stage / 'intel-intrinsicsguide.min.js').read_text()
        data = re.search(r'url:"([^"]*/data-[^\"]+\.xml)"', js)
        if not data:
            raise RuntimeError('Intel XML URL not found; previous data retained')
        # Stable local filename; the XML version is read from the content by build_data.py.
        for name, url in {
            'intel-data-3-6-9.xml': urllib.request.urljoin(GUIDE, data[1]),
            'uops-instructions.xml': 'https://uops.info/instructions.xml',
            'uops-table.html': 'https://uops.info/table.html',
        }.items():
            manifest[name] = fetch(url, stage / name)
        import xml.etree.ElementTree as ET
        ET.parse(stage / 'intel-data-3-6-9.xml')
        for _, e in ET.iterparse(stage / 'uops-instructions.xml'):
            e.clear()
        for name in manifest:
            (stage / name).replace(dest / name)
        (dest / 'update-manifest.json').write_text(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
