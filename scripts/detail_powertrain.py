"""Photo-led EA855 detail and static DQ500-family exterior. Run after optimize_model.

Millimetres, Y up, crank axis +X. These are estimated exterior surfaces, not OEM CAD.
This stage builds static exterior only; build_transmission.py adds moving internals.
"""
import bpy, math, os, random
from math import sin, cos, pi
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'models/rs3-ea855-evo.blend'))
al = bpy.data.materials['Cast aluminium']
steel = bpy.data.materials['Machined steel']
dark = bpy.data.materials['Graphite polymer']
black = bpy.data.materials['Dark steel']
rubber = bpy.data.materials['Rubber']
gold = bpy.data.materials['Hot exhaust']
root = bpy.data.objects['RS3_EA855_EVO']

# A small embedded tangent-space normal texture gives aluminium a cast finish
# in both Blender and glTF, rather than relying on Blender-only shader nodes.
image=bpy.data.images.get('Casting microstructure')
if not image:
    size=128
    image=bpy.data.images.new('Casting microstructure',width=size,height=size)
    rng=random.Random(855)
    heights=[rng.random() for _ in range(size*size)]
    pixels=[]
    for y in range(size):
        for x in range(size):
            dx=(heights[y*size+(x+1)%size]-heights[y*size+(x-1)%size])*.22
            dy=(heights[((y+1)%size)*size+x]-heights[((y-1)%size)*size+x])*.22
            n=Vector((dx,dy,1)).normalized()
            pixels.extend((n.x*.5+.5,n.y*.5+.5,n.z*.5+.5,1))
    image.colorspace_settings.name='Non-Color'
    image.pixels=pixels
    image.pack()
nodes=al.node_tree.nodes
tex=nodes.get('Casting grain') or nodes.new('ShaderNodeTexImage')
tex.name='Casting grain';tex.image=image
normal=nodes.get('Casting normal') or nodes.new('ShaderNodeNormalMap')
normal.name='Casting normal';normal.inputs['Strength'].default_value=.08
al.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color'])
al.node_tree.links.new(normal.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
nodes.get('Principled BSDF').inputs['Roughness'].default_value=.57
nodes.get('Principled BSDF').inputs['Metallic'].default_value=.64

# Idempotent detail pass, also suitable for iteration on the editable source.
for name in ['EngineDetail', 'Transmission']:
    old = bpy.data.objects.get(name)
    if old:
        for child in list(old.children_recursive):
            bpy.data.objects.remove(child, do_unlink=True)
        bpy.data.objects.remove(old, do_unlink=True)

def group(name, parent):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    return o

detail = group('EngineDetail', root)
gearbox = group('Transmission', root)
gearbox['reference'] = 'DQ500 family exterior photo reconstruction; 8Y mounting details estimated'
gearbox['simulation'] = 'static exterior only; no gear train or clutch solver'
gearbox['estimated_envelope_mm'] = [340, 320, 330]
shell = group('TransmissionHousing', gearbox)
fittings = group('TransmissionFittings', gearbox)
outputs = group('TransmissionOutputs', gearbox)

def finish(o, name, material, parent, bevel=0):
    o.name = name
    o.parent = parent
    o.data.materials.append(material)
    if bevel:
        m = o.modifiers.new('Manufactured edge radius', 'BEVEL')
        m.width = bevel
        m.segments = 3
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=m.name)
    for f in o.data.polygons:
        f.use_smooth = True
    m = o.modifiers.new('Surface normals', 'WEIGHTED_NORMAL')
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)
    return o

def box(name, loc, size, material=al, parent=detail, bevel=2):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, material, parent, bevel)

def cyl(name, loc, radius, depth, material=steel, parent=detail, axis='X', vertices=40):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    if axis == 'X': o.rotation_euler.y = pi / 2
    if axis == 'Y': o.rotation_euler.x = pi / 2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, name, material, parent, .6)

def tube(name, points, radius, material=rubber, parent=detail, smooth=True):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.resolution_u = 10
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    cu.use_fill_caps = not smooth
    sp = cu.splines.new('BEZIER' if smooth else 'POLY')
    if smooth:
        sp.bezier_points.add(len(points)-1)
        for p, co in zip(sp.bezier_points, points):
            p.co = co
            p.handle_left_type = p.handle_right_type = 'AUTO'
    else:
        sp.points.add(len(points)-1)
        for p, co in zip(sp.points, points): p.co = (*co, 1)
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    cu.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH')
    return o

def ring(name, loc, radius, thickness, material=steel, parent=detail, axis='X'):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=8,
        major_radius=radius, minor_radius=thickness, location=loc)
    o = bpy.context.object
    if axis == 'X': o.rotation_euler.y = pi/2
    if axis == 'Y': o.rotation_euler.x = pi/2
    return finish(o, name, material, parent)

def bolt(loc, parent=detail, axis='X', radius=4):
    cyl('Fastener washer', loc, radius*1.55, 1.4, steel, parent, axis)
    v = Vector(loc)
    v['XYZ'.index(axis)] += 2.4
    cyl('Hex flange bolt', v, radius, 4, black, parent, axis, 6)

# Bell housing: coaxial with crank, bulges into the offset differential pocket.
# Ring sections make a genuinely hollow, tapered casting with a machined lip.
def casting(name, stations, parent=shell, wall=6):
    n = 80
    verts, faces = [], []
    for inside in [False, True]:
        for x, ry, rz, yc, zc in stations:
            for k in range(n):
                t = 2*pi*k/n
                # Offset lower quadrant gives the cast case its asymmetric outline.
                bulge = 1 + .12*max(0, sin(t))**4
                verts.append((x, yc+(ry-(wall if inside else 0))*cos(t),
                    zc+(rz-(wall if inside else 0))*sin(t)*bulge))
    count = len(stations)*n
    for layer in range(2):
        for j in range(len(stations)-1):
            for k in range(n):
                a=layer*count+j*n+k; b=layer*count+j*n+(k+1)%n
                f=(a,b,b+n,a+n)
                faces.append(tuple(reversed(f)) if layer else f)
    for j in [0,len(stations)-1]:
        for k in range(n):
            a=j*n+k; b=j*n+(k+1)%n
            faces.append((a,a+count,b+count,b))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='Casting UV')
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            vi=mesh.loops[loop_index].vertex_index
            uv.data[loop_index].uv=((vi % n)/n,((vi % count)//n)/max(1,len(stations)-1))
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    return finish(o,name,al,parent,1)

casting('Bell housing cast shell', [(285,137,128,0,0),(296,139,130,0,0),
    (320,135,126,0,4),(363,113,108,3,15),(382,107,103,5,20)])
casting('Machined engine mating flange', [(284,142,133,0,0),(292,142,133,0,0)], wall=12)
casting('Gearcase cast barrel', [(379,108,103,5,20),(394,111,105,5,22),
    (478,105,98,8,28),(552,92,89,11,28),(584,83,81,12,28)])
casting('Gearcase split flange', [(382,114,110,5,22),(389,114,110,5,22)], wall=12)
casting('End cover flange', [(577,94,90,12,28),(585,94,90,12,28)], wall=12)
cyl('End bearing cover',(587,12,28),82,9,al,shell)
for y,z,r in [(37,4,29),(-23,62,24)]:
    cyl('End cover bearing boss',(596,y,z),r+5,9,al,shell)
    cyl('Bearing cap recess',(602,y,z),r,2,black,fittings)
    cyl('Machined bearing cap',(604,y,z),r-3,3,al,fittings)
    bolt((607,y,z),fittings,radius=5)
    for i in range(6):
        t=i*pi/3
        tube('End cover radial rib',[(596,y+(r+3)*cos(t),z+(r+3)*sin(t)),
            (592,12+77*cos(t),28+77*sin(t))],2.5,al,shell,False)

# Separate lobed differential enclosure and transverse output flanges (axis X).
cyl('Differential cast pocket',(365,-12,139),66,139,al,shell)
for i in range(8):
    t=i*pi/4
    tube('Differential reinforcement',[(300,-12+67*cos(t),139+67*sin(t)),
        (340,-12+67*cos(t),139+67*sin(t)),(425,-12+67*cos(t),139+67*sin(t))],2.8,al,shell,False)
for x in [288,442]:
    cyl('Differential bearing boss',(x,-12,139),42,21,al,outputs)
    cyl('Axle seal',(x + (-12 if x<300 else 12),-12,139),30,5,rubber,outputs)
    cyl('Axle output stub',(x + (-20 if x<300 else 20),-12,139),21,25,steel,outputs)
    ring('Output flange rim',(x + (-33 if x<300 else 33),-12,139),32,4,steel,outputs)
    for i in range(6):
        t=i*pi/3
        bolt((x + (-34 if x<300 else 34),-12+30*cos(t),139+30*sin(t)),outputs,radius=3)

# Radial bell ribs, perimeter bosses and case longitudinal stiffeners.
for i in range(16):
    t=2*pi*i/16
    y,z=143*cos(t),134*sin(t)*(1+.12*max(0,sin(t))**4)
    cyl('Bell bolt boss',(292,y,z),9,18,al,shell)
    bolt((303,y,z),fittings,radius=5)
    tube('Bell radial web',[(301,y*.97,z*.97),(330,y*.92,z*.92),
        (375,5+101*cos(t),20+98*sin(t))],2.8,al,shell,False)
for i in range(12):
    t=2*pi*i/12
    tube('Gearcase longitudinal web',[(393,5+112*cos(t),22+106*sin(t)),
        (474,8+106*cos(t),28+100*sin(t)),(578,12+94*cos(t),28+90*sin(t))],2.8,al,shell,False)
    for x,ry,rz in [(391,115,110),(586,94,90)]:
        y,z=12+ry*cos(t),28+rz*sin(t)
        cyl('Case fastening boss',(x,y,z),7,11,al,shell)
        bolt((x+7,y,z),fittings,radius=3.6)
for x in [428,473,523]:
    casting('Case circumferential rib',[(x,109-(x-428)*.14,103-(x-428)*.14,8,26),
        (x+4,109-(x-428)*.14,103-(x-428)*.14,8,26)],wall=4)

# Mechatronics cover, cooler plate stack, oil filter and electrical connector.
box('Mechatronics cover gasket',(479,7,-74),(162,143,5),rubber,fittings,13)
box('Mechatronics cover',(479,7,-82),(155,136,15),black,fittings,13)
for x in [413,445,479,513,545]:
    for y in [-51,65]: bolt((x,y,-92),fittings,'Z',3.4)
for x in range(423,541,13): box('Mechatronics pressed rib',(x,7,-91),(3,91,2),dark,fittings,1)
box('Cooler mounting foot',(447,115,22),(87,14,80),al,fittings,4)
for y in range(127,168,5):box('Oil cooler plate',(447,y,22),(88,3,73),steel,fittings,3)
for x in [425,470]:
    cyl('Cooler hose union',(x,174,22),9,20,al,fittings,'Y')
    tube('Gearbox coolant hose',[(x,185,22),(x,204,-3),(350,202,-44),(269,180,-61)],7,rubber,fittings)
cyl('Transmission oil filter',(535,128,53),23,52,dark,fittings,'Y')
cyl('Filter hex cap',(535,157,53),16,8,black,fittings,'Y',6)
ring('Filter cap seam',(535,151,53),23,1.5,rubber,fittings,'Y')
cyl('Electrical socket',(522,45,-101),17,23,dark,fittings,'Z')
ring('Connector locking collar',(522,45,-114),17,2,black,fittings,'Z')
tube('Transmission harness',[(522,45,-124),(551,85,-132),(514,185,-104),(308,267,-86)],5,rubber,fittings)
box('Upper mounting bracket',(540,126,0),(82,18,53),al,fittings,4)
for x in [512,567]:bolt((x,137,0),fittings,'Y',6)
cyl('Drain plug',(509,-83,28),9,8,steel,fittings,'Y',6)
box('Casting ID pad',(494,43,126),(59,19,3),al,fittings,2)
for x in [471,517]:bolt((x,43,129),fittings,'Z',2)
# Angle drive housing, terminating at a prop-shaft companion flange.
box('Angle drive housing',(323,-9,-116),(82,88,106),al,outputs,17)
cyl('Angle drive bearing nose',(323,-9,-183),32,47,al,outputs,'Z')
cyl('Prop shaft companion flange',(323,-9,-210),41,10,steel,outputs,'Z')
for i in range(6):
    t=i*pi/3
    bolt((323+31*cos(t),-9+31*sin(t),-217),outputs,'Z',4)

# Engine: visible fasteners, hose couplings, injector harness and service fittings.
for i in range(5):
    x=(i-2)*88
    box('Coil electrical connector',(x,331,31),(21,13,22),dark,detail,2)
    box('Connector latch',(x,340,36),(8,3,10),black,detail,1)
    tube('Coil harness branch',[(x,334,43),(x+16,313,61),(x+25,299,78)],3,rubber)
    box('Injector connector',(x,278,-82),(16,16,16),dark,detail,2)
    bolt((x,256,93),detail,'Z',3)
    for z in [66,-66]:bolt((x,269,z),detail,'Y',3.6)
tube('Main ignition loom',[(-202,299,78),(-88,299,78),(88,299,78),(220,286,76),(245,226,61)],5,rubber)
for x in range(-188,220,17):
    ring('Loom corrugation',(x,299,78),5.3,.8,black)
for x in [-177,-88,0,88,177]:box('Harness retaining clip',(x,299,78),(6,14,13),dark,detail,1)
tube('Injector electrical loom',[(-201,279,-95),(0,279,-95),(200,279,-95),(227,229,-90)],4,rubber)
cyl('High pressure fuel pump',(187,299,-48),20,35,al,detail,'Y')
box('Pump electrical head',(187,323,-48),(31,13,32),dark,detail,4)
tube('High pressure hardline',[(187,292,-68),(207,287,-92),(164,281,-102),(123,280,-76)],2.2,steel)
for x in [-125,88]:
    box('Rail retaining foot',(x,276,-73),(19,9,16),al)
    bolt((x,283,-73),detail,'Y',3)
for x in [198,225]:
    ring('Throttle hose clamp',(x,174,132),35,2.3,steel)
    box('Clamp screw housing',(x,210,132),(9,7,9),steel)
box('Throttle actuator',(213,191,172),(45,41,28),dark,detail,6)
tube('Throttle wiring',[(213,210,183),(184,246,175),(101,278,137),(60,294,80)],3,rubber)
# Turbo inlet tract, with rolled metal lips and flexible hose cuff.
tube('Turbo inlet elbow',[(95,158,-222),(95,173,-251),(27,222,-247),(-70,254,-220),(-184,273,-148)],25,dark)
for z in [-219,-229]:ring('Turbo inlet clamp',(95,158,z),27,2,steel,axis='Z')
tube('Turbo oil feed',[(90,198,-151),(43,202,-113),(-34,178,-77),(-49,124,-70)],2,steel)
tube('Turbo oil drain',[(97,126,-155),(88,80,-123),(72,10,-73)],5,black)
for x in [-68,32,131]:
    bolt((x,231,-155),detail,'Y',4)
    box('Heat shield emboss',(x,230,-155),(5,3,57),steel,detail,1)
tube('Shield rolled edge',[(-89,224,-191),(-89,231,-118),(183,231,-118),(183,224,-191)],2,steel,smooth=False)
# Oil cooler/filter module on the intake side.
box('Engine oil cooler base',(-103,17,96),(69,76,18),al,detail,5)
for z in range(108,130,4):box('Engine oil cooler plate',(-103,17,z),(65,67,2.3),steel,detail,3)
for y in [-7,37]:tube('Oil cooler coolant line',[(-67,y,117),(-43,y,144),(-9,y+30,129)],6,rubber)
cyl('Filter service hex',(-163,56,110),15,9,black,detail,'Y',6)
tube('Dipstick guide',[(-158,-33,76),(-195,110,91),(-211,266,106),(-207,293,108)],3,steel)
yellow=bpy.data.materials.get('Service yellow')
if not yellow:
    yellow=bpy.data.materials.new('Service yellow');yellow.diffuse_color=(.9,.45,.025,1);yellow.use_nodes=True
    yellow.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.9,.45,.025,1)
ring('Dipstick pull handle',(-207,306,108),11,3,yellow,axis='Z')
for x in [-209,206]:
    ring('Engine lifting eye',(x,285,-87),13,5,steel,axis='Z')
    box('Lifting eye foot',(x,269,-78),(29,18,13),al)
    bolt((x,271,-88),detail,'Z',4)
# Fine sump flange seam and cast drain plug, without obscuring the cutaway.
for z, parent in [(69,bpy.data.objects['FrontShell']),(-69,bpy.data.objects['RearShell'])]:
    # Keep new pieces under detail for a repeatable pass; hide with the solid mode.
    box('Oil pan gasket',(0,-53,z),(444,1.5,3),rubber,detail,.4)
cyl('Engine sump drain',(-187,-76,69),8,7,steel,detail,'Z',6)

root['detail_revision']='2026-09 exterior and static transmission'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/rs3-ea855-evo.glb'),
    export_format='GLB',export_yup=False,export_extras=True,export_animations=False)
print('POWERTRAIN DETAIL COMPLETE',len(bpy.data.objects),'objects')
