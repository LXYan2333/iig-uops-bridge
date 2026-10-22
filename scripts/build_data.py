#!/usr/bin/env python3
"""Extract only matching metadata; never bundle performance measurements."""
import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def table_catalog(text):
    """Mirror table.html's canonicalizeInstrString, only for actual catalog rows."""
    catalog = {}
    owners = {}
    for line in text.splitlines():
        if not line.strip():
            continue
        fields = line.split('|')
        if len(fields) != 2 or not all(fields):
            raise ValueError('Invalid uops.info instruction catalog row')
        name, extension = fields
        identifier = re.sub(r'[(){}, ]+', '_', name).removesuffix('_')
        if not re.fullmatch(r'[A-Za-z0-9_.+-]+', identifier):
            raise ValueError('Unsafe instruction catalog identifier: ' + identifier)
        key = (name, extension)
        if identifier in owners and owners[identifier] != key:
            raise ValueError('Conflicting instruction catalog identifier: ' + identifier)
        owners[identifier] = key
        catalog[key] = identifier
    if not catalog:
        raise ValueError('Empty uops.info instruction catalog')
    return catalog


def detail_id(instruction, catalog):
    raw_url = instruction.get('url')
    if raw_url:
        url = urlparse(raw_url if '://' in raw_url else 'https://' + raw_url)
        if (url.scheme != 'https' or url.netloc != 'uops.info' or url.query or url.fragment
                or not re.fullmatch(r'/html-instr/[A-Za-z0-9_.+-]+\.html', url.path)):
            raise ValueError('Unexpected source URL: ' + raw_url)
        return url.path.removeprefix('/html-instr/').removesuffix('.html')
    # The full name preserves memory, broadcast, zeroing and operand forms.
    # XML remains authoritative for XED, encoding, operands and mask flags.
    return catalog.get((instruction.get('string'), instruction.get('extension')))


def operand(o):
    kind = o.get('type')
    width = o.get('width', '?')
    if kind == 'mem':
        return 'VSIB_' + o.get('VSIB') if o.get('VSIB', '0') != '0' else 'M' + width
    if kind == 'imm':
        return 'I' + width
    if kind == 'reg':
        name = (o.text or '').split(',')[0]
        for prefix in ('ZMM', 'YMM', 'XMM', 'TMM', 'MM', 'K', 'ST'):
            if re.match(prefix + r'\d', name):
                return prefix
        if re.match(r'(R\d|R[A-Z]|E[A-Z]|[ABCD][HLX]|[SD]IL|[BS]PL|[SD]I|[BS]P)', name):
            return 'R' + width
        return name or '?'
    return (kind or '?').upper()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', type=Path, default=ROOT / 'research')
    args = ap.parse_args()
    source = args.source
    intel_path = source / 'intel-data-3-6-9.xml'
    uops_path = source / 'uops-instructions.xml'
    catalog_path = source / 'uops-instructions.csv'
    if not catalog_path.exists():
        raise FileNotFoundError('Missing uops-instructions.csv; run npm run data:update first')
    catalog = table_catalog(catalog_path.read_text())
    if len(catalog) < 20000:
        raise ValueError('Incomplete uops.info instruction catalog')
    intel = ET.parse(intel_path).getroot()
    intrinsics = []
    for e in intel.findall('intrinsic'):
        ret = e.find('return')
        intrinsics.append([
            e.get('name'), ret.get('type', '') if ret is not None else '',
            [x.get('type', '') for x in e.findall('parameter')],
            [x.text for x in e.findall('CPUID')],
            [[x.get('name', ''), x.get('form', ''), x.get('xed', '')] for x in e.findall('instruction')],
            e.get('sequence', '').upper() == 'TRUE',
        ])
    variants = []
    recovered = 0
    date = None
    for event, e in ET.iterparse(uops_path, events=('start', 'end')):
        if date is None:
            date = e.get('date', 'unknown')
        if event == 'end' and e.tag == 'instruction':
            identifier = detail_id(e, catalog)
            if not identifier:
                e.clear()
                continue
            if not e.get('url'):
                recovered += 1
            flags = sum((1 << i) for i, k in enumerate(('mask', 'zeroing', 'bcast', 'roundc', 'sae')) if e.get(k, '0') != '0')
            ops = [operand(o) for o in e.findall('operand') if o.get('suppressed') != '1' and o.get('opmask') != '1']
            variants.append([
                identifier, e.get('string'),
                e.get('iclass'), e.get('iform'), e.get('isa-set'),
                'EVEX' if e.get('evex') == '1' else 'VEX' if e.get('vex') == '1' else 'legacy', ops, flags,
            ])
            e.clear()
    if len(intrinsics) < 7000 or len(variants) < 15000:
        raise ValueError('Incomplete source dataset')
    table = (source / 'uops-table.html').read_text()
    names = dict(re.findall(r'"([^"\n]+)":\s+"([^"\n]+)"', table.split('var archToString = {')[1].split('}')[0]))
    checkbox = dict(re.findall(r'name="cb_([^"\n]+)" arch="([^"\n]+)"', table))
    archs = [[arch, name, next((cb for cb, a in checkbox.items() if a == arch), arch)] for arch, name in names.items()]
    data = {'version': 1, 'intelVersion': intel.get('version'), 'uopsDate': date,
            'sources': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [intel_path, uops_path, catalog_path]},
            'architectures': archs, 'intrinsics': intrinsics, 'variants': variants}
    out = ROOT / 'src/generated/index.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False) + '\n')
    print(f'{out.relative_to(ROOT)}: {len(intrinsics)} intrinsics, {len(variants)} variants, {out.stat().st_size:,} bytes')
    print(f'Recovered {recovered} detail links from the official uops.info table catalog')


if __name__ == '__main__':
    main()
