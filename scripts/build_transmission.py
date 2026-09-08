"""Independent, repeatable DQ500 educational internal stage. Blender 4.5 LTS.
Y up, crank axis X, millimetres. Geometry is NOT OEM tooth-count data.
Every moving assembly has a local origin and exported ptMotion metadata.
"""
import bpy, math, os
from math import pi, sin, cos
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'))
parent=bpy.data.objects['Transmission']
for name in ['TransmissionInternals','TransmissionRearSection']:
    old=bpy.data.objects.get(name)
    if old:
        for o in list(old.children_recursive): bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.objects.remove(old,do_unlink=True)
def group(name, loc=(0,0,0), motion=None, **props):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=internals if 'internals' in globals() else parent;o.location=loc
    if motion:o['ptMotion']=motion
    for k,v in props.items():o[k]=v
    return o
internals=group('TransmissionInternals')
def mat(name,color):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=.75;n.inputs['Roughness'].default_value=.32
    return m
k1=mat('K1 amber',(.95,.38,.055));k2=mat('K2 blue',(.06,.48,.95));steel=mat('DCT shaft steel',(.36,.43,.5));gold=mat('DCT synchronizer brass',(.7,.52,.16))
def mesh(name,verts,faces,material,parent):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.parent=parent;o.data.materials.append(material);return o
def ring(name, x, radius, bore, width, material, parent, teeth=0, cut=False):
    n=teeth*4 if teeth else 64; verts=[]
    for xx,inside in [(x-width/2,False),(x+width/2,False),(x-width/2,True),(x+width/2,True)]:
        for j in range(n):
            r=bore if inside else radius+(1.6 if teeth and j%4 in [1,2] else 0)
            a=2*pi*j/n;verts.append((xx,r*cos(a),r*sin(a)))
    faces=[]
    for j in range(n):
        if cut and sin(2*pi*(j+.5)/n)>.1:continue
        q=(j+1)%n
        faces.extend([(j,q,n+q,n+j),(2*n+j,3*n+j,3*n+q,2*n+q),(j,2*n+j,2*n+q,q),(n+j,n+q,3*n+q,3*n+j)])
    return mesh(name,verts,faces,material,parent)
def bar(name,loc,size,material,parent):
    bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name=name;o.parent=parent;o.location=loc;o.scale=size;o.data.materials.append(material);return o

def helical(name, radius, bore, width, material, parent, hand=1):
    # Involute flanks, 20 degree pressure angle, 24 degree helix.
    # Tooth counts are illustrative; vehicle ratios remain solver parameters.
    teeth=max(16,round(radius*1.2)); module=2*radius/teeth
    root=radius-1.25*module; tip=radius+module; base=radius*cos(math.radians(20))
    def inv(r):
        t=math.sqrt(max(0,(r/base)**2-1));return t-math.atan(t)
    half=pi/(2*teeth); profile=[]
    for tooth in range(teeth):
        a=2*pi*tooth/teeth
        flank=[max(root,base)+(tip-max(root,base))*j/5 for j in range(6)]
        profile.append((a-pi/teeth,root))
        profile.append((a-half-inv(radius),root))
        for r in flank:profile.append((a-half-inv(radius)+inv(r),r))
        for r in reversed(flank):profile.append((a+half+inv(radius)-inv(r),r))
        profile.append((a+half+inv(radius),root))
    n=len(profile);verts=[];faces=[];layers=7
    for layer in range(layers):
        x=width*(layer/(layers-1)-.5)
        twist=hand*x*math.tan(math.radians(24))/radius
        bevel=.35 if layer in [0,layers-1] else 0
        for a,r in profile:verts.append((x,(r-bevel)*cos(a+twist),(r-bevel)*sin(a+twist)))
    for layer in range(layers-1):
        for j in range(n):
            q=(j+1)%n;faces.append((layer*n+j,layer*n+q,(layer+1)*n+q,(layer+1)*n+j))
    for side in [0,1]:
        x=width*(side-.5);start=len(verts);outer=side*(layers-1)*n
        twist=hand*x*math.tan(math.radians(24))/radius
        for a,r in profile:verts.append((x,bore*cos(a+twist),bore*sin(a+twist)))
        for j in range(n):
            q=(j+1)%n
            face=(outer+j,start+j,start+q,outer+q)
            faces.append(face if side==0 else tuple(reversed(face)))
    for j in range(n):
        q=(j+1)%n;faces.append((layers*n+j,(layers+1)*n+j,(layers+1)*n+q,layers*n+q))
    o=mesh(name,verts,faces,material,parent);o['toothForm']='involute helical';o['helixAngle']=24*hand;o['visualTeeth']=teeth
    return o

def bearing(name,x,y,z,r=15):
    seat=group(name,(x,y,z))
    ring('Bearing outer race',0,r+4,r+1,7,steel,seat)
    ring('Bearing inner race',0,r-2,r-5,7,steel,seat)
    for j in range(12):
        a=j*2*pi/12
        roller=group(name+' roller '+str(j),(0,(r-.5)*cos(a),(r-.5)*sin(a)));roller.parent=seat
        ring('Roller',0,1.45,0,5,gold,roller)

fly=group('DCTFlywheel',(299,0,0),'engine');ring('Flywheel connection',0,100,18,8,steel,fly,60)
for i,m in enumerate([k1,k2]):
    x=335
    outer,inner=(90,80) if i==0 else (61,59)
    plate_bore=62 if i==0 else 26
    drum=group('ClutchDrumK'+str(i+1),(x,0,0),'engine',clutch=i);ring('Wet clutch basket',0,outer,inner,26,m,drum,cut=True)
    pack=group('ClutchK'+str(i+1),(x,0,0),'clutch',clutch=i)
    for j in range(7):
        offset=-10+j*3
        plate=group('ClutchPlateK'+str(i+1)+'_'+str(j),(offset,0,0),'plate',clutch=i,baseX=offset,driving=j%2==0)
        plate.parent=pack
        ring('Friction disc' if j%2 else 'Drive steel disc',0,78-i*20,plate_bore,1.4,m if j%2 else steel,plate,36)
    pressure=group('ClutchPressureK'+str(i+1),(12,0,0),'plate',clutch=i,baseX=12,driving=False);pressure.parent=pack
    ring('Pressure plate',0,79-i*20,plate_bore,3,m,pressure)
    for j in range(18):
        a=j*2*pi/18
        tab=bar('Basket axial spline',(0,((outer+inner)/2)*cos(a),((outer+inner)/2)*sin(a)),(24,2,2),steel,drum)
    piston=group('ClutchPistonK'+str(i+1),(x+15,0,0),'piston',clutch=i,baseX=x+15)
    ring('Annular hydraulic piston',0,77-i*20,plate_bore,3,steel,piston)
    # Visible radial torque direction marker, rotates with each clutch hub.
    bar('Torque direction spoke',(-13 if i==0 else 16,40-i*15,0),(2,64-i*20,3),m,pack)
solid=group('InputShaftK1',(459,0,0),'input',clutch=0);ring('Solid input shaft',0,10,0,235,k1,solid)
hollow=group('InputShaftK2',(398,0,0),'input',clutch=1);ring('Hollow input shaft',0,17,12,100,k2,hollow)
centres={1:(45,48),2:(45,-48)}
for shaft,final in [(1,4.058),(2,3.45)]:
    y,z=centres[shaft];o=group('OutputShaft'+str(shaft),(481,y,z),'output',final=final);ring('Output shaft',0,9,0,205,steel,o)
# R meshes with the second-gear free wheel, without a third reverse shaft.
gears=[(1,0,3.562,4.058,1,480),(5,0,.788,4.058,1,505),(3,0,1.678,3.45,2,530),(7,0,.634,3.45,2,555),
       (2,1,2.526,3.45,2,398),(6,1,.760,3.45,2,442),(4,1,1.021,4.058,1,420),(-1,1,-2.789,4.058,1,398)]
for g,c,ratio,final,shaft,x in gears:
    y,z=centres[shaft];distance=math.hypot(y,z)
    driven=distance*abs(ratio)/(1+abs(ratio))
    if g==-1:driven=96-(distance*2.526/(1+2.526))
    o=group('Gear_'+str(g),(x,y,z),'gear',gear=g,clutch=c,final=final,shaft=shaft)
    helical('Free gear '+str(g),driven,10,9,steel,o,1 if g!=-1 else -1)
    side=1 if g in [1,3,2,-1] else -1
    dog_offset=15 if g in [2,6] else 6
    ring('Gear dog hub '+str(g),side*dog_offset/2,15,10,dog_offset,steel,o)
    ring('Dog engagement teeth '+str(g),side*dog_offset,19,10,3,[k1,k2][c],o,24)
    ring('Synchronizer cone '+str(g),side*(dog_offset+2),17.5,10,1.5,gold,o)
    bar('Gear phase marker',(0,driven*.7,0),(10,3,4),steel,o)
    if g!=-1:
        drive=group('DriveGear_'+str(g),(x,0,0),'input',clutch=c,gear=g)
        helical('Constant mesh input gear',distance-driven,min(18 if c else 11,distance-driven-4),9,steel,drive,-1)
for name,pair,shaft,x in [('15',[1,5],1,492.5),('37',[3,7],2,542.5),('4R',[-1,4],1,409),('26',[2,6],2,420)]:
    y,z=centres[shaft];final=4.058 if shaft==1 else 3.45
    sleeve=group('Synchronizer_'+name,(x,y,z),'sleeve',gears=pair,baseX=x,final=final,travel=7)
    ring('Sliding dog sleeve',0,22,10,6,gold,sleeve,24)
    ring('Fork groove left shoulder',-2.4,23,20,1,steel,sleeve)
    ring('Fork groove right shoulder',2.4,23,20,1,steel,sleeve)
    hub=group('SynchronizerHub_'+name,(x,y,z),'output',final=final)
    ring('Splined synchronizer hub',0,17,9,7,steel,hub,24)
    fork=group('Fork_'+name,(x,y,z),'fork',gears=pair,baseX=x,travel=7)
    # Open fork, leaves the observer-facing half visible.
    verts=[];faces=[]
    for j in range(25):
        a=pi/2+j*pi/24
        for xx,r in [(-2,24),(-2,28),(2,24),(2,28)]:verts.append((xx,r*cos(a),r*sin(a)))
    for j in range(24):
        for a,b in [(0,1),(1,3),(3,2),(2,0)]:faces.append((j*4+a,j*4+b,(j+1)*4+b,(j+1)*4+a))
    mesh('Selector fork',verts,faces,steel,fork);bar('Selector linkage',(0,-43,0),(5,35,5),steel,fork)
    bar('Selector rail',(x,-8,z-10),(36,4,4),steel,internals)

for shaft,(y,z) in centres.items():
    for x in [382,566]:bearing('Output bearing '+str(shaft)+' '+str(x),x,y,z)
bearing('Input rear bearing',579,0,0,17)
bearing('Input front bearing',374,0,0,22)
diff=group('FinalDrive',(574,45,0),'wheel');ring('Final drive crown',0,38,14,13,steel,diff,48)
for shaft,final in [(1,4.058),(2,3.45)]:
    y,z=centres[shaft];o=group('FinalPinion'+str(shaft),(574,y,z),'output',final=final);ring('Final drive pinion',0,11,3,12,gold,o,16)
# Reference-side partial shell; full authored shell remains untouched.
rear=group('TransmissionRearSection');rear.parent=parent
verts=[];faces=[]
for x,r in [(383,106),(578,91)]:
    for j in range(33):
        a=pi+j*pi/32;verts.append((x,10+r*cos(a),22+r*sin(a)))
for j in range(32):faces.append((j,j+1,j+34,j+33))
mesh('Rear half casing',verts,faces,bpy.data.materials['Cast aluminium'],rear)
rear.hide_render=True;rear.hide_set(True)
parent['simulation']='DQ500 educational moving internal structure; same-generation ratios; not OEM CAD'
internals['source']='SSP454 0BT: K1 1/3/5/7; K2 2/4/6/R; output1 1/4/5/R; output2 2/3/6/7; R via free gear2'
internals['geometry']='Approximate teeth, plate count and distances; angular rates from solver ratios, not visual tooth counts'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/rs3-ea855-evo.glb'),export_format='GLB',export_yup=False,export_extras=True,export_animations=False)
print('TRANSMISSION INTERNALS COMPLETE',len(internals.children_recursive))
