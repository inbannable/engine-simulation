"""Add only SystemLayers to the delivered Blender file (Blender 4.5 LTS).
Run: blender --background --python scripts/build_system_layers.py
Y up, X crank axis, mm. All new plumbing is educational, not internal OEM CAD.
"""
import bpy, os, math, json, struct, hashlib
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLEND=os.path.join(ROOT,'models/rs3-ea855-evo.blend')
GLB=os.path.join(ROOT,'public/models/rs3-ea855-evo.glb')
bpy.ops.wm.open_mainfile(filepath=BLEND)
bpy.context.view_layer.update()
def snapshot(objects):
    return {o.name: {'parent':o.parent.name if o.parent else None,
        'matrix':[list(r) for r in o.matrix_local], 'extras':o.id_properties_ensure().to_dict(),
        'data':o.data.name if o.data else None} for o in objects}
old=bpy.data.objects.get('SystemLayers')
owned=set([old]+list(old.children_recursive)) if old else set()
baseline=snapshot([o for o in bpy.data.objects if o not in owned])
for o in owned:
    data=o.data
    bpy.data.objects.remove(o,do_unlink=True)
    if data and data.users==0 and isinstance(data,bpy.types.Mesh):bpy.data.meshes.remove(data)
def group(name,parent=None,loc=(0,0,0),**props):
    o=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(o);o.parent=parent;o.location=loc
    for k,v in props.items():o[k]=v
    return o
root=group('SystemLayers',geometry='Educational exposed routes; not OEM internal CAD',units='mm',revision=1)
groups={n:group(n,root) for n in ['AirSystem','OilSystem','CoolantSystem','HydraulicSystem','SystemMotionAnchors']}
colors={'air':(.12,.62,.8),'exhaust':(.57,.36,.2),'oil':(.83,.62,.12),'coolant':(.14,.66,.43),'hydraulic':(.57,.32,.76),'metal':(.5,.57,.62)}
mats={}
for name,color in colors.items():
    m=bpy.data.materials.get('SYS_MAT_'+name) or bpy.data.materials.new('SYS_MAT_'+name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=.35;p.inputs['Roughness'].default_value=.32;mats[name]=m
parents={d:groups[g] for d,g in [('air','AirSystem'),('exhaust','AirSystem'),('oil','OilSystem'),('coolant','CoolantSystem'),('hydraulic','HydraulicSystem')]}
def mesh(name,verts,faces,parent,material):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);bpy.context.scene.collection.objects.link(o);o.parent=parent;d.materials.append(mats[material]);return o
def tube(name,points,r,parent,material):
    # Parallel-transport polygon rings: inexpensive, deterministic, no baked motion.
    verts=[];faces=[];last=None;n=10
    for i,p in enumerate(points):
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        tangent.normalize();seed=last if last is not None else Vector((0,1,0))
        u=seed-tangent*seed.dot(tangent)
        if u.length<.01:u=tangent.cross(Vector((1,0,0)))
        u.normalize();v=tangent.cross(u);last=u
        for j in range(n):verts.append(tuple(Vector(p)+r*(u*math.cos(j*2*math.pi/n)+v*math.sin(j*2*math.pi/n))))
    for i in range(len(points)-1):
        for j in range(n):a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
    faces.extend([tuple(reversed(range(n))),tuple(range(len(verts)-n,len(verts)))])
    o=mesh(name,verts,faces,parent,material)
    for p in o.data.polygons:p.use_smooth=True
    return o
paths={}
def path(domain,name,points,r=4):
    paths[name]=points
    for i,p in enumerate(points):group(f'SYS_{domain.upper()}_{name.upper()}_{i:02}',parents[domain],p,system=domain,path=name,order=i,direction=1,role='anchor')
    o=tube('SYS_ROUTE_'+name,points,r,parents[domain],domain);o['system']=domain;o['path']=name;o['role']='route'
# Rear turbo shares the existing compressor/turbine axis; external charge route
# goes round the belt end, leaving the timing chain and cylinder banks clear.
path('air','air_intake',[(-245,260,-275),(-110,250,-275),(95,210,-275),(95,158,-230),(95,158,-183),(139,180,-183),(150,210,-240),(-280,210,-240),(-300,160,0),(-280,155,190),(220,155,190),(235,174,132),(180,174,132),(0,174,132),(-176,174,132)],12)
for i in range(1,6):
    x=(i-3)*88
    path('air',f'air_cylinder_{i}',[(x,174,132),(x,205,144),(x,249,100),(x,249,65),(x,231,25)],7)
    path('exhaust',f'exhaust_cylinder_{i}',[(x,231,-25),(x,247,-66),(x,265,-110),(x*.65+33,245,-180),(95,200,-165),(95,158,-126)],6)
path('exhaust','exhaust_turbo',[(95,158,-126),(95,158,-159),(64,126,-190),(10,65,-205),(-15,-65,-205)],13)
# Closed supply/return explanations. Galleries run outboard of rotating parts.
path('oil','oil_main',[(-180,-70,95),(-235,-40,95),(-235,25,95),(-180,65,100),(0,65,100),(180,65,100)],4)
path('oil','oil_crank',[(0,65,100),(0,0,95),(220,0,95),(220,0,0),(220,-55,80),(-180,-70,95)],3)
path('oil','oil_head',[(180,65,100),(205,200,105),(176,280,80),(0,280,80),(-176,280,80),(-215,200,105),(-215,-55,95),(-180,-70,95)],3)
path('oil','oil_turbo',[(180,65,100),(225,95,105),(225,130,-220),(95,190,-220),(95,175,-159),(95,130,-159),(75,65,-110),(70,-65,95),(-180,-70,95)],3)
path('coolant','coolant_block',[(-240,105,90),(-200,120,95),(-176,145,80),(0,145,80),(176,145,80),(210,195,90)],5)
path('coolant','coolant_head',[(210,195,90),(176,265,85),(0,265,85),(-176,265,85),(-245,235,100),(-275,235,150),(-275,90,150),(-240,105,90)],5)
path('coolant','coolant_turbo',[(210,195,90),(230,220,100),(230,220,-235),(95,200,-235),(95,180,-159),(95,140,-159),(-240,105,-235),(-275,90,-180),(-275,90,150),(-240,105,90)],4)
# Valve block below DCT; individual circuits fan out on opposite side of gears.
pump=(365,-115,-90);valve=(435,-115,-100)
for k,r in [(1,78),(2,56)]:path('hydraulic',f'hydraulic_k{k}',[pump,valve,(350,-115,-100-k*10),(350,-r,-40),(350,-r,0)],3)
for name,x,z in [('15',492.5,48),('37',542.5,-48),('4r',409,48),('26',420,-48)]:
    path('hydraulic','hydraulic_fork_'+name,[pump,valve,(x,-100,-135),(x,-45,-135),(x,-35,z),(x,2,z)],2.5)
path('hydraulic','hydraulic_return',[valve,(560,-135,-100),(560,-150,20),(365,-150,20),pump],4)
def rotor(name,loc,axis,r,motion,material):
    o=group(name,groups['SystemMotionAnchors'],loc,ptMotion=motion,axis=list(axis),role='motion',origin='shaft center',radius_mm=r)
    a=Vector(axis);u=a.cross(Vector((0,1,0))).normalized();v=a.cross(u)
    tube(name+'_shaft',[tuple(-a*12),tuple(a*12)],r*.22,o,'metal')
    for j in range(9):
        theta=j*2*math.pi/9;rad=u*math.cos(theta)+v*math.sin(theta);side=a.cross(rad)
        verts=[tuple(rad*r*.22-a*3),tuple(rad*r+side*3-a*2),tuple(rad*r+side*5+a*3),tuple(rad*r*.22+a*3)]
        mesh(name+f'_blade_{j}',verts,[(0,1,2,3),(3,2,1,0)],o,material)
    return o
rotor('SYSTurboRotor',(95,158,-159),(0,0,1),24,'turbo','air')
rotor('SYSStarterRotor',(299,-112,0),(1,0,0),12,'starter','metal')
ring=rotor('SYSStarterRingGear',(299,0,0),(1,0,0),100,'engine','metal')
# Ring is an outboard witness on the existing flywheel plane, centered on crank.
points=[(0,100*math.cos(j*2*math.pi/64),100*math.sin(j*2*math.pi/64)) for j in range(65)]
tube('SYS_StarterRingWitness',points,2,ring,'metal')
rotor('SYSHydraulicPump',pump,(1,0,0),15,'hydraulicPump','hydraulic')
rotor('SYSWaterPump',(-240,105,90),(1,0,0),18,'waterPump','coolant')
rotor('SYSOilPump',(-235,25,95),(1,0,0),15,'oilPump','oil')
# Components have neutral material identities; colors are categorical, not heat.
def box(name,loc,size,parent,material):
    verts=[(loc[0]+x*size[0]/2,loc[1]+y*size[1]/2,loc[2]+z*size[2]/2) for x,y,z in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
    return mesh(name,verts,[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],parent,material)
box('SYS_ValveBody',valve,(62,12,26),groups['HydraulicSystem'],'metal')
box('SYS_Thermostat',(-245,235,100),(24,24,24),groups['CoolantSystem'],'metal')
box('SYS_ChargeCooler_Concept',(-290,160,0),(18,70,100),groups['AirSystem'],'metal')
box('SYS_Throttle',(235,174,132),(22,32,32),groups['AirSystem'],'metal')
bpy.context.view_layer.update()
assert baseline==snapshot([bpy.data.objects[n] for n in baseline]),'Existing objects modified'
triangles=sum(len(p.vertices)-2 for o in root.children_recursive if o.type=='MESH' for p in o.data.polygons)
assert triangles<100000
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=BLEND,compress=True)
bpy.ops.export_scene.gltf(filepath=GLB,export_format='GLB',export_yup=False,export_extras=True,export_animations=False)
# Lossless buffer-view deduplication; preserve node names, pivots, extras, normals.
raw=open(GLB,'rb').read();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:];packed=bytearray();seen={}
for view in g['bufferViews']:
    start=view.get('byteOffset',0);chunk=binary[start:start+view['byteLength']]
    if chunk not in seen:
        while len(packed)%4:packed.append(0)
        seen[chunk]=len(packed);packed.extend(chunk)
    view['byteOffset']=seen[chunk]
while len(packed)%4:packed.append(0)
g['buffers'][0]['byteLength']=len(packed)
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
with open(GLB,'wb') as f:f.write(struct.pack('<III',0x46546c67,2,28+len(j)+len(packed))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(packed),0x004e4942)+packed)
report={'added_nodes':len(root.children_recursive)+1,'path_count':len(paths),'path_anchors':sum(map(len,paths.values())),'added_triangles':triangles,'glb_bytes':os.path.getsize(GLB),'blend_bytes':os.path.getsize(BLEND),'existing_nodes_preserved':len(baseline),'system_signature':hashlib.sha256(json.dumps(snapshot([root]+list(root.children_recursive)),sort_keys=True).encode()).hexdigest()}
os.makedirs(os.path.join(ROOT,'outputs/system-layers'),exist_ok=True)
with open(os.path.join(ROOT,'outputs/system-layers/build-report.json'),'w') as f:json.dump(report,f,indent=2)
print('SYSTEM_LAYERS',json.dumps(report))
assert report['glb_bytes']<=15000000,'GLB exceeds 15 MB'



