"""Share low-poly helical springs and correct the editable chain guide envelope."""
import bpy,math,os
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'))
verts=[];faces=[];segments=96;sides=8
for i in range(segments+1):
 u=i/segments;t=u*12*math.pi;center=Vector((8*math.cos(t),27*u,8*math.sin(t)))
 radial=Vector((math.cos(t),0,math.sin(t)));tangent=Vector((-96*math.pi*math.sin(t),27,96*math.pi*math.cos(t))).normalized();normal=tangent.cross(radial).normalized()
 for j in range(sides):
  a=j*2*math.pi/sides;p=center+1.25*(math.cos(a)*radial+math.sin(a)*normal);verts.append(tuple(p))
for i in range(segments):
 for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
mesh=bpy.data.meshes.new('Shared helical spring');mesh.from_pydata(verts,[],faces);mesh.materials.append(bpy.data.materials['Dark steel']);mesh.update()
for p in mesh.polygons:p.use_smooth=True
for o in bpy.data.objects:
 if 'Spring_' in o.name and o.type=='MESH':o.data=mesh

def hull(circles):
 pts=sorted([(y+r*math.cos(i*math.pi/48),z+r*math.sin(i*math.pi/48)) for y,z,r in circles for i in range(96)])
 def cross(o,a,b):return(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
 lower=[];upper=[]
 for p in pts:
  while len(lower)>1 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
  lower.append(p)
 for p in reversed(pts):
  while len(upper)>1 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
  upper.append(p)
 return lower[:-1]+upper[:-1]
for name,x,circles in [('Primary chain guide',244,[(0,0,32),(157,0,51)]),('Secondary chain guide',258,[(157,0,31),(294,-44,38.5),(294,44,38.5)])]:
 old=bpy.data.objects.get(name)
 if old:bpy.data.objects.remove(old,do_unlink=True)
 pts=hull(circles);cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=2;cu.bevel_resolution=2;s=cu.splines.new('POLY');s.points.add(len(pts)-1)
 for p,(y,z) in zip(s.points,pts):p.co=(x,y,z,1)
 s.use_cyclic_u=True;o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);o.parent=bpy.data.objects['Timing'];cu.materials.append(bpy.data.materials['Dark steel'])
 bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/rs3-ea855-evo.glb'),export_format='GLB',export_yup=False,export_extras=True,export_animations=False)
print('OPTIMIZATION COMPLETE')
