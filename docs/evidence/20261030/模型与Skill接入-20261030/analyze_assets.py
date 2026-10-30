import json,struct,gzip,sys,math,collections,glob,os,hashlib
root=sys.argv[1].rstrip('/\\')+'/public/'  # 用法: python analyze_assets.py <medical-main 目录>
print("=== GLB metadata ===")
for f in sorted(glob.glob(root+'models/*.glb')):
    b=open(f,'rb').read()
    magic,ver,length=struct.unpack('<4sII',b[:12])
    clen,ctype=struct.unpack('<I4s',b[12:20])
    j=json.loads(b[20:20+clen])
    acc=j.get('accessors',[]); meshes=j.get('meshes',[])
    tris=0;verts=0;mn=[1e9]*3;mx=[-1e9]*3
    for m in meshes:
        for p in m['primitives']:
            if 'indices' in p: tris+=acc[p['indices']]['count']//3
            pa=acc[p['attributes']['POSITION']]; verts+=pa['count']
            if 'min' in pa:
                mn=[min(a,c) for a,c in zip(mn,pa['min'])]; mx=[max(a,c) for a,c in zip(mx,pa['max'])]
    a=j.get('asset',{})
    print(os.path.basename(f), len(b)//1024,'KB', 'ext',j.get('extensionsUsed'), 'meshes',len(meshes),'nodes',len(j.get('nodes',[])),'mats',len(j.get('materials',[])),'tex',len(j.get('textures',[])),'imgs',len(j.get('images',[])),'verts',verts,'tris',tris)
    print('   asset:',{k:v for k,v in a.items()}, 'extras' , str(j.get('asset',{}).get('extras'))[:200])
    print('   bbox extent(raw units):',[round(y-x,4) for x,y in zip(mn,mx)])
    print('   mesh/node names:',[m.get('name') for m in meshes][:8],'|',[n.get('name') for n in j.get('nodes',[])][:8])
    print('   mat names:',[m.get('name') for m in j.get('materials',[])][:6])

print("\n=== Atlas stomach mesh ===")
a=json.load(open(root+'atlas/atlas.json'))
parts=a['parts']
buf=gzip.open(root+'atlas/body-9.bin.gz').read()
print('chunk9 bytes',len(buf), 'declared', a['chunks'][9]['bytes'])
s=[p for p in parts if p['id']=='FJ2564'][0]
vc,ic=s['vertexCount'],s['indexCount']
pos=struct.unpack_from('<%df'%(vc*3),buf,s['positions'])
nor=struct.unpack_from('<%dH'%(vc*3),buf,s['normals'])
idx=struct.unpack_from('<%dI'%ic,buf,s['indices'])
print('finite positions:',all(math.isfinite(x) for x in pos),'max index',max(idx),'< vc',vc,'min idx',min(idx))
P=[pos[i*3:i*3+3] for i in range(vc)]
mn=[min(p[k] for p in P) for k in range(3)];mx=[max(p[k] for p in P) for k in range(3)]
print('actual bounds',[round(x,5) for x in mn],[round(x,5) for x in mx],'declared',s['bounds'])
N=[tuple(v/32767-1 for v in nor[i*3:i*3+3]) for i in range(vc)]
lens=[math.sqrt(sum(c*c for c in n)) for n in N]
print('normal length min/max',round(min(lens),3),round(max(lens),3))
def sub(a,b):return (a[0]-b[0],a[1]-b[1],a[2]-b[2])
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def dot(a,b):return sum(x*y for x,y in zip(a,b))
area=0;degenerate=0;agree=0;vol=0
edges=collections.Counter()
for t in range(0,ic,3):
    i,j,k=idx[t:t+3]
    c=cross(sub(P[j],P[i]),sub(P[k],P[i]))
    l=math.sqrt(dot(c,c))
    if l<1e-12: degenerate+=1; continue
    area+=l/2
    nn=tuple(sum(N[v][q] for v in (i,j,k)) for q in range(3))
    if dot(c,nn)>0: agree+=1
    vol+=dot(P[i],cross(P[j],P[k]))/6
    for e in ((i,j),(j,k),(k,i)): edges[tuple(sorted(e))]+=1
tri=ic//3
print('triangles',tri,'degenerate',degenerate,'winding agrees with vertex normals: %.1f%%'%(100*agree/(tri-degenerate)))
cnt=collections.Counter(edges.values())
print('edge use counts (2 = closed manifold):',dict(cnt))
print('surface area m2 %.5f  signed volume m3 %.6f (%.1f mL)'%(area,vol,abs(vol)*1e6))
# connected components
parent=list(range(vc))
def find(x):
    while parent[x]!=x: parent[x]=parent[parent[x]];x=parent[x]
    return x
for t in range(0,ic,3):
    i,j,k=idx[t:t+3]
    for u,v in ((i,j),(j,k)):
        ru,rv=find(u),find(v)
        if ru!=rv: parent[ru]=rv
print('connected components:',len({find(v) for v in set(idx)}))

print("\n=== Left/right convention: atlas x-centres ===")
def cx(p):return (p['bounds'][0][0]+p['bounds'][1][0])/2
names=['Liver','Stomach','Spleen','Heart','Gallbladder','Appendix','Pancreas','Left lung','Right lung','Left kidney','Right kidney','Aorta','Descending colon','Ascending colon','Esophagus']
for n in names:
    ms=[p for p in parts if p['name'].lower()==n.lower()]
    if not ms: ms=[p for p in parts if n.lower() in p['name'].lower()][:2]
    for p in ms[:2]: print('%-28s x_center=%+.4f y_center=%.3f'%(p['name'],cx(p),(p['bounds'][0][1]+p['bounds'][1][1])/2))

print("\n=== Outward-direction test (centroid) for stomach ===")
cen=[sum(p[k] for p in P)/vc for k in range(3)]
w_out=n_out=tot=0
for t in range(0,ic,3):
    i,j,k=idx[t:t+3]
    fc=[sum(P[v][q] for v in (i,j,k))/3 for q in range(3)]
    out=sub(fc,cen); wn=cross(sub(P[j],P[i]),sub(P[k],P[i]))
    vn=[sum(N[v][q] for v in (i,j,k)) for q in range(3)]
    tot+=1; w_out+=dot(wn,out)>0; n_out+=dot(vn,out)>0
print('outward: winding %.1f%%, stored normals %.1f%% (of %d triangles)'%(100*w_out/tot,100*n_out/tot,tot))
print("\n=== SHA256 of inputs ===")
for f in ['atlas/atlas.json','atlas/body-9.bin.gz']+sorted(glob.glob(root+'models/*.glb')):
    p=f if f.startswith('/') or f.startswith(root) else root+f
    print(hashlib.sha256(open(p,'rb').read()).hexdigest(), os.path.relpath(p,root))
