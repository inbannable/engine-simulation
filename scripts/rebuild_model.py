"""Reproducible three-pass model build. Set BLENDER to the executable path."""
import os,shutil,subprocess,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
blender=os.environ.get('BLENDER') or shutil.which('blender')
if not blender:
 candidate='/Applications/Blender.app/Contents/MacOS/Blender'
 if os.path.exists(candidate):blender=candidate
if not blender:
 candidates=sorted((root/'work').glob('blender-4.5.*-windows-x64/blender.exe'),key=lambda p:tuple(map(int,p.parent.name.split('-')[1].split('.'))))
 if candidates:blender=str(candidates[-1])
if not blender:raise SystemExit('Install Blender 4.5 LTS, then set BLENDER=/path/to/Blender executable.')
for script in ['build_engine.py','refine_model.py','finish_model.py','optimize_model.py','detail_powertrain.py','build_transmission.py']:
 subprocess.run([blender,'--background','--python',str(root/'scripts'/script)],cwd=root,check=True)
