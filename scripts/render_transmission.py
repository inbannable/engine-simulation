"""Render the authored model for visual QA; does not modify the saved source."""
import bpy, os
from mathutils import Vector, Matrix
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'models/rs3-ea855-evo.blend'))
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=1500
scene.render.resolution_y=1050
scene.render.resolution_percentage=100
scene.world.color=(.22,.22,.22)
scene.view_settings.view_transform='AgX'
def aim(o, target):
    back=(o.location-Vector(target)).normalized()
    right=Vector((0,1,0)).cross(back).normalized()
    up=back.cross(right)
    o.rotation_euler=Matrix((right,up,back)).transposed().to_euler()
for name,loc,power,size in [('Key',(-400,950,650),22000000,650),
                           ('Rim',(700,650,-500),27000000,500),
                           ('Fill',(150,200,800),7000000,500)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;aim(o,(100,100,0))
data=bpy.data.cameras.new('QA camera');data.type='ORTHO';data.ortho_scale=1080;data.clip_end=10000
camera=bpy.data.objects.new('QA camera',data);scene.collection.objects.link(camera);scene.camera=camera
os.makedirs(os.path.join(ROOT,'outputs'),exist_ok=True)

scene.cycles.samples=16
scene.render.resolution_x=1200
scene.render.resolution_y=840
for mode in ['assembly','cutaway','mechanism','handover']:
    def visible(name, show):
        o=bpy.data.objects.get(name)
        if o:
            o.hide_render=not show
            for child in o.children_recursive: child.hide_render=not show
    internal=mode!='assembly'
    for name in ['TransmissionHousing','TransmissionFittings','TransmissionOutputs']:
        visible(name, not internal)
    visible('TransmissionRearSection',mode=='cutaway')
    if internal:
        for name in ['Cover','Body','FrontShell','EngineDetail','Accessories']:visible(name,False)
    if mode=='handover':
        for clutch,engagement in [(1,.4),(2,.6)]:
            for j in range(7):
                plate=bpy.data.objects['ClutchPlateK'+str(clutch)+'_'+str(j)]
                plate.location.x=plate['baseX']*(1-engagement*.16)
            piston=bpy.data.objects['ClutchPistonK'+str(clutch)]
            piston.location.x=piston['baseX']-engagement*2.2
        bpy.data.objects['Synchronizer_15'].location.x-=7
        bpy.data.objects['Synchronizer_26'].location.x-=7
        bpy.data.objects['Fork_15'].location.x-=7
        bpy.data.objects['Fork_26'].location.x-=7
    camera.location=(740,360,600) if internal else (-900,650,1100)
    data.ortho_scale=440 if internal else 1110
    aim(camera,(443,15,0) if internal else (125,115,0))
    scene.render.filepath=os.path.join(ROOT,'outputs','dct-'+mode+'.png')
    bpy.ops.render.render(write_still=True)
