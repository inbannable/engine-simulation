"""Final mechanical assembly corrections; run after build_engine + refine_model."""
import bpy,math,os
from math import pi,sin,cos
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'))
al=bpy.data.materials['Cast aluminium'];dark=bpy.data.materials['Graphite polymer'];steel=bpy.data.materials['Machined steel'];black=bpy.data.materials['Dark steel']

def box(name,loc,size,mat,parent,bevel=2):
 bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.parent=parent;o.data.materials.append(mat)
 m=o.modifiers.new('Cast radii','BEVEL');m.width=bevel;m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
 for f in o.data.polygons:f.use_smooth=True
 return o

def cyl(name,loc,r,depth,mat,parent,axis='X'):
 bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=r,depth=depth,location=loc);o=bpy.context.object;o.name=name;o.parent=parent;o.data.materials.append(mat)
 if axis=='X':o.rotation_euler[1]=pi/2
 if axis=='Y':o.rotation_euler[0]=pi/2
 for f in o.data.polygons:f.use_smooth=True
 return o
crank=bpy.data.objects['Crankshaft'];shaft=bpy.data.objects.get('Main shaft')
if shaft:bpy.data.objects.remove(shaft,do_unlink=True)
for x in [-220,-132,-44,44,132,220]:cyl('Main journal',(x,0,0),25,35,steel,crank)
# Cam shafts/valves share the same splayed layout; intake on +Z, exhaust on -Z.
alpha=math.atan(.38)
for side,sgn in [('Intake',1),('Exhaust',-1)]:
 cam=bpy.data.objects[side+'Cam'];cam.location.y=294;cam.location.z=44*sgn
 gear=bpy.data.objects[side+'Gear'];gear.location.y=294;gear.location.z=44*sgn
 for i in range(1,6):
  for j in range(2):
   v=bpy.data.objects[f'{side}Valve_{i}_{j}'];v.location.y=231;v.rotation_euler.x=alpha*sgn
   for child in list(v.children):child.location.y-=231
   # Spring lower seat fixed; top retainer moves with valve. Independent mesh group.
   springs=[c for c in v.children if c.name.startswith('Valve spring')]
   for spring in springs:
    # The curve mesh has authored coordinates Y251..278. Normalize to 0..27.
    spring.parent=bpy.data.objects['Core'];spring.name=f'{side}Spring_{i}_{j}';spring.location=(v.location.x,231+20*cos(alpha),sgn*(25+20*sin(alpha)));spring.rotation_euler.x=sgn*alpha
    for vert in spring.data.vertices:vert.co.y-=251
cover=bpy.data.objects['Cover']
for z in [-69,69]:box('Cam cover skirt',(0,303,z),(450,38,10),dark,cover,4)
for x in [-224,224]:box('Cam cover end skirt',(x,303,0),(10,38,131),dark,cover,5)
# Taper the two large shoulders, avoiding the generic rectangular cover silhouette.
for x in [-200,200]:
 o=box('Cover shoulder',(x,331,7),(51,41,135),dark,cover,10);o.rotation_euler.z=(-.17 if x>0 else .17)
acc=bpy.data.objects['Accessories']
cyl('Plenum end cap',(-207,174,130),29.5,6,dark,acc)
# Spark/coil rail wiring and bolted longitudinal head flanges.
for z in [-67,67]:
 for x in [-208,-132,-44,44,132,208]:cyl('Valve cover fastener',(x,326,z),4,6,steel,cover,'Y')
# Deeper cast sill and local bolt flanges on oil filter side.
for parentName,z in [('FrontShell',69),('RearShell',-69)]:
 parent=bpy.data.objects[parentName]
 for x in [-178,-90,0,90,178]:
  o=box('Diagonal cast gusset',(x,42,z),(10,71,6),al,parent,1.5);o.rotation_euler.z=.18
# Grey metal should read as cast metal under studio light, not white plastic.
for name,rough in [('Cast aluminium',.48),('Machined steel',.3),('Graphite polymer',.52)]:
 bpy.data.materials[name].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=rough
# Save compact editable source and final uncompressed GLB (no external decoder required).
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/rs3-ea855-evo.glb'),export_format='GLB',export_yup=False,export_extras=True,export_animations=False)
print('ASSEMBLY COMPLETE')
