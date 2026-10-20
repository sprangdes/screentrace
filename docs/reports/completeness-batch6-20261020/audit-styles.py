"""Check local stylesheet content and actual owning-screen linkage; never fetch remote CSS."""
from pathlib import Path
from html.parser import HTMLParser
from source_markup import protect_nested_tags
import json,base64,posixpath,collections,re
H=Path(__file__).resolve().parent;R=H.parents[2];B=json.loads((H/'baseline.json').read_text());C=json.loads((H/'source-census.json').read_text());rows=[]
class Tags(HTMLParser):
 def __init__(self):super().__init__();self.tags=[]
 def handle_starttag(self,tag,attrs):self.tags.append((tag,dict(attrs),self.getpos()[0]))
for project,meta in B['projects'].items():
 root=Path(meta['sourceRoot']);o=R/'analyze/completeness-batch6-20261020'/project;g=json.loads((o/'application-graph.json').read_text());packed=json.loads((o/'viewer-documents.json').read_text());assets={k:base64.b64decode(v.split(',',1)[1]).decode(errors='replace').replace('\r\n','\n') for k,v in packed['assets'].items() if v.startswith('data:text/css;base64,')}
 for view in C[project]['views']:
  file=view['file'];parser=Tags();parser.feed(protect_nested_tags((root/file).read_text()))
  for tag,a,line in parser.tags:
   if tag!='link' or a.get('rel')!='stylesheet':continue
   raw=a.get('href','');row=dict(project=project,file=file,line=line,original=raw)
   if raw.startswith(('http:','https:','//')):row['result']='EXTERNAL_NOT_FETCHED';rows.append(row);continue
   if project=='InventoryMGRSpringMVCCRUD':resource='WebContent/'+raw.lstrip('/')
   else:resource='src/main/webapp/'+raw.removeprefix('${contextPath}/').lstrip('/')
   row['resource']=resource
   if not(root/resource).is_file():row['result']='SOURCE_MISSING_STYLE';rows.append(row);continue
   css=(root/resource).read_text().replace('\r\n','\n');prefix=css.strip()[:256];matching=[k for k,v in assets.items() if prefix in v];owners=[file]
   if file.endswith('/incl/styles.jsp'):owners=[v['file'] for v in C[project]['views'] if '/incl/styles.jsp' in(root/v['file']).read_text()]
   screens=[n for n in g['nodes'] if n['type']=='SCREEN' and n['attributes'].get('view') in owners];linked=[n['id'] for n in screens if any('st-asset-sha256:'+key in packed['documents'].get(n['id'],'') for key in matching)];row.update(expectedConsumers=owners,screens=[n['id'] for n in screens],packedMatchingCssAssets=matching,linkedScreens=linked,prefixProof=prefix);row['result']='PASS' if screens and len(linked)==len(screens) else 'FAIL';rows.append(row)
(H/'style-results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
for p in C:print(p,dict(collections.Counter(r['result'] for r in rows if r['project']==p)))
