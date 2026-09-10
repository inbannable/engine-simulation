"""Export the final .blend and compare GLB geometry, transforms and extras."""
import bpy,json,struct
from pathlib import Path
root=Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(root/'models/rs3-ea855-evo.blend'))
out=root/'work/consistency-export.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=False,export_extras=True,export_animations=False)
def read(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
def ac(g,b,i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]*{5126:4,5123:2,5125:4,5121:1}[a['componentType']];start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size)
 return b''.join(b[start+k*stride:start+k*stride+size] for k in range(a['count']))
a,ab=read(root/'public/models/rs3-ea855-evo.glb');b,bb=read(out)
assert a['nodes']==b['nodes'],'Node transforms/extras mismatch'
for p,q in zip(a['meshes'],b['meshes']):
 assert len(p['primitives'])==len(q['primitives'])
 for x,y in zip(p['primitives'],q['primitives']):
  assert x['attributes'].keys()==y['attributes'].keys()
  for k in x['attributes']:assert ac(a,ab,x['attributes'][k])==ac(b,bb,y['attributes'][k]),k
  assert ac(a,ab,x['indices'])==ac(b,bb,y['indices'])
assert a.get('materials')==b.get('materials')
report={'passed':True,'nodes':len(a['nodes']),'mesh_definitions':len(a['meshes']),'checked':'transforms, hierarchy, extras, geometry attributes, indices, materials'}
(root/'outputs/system-layers/blend-glb-consistency.json').write_text(json.dumps(report,indent=2))
print('BLEND/GLB CONSISTENCY PASS',json.dumps(report))
