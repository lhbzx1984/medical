"""Generate the educational female body from MakeHuman CC0 sources.

Usage: python scripts/build-makehuman-female.py PATH_TO_SOURCE_DIR
Requires numpy. The source directory contains base.obj, asian-female-young.target,
and universal-female-young-averagemuscle-averageweight.target from the pinned
MakeHuman revision documented in README.md. Only the body group is exported.
"""
import sys
from pathlib import Path
import json, struct
import numpy as np
source=Path(sys.argv[1])
vertices=[]; triangles=[]; group=''
for line in (source/'base.obj').read_text(encoding='utf-8').splitlines():
 fields=line.split()
 if not fields: continue
 if fields[0]=='v': vertices.append([float(n) for n in fields[1:4]])
 elif fields[0]=='g': group=fields[1]
 elif fields[0]=='f' and group=='body':
  f=[int(p.split('/')[0])-1 for p in fields[1:]]
  for i in range(1,len(f)-1): triangles.append([f[0],f[i],f[i+1]])
v=np.array(vertices,dtype=np.float64)
for filename in ['asian-female-young.target','universal-female-young-averagemuscle-averageweight.target']:
 for line in (source/filename).read_text(encoding='utf-8').splitlines():
  parts=line.split()
  if len(parts)==4 and parts[0].isdigit(): v[int(parts[0])]+=np.array([float(n) for n in parts[1:]])
f=np.array(triangles,dtype=np.uint32); used=np.unique(f); remap=np.zeros(len(v),dtype=np.uint32);remap[used]=np.arange(len(used),dtype=np.uint32);f=remap[f]; v=v[used]
v=(v/10).astype('<f4');norm=np.zeros_like(v);cross=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
for i in range(3):np.add.at(norm,f[:,i],cross)
norm/=np.maximum(np.linalg.norm(norm,axis=1,keepdims=True),1e-8);norm=norm.astype('<f4');indices=f.astype('<u2').ravel()
chunks=[v.tobytes(),norm.tobytes(),indices.tobytes()];offset=[];binary=b''
for chunk in chunks:
 offset.append(len(binary));binary+=chunk;binary+=b'\0'*((-len(binary))%4)
gltf={'asset':{'version':'2.0','generator':'MakeHuman CC0 body adaptation'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'female_skin','mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1},'indices':2}]}],'buffers':[{'byteLength':len(binary)}],'bufferViews':[{'buffer':0,'byteOffset':offset[0],'byteLength':len(chunks[0]),'target':34962},{'buffer':0,'byteOffset':offset[1],'byteLength':len(chunks[1]),'target':34962},{'buffer':0,'byteOffset':offset[2],'byteLength':len(chunks[2]),'target':34963}],'accessors':[{'bufferView':0,'componentType':5126,'count':len(v),'type':'VEC3','min':v.min(0).tolist(),'max':v.max(0).tolist()},{'bufferView':1,'componentType':5126,'count':len(v),'type':'VEC3'},{'bufferView':2,'componentType':5123,'count':len(indices),'type':'SCALAR'}]}
j=json.dumps(gltf,separators=(',',':')).encode();j+=b' '*((-len(j))%4); glb=struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(binary))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(binary),b'BIN\0')+binary
Path('public/models/makehuman-female.glb').write_bytes(glb)
print('bounds',v.min(0),v.max(0),'verts',len(v),'triangles',len(f),'bytes',len(glb))
