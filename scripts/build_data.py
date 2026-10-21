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
    date = None
    for event, e in ET.iterparse(uops_path, events=('start', 'end')):
        if date is None:
            date = e.get('date', 'unknown')
        if event == 'end' and e.tag == 'instruction':
            if not e.get('url'):
                e.clear()
                continue
            url = urlparse('https://' + e.get('url', ''))
            if url.hostname != 'uops.info' or not re.fullmatch(r'/html-instr/[A-Za-z0-9_.+-]+\.html', url.path):
                raise ValueError('Unexpected source URL: ' + e.get('url', ''))
            flags = sum((1 << i) for i, k in enumerate(('mask', 'zeroing', 'bcast', 'roundc', 'sae')) if e.get(k, '0') != '0')
            ops = [operand(o) for o in e.findall('operand') if o.get('suppressed') != '1' and o.get('opmask') != '1']
            variants.append([
                url.path.removeprefix('/html-instr/').removesuffix('.html'), e.get('string'),
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
            'sources': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [intel_path, uops_path]},
            'architectures': archs, 'intrinsics': intrinsics, 'variants': variants}
    out = ROOT / 'src/generated/index.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False) + '\n')
    print(f'{out.relative_to(ROOT)}: {len(intrinsics)} intrinsics, {len(variants)} variants, {out.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()
