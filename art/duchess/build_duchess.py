"""Rebuild the Duchess in Blender 5.1, render her portrait and export the game mesh.

Run: blender --background --factory-startup --python art/duchess/build_duchess.py
Design coordinates throughout are Three.js coordinates: X right, Y up, +Z front.
The editable Blender scene uses Z up, -Y front. No external assets or add-ons needed.
"""
import bpy, math, os, json, base64, struct, sys
from mathutils import Vector, Matrix
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'src', 'assets', 'duchess')
os.makedirs(OUT, exist_ok=True)
ART = os.path.dirname(__file__)
TAU = 2 * math.pi
PI = math.pi
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials): bpy.data.materials.remove(block)
collection = bpy.data.collections.new('LA DUCHESSE — sculpted character')
bpy.context.scene.collection.children.link(collection)
materials = {}
material_defs = {}

def V(p): return Vector((p[0], -p[2], p[1]))
def from_blender(p): return (p.x, p.z, -p.y)
def clamp(v, lo=0, hi=1): return max(lo, min(hi, v))
def smooth(t):
    t=clamp(t)
    return t*t*(3-2*t)
def lin(x): return x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4
def rgb(h): return tuple(lin(int(h[i:i+2],16)/255) for i in (1,3,5))

def mat(name, color, rough=.5, metal=0, sheen=0, subsurface=0, coat=0):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb(color),1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    p.inputs['Sheen Weight'].default_value=sheen
    p.inputs['Sheen Roughness'].default_value=.6
    p.inputs['Sheen Tint'].default_value=(*rgb(color),1)
    p.inputs['Subsurface Weight'].default_value=subsurface
    p.inputs['Subsurface Radius'].default_value=(1,.45,.25)
    p.inputs['Subsurface Scale'].default_value=.012
    p.inputs['Coat Weight'].default_value=coat
    p.inputs['Coat Roughness'].default_value=.22
    materials[name]=m
    material_defs[name]=dict(color=color,roughness=rough,metalness=metal,sheen=sheen,coat=coat)
    return m

skin=mat('Porcelain skin', '#efc8b3', .49, subsurface=.08)
skin_lid=mat('Warm eyelids', '#d3a08e', .58, subsurface=.05)
velvet=mat('Burgundy silk velvet', '#52192b', .72, sheen=.4)
velvet_rib=mat('Burgundy raised folds', '#581e31', .72, sheen=.4)
ivory=mat('Ivory silk', '#eee0c8', .73, sheen=.25)
lace=mat('Antique lace', '#f2e5ca', .7)
gold=mat('Antique gold', '#c19a55', .3, .75)
gold_dark=mat('Engraved gold recesses', '#8f6d34', .4, .65)
hair=mat('Chestnut hair', '#38251f', .46, coat=.025)
hair_light=mat('Chestnut sculpted ridges', '#3e2a23', .46, coat=.025)
hair_dark=mat('Hair grooves', '#30201b', .46, coat=.025)
eye_white=mat('Warm eye whites', '#f8f2e8', .2, coat=.3)
iris=mat('Brown irises', '#463228', .3, coat=.12)
iris_gold=mat('Iris amber fibres', '#715338', .3)
pupil=mat('Pupils and lashes', '#130b0a', .36, coat=0)
pupil.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.22
lip=mat('Rose lips', '#a65a56', .4, subsurface=.05, coat=.12)
lip_dark=mat('Lip crease', '#713c3b', .55)
glint=mat('Eye catchlights', '#ffffff', .15)
pedestal=mat('Warm stone pedestal', '#afa79b', .45)
ped_dark=mat('Bronze pedestal base', '#51463d', .33, .45)

def link(obj, material, part='hips'):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    collection.objects.link(obj)
    obj['game_part']=part
    if material: obj.data.materials.append(material)
    if obj.type=='MESH':
        for p in obj.data.polygons: p.use_smooth=True
    return obj

def grid(name, rows, cols, fn, material, part='hips', sub=0, thick=0, flip=False, wrap=False):
    vertices=[]
    ncols=cols if wrap else cols+1
    for i in range(rows+1):
        for j in range(ncols): vertices.append(V(fn(i/rows,j/cols)))
    faces=[]
    for i in range(rows):
        for j in range(cols):
            a=i*ncols+j; b=i*ncols+(j+1)%ncols; c=b+ncols; d=a+ncols
            faces.append((a,d,c,b) if flip else (a,b,c,d))
    data=bpy.data.meshes.new(name)
    data.from_pydata(vertices,[],faces); data.update()
    obj=bpy.data.objects.new(name,data); link(obj,material,part)
    if sub:
        mod=obj.modifiers.new('Silk surface subdivision','SUBSURF'); mod.levels=sub; mod.render_levels=sub
    if thick:
        mod=obj.modifiers.new('Real fabric thickness','SOLIDIFY'); mod.thickness=thick; mod.offset=0
    return obj

def ellipsoid(name,p,s,material,part='hips',seg=40,rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=V(p))
    o=bpy.context.object; o.name=name; o.scale=(s[0],s[2],s[1]); link(o,material,part)
    return o

def curve(name,points,radius,material,part='hips',cyclic=False,radii=None):
    data=bpy.data.curves.new(name,'CURVE'); data.dimensions='3D'; data.resolution_u=3
    data.bevel_depth=radius; data.bevel_resolution=2
    spline=data.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for i,(b,p) in enumerate(zip(spline.bezier_points,points)):
        b.co=V(p); b.handle_left_type=b.handle_right_type='AUTO'
        if radii: b.radius=radii[i]
    spline.use_cyclic_u=cyclic
    o=bpy.data.objects.new(name,data); link(o,material,part); return o

def ring(name,r,y,material,part='hips',tube=.003,z=0,rx=1,rz=1):
    return curve(name,[(math.sin(i/64*TAU)*r*rx,y,z+math.cos(i/64*TAU)*r*rz) for i in range(64)],tube,material,part,True)

def lathe(name,profile,material,part='hips',depth=.8,sub=1):
    def pt(v,u):
        at=v*(len(profile)-1); i=min(len(profile)-2,int(at)); t=at-i
        r=profile[i][0]*(1-t)+profile[i+1][0]*t
        y=profile[i][1]*(1-t)+profile[i+1][1]*t
        return (math.sin(u*TAU)*r,y,math.cos(u*TAU)*r*depth)
    return grid(name,(len(profile)-1)*3,64,pt,material,part,sub=sub,wrap=True)

# ───────────────────────────────────────── Skin: one continuous sculpted face, not assembled balls.
HEAD_Y=1.137
def forehead_y(y):
    # The cranium continues behind the swept hair. The visible face is only its
    # lower portion; stopping the skull at the hairline leaves hollow temples.
    return y+.075*smooth((y-1.185)/.128)

def forehead_base(y):
    lo=y-.075; hi=y
    for _ in range(18):
        mid=(lo+hi)/2
        if forehead_y(mid)<y: lo=mid
        else: hi=mid
    return (lo+hi)/2

def face_relief(x,y,sz):
    def gauss(cx,cy,wx,wy): return math.exp(-((x-cx)/wx)**2-((y-cy)/wy)**2)
    return smooth(sz/.6)*(.016*(gauss(.095,1.082,.055,.047)+gauss(-.095,1.082,.055,.047))
        -.009*(gauss(.073,1.147,.049,.034)+gauss(-.073,1.147,.049,.034))
        +.017*gauss(0,1.123,.019,.052)+.031*gauss(0,1.092,.023,.020)
        +.010*gauss(0,1.039,.038,.024)+.007*gauss(0,1.002,.048,.018))

def face_front(x,y):
    y=forehead_base(y)
    sy=(y-HEAD_Y)/.176
    jaw=1-.18*smooth((-sy-.15)/.85)
    sz=math.sqrt(max(.00001,1-sy*sy-(x/(.171*jaw))**2))
    return sz*.142+face_relief(x,y,sz)
def face_point(v,u):
    ph=.0001+(1-v)*(PI-.0002); a=u*TAU
    sy=math.cos(ph); sx=math.sin(ph)*math.sin(a); sz=math.sin(ph)*math.cos(a)
    y=HEAD_Y+sy*.176
    jaw=1-.18*smooth((-sy-.15)/.85)
    x=sx*.171*jaw
    z=sz*.142
    z+=face_relief(x,y,sz)
    return (x,forehead_y(y),z)

face=grid('Sculpt • continuous cheeks, sockets, nose and chin',72,128,face_point,skin,'head',wrap=True)
# Vertex paint is exported with the mesh and is also used in the Blender render.
attr=face.data.color_attributes.new(name='Complexion',type='FLOAT_COLOR',domain='POINT')
base=Vector(rgb('#edbfa5')); blush=Vector(rgb('#d6636d')); nose_pink=Vector(rgb('#ce7d74'))
for i,vert in enumerate(face.data.vertices):
    x,y,z=from_blender(vert.co)
    front=smooth(z/.12)
    cheek=math.exp(-((abs(x)-.103)/.050)**2-((y-1.083)/.040)**2)*front*.62
    nose=math.exp(-(x/.024)**2-((y-1.091)/.022)**2)*front*.48
    c=base.lerp(blush,cheek).lerp(nose_pink,nose)
    attr.data[i].color=(*c,1)
nodes=skin.node_tree.nodes
paint=nodes.new('ShaderNodeVertexColor'); paint.layer_name='Complexion'
# Only the head uses vertex paint; make a separate material for neck and hands.
paint_skin=skin.copy(); paint_skin.name='Painted porcelain complexion'
paint=paint_skin.node_tree.nodes.new('ShaderNodeVertexColor'); paint.layer_name='Complexion'
paint_skin.node_tree.links.new(paint.outputs['Color'],paint_skin.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
face.data.materials.clear(); face.data.materials.append(paint_skin)
material_defs[paint_skin.name]=dict(material_defs[skin.name],vertexColors=True)
materials[paint_skin.name]=paint_skin

# Neck and exposed upper chest have one softly connected contour under the bodice.
lathe('Sculpt • neck and collarbones',[(.09,.845),(.132,.88),(.137,.912),(.107,.935),(.06,.95),(.036,.969),(.034,1.027)],skin,depth=.68,sub=1)
for sd in [-1,1]:
    ellipsoid('Sculpt • ear', (sd*.165,1.119,-.006),(.021,.037,.016),skin,'head')
    ellipsoid('Ear inner fold',(sd*.174,1.119,.006),(.009,.021,.008),skin_lid,'head',24,16)

# ───────────────────────────────────────── Almond eyes, iris fibres, tear lines, lashes and brows.
for sd in [-1,1]:
    cx=sd*.071; cy=1.149
    def eye_bounds(x):
        u=clamp((x-cx)/.094+.5)
        shape=math.sin(PI*u)**.72
        tilt=sd*(x-cx)*.055
        return cy-.026*shape+tilt,cy+.035*shape+tilt
    def eye_depth(x,y):
        lo,hi=eye_bounds(x)
        u=clamp((x-cx)/.094+.5); v=clamp((y-lo)/max(.00001,hi-lo))
        return face_front(x,y)+.002+.009*(math.sin(PI*v)*math.sin(PI*u))**.7
    def eye_surface(v,u):
        x=cx+(u*2-1)*.047; lo,hi=eye_bounds(x); y=lo+v*(hi-lo)
        return (x,y,eye_depth(x,y))
    grid('Eye • almond sclera',14,32,eye_surface,eye_white,'eyes',sub=1)
    # A curved, painted iris sits inside the almond opening. Its fibres and limbal
    # rim cost no separate geometry, and cannot protrude beyond the eyelids.
    def iris_surface(v,u):
        a=u*TAU; x=cx+math.sin(a)*.028*v
        lo,hi=eye_bounds(x)
        y=clamp(cy+.002+math.cos(a)*.030*v,lo+.0007,hi-.0007)
        return (x,y,eye_depth(x,y)+.0008)
    iris_obj=grid('Eye • inset painted iris',12,64,iris_surface,iris,'eyes',wrap=True)
    iris_col=iris_obj.data.color_attributes.new(name='Complexion',type='FLOAT_COLOR',domain='POINT')
    for i,vert in enumerate(iris_obj.data.vertices):
        x,y,z=from_blender(vert.co); a=math.atan2(x-cx,y-cy-.002)
        r=math.hypot((x-cx)/.028,(y-cy-.002)/.030)
        fibre=.5+.5*math.sin(a*37+math.sin(a*11)*1.2)
        c=Vector(rgb('#251a16')).lerp(Vector(rgb('#65412a')),.22+.35*fibre)
        c=c.lerp(Vector(rgb('#211713')),smooth((r-.84)/.14))
        c=c.lerp(Vector(rgb('#110b09')),1-smooth((r-.57)/.12))
        iris_col.data[i].color=(*c,1)
    for dx,dy,s in [(-.007,.011,.0042),(.009,-.006,.0016)]:
        ellipsoid('Eye • catchlight',(cx+dx,cy+dy,eye_depth(cx+dx,cy+dy)+.0018),(s,s*1.15,.0006),glint,'eyes',16,10)
    upper=[eye_surface(1,j/12) for j in range(13)]
    lower=[eye_surface(0,j/12) for j in range(13)]
    lid_radii=[.15]+[math.sin(j/12*PI)**.5 for j in range(1,12)]+[.15]
    curve('Eye • sculpted upper lid',[(x,y+.002,z-.001) for x,y,z in upper],.0038,skin_lid,'head',radii=lid_radii)
    curve('Eye • upper lashes',[(x,y-.0005,z+.001) for x,y,z in upper],.0034,pupil,'eyes',radii=lid_radii)
    curve('Eye • lower waterline',lower,.0019,skin_lid,'head',radii=lid_radii)
    for k in range(3):
        x=cx+sd*(.034+k*.004); y=eye_bounds(x)[1]
        z=eye_depth(x,y)+.002
        curve('Eye • individual outer lash',[(x,y,z),(x+sd*.006,y+.003,z),(x+sd*.010,y+.008,z-.002)],.0013,pupil,'eyes',radii=[1,.7,.05])
    brow=[(cx-sd*.035,1.207,.129),(cx-sd*.013,1.218,.134),(cx+sd*.015,1.217,.125),(cx+sd*.037,1.209,.112)]
    curve('Face • arched eyebrow',[(x,y-.01,face_front(x,y-.01)+.002) for x,y,z in brow],.0065,hair,'head',radii=[.7,1,.8,.1])
    closed=[(cx-.045,cy),(cx,cy-.012),(cx+.045,cy)]
    curve('Eye • closed expression',[(x,y,face_front(x,y)+.004) for x,y in closed],.0027,pupil,'closedEyes')

iris.node_tree.nodes.new('ShaderNodeVertexColor').layer_name='Complexion'
iris.node_tree.links.new(iris.node_tree.nodes[-1].outputs['Color'],iris.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
material_defs[iris.name]['vertexColors']=True

# Sculpted lips are surfaces with a soft cupid's bow, not a ring or a painted smile.
def lip_surface(upper):
    def pt(v,u):
        x=(u*2-1)*.035
        width=math.sin(u*PI)**.7
        seam=1.038+.0015*math.cos(u*TAU)
        h=(.007+.004*math.exp(-((abs(x)-.011)/.008)**2)) if upper else -.0105
        y=seam+v*h*width
        z=face_front(x,y)+.0015+.004*math.sin(v*PI)*width
        return (x,y,z)
    return pt
grid('Face • cupid bow upper lip',8,32,lip_surface(True),lip,'mouth',sub=1)
grid('Face • soft lower lip',8,32,lip_surface(False),lip,'mouth',sub=1,flip=True)
nostril=mat('Nostril warm recess', '#9a6255', .7)
for sd in [-1,1]: ellipsoid('Face • nostril recess',(sd*.0105,1.082,face_front(sd*.0105,1.082)+.0008),(.0025,.0015,.0008),nostril,'head',16,8)
curve('Face • subtle lip crease',[(x,y,face_front(x,y)+.002) for x,y in [(-.030,1.039),(-.014,1.038),(0,1.036),(.014,1.038),(.03,1.039)]],.0012,lip_dark,'mouth',radii=[.1,.8,1,.8,.1])
ellipsoid('Face • surprised mouth rim',(0,1.038,.133),(.022,.027,.008),lip,'surprisedMouth')
ellipsoid('Face • surprised mouth opening',(0,1.038,.140),(.014,.019,.003),pupil,'surprisedMouth')

# Match the reference's compact, rounded face: chin at 1.00 m, eyes at 1.17 m.
# Transform every facial component together so the lids and expressions stay fitted.
FACE_LIFT=1-.961*.91
face_fit=Matrix.Translation(Vector((0,0,FACE_LIFT))) @ Matrix.Diagonal((.94,1,.91,1))
bpy.context.view_layer.update()  # Commit the last primitive's scale before reading world matrices.
for obj in collection.objects:
    if obj.get('game_part') in ('head','eyes','closedEyes','mouth','surprisedMouth'):
        obj.matrix_world=face_fit @ obj.matrix_world

# ───────────────────────────────────────── Swept pompadour: raised roots, deep grooves, no fringe.
def coiffure(v,u,offset=0):
    a=u*TAU
    front=max(0,math.cos(a))
    hairline=1.165+.15*(1-math.sin(a)**4) if front>0 else 1.169
    end=math.acos(clamp((hairline-1.28)/.191,-1,1))
    ph=.015+(1-v)*(end-.015)
    a+=.24*math.sin(a)*math.sin(v*PI)
    near=smooth((1-v-.40)/.60)
    sweep=1-.40*near*front**3
    groove=.0018*math.cos(a*44+ph*2.4)*math.sin(ph)
    r=.225+groove+offset
    x=math.sin(a)*math.sin(ph)*r; y=1.28+math.cos(ph)*(.191+groove+offset)
    z=-.025+math.cos(a)*math.sin(ph)*(.190+groove+offset)*sweep
    # Every lock returns continuously to the close-fitting scalp. Matching the
    # same contour avoids an exposed smooth band beneath the swept volume.
    rp=1.80-.82*front**2
    rx=math.sin(a)*math.sin(rp)*(.185+offset)
    ry=1.19+math.cos(rp)*(.22+offset)
    rz=math.cos(a)*math.sin(rp)*(.13+offset)-.008
    if front>.05: rz=max(rz,face_front(rx/.94,(ry-FACE_LIFT)/.91)+.006+offset)
    blend=1-smooth(v/.26)
    x=x*(1-blend)+rx*blend; y=y*(1-blend)+ry*blend; z=z*(1-blend)+rz*blend
    if front>.05: z=max(z,face_front(x/.94,(y-FACE_LIFT)/.91)+.007+offset)
    return (x,y,z)
grid('Hair • sculpted swept pompadour',56,192,lambda v,u:coiffure(v,u),hair,'head',wrap=True)
def fitted_scalp(v,u):
    a=u*TAU; ph=.001+(1-v)*(1.80-.82*max(0,math.cos(a))**2)
    x=math.sin(a)*math.sin(ph)*.185; y=1.19+math.cos(ph)*.22
    z=math.cos(a)*math.sin(ph)*.13-.008
    if math.cos(a)>.05: z=max(z,face_front(x/.94,(y-FACE_LIFT)/.91)+.003)
    return (x,y,z)
grid('Hair • close-fitting temple underlayer',24,96,fitted_scalp,hair_dark,'head',wrap=True)
for i in range(44):
    def lock(v,u,i=i):
        v=.035+v*.94
        angle=(i+(u-.5)*.86)/44+.010*math.sin(v*PI)
        relief=.0004+.0045*math.sin(u*PI)*math.sin(v*PI)**.4
        return coiffure(v,angle,relief)
    grid('Hair • swept ribbon lock',28,6,lock,hair_light if i%4 else hair,'head')
# A ribbed bun with an irregular, gathered silhouette.
def bun(v,u):
    ph=.001+v*(PI-.002); a=u*TAU
    ridge=.004*math.cos(a*16+ph*.9)
    return (math.sin(a)*math.sin(ph)*(.112+ridge),1.529+math.cos(ph)*(.079+ridge),-.042+math.cos(a)*math.sin(ph)*(.101+ridge))
grid('Hair • gathered high bun',36,112,bun,hair,'head',wrap=True,flip=True)
for i in range(18):
    pts=[]
    for j in range(14):
        ph=.10+j/13*2.85; a=i/18*TAU
        pts.append((math.sin(a)*math.sin(ph)*.114,1.529+math.cos(ph)*.081,-.042+math.cos(a)*math.sin(ph)*.103))
    curve('Hair • bun fold',pts,.0034,hair_light,'head',radii=[.15]+[1]*12+[.15])
for sd in [-1,1]:
    curve('Hair • temple curl',[(sd*.166,1.188,.044),(sd*.162,1.139,.057),(sd*.156,1.115,.074),
        (sd*.164,1.091,.078),(sd*.151,1.078,.085),(sd*.162,1.061,.084),(sd*.156,1.048,.080)],.0063,hair,'head',radii=[1,1,1,.9,.8,.55,.10])

# ───────────────────────────────────────── Gold crown: pierced arches, engraved band and finials.
ring('Crown • lower circlet',.123,1.468,gold,'head',.0045,z=-.042,rz=.91)
ring('Crown • upper circlet',.124,1.479,gold,'head',.003,z=-.042,rz=.91)
grid('Crown • embossed gold band',3,96,lambda v,u:(math.sin(u*TAU)*.124,1.465+v*.019,-.042+math.cos(u*TAU)*.113),gold,'head',wrap=True)
for i in range(26):
    a=i/26*TAU
    pts=[]
    for j in range(9):
        t=j/8; ang=a+(t-.5)*TAU/26
        pts.append((math.sin(ang)*.125,1.475+math.sin(t*PI)*.012,-.042+math.cos(ang)*.114))
    curve('Crown • filigree arch',pts,.0017,gold,'head')
for i in range(11):
    a=-1.8+i/10*3.6
    x=math.sin(a)*.124; z=-.042+math.cos(a)*.114
    h=.026+.011*math.cos(a)
    curve('Crown • rising fleurons',[(x,1.479,z),(x*1.025,1.479+h*.55,z+.005),(x*1.06,1.479+h,z+.007)],.003,gold,'head',radii=[1,.8,.65])
    ellipsoid('Crown • oval finial',(x*1.06,1.479+h+.004,z+.007),(.009,.012,.007),gold,'head',20,12)
    ellipsoid('Crown • engraved bead',(x,1.475,z+.004),(.003,.003,.003),gold_dark,'head',12,8)
    if i<10:
        pts=[]
        for j in range(9):
            t=j/8; aa=a+t*.36
            pts.append((math.sin(aa)*.127,1.487+.026*(abs(math.cos(t*PI))**1.5),-.042+math.cos(aa)*.118))
        curve('Crown • scalloped fleur-de-lys edge',pts,.003,gold,'head')

# ───────────────────────────────────────── Corset with pointed front and embroidered borders.
def body_radius(y):
    profile=[(.685,.091),(.73,.101),(.79,.117),(.855,.138),(.91,.137),(.95,.105)]
    for (a,r),(b,s) in zip(profile,profile[1:]):
        if y<=b: return r+(s-r)*clamp((y-a)/(b-a))
    return .105
def corset_point(v,u,extra=0):
    a=u*TAU
    front=max(0,math.cos(a))
    top=.938-.05*(1-smooth((abs(math.atan2(math.sin(a),math.cos(a)))-.55)/.6))
    bottom=.694-.023*front**5
    y=bottom+(top-bottom)*v
    r=body_radius(y)+extra
    return (math.sin(a)*r,y,math.cos(a)*r*.73)
grid('Dress • fitted pointed velvet corset',26,96,lambda v,u:corset_point(v,u),velvet,sub=1,thick=.003,wrap=True)
for sd in [-1,1]:
    pts=[]
    for j in range(14):
        v=j/13; a=sd*(.1+.87*v)
        top=.938-.05*(1-smooth((abs(a)-.55)/.6))
        y=.687+v*(top-.687); r=body_radius(y)+.003
        pts.append((math.sin(a)*r,y,math.cos(a)*r*.73))
    curve('Corset • wide shoulder gold braid',pts,.0075,gold,radii=[.4]+[1]*12+[1])
    # Fine parallel cording follows the broad band.
    curve('Corset • inner cord',[(x+sd*.006,y,z+.001) for x,y,z in pts],.0017,gold_dark)
curve('Corset • square lace neckline',[corset_point(1,(-.96+j/32*1.92)/TAU,.004) for j in range(33)],.004,gold)
for i in range(30):
    a=-.80+i/29*1.6; p=corset_point(1,a/TAU,.006)
    ellipsoid('Neckline • individual lace loop',(p[0],p[1]+.004,p[2]+.001),(.0028,.005,.0025),lace,seg=12,rings=8)

# ───────────────────────────────────────── Ivory underskirt with broad hanging folds and fine fluting.
def skirt_r(t): return .105+.335*(1-t)**.79+.014*math.sin(PI*t)
def skirt_point(t,a,offset=0):
    wave=(.010*math.cos(a*32+.25*t)+.0025*math.cos(a*64+.4*math.sin(a*7)))*(1-t)**.66
    r=skirt_r(t)+wave+offset
    return (math.sin(a)*r,.025+t*.68,math.cos(a)*r*.80)
grid('Dress • full sculpted ivory underskirt',56,192,lambda v,u:skirt_point(v,u*TAU),ivory,'skirt',sub=1,thick=.004,wrap=True)
for name,lo,hi,material in [('Velvet hem',.018,.085,velvet),('Lower embroidered gold border',.009,.023,gold),('Upper embroidered gold border',.08,.095,gold)]:
    offset=.006 if material==velvet else .010
    grid('Dress • '+name,3,192,lambda v,u,lo=lo,hi=hi,offset=offset:skirt_point(lo+(hi-lo)*v,u*TAU,offset),material,'skirt',wrap=True,thick=.0015)
for i in range(110):
    a=i/110*TAU; pts=[]
    for j in range(9):
        t=j/8; p=skirt_point(.084+.007*math.sin(t*TAU),a+(t-.5)*TAU/110,.012)
        pts.append(p)
    curve('Hem • gold embroidered scroll',pts,.0012,gold_dark,'skirt')

# Deep velvet swags have actual thickness and a subdivided folded surface.
for sd,part in [(1,'tailL'),(-1,'tailR')]:
    def drape_point(v,u,sd=sd):
        a=sd*(.018+u*3.1)
        bottom=.28+.71*math.exp(-u*5.5)+.10*u**4
        t=bottom+(1-bottom)*v
        folds=(.023*math.sin(v*PI*6.6+u*1.2)+.003*math.sin(v*PI*13+u*3))*(math.sin(v*PI)**.65)
        swell=.016+.040*(1-v)**.6+.019*math.sin(u*PI)*math.sin(v*PI)
        r=skirt_r(t)+swell+folds
        return (math.sin(a)*r,.025+t*.68,math.cos(a)*r*.80)
    grid('Dress • thick gathered velvet swag',54,88,lambda v,u:drape_point(v,u if sd>0 else 1-u),velvet,part,sub=1,thick=.007)
    curve('Dress • rolled velvet selvedge',[drape_point(.006,j/48) for j in range(49)],.010,velvet_rib,part,radii=[.3]+[1]*47+[.5])

# ───────────────────────────────────────── Slashed puff sleeves, lace cuffs and sculpted fingers.
for sd,part in [(1,'armL'),(-1,'armR')]:
    shoulder=(sd*.147,.935,0)
    def local(p): return (shoulder[0]+sd*p[0],shoulder[1]+p[1],shoulder[2]+p[2])
    def puff(v,u):
        ph=.002+v*(PI-.004); a=u*TAU
        lobe=1+.08*math.cos(a*6)
        return local((.015+math.sin(a)*math.sin(ph)*.069*lobe,-.052+math.cos(ph)*.097,math.cos(a)*math.sin(ph)*.065*lobe))
    grid('Sleeve • lobed velvet puff',24,56,puff,velvet,part,sub=1,wrap=True,flip=sd>0)
    for i in range(4):
        a=-1.5+i/3*3.0
        def ribbon(v,u,a=a):
            ph=.22+v*2.56; aa=a+(u-.5)*.24*math.sin(ph)
            lobe=1+.08*math.cos(aa*6)
            return local((.015+math.sin(aa)*math.sin(ph)*(.069*lobe+.0015),-.052+math.cos(ph)*.097,math.cos(aa)*math.sin(ph)*(.065*lobe+.0015)))
        grid('Sleeve • tapered brocade insert',24,3,ribbon,gold,part,flip=sd>0)
    ring('Sleeve • braided gold cuff',.045,shoulder[1]-.145,gold,part,.004,z=0,rx=1,rz=1).location.x=sd*(.147+.015)
    def flare(v,u):
        a=u*TAU; r=.048+.022*(1-v)+.005*math.cos(a*8)*(1-v)
        return local((.015+.046*(1-v)+math.sin(a)*r,-.23+v*.08,math.cos(a)*r))
    grid('Sleeve • flared velvet lower cuff',12,64,flare,velvet,part,sub=1,thick=.003,wrap=True,flip=sd<0)
    for i in range(8):
        a=i/8*TAU
        curve('Cuff • gold trim', [flare(j/10,a/TAU) for j in range(11)],.0025,gold,part)
    for k in range(2):
        def ruffle(v,u,k=k):
            a=u*TAU; r=.078-v*.026+.007*math.cos(a*12)*(1-v)
            return local((.064+math.sin(a)*r,-.248-k*.025+v*.036+.004*math.sin(a*12),math.cos(a)*r))
        grid('Cuff • scalloped ivory lace tier',8,96,ruffle,lace,part,sub=1,thick=.0015,wrap=True,flip=sd<0)
    forearm=ellipsoid('Arm • smooth forearm',local((.104,-.325,.008)),(.023,.095,.024),skin,part)
    forearm.rotation_euler.y=-sd*.35
    ring('Wrist • gold bracelet',.023,shoulder[1]-.398,gold,part,.003,z=.008).location.x=sd*(.147+.131)
    palm=ellipsoid('Hand • sculpted palm',local((.137,-.42,.014)),(.024,.035,.014),skin,part)
    for k in range(4):
        x=.118+k*.011
        length=[.037,.047,.043,.033][k]
        curve('Hand • separate tapered finger',[local((x,-.428,.018)),local((x+.002,-.445,.024)),local((x+.004,-.435-length,.018))],.0062,skin,part,radii=[1,.83,.28])
    curve('Hand • thumb',[local((.114,-.406,.017)),local((.102,-.421,.032)),local((.103,-.439,.032))],.008,skin,part,radii=[1,.8,.3])

# Shoe tips and hidden legs retain the old pivot-driven walking contract.
for sd,part in [(1,'legL'),(-1,'legR')]:
    ellipsoid('Shoe • velvet toe',(sd*.065,.036,.035),(.043,.026,.082),velvet,part,32,16)

# Expression alternatives must be exported but not shown in the beauty render.
for o in collection.objects:
    if o.get('game_part') in ('closedEyes','surprisedMouth'): o.hide_render=True; o.hide_set(True)

# ───────────────────────────────────────── Pedestal and studio (excluded from the game mesh).
lathe('DISPLAY • stepped stone plinth',[(0,-.17),(.50,-.17),(.515,-.15),(.515,-.12),(.49,-.106),(.49,-.09),(.463,-.075),(.463,-.035),(.44,-.015),(.44,0),(0,0)],pedestal,'display',depth=1,sub=0)
lathe('DISPLAY • bronze foundation',[(0,-.18),(.51,-.18),(.52,-.17),(.52,-.145),(.51,-.14),(0,-.14)],ped_dark,'display',depth=1,sub=0)
ring('DISPLAY • fine bronze inlay',.424,.002,gold_dark,'display',.0015)
for i in range(24):
    a=i/24*TAU
    ellipsoid('DISPLAY • inlaid stud',(math.sin(a)*.424,.004,math.cos(a)*.424),(.003,.002,.003),gold_dark,'display',12,8)

scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=96
scene.cycles.use_denoising=True
scene.cycles.preview_samples=16
scene.render.resolution_x=900; scene.render.resolution_y=1300; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.world.color=(.07,.07,.07)
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.render.image_settings.color_depth='8'
def area(name,p,power,size,color,target=(0,.85,0),ratio=1):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size; data.color=color
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=V(p)
    obj.rotation_euler=(V(target)-obj.location).to_track_quat('-Z','Y').to_euler()
area('STUDIO • large warm key',(-2.2,3.4,3.8),300,2.3,(1,.88,.78))
area('STUDIO • cool fill',(2.5,2.2,2),75,2.5,(.80,.87,1))
area('STUDIO • hair rim',(-1.2,2.9,-2.2),280,2,(1,.87,.74))
area('STUDIO • frontal softbox',(0,1.3,4),20,2,(1,1,1))
camera_data=bpy.data.cameras.new('Portrait camera'); camera=bpy.data.objects.new('Portrait camera',camera_data); scene.collection.objects.link(camera)
camera.location=V((0,1.40,5.5)); target=V((0,.72,0)); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO'; camera_data.ortho_scale=2.02; camera_data.lens=70; scene.camera=camera

# Collection custom properties make the .blend self-documenting and editable.
collection['reference']='User-provided Duchess reference, burgundy and ivory court dress'
collection['build_command']='blender --background --factory-startup --python art/duchess/build_duchess.py'
collection['coordinate_system']='Blender Z up, front -Y. Game export is Y up, front +Z.'
reference_path=os.path.join(ART,'reference.png')
if os.path.exists(reference_path):
    guide=bpy.data.objects.new('REFERENCE • supplied Duchess image',None)
    guide.empty_display_type='IMAGE'; guide.empty_display_size=2
    guide.data=bpy.data.images.load(reference_path,check_existing=True); guide.data.pack()
    guide.location=V((1.4,.72,-.15)); guide.rotation_euler=(PI/2,0,0)
    guide.hide_render=True; guide.empty_image_depth='BACK'
    scene.collection.objects.link(guide)

PIVOTS={'hips':(0,.60,0),'head':(0,.975,0),'eyes':(0,.975,0),'closedEyes':(0,.975,0),
    'mouth':(0,.975,0),'surprisedMouth':(0,.975,0),'armL':(.147,.935,0),'armR':(-.147,.935,0),
    'tailL':(0,.705,0),'tailR':(0,.705,0),'skirt':(0,.60,0),'legL':(.065,.60,0),'legR':(-.065,.60,0)}

# These variations are baked into vertex colors in the runtime mesh: no extra
# texture fetches, shader branches or material batches are needed in the game.
PAINTED={hair.name,hair_light.name,hair_dark.name,velvet.name,velvet_rib.name,ivory.name,gold.name,gold_dark.name,lace.name}
ALIASES={hair_light.name:hair.name,hair_dark.name:hair.name,velvet_rib.name:velvet.name,gold_dark.name:gold.name}
for name in PAINTED:
    material_defs[name]['vertexColors']=True

def surface_color(name,p):
    x,y,z=p; a=math.atan2(x,z)
    c=Vector(rgb(material_defs[name]['color']))
    if name in (hair.name,hair_light.name,hair_dark.name):
        shade=.88+.12*math.sin(a*22+y*18)**2
    elif name in (velvet.name,velvet_rib.name,ivory.name,lace.name):
        # Soft creases and fine tonal weave survive minification without aliasing.
        shade=.91+.07*math.sin(a*16+y*3)**2+.02*math.sin(y*180+x*90)**2
    else:
        shade=.87+.13*math.sin(a*26+y*60)**2
    return (*tuple(c*shade),1)

# Studio-only weave and hair microstructure for the high-resolution portrait.
# The runtime receives the baked tonal variation above, without these nodes.
for material,scale,strength,distance in [(velvet,190,.16,.00035),(ivory,210,.12,.00022),(hair,95,.12,.00025)]:
    nodes=material.node_tree.nodes; links=material.node_tree.links
    noise=nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=scale
    noise.inputs['Detail'].default_value=2
    bump_node=nodes.new('ShaderNodeBump'); bump_node.inputs['Strength'].default_value=strength
    bump_node.inputs['Distance'].default_value=distance
    links.new(noise.outputs['Fac'],bump_node.inputs['Height'])
    links.new(bump_node.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])

def pack(code,data):
    return base64.b64encode(struct.pack('<'+str(len(data))+code,*data)).decode('ascii')

def export_game():
    groups=defaultdict(lambda:dict(positions=[],normals=[],colors=[],indices=[],hasColors=False))
    deps=bpy.context.evaluated_depsgraph_get()
    # Preserve the editable high resolution source. Only the export copies are simplified.
    runtime=bpy.data.collections.new('TEMP • runtime LOD'); scene.collection.children.link(runtime)
    for obj in collection.objects:
        part=obj.get('game_part')
        if part not in PIVOTS or obj.type not in ('MESH','CURVE'): continue
        ev=obj.evaluated_get(deps); me=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
        if not me: continue
        data=me.copy(); ev.to_mesh_clear()
        copy=bpy.data.objects.new('Runtime / '+obj.name,data); runtime.objects.link(copy)
        copy.matrix_world=obj.matrix_world.copy(); copy['game_part']=part
        if len(data.polygons)>64:
            mod=copy.modifiers.new('Game LOD — preserve sculpt silhouette','DECIMATE')
            # Narrow hem overlays need enough vertices to follow every ivory pleat.
            if 'continuous cheeks' in obj.name: ratio=.42
            elif 'painted iris' in obj.name: ratio=1
            elif 'pompadour' in obj.name: ratio=.38
            elif 'ribbon lock' in obj.name: ratio=.35
            elif 'underskirt' in obj.name: ratio=.075
            elif part=='skirt' and obj.type=='MESH': ratio=.6
            elif obj.type=='CURVE': ratio=.16
            else: ratio=.12
            mod.ratio=ratio
            mod.use_collapse_triangulate=True
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    for obj in runtime.objects:
        part=obj['game_part']
        ev=obj.evaluated_get(deps); me=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
        me.calc_loop_triangles()
        world=obj.matrix_world; norm=world.to_3x3().inverted().transposed(); pivot=PIVOTS[part]
        ca=me.color_attributes.get('Complexion')
        # Objects use a single material, so batching by part/material is lossless.
        source_name=me.materials[0].name if len(me.materials) else 'Porcelain skin'
        name=ALIASES.get(source_name,source_name)
        group=groups[(part,name)]; start=len(group['positions'])//3
        for vert in me.vertices:
            p=from_blender(world@vert.co); n=from_blender((norm@vert.normal).normalized())
            group['positions'].extend(round((p[i]-pivot[i])/.00004) for i in range(3))
            group['normals'].extend(round(clamp(n[i],-1,1)*32767) for i in range(3))
            col=ca.data[vert.index].color if ca else surface_color(source_name,p) if source_name in PAINTED else (1,1,1,1)
            group['colors'].extend(round(clamp(col[i])*255) for i in range(3))
        group['hasColors']|=bool(ca) or source_name in PAINTED
        for tri in me.loop_triangles: group['indices'].extend(start+i for i in tri.vertices)
        ev.to_mesh_clear()
    meshes=[]
    for (part,name),g in groups.items():
        short=len(g['positions'])//3<=65536
        meshes.append(dict(part=part,material=name,position=pack('h',g['positions']),normal=pack('h',g['normals']),
            color=pack('B',g['colors']) if g['hasColors'] else None,indexType='uint16' if short else 'uint32',index=pack('H' if short else 'I',g['indices'])))
    data=dict(generator='Blender '+bpy.app.version_string,positionScale=.00004,pivots=PIVOTS,materials=material_defs,meshes=meshes)
    with open(os.path.join(OUT,'duchess.mesh.json'),'w',encoding='utf8') as f: json.dump(data,f,separators=(',',':'))
    print('GAME_EXPORT',len(meshes),'batches',sum(len(g['indices'])//3 for g in groups.values()),'triangles',flush=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in runtime.objects: obj.select_set(obj['game_part'] not in ('closedEyes','surprisedMouth'))
    bpy.ops.export_scene.gltf(filepath=os.path.join(ART,'duchess.glb'),export_format='GLB',use_selection=True,export_apply=True,export_animations=False)
    for obj in list(runtime.objects):
        data=obj.data; bpy.data.objects.remove(obj,do_unlink=True); bpy.data.meshes.remove(data)
    bpy.data.collections.remove(runtime)

# Keep the beauty view selected when the .blend is opened.
bpy.ops.object.select_all(action='DESELECT')
face.select_set(True); bpy.context.view_layer.objects.active=face
for screen in bpy.data.screens:
    for area_ui in screen.areas:
        if area_ui.type=='VIEW_3D':
            area_ui.spaces.active.region_3d.view_perspective='CAMERA'
            area_ui.spaces.active.shading.type='MATERIAL'
scene.render.filepath=os.path.join(OUT,'duchess-portrait.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ART,'duchess.blend'))
if '--preview' not in sys.argv: export_game()
if '--draft' in sys.argv:
    scene.render.resolution_percentage=50; scene.cycles.samples=24
    scene.render.filepath=os.path.join(ART,'preview.png')
if '--no-render' not in sys.argv: bpy.ops.render.render(write_still=True)
print('DUCHESS_COMPLETE',scene.render.filepath,flush=True)
