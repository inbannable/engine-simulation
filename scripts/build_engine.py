"""RS3 EA855 evo visual reconstruction. Dimensions in millimetres, Y up.
Run: blender --background --python scripts/build_engine.py
The reference register and approximations are in docs/SOURCES.md.
"""
import bpy, math, os
from mathutils import Vector
from math import sin, cos, pi
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for d in list(bpy.data.materials): bpy.data.materials.remove(d)

def mat(name, color, metal=0, rough=.4):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
al=mat('Cast aluminium',(.39,.43,.47),.72,.37)
steel=mat('Machined steel',(.57,.62,.67),.88,.24)
dark=mat('Graphite polymer',(.024,.028,.034),.12,.36)
rubber=mat('Rubber',(.012,.016,.02),0,.68)
red=mat('RS red',(.58,.018,.025),.24,.27)
black=mat('Dark steel',(.055,.067,.077),.78,.3)
gold=mat('Hot exhaust',(.32,.23,.15),.78,.45)
cut=mat('Cut section',(.42,.47,.51),.55,.49)
white=mat('Lettering',(.75,.79,.83),.6,.3)

def group(name, parent=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.parent=parent; return o
root=group('RS3_EA855_EVO')
body=group('Body',root); front=group('FrontShell',root); rear=group('RearShell',root); cover=group('Cover',root); accessories=group('Accessories',root); timing=group('Timing',root); core=group('Core',root)

def finish(o,name,material,parent,bevel=0):
    o.name=name; o.parent=parent
    if material:o.data.materials.append(material)
    if bevel:
        b=o.modifiers.new('Edge radii','BEVEL'); b.width=bevel; b.segments=2
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=b.name)
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=True
        n=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL'); n.keep_sharp=True
        bpy.context.view_layer.objects.active=o
        try:bpy.ops.object.modifier_apply(modifier=n.name)
        except:pass
    return o

def box(name,loc,size,m=al,p=body,b=2):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,m,p,b)
def cyl(name,loc,r,depth,m=steel,p=core,axis='Y',verts=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=loc);o=bpy.context.object
    if axis=='Y':o.rotation_euler[0]=pi/2
    if axis=='X':o.rotation_euler[1]=pi/2
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return finish(o,name,m,p,.6)
def tube(name,pts,r,m=al,p=accessories):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=12;cu.bevel_depth=r;cu.bevel_resolution=3
    s=cu.splines.new('BEZIER');s.bezier_points.add(len(pts)-1)
    for bp,co in zip(s.bezier_points,pts):bp.co=co;bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);o.parent=p;o.data.materials.append(m)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return o

def ring(name,loc,r,minor,m=steel,p=core,axis='Y'):
    bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=8,location=loc,major_radius=r,minor_radius=minor)
    o=bpy.context.object
    if axis=='Y':o.rotation_euler[0]=pi/2
    if axis=='X':o.rotation_euler[1]=pi/2
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return finish(o,name,m,p)
def text(name,word,loc,size,m=white,p=cover):
    c=bpy.data.curves.new(name,'FONT');c.body=word;c.size=size;c.extrude=.25;c.align_x='CENTER'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler[0]=-pi/2;o.parent=p;c.materials.append(m)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
    return o

def shell(name,zlo,zhi,p):
    o=box(name,(0,133,(zlo+zhi)/2),(451,192,zhi-zlo),al,p,3)
    for i in range(5):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=41.65,depth=240,location=((i-2)*88,132,0),rotation=(pi/2,0,0));c=bpy.context.object
        mod=o.modifiers.new('Bore','BOOLEAN');mod.operation='DIFFERENCE';mod.object=c
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(c,do_unlink=True)
    return o
shell('Block front',0,65,front);shell('Block rear',-65,0,rear)
# Open-sided crankcase and sump are split at the same observation plane.
for z,p in [(63,front),(-63,rear)]:
    box('Crankcase wall',(0,-3,z),(453,104,8),al,p)
    box('Sump half',(0,-73,z/2),(447,37,67),al,p,7)
    for x in [-211,-132,-44,44,132,211]:
        box('Cast rib',(x,100,z),(7,167,10),al,p,1)
        cyl('Block bolt',(x,223,z*.78),4,8,steel,p)
for x in [-225,225]:box('End casting',(x,93,0),(10,274,128),al,body)
for z,p in [(44,front),(-44,rear)]:
    box('Cylinder head casting',(0,249,z),(450,35,40),al,p)
    box('Cam carrier',(0,293,z),(450,17,23),al,p)
    for x in [-215,-132,-44,44,132,215]:cyl('Head fastener',(x,302,z),4,7,steel,p)
# Main bearing girdle; six supports rather than five floating pins.
for x in [-220,-132,-44,44,132,220]:
    ring('Main bearing',(x,0,0),28,5,al,core,'X')
    box('Bearing cap',(x,-30,0),(13,15,76),al,core)
    for z in [-31,31]:cyl('Bearing stud',(x,-19,z),4,15,steel,core)
crank=group('Crankshaft',core)
cyl('Main shaft',(0,0,0),25,483,steel,crank,'X')
OFF=[0,144,576,288,432]
for i,off in enumerate(OFF):
    x=(i-2)*88;t=-off*pi/180;y=46.4*cos(t);z=46.4*sin(t)
    cyl('Crankpin',(x,y,z),21,33,steel,crank,'X')
    for dx in [-23,23]:
        o=box('Crank web',(x+dx,y/2,z/2),(14,78,36),black,crank,8);o.rotation_euler[0]=t
        cyl('Counterweight',(x+dx,-y*.49,-z*.49),35,15,black,crank,'X')
    # Piston origin at the wrist pin, flat crown 27 mm above it.
    piston=group('Piston_%d'%(i+1),core);piston.location=(x,0,0)
    cyl('Piston skirt',(0,7,0),40.6,38,steel,piston)
    cyl('Piston crown',(0,25,0),40.85,4,al,piston)
    for yy in [14,19,23]:ring('Piston ring',(0,yy,0),40.55,.75,black,piston)
    cyl('Wrist pin',(0,0,0),11.5,74,steel,piston,'X')
    rod=group('Rod_%d'%(i+1),core);rod.location=(x,0,0)
    ring('Big end',(0,0,0),23,5,steel,rod,'X');ring('Small end',(0,144,0),13,4,steel,rod,'X')
    box('Rod I web',(0,73,0),(9,116,10),al,rod,3)
    for xx in [-6,6]:box('Rod I flange',(xx,73,0),(3,119,17),steel,rod,2)
    for zz in [-24,24]:cyl('Rod cap bolt',(0,-7,zz),4,22,black,rod)
    # Spark plug; inlet and exhaust pairs, all four independent valves.
    cyl('Spark plug',(x,275,0),5,39,white,core)
    for side,z in [('Intake',25),('Exhaust',-25)]:
        for j,dx in enumerate([-15,15]):
            v=group('%sValve_%d_%d'%(side,i+1,j),core);v.location=(x+dx,0,z)
            cyl('Valve head',(0,231,0),12,3,steel,v)
            cyl('Valve stem',(0,257,0),2.6,51,steel,v)
            cyl('Spring retainer',(0,281,0),8,3,steel,v)
            pts=[(8*cos(a*2*pi*6),251+27*a,8*sin(a*2*pi*6)) for a in [k/96 for k in range(97)]]
            tube('Valve spring',pts,1.25,black,v)
# Two shafts with twenty lobes, phased for the teaching valve curve.
for side,z,center in [('Intake',25,450),('Exhaust',-25,270)]:
    cam=group(side+'Cam',core);cam.location=(0,305,z)
    cyl('Camshaft',(0,0,0),8,468,steel,cam,'X')
    for i,off in enumerate(OFF):
        for dx in [-15,15]:
            # A rounded eccentric lobe is a geometric approximation.
            phi=(off+center)*pi/360
            o=cyl('Cam lobe',((i-2)*88+dx,-6*cos(phi),6*sin(phi)),12,11,black,cam,'X')
# Cam cover follows the long rounded RS3 outline, with five red ribs.
box('Cam cover',(0,321,0),(454,32,132),dark,cover,12)
box('Sculpted upper shell',(-8,344,-7),(439,31,142),dark,cover,14)
for i in range(5):
    x=(i-2)*77
    o=box('Red cylinder accent',(x,361,-28),(43,12,66),red,cover,8)
    box('Cover channel',(x,359,27),(3,3,40),black,cover,1)
# Audi rings on front badge rail, and TFSI lettering on the upper face.
box('Silver badge surround',(-5,317,78),(361,29,7),steel,cover,7)
box('Badge inset',(-5,318,83),(347,20,4),dark,cover,5)
for x in [-150,-132,-114,-96]:ring('Audi ring',(x,319,87),12,1.4,white,cover,'Z')
text('TFSI lettering','TFSI',(108,364,44),15)
text('RS lettering','RS',(157,364,-5),17)
cyl('Oil filler',(-172,366,-36),20,10,dark,cover)
ring('Oil cap seal',(-172,372,-36),16,1,black,cover)
# Intake runners fan down from the five inlet ports into the front plenum.
for i in range(5):
    x=(i-2)*88
    tube('Intake runner',[(x,251,68),(x,254,92),(x+8,225,122),(x+8,180,131)],18,dark,accessories)
    ring('Inlet flange',(x,252,74),19,3,al,accessories,'Z')
    tube('Exhaust primary',[(x,247,-66),(x,247,-95),(x*.7+40,215,-136),(85,180,-149)],12,gold,accessories)
    cyl('Ignition coil',(x,327,0),11,24,black,cover)
tube('Intake plenum',[(-207,174,130),(-130,174,132),(0,174,132),(180,174,132)],30,dark,accessories)
cyl('Throttle body',(212,174,132),35,43,al,accessories,'X')
tube('Charge pipe',[(235,174,132),(270,173,128),(279,225,100),(259,274,79)],26,rubber,accessories)
for x in [-190,-100,0,100,169]:ring('Plenum rib',(x,174,132),30.5,2,dark,accessories,'X')
# Turbo snail, turbine core, heat shield and wastegate actuator, rear-mounted.
ring('Compressor volute',(95,158,-183),42,18,al,accessories,'Z')
cyl('Turbo inlet',(95,158,-205),27,30,al,accessories,'Z')
cyl('Turbine core',(95,158,-159),31,40,gold,accessories,'Z')
ring('Turbine volute',(95,158,-126),34,14,gold,accessories,'Z')
tube('Compressor outlet',[(135,174,-182),(162,201,-180),(170,248,-150),(210,280,-70)],19,al,accessories)
cyl('Wastegate actuator',(149,191,-153),19,28,black,accessories)
tube('Downpipe',[(83,139,-136),(38,109,-147),(-10,22,-142),(-12,-55,-140)],26,gold,accessories)
box('Heat shield',(47,224,-155),(272,10,74),al,accessories,7)
# Oil filter and auxiliary details.
cyl('Oil filter housing',(-163,18,110),23,69,dark,accessories)
for y in [-6,4,14,24]:ring('Filter rib',(-163,y,110),23,1.5,black,accessories)
tube('Coolant return',[(-205,219,73),(-225,169,98),(-211,86,107),(-170,61,109)],7,rubber,accessories)
tube('Fuel rail',[(-190,280,-76),(0,280,-76),(192,280,-76)],5,steel,accessories)
for i in range(5):tube('Injector feed',[((i-2)*88,280,-76),((i-2)*88,289,-51),((i-2)*88,275,-11)],2,steel,accessories)
# Timing at +X, two chains. Primary: crank 25 to intermediate 40; secondary 24 to cams 30.
def gear(name,x,y,z,r,teeth,p):
    g=group(name,p);g.location=(x,y,z);cyl('Sprocket hub',(0,0,0),r-3,7,steel,g,'X')
    ring('Sprocket rim',(0,0,0),r-3,2,black,g,'X')
    for i in range(teeth):
        t=i*2*pi/teeth;o=box('Tooth',(0,r*cos(t),r*sin(t)),(7,5,4),steel,g,.5);o.rotation_euler[0]=t
    for i in range(6):
        t=i*pi/3;cyl('Sprocket recess',(4,(r*.57)*cos(t),(r*.57)*sin(t)),r*.13,1,black,g,'X',16)
    return g
gear('CrankGear',244,0,0,31.8,25,timing)
gear('IntermediateGear',244,157,0,50.9,40,timing)
gear('IntermediateUpperGear',258,157,0,30.55,24,timing)
for side,z in [('Intake',25),('Exhaust',-25)]:gear(side+'Gear',258,305,z,38.2,30,timing)
# Chain paths are also exported as editable guide geometry; browser animates link travel.
primary=[(244,0,-32),(244,157,-51),(244,205,0),(244,157,51),(244,0,32),(244,-32,0),(244,0,-32)]
secondary=[(258,157,-31),(258,305,-64),(258,343,-25),(258,343,25),(258,305,64),(258,157,31),(258,127,0),(258,157,-31)]
tube('Primary chain guide',primary,3,black,timing);tube('Secondary chain guide',secondary,3,black,timing)
for y,z in [(80,-44),(230,59)]:box('Chain tensioner',(246,y,z),(16,46,12),dark,timing,4)
box('Timing cover',(275,135,0),(16,365,155),al,body,14)
# Belt pulley side is -X, cylinder 1 end.
for name,y,z,r in [('CrankPulley',0,0,53),('AlternatorPulley',58,98,30),('AccessoryPulley',-38,88,26)]:
    gear(name,-254,y,z,r,24,accessories)
    for xx in [-257,-261]:ring('Belt groove',(xx,y,z),r,1,black,accessories,'X')
cyl('Alternator',(-210,58,98),37,63,al,accessories,'X')
for i in range(12):
    t=i*pi/6;box('Alternator slot',(-216,58+35*cos(t),98+35*sin(t)),(43,3,3),black,accessories,1)
tube('Serpentine belt',[(-262,-48,-22),(-262,8,-54),(-262,54,10),(-262,86,88),(-262,54,128),(-262,-44,111),(-262,-63,79),(-262,-48,-22)],3,rubber,accessories)
# Repeated cast bolt bosses around oil pan flange.
for x in range(-200,201,40):
    for z in [-60,60]:cyl('Sump screw',(x,-50,z),3.5,7,steel,rear if z<0 else front,verts=6)
# Store construction facts with editable scene.
root['reference']='2021 Audi RS3 8Y / EA855 evo';root['bore_mm']=82.5;root['stroke_mm']=92.8;root['rod_mm_estimate']=144;root['cylinder_spacing_series_reference_mm']=88
bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=.001
# Initial assembled pose, with animation left to deterministic runtime.
for i,off in enumerate(OFF):
    t=-off*pi/180;py=46.4*cos(t);pz=46.4*sin(t);yy=py+math.sqrt(144**2-pz**2)
    bpy.data.objects['Piston_%d'%(i+1)].location.y=yy
    o=bpy.data.objects['Rod_%d'%(i+1)];o.location.y=py;o.location.z=pz;o.rotation_euler.x=math.atan2(-pz,yy-py)
# Keep a useful modelling viewport.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=950;area.spaces.active.region_3d.view_location=(0,150,0)
os.makedirs(os.path.join(ROOT,'models'),exist_ok=True);os.makedirs(os.path.join(ROOT,'public/models'),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/rs3-ea855-evo.glb'),export_format='GLB',export_yup=False,export_extras=True,export_animations=False)
print('RS3 MODEL COMPLETE',len(bpy.data.objects),'objects')
