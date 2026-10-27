"""Checks that every relative link in the repository's markdown resolves to an existing file.

Usage (repository root): python docs/check-links.py
Anchors are not validated (several large registers are linked by ID anchors); files are.
"""
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP = ('node_modules', '.git', '.tools', '.next', '.expo', 'target', '.claude')
LINK = re.compile(r'\]\(([^)\s]+)\)')
FENCE = re.compile(r'^\s*(```|~~~)')

broken = []
files = []
for directory, subdirectories, names in os.walk(ROOT):
    subdirectories[:] = [d for d in subdirectories if d not in SKIP]
    files += [Path(directory) / n for n in names if n.endswith('.md')]
for path in files:
    fenced = False
    for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        if FENCE.match(line):
            fenced = not fenced
            continue
        if fenced:
            continue
        for target in LINK.findall(line):
            if re.match(r'^[a-z]+:', target) or target.startswith('#'):
                continue
            file_part = target.split('#', 1)[0]
            if file_part and not (path.parent / file_part).exists():
                broken.append(f'{path.relative_to(ROOT)}:{number}: {target}')

print(f'{len(files)} markdown files checked, {len(broken)} broken links')
for item in broken:
    print('  ' + item)
sys.exit(1 if broken else 0)
