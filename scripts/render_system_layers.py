"""Five offline system QA views. Changes visibility only in memory; never saves blend."""
import bpy,os
from mathutils import Vector,Matrix
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'))
s=bpy.context.scene;s.render.engine='BLENDER_WORKBENCH';s.render.resolution_x=1500;s.render.resolution_y=1050;s.render.resolution_percentage=100
s.display.shading.light='STUDIO';s.display.shading.color_type='MATERIAL';s.display.shading.show_shadows=True;s.display.shading.show_cavity=True;s.display.shading.cavity_type='BOTH';s.display.shading.background_type='WORLD';s.world.color=(.045,.055,.075)
s.view_settings.view_transform='Standard';s.render.image_settings.file_format='PNG'
d=bpy.data.cameras.new('SYS QA Camera');d.type='ORTHO';d.clip_end=10000
c=bpy.data.objects.new('SYS QA Camera',d);s.collection.objects.link(c);s.camera=c
def aim(target):
    back=(c.location-Vector(target)).normalized();right=Vector((0,1,0)).cross(back).normalized();up=back.cross(right);c.rotation_euler=Matrix((right,up,back)).transposed().to_euler()
def hide_tree(name):
    o=bpy.data.objects.get(name)
    if o:
        for child in [o]+list(o.children_recursive):child.hide_render=True
base={o.name:o.hide_render for o in bpy.data.objects}
views=[('01-air-turbo','air',(-650,480,-900),(0,120,0),830),('02-combustion-exhaust','exhaust',(540,450,-850),(0,120,-30),810),('03-lubrication','oil',(-600,430,850),(0,125,0),790),('04-cooling','coolant',(-650,550,850),(0,160,0),820),('05-dct-hydraulics','hydraulic',(780,290,-720),(440,-20,0),650)]
# Additional cutaway context views: temporarily bisect shell meshes at Z=0.
# This never touches the delivery file; positive-Z faces are removed in memory.
import bmesh
for name in ['Body','TransmissionHousing']:
    shell=bpy.data.objects.get(name)
    if not shell:continue
    for o in shell.children_recursive:
        if o.type!='MESH':continue
        o.data=o.data.copy();bm=bmesh.new();bm.from_mesh(o.data)
        inv=o.matrix_world.inverted();point=inv @ Vector((0,0,0));normal=o.matrix_world.to_3x3().transposed() @ Vector((0,0,1))
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.001,plane_co=point,plane_no=normal,clear_outer=True,clear_inner=False)
        bm.to_mesh(o.data);bm.free()

for filename,domain,loc,target,scale in views:
    for o in bpy.data.objects:o.hide_render=base[o.name]
    for name in ['Cover','Body','FrontShell','RearShell','EngineDetail','Accessories','TransmissionHousing','TransmissionFittings','TransmissionOutputs','TransmissionRearSection']:hide_tree(name)
    if domain=='hydraulic':
        for name in ['Core','Timing']:hide_tree(name)
    else:hide_tree('Transmission')
    for o in bpy.data.objects['SystemLayers'].children_recursive:
        if o.get('role')=='route':o.hide_render=o.get('system')!=domain
    keep={'air':['SYSTurboRotor'],'exhaust':['SYSTurboRotor'],'oil':['SYSOilPump'],'coolant':['SYSWaterPump'],'hydraulic':['SYSHydraulicPump','SYSStarterRotor','SYSStarterRingGear']}[domain]
    for o in bpy.data.objects['SystemMotionAnchors'].children:
        if o.name not in keep:hide_tree(o.name)
    for name,owner in [('SYS_ValveBody','hydraulic'),('SYS_Thermostat','coolant'),('SYS_ChargeCooler_Concept','air'),('SYS_Throttle','air')]:
        bpy.data.objects[name].hide_render=domain!=owner
    c.location=loc;d.ortho_scale=scale;aim(target)
    s.render.filepath=os.path.join(ROOT,'outputs/system-layers',filename+'.png');bpy.ops.render.render(write_still=True)


    shell=bpy.data.objects['TransmissionHousing' if domain=='hydraulic' else 'Body']
    for o in [shell]+list(shell.children_recursive):o.hide_render=False
    c.location=(780,290,720) if domain=='hydraulic' else (-650,480,900);aim(target)
    s.render.filepath=os.path.join(ROOT,'outputs/system-layers',filename+'-cutaway.png');bpy.ops.render.render(write_still=True)

