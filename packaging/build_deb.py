#!/usr/bin/env python3
"""Package built Viz static files for the App web_root (/opt/rocos/web)."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile
from deb_common import finish, licenses

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=root / 'build/packages')
args = parser.parse_args()
if not (root / 'dist/index.html').is_file():
    raise ValueError('Run npm run build before packaging')
version = json.loads((root / 'package.json').read_text())['version']
with tempfile.TemporaryDirectory(prefix='rocos-viz-deb-') as tmp:
    stage = Path(tmp)
    shutil.copytree(root / 'dist', stage / 'opt/rocos/web')
    licenses(root, stage, 'viz')
    finish(stage, args.output.resolve(), 'viz', version, 'all',
           {'api_version': '3.0.0', 'shm_abi_version': None},
           'ROCOS Viz static web application')
