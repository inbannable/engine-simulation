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
for name,loc,target,scale in [('assembly',(-900,650,1100),(125,115,0),1110),
                              ('transmission',(1100,530,790),(403,39,10),710),
                              ('exhaust',(850,620,-1150),(125,115,0),1110)]:
    camera.location=loc;data.ortho_scale=scale;aim(camera,target)
    scene.render.filepath=os.path.join(ROOT,'outputs',name+'.png')
    bpy.ops.render.render(write_still=True)
