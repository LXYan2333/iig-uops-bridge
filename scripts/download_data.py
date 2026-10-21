#!/usr/bin/env python3
"""Refresh official source files. urllib honors HTTPS_PROXY / HTTP_PROXY."""
import hashlib
import http.client
import json
import re
import shutil
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://www.intel.com'
GUIDE = BASE + '/content/www/us/en/docs/intrinsics-guide/index.html'
RENDERER_PATH = '/content/dam/develop/public/us/en/include/intrinsics-guide/intrinsicsguide.min.js'
NETWORK_ERRORS = (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException)
SOURCE_ERRORS = NETWORK_ERRORS + (ValueError, ET.ParseError)


def fetch(url, path):
    for attempt in range(3):
        print('Downloading', url, flush=True)
        req = urllib.request.Request(url, headers={'User-Agent': 'iig-uops-bridge data updater'})
        try:
            with urllib.request.urlopen(req, timeout=180) as response, path.open('wb') as out:
                shutil.copyfileobj(response, out)
            return {'url': url, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        except NETWORK_ERRORS as error:
            path.unlink(missing_ok=True)
            retryable = not isinstance(error, urllib.error.HTTPError) or error.code == 429 or 500 <= error.code < 600
            if not retryable or attempt == 2:
                raise
            print(f'Temporary download failure: {error}; retrying', flush=True)
            time.sleep(2 ** attempt)


def fetch_intel(stage):
    manifest = {}
    renderers = []
    failures = []
    try:
        info = fetch(GUIDE, stage / 'intel-guide.html')
        html = (stage / 'intel-guide.html').read_text()
        script = re.search(r'src="([^"]*intrinsicsguide\.min\.js[^"]*)"', html)
        if not script:
            raise ValueError('Intel renderer URL not found')
        manifest['intel-guide.html'] = info
        renderers.append(urllib.request.urljoin(GUIDE, script[1]))
    except SOURCE_ERRORS as error:
        failures.append(f'{GUIDE}: {error}')
        print(f'Intel Guide page unavailable: {error}; trying official static sources', flush=True)

    # Both hosts are Intel-operated. Discover the XML version from live JS, never a snapshot.
    renderers.extend(host + RENDERER_PATH for host in (BASE, 'https://www.intel.cn'))
    for renderer in dict.fromkeys(renderers):
        try:
            js_info = fetch(renderer, stage / 'intel-intrinsicsguide.min.js')
            js = (stage / 'intel-intrinsicsguide.min.js').read_text()
            data = re.search(r'url:"([^"]*data-[^"]+\.xml)"', js)
            if not data:
                raise ValueError('Intel XML URL not found')
            # Stable filename; build_data.py reads the actual XML version.
            xml_info = fetch(urllib.request.urljoin(renderer, data[1]), stage / 'intel-data-3-6-9.xml')
            root = ET.parse(stage / 'intel-data-3-6-9.xml').getroot()
            if root.find('intrinsic') is None:
                raise ValueError('Intel XML contains no intrinsics')
            manifest['intel-intrinsicsguide.min.js'] = js_info
            manifest['intel-data-3-6-9.xml'] = xml_info
            return manifest
        except SOURCE_ERRORS as error:
            failures.append(f'{renderer}: {error}')
            print(f'Intel source unavailable: {error}; trying next official source', flush=True)
    raise RuntimeError('All official Intel sources failed; previous data retained.\n' + '\n'.join(failures))


def main():
    dest = ROOT / 'research'
    dest.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=dest) as tmp:
        stage = Path(tmp)
        manifest = fetch_intel(stage)
        for name, url in {
            'uops-instructions.xml': 'https://uops.info/instructions.xml',
            'uops-table.html': 'https://uops.info/table.html',
        }.items():
            manifest[name] = fetch(url, stage / name)
        for _, e in ET.iterparse(stage / 'uops-instructions.xml'):
            e.clear()
        for name in manifest:
            (stage / name).replace(dest / name)
        (dest / 'update-manifest.json').write_text(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
