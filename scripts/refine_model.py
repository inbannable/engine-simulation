"""Refine the generated engine with photo-led cover shaping, cam profile and cast details."""
import bpy,math,os
from math import pi,sin,cos
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'))
al=bpy.data.materials['Cast aluminium']; dark=bpy.data.materials['Graphite polymer']; steel=bpy.data.materials['Machined steel']; black=bpy.data.materials['Dark steel'];red=bpy.data.materials['RS red']
# Close the endcast bottom correctly, keep the deep skirt silhouette.
# The top cover should be tapered, rather than a generic rectangular slab.
o=bpy.data.objects.get('Sculpted upper shell')
if o:
 for v in o.data.vertices:
  if v.co.z>0:v.co.x*=.92
  # Sloped shoulders and end facets.
  v.co.y-=max(0,abs(v.co.x)-165)*.16
# Add narrow ribs defining the graphite upper face.
cover=bpy.data.objects['Cover']
for x in range(-180,181,8):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,360,23));o=bpy.context.object;o.name='Cover fine rib';o.scale=(1.05,.65,48);o.parent=cover;o.data.materials.append(black)
# Silver side TFSI label faces +Z.
cu=bpy.data.curves.new('Front TFSI','FONT');cu.body='TFSI';cu.size=13;cu.extrude=.2;o=bpy.data.objects.new('Front TFSI',cu);bpy.context.collection.objects.link(o);o.location=(94,312,86);o.parent=cover;cu.materials.append(steel)
bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
# Remove the original rounded eccentric approximation and create sampled teaching lobes.
for side,center in [('Intake',450),('Exhaust',270)]:
 parent=bpy.data.objects[side+'Cam'];parent.location.y=297
 for child in list(parent.children):
  if child.name.startswith('Cam lobe'):bpy.data.objects.remove(child,do_unlink=True)
 for i,off in enumerate([0,144,576,288,432]):
  phi=(off+center)*pi/360
  for dx in [-15,15]:
   verts=[];faces=[];n=96
   for x in [-5.5,5.5]:
    for k in range(n):
     t=2*pi*k/n;d=(t-phi+pi)%(2*pi)-pi
     lift=8*cos(2*d)**2 if abs(d)<pi/4 else 0;r=14.5+lift
     verts.append(((i-2)*88+dx+x,-r*cos(t),r*sin(t)))
   for k in range(n):faces.append((k,(k+1)%n,(k+1)%n+n,k+n))
   faces.append(tuple(reversed(range(n))));faces.append(tuple(range(n,n*2)))
   mesh=bpy.data.meshes.new('Teaching lobe');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Cam lobe',mesh);bpy.context.collection.objects.link(o);o.parent=parent;o.data.materials.append(black)
# Cast pockets / flat bosses and localized ribs: retain individual parts in .blend.
for side,z,parent in [('front',65,bpy.data.objects['FrontShell']),('rear',-65,bpy.data.objects['RearShell'])]:
 for i in range(5):
  x=(i-2)*88
  bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,radius=1,location=(x,92,z));o=bpy.context.object;o.name='Cast oval boss';o.scale=(28,43,4);o.parent=parent;o.data.materials.append(al)
  bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=7,depth=3,location=(x,92,z+(5 if z>0 else -5)));o=bpy.context.object;o.name='Casting plug';o.parent=parent;o.data.materials.append(steel)
# Move corresponding sprockets / chain guide tops to cam height.
for name in ['IntakeGear','ExhaustGear']:bpy.data.objects[name].location.y=297
# Save a compact source and export.
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/rs3-ea855-evo.glb'),export_format='GLB',export_yup=False,export_extras=True,export_animations=False)
print('REFINEMENT COMPLETE')
