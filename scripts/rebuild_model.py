"""Validate the procedural scaffold, then rebuild the authored Blender deliverable.

The checked-in .blend is an authoring source, including refinements absent from
the legacy procedural scripts. Never silently replace it with their scaffold.
All work happens in staging; assets are replaced only after validation.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
blender = os.environ.get('BLENDER') or shutil.which('blender')
if not blender:
    candidate = Path('/Applications/Blender.app/Contents/MacOS/Blender')
    if candidate.exists():
        blender = str(candidate)
if not blender:
    candidates = sorted((root / 'work').glob('blender-4.5.*-windows-x64/blender.exe'))
    if candidates:
        blender = str(candidates[-1])
if not blender:
    raise SystemExit('Install Blender 4.5 LTS and set BLENDER to its executable.')
blender = str(Path(blender).resolve())


def nodes(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + size])['nodes']


(root / 'work').mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='engine-rebuild-', dir=root / 'work') as tmp:
    stage = Path(tmp)
    shutil.copytree(root / 'scripts', stage / 'scripts')
    (stage / 'models').mkdir()
    (stage / 'public' / 'models').mkdir(parents=True)
    (stage / 'outputs').mkdir()

    def run(script):
        subprocess.run([blender, '--background', '--python-exit-code', '1',
                        '--python', str(stage / 'scripts' / script)], cwd=stage, check=True)

    for script in ['build_engine.py', 'refine_model.py', 'finish_model.py',
                   'optimize_model.py', 'detail_powertrain.py', 'build_transmission.py']:
        run(script)
    procedural = nodes(stage / 'public/models/rs3-ea855-evo.glb')
    names = {n['name'] for n in procedural}
    assert all(n in names for n in ['Crankshaft', 'Transmission', 'DCTFlywheel']), 'Incomplete scaffold'

    # Authored source is authoritative for manually refined legacy geometry.
    # The procedural scaffold is not claimed byte-equivalent to the source.
    source = root / 'models/rs3-ea855-evo.blend'
    shutil.copy2(source, stage / 'models/rs3-ea855-evo.blend')
    print('Preserving authored .blend geometry; rebuilding all system layers.', flush=True)
    run('build_system_layers.py')
    final_nodes = nodes(stage / 'public/models/rs3-ea855-evo.glb')
    assert len({n['name'] for n in final_nodes}) == len(final_nodes), 'Duplicate nodes'
    assert sum(n.get('extras', {}).get('role') == 'anchor' for n in final_nodes) == 167
    for relative in ['models/rs3-ea855-evo.blend', 'public/models/rs3-ea855-evo.glb',
                     'outputs/system-layers/build-report.json']:
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(stage / relative, destination)
    report = {
        'procedural_scaffold_nodes': len(procedural),
        'final_nodes': len(final_nodes),
        'authored_blend_preserved': True,
        'legacy_procedural_byte_equivalence_claimed': False,
        'glb_sha256': hashlib.sha256((root / 'public/models/rs3-ea855-evo.glb').read_bytes()).hexdigest(),
    }
    (root / 'outputs/system-layers/full-rebuild.json').write_text(json.dumps(report, indent=2))
    print('FULL REBUILD PASS', json.dumps(report))
