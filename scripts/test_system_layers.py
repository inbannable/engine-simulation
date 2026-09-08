"""Repeatability acceptance runner (standalone Python, requires Blender).
Does not rebuild the engine; calls only build_system_layers.py twice.
"""
from pathlib import Path
import subprocess,os,shutil,json,hashlib
root=Path(__file__).resolve().parent.parent
blender=os.environ.get('BLENDER') or shutil.which('blender')
if not blender:
    candidates=sorted((root/'work').glob('blender-4.5.*-windows-x64/blender.exe'))
    if candidates:blender=str(candidates[-1])
if not blender:raise SystemExit('Set BLENDER to Blender 4.5 LTS executable')
results=[]
for i in range(2):
    log=root/f'outputs/system-layers/idempotence-{i+1}.log'
    with log.open('w') as f:subprocess.run([blender,'--background','--python-exit-code','1','--python',str(root/'scripts/build_system_layers.py')],stdout=f,stderr=subprocess.STDOUT,check=True)
    report=json.loads((root/'outputs/system-layers/build-report.json').read_text())
    report['glb_sha256']=hashlib.sha256((root/'public/models/rs3-ea855-evo.glb').read_bytes()).hexdigest()
    results.append(report)
for key in ['system_signature','glb_sha256','added_nodes','added_triangles','path_anchors','path_count','existing_nodes_preserved']:
    assert results[0][key]==results[1][key],key
(root/'outputs/system-layers/idempotence.json').write_text(json.dumps({'passed':True,'runs':results},indent=2))
print('PASS: two runs, identical nodes, local transforms, metadata and GLB bytes')
