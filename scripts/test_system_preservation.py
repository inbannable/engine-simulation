"""Compare delivery against a pre-system asset revision; run from repository root."""
import subprocess,json,struct,hashlib,sys
from pathlib import Path
def read(b):
 n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
a,ab=read(subprocess.check_output(['git','show',(sys.argv[1] if len(sys.argv)>1 else 'e3f77f171e70c98018059360bb4d5fccec459025')+':public/models/rs3-ea855-evo.glb']))
b,bb=read(Path('public/models/rs3-ea855-evo.glb').read_bytes())
assert len(a.get('textures',[]))==len(b.get('textures',[]))
def accessor(g,blob,i):
 ac=g['accessors'][i];v=g['bufferViews'][ac['bufferView']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[ac['type']]*{5126:4,5123:2,5125:4,5121:1}[ac['componentType']];start=v.get('byteOffset',0)+ac.get('byteOffset',0);stride=v.get('byteStride',size)
 return b''.join(blob[start+k*stride:start+k*stride+size] for k in range(ac['count']))
by={n['name']:n for n in b['nodes']}
count=0
for n in a['nodes']:
 m=by[n['name']]
 for k in ['translation','rotation','scale','matrix','extras']:assert n.get(k)==m.get(k),(n['name'],k)
 assert [a['nodes'][i]['name'] for i in n.get('children',[])]==[b['nodes'][i]['name'] for i in m.get('children',[])]
 if 'mesh' in n:
  for p,q in zip(a['meshes'][n['mesh']]['primitives'],b['meshes'][m['mesh']]['primitives']):
   for k in p['attributes']:assert accessor(a,ab,p['attributes'][k])==accessor(b,bb,q['attributes'][k]),(n['name'],k)
   assert accessor(a,ab,p['indices'])==accessor(b,bb,q['indices']),n['name']
  count+=1
report={'original_nodes_verified':len(a['nodes']),'mesh_nodes_with_identical_positions_normals_indices':count,'texture_count_preserved':len(a.get('textures',[])),'preserved':'node transforms, children names, extras, positions, normals, triangle indices'}
Path('outputs/system-layers/preservation.json').write_text(json.dumps(report,indent=2));print(report)
