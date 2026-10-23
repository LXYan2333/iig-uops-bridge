#!/usr/bin/env python3
"""Stage both generated datasets; publish only after both builders succeed."""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    def run(script, *arguments):
        subprocess.run([sys.executable, str(ROOT / 'scripts' / script), *map(str, arguments)], check=True)
    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp)
        if args.download:
            run('download_data.py')
        run('build_data.py', '--output', stage / 'index.json')
        run('build_support.py', '--index', stage / 'index.json', '--output', stage / 'support.json',
            *(['--download'] if args.download else []))
        for name in ('index.json', 'support.json'):
            # Stage inside the destination filesystem before atomic replacement.
            target = ROOT / 'src/generated' / name
            pending = target.with_suffix('.pending')
            pending.write_bytes((stage / name).read_bytes())
            pending.replace(target)


if __name__ == '__main__':
    main()
