#!/usr/bin/env python3
"""Generate conservative architecture assessments from pinned, verified upstream tables."""
import argparse
import ast
import hashlib
import json
import re
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / 'scripts/support-sources.json'


def lines(text):
    text = re.sub(r'#.*', '', text)
    text = re.sub(r'\\\s*\n', ' ', text)
    return [line.strip() for line in text.splitlines() if line.strip()]


def chips_from(texts):
    definitions = {}
    for text in texts:
        for line in lines(text):
            name, body = line.split(':', 1)
            name = name.strip()
            if name in definitions:
                raise ValueError('Duplicate XED chip: ' + name)
            definitions[name] = body.split()
    expanded = {}

    def expand(name, visiting=()):
        if name in visiting:
            raise ValueError('Cyclic XED chip inheritance')
        if name in expanded:
            return expanded[name]
        inherited, removed, added = set(), set(), set()
        for token in definitions[name]:
            if m := re.fullmatch(r'ALL_OF\((\w+)\)', token):
                inherited |= expand(m[1], (*visiting, name))
            elif m := re.fullmatch(r'COMMON_SUBSET\((\w+),(\w+)\)', token):
                inherited |= expand(m[1], (*visiting, name)) & expand(m[2], (*visiting, name))
            elif m := re.fullmatch(r'NOT\((\w+)\)', token):
                removed.add(m[1])
            elif re.fullmatch(r'\w+', token):
                added.add(token)
            else:
                raise ValueError('Unknown XED chip syntax: ' + token)
        expanded[name] = (inherited - removed) | added
        return expanded[name]

    for name in definitions:
        expand(name)
    return expanded


def cpuid_from(texts):
    """Each group is AND; different groups are OR. Keep unrecognized records."""
    result, seen = {}, {}
    for text in texts:
        for line in lines(text):
            key, body = line.split(':', 1)
            parts = [p.strip().upper() for p in key.split(',')]
            if len(parts) > 2 or not parts[0].startswith('XED_ISA_SET_'):
                raise ValueError('Unknown CPUID group syntax')
            isa = parts[0].removeprefix('XED_ISA_SET_')
            group = parts[1] if len(parts) == 2 else ('AVX10' if 'avx10_enabled' in body.lower() else 'FBIT')
            records = body.lower().split() or ['n/a']
            if group not in ('AVX10', 'FBIT'):
                raise ValueError('Unknown or duplicate CPUID group: ' + key)
            if (isa, group) in seen:
                if seen[isa, group] != records:
                    raise ValueError('Conflicting CPUID group: ' + key)
                continue
            seen[isa, group] = records
            # Empty/N/A records are deliberately unknown, never vacuously true.
            result.setdefault(isa, []).append(records)
    return result


def llvm_from(cpp, definitions):
    """Interpret only the set-expression grammar used by the pinned LLVM tables."""
    cpp = re.sub(r'/\*.*?\*/|//[^\n]*', '', cpp, flags=re.S)
    names = set(re.findall(r'^X86_FEATURE(?:_COMPAT)?\s*\(\s*(\w+),', definitions, re.M))
    expressions = dict(re.findall(r'constexpr\s+FeatureBitset\s+(\w+)\s*=\s*([^;]+);', cpp))
    cache = {'Feature' + f: {f} for f in names}

    def resolve(name, visiting=()):
        if name in cache:
            return cache[name]
        if name in visiting:
            raise ValueError('Cyclic LLVM feature expression')
        def evaluate(node):
            if isinstance(node, ast.Name):
                return resolve(node.id, (*visiting, name))
            if isinstance(node, ast.Dict) and not node.keys:
                return set()
            if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Invert):
                return names - evaluate(node.operand)
            if isinstance(node, ast.BinOp):
                a, b = evaluate(node.left), evaluate(node.right)
                if isinstance(node.op, ast.BitOr): return a | b
                if isinstance(node.op, ast.BitAnd): return a & b
                if isinstance(node.op, ast.BitXor): return a ^ b
            raise ValueError('Unknown LLVM feature expression')
        cache[name] = evaluate(ast.parse(' '.join(expressions[name].split()), mode='eval').body)
        return cache[name]

    implications = {f: resolve('ImpliedFeatures' + f) for f in names}
    def closure(features):
        result = set(features)
        while True:
            expanded = result | set().union(*(implications[f] for f in result))
            if expanded == result:
                return result
            result = expanded
    processors = re.findall(r'\{\s*\{\s*"([^"\n]+)"\s*\},\s*\{\s*CK_\w+,\s*(?:~0U|FEATURE_\w+),\s*(Features\w+)', cpp)
    if not processors:
        raise ValueError('LLVM processor table not recognized')
    return {name: closure(resolve(expr)) for name, expr in processors}, names


def evaluate_groups(groups, features, bindings):
    if not groups:
        return None
    values = []
    for group in groups:
        terms = [bindings[token] in features if token in bindings else None for token in group]
        values.append(False if False in terms else True if terms and all(x is True for x in terms) else None)
    return True if True in values else False if all(x is False for x in values) else None


def combine(xed, llvm):
    known = [v for v in (xed, llvm) if v is not None]
    if len(set(known)) > 1:
        return 'conflicts'
    return 'supported' if True in known else 'unsupported' if False in known else 'unknown'


def verified_files(source):
    lock = json.loads(LOCK.read_text())
    for name, meta in lock['files'].items():
        if hashlib.sha256((source / name).read_bytes()).hexdigest() != meta['sha256']:
            raise ValueError('Support source checksum mismatch: ' + name)
    return lock


def generate(source, index):
    lock = verified_files(source)
    # Read archive members directly: no extraction and no execution of upstream code.
    with tarfile.open(source / 'xed.tar.gz') as archive:
        texts = {m.name.split('/', 1)[1]: archive.extractfile(m).read().decode()
                 for m in archive.getmembers() if m.isfile() and '/datafiles/' in m.name
                 and ('chips' in m.name or 'cpuid' in m.name) and m.name.endswith('.txt')}
    chips = chips_from([v for k, v in texts.items() if 'chips' in k])
    cpuid = cpuid_from([v for k, v in texts.items() if 'cpuid' in k])
    llvm, features = llvm_from((source / 'llvm.cpp').read_text(), (source / 'llvm.def').read_text())
    bindings = json.loads((ROOT / 'scripts/support-cpuid.json').read_text())
    if set(bindings.values()) - features:
        raise ValueError('Unknown LLVM feature binding')
    policy = json.loads((ROOT / 'scripts/support-policy.json').read_text())
    known_isa = set().union(*chips.values())
    isas = sorted({v[4] for v in index['variants']})
    architectures = {}
    for arch, *_ in index['architectures']:
        mapping = policy['architectures'].get(arch, {})
        result = {**mapping, 'supported': [], 'unsupported': [], 'conflicts': []}
        xmodel, lmodel = mapping.get('xed'), mapping.get('llvm')
        # Missing models are errors during an upstream upgrade, not silent negatives.
        xfeatures = chips[xmodel] if xmodel else None
        lfeatures = llvm[lmodel] if lmodel else None
        for isa in isas:
            x = isa in xfeatures if xfeatures is not None and isa in known_isa else None
            l = evaluate_groups(cpuid.get(isa), lfeatures, bindings) if lfeatures is not None else None
            state = combine(x, l)
            if state != 'unknown':
                result[state].append(isa)
        architectures[arch] = result
    if len(chips) < 40 or len(llvm) < 40 or len(cpuid) < 200:
        raise ValueError('Incomplete support source tables')
    return {'version': 1, 'sources': lock, 'architectures': architectures,
            'requirements': {isa: cpuid.get(isa, []) for isa in isas},
            'exceptions': policy['exceptions']}


def download(source):
    try:
        from .download_data import fetch
    except ImportError:
        from download_data import fetch
    source.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=source) as tmp:
        stage = Path(tmp)
        for name, meta in json.loads(LOCK.read_text())['files'].items():
            fetch(meta['url'], stage / name)
        verified_files(stage)
        # Validate both parsers before replacing even the ignored source copies.
        generate(stage, json.loads((ROOT / 'src/generated/index.json').read_text()))
        for path in stage.iterdir():
            path.replace(source / path.name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', type=Path, default=ROOT / 'research/support')
    ap.add_argument('--index', type=Path, default=ROOT / 'src/generated/index.json')
    ap.add_argument('--output', type=Path, default=ROOT / 'src/generated/support.json')
    ap.add_argument('--download', action='store_true')
    args = ap.parse_args()
    if args.download:
        download(args.source)
    data = generate(args.source, json.loads(args.index.read_text()))
    # No output replacement on validation/serialization failure.
    payload = json.dumps(data, separators=(',', ':'), ensure_ascii=False) + '\n'
    args.output.write_text(payload)
    print(f'{args.output}: {len(data["architectures"])} architectures, {len(data["requirements"])} ISA sets')


if __name__ == '__main__':
    main()
