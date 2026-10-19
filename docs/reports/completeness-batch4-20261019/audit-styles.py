import os
"""Source-local stylesheet inclusion audit; no CSS/JS execution and no remote media fetch."""
from pathlib import Path
from html.parser import HTMLParser
import json,re,base64,collections
H=Path(__file__).resolve().parent;R=H.parents[2];B=json.loads((H/'baseline.json').read_text());C=json.loads((H/'source-census.json').read_text());results=[]
class Links(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.links=[]
 def handle_starttag(self,t,attrs):
  a=dict(attrs)
  if t=='link' and a.get('rel')=='stylesheet':self.links.append((self.getpos()[0],a.get('th:href',a.get('href',''))))
for project,c in C.items():
 root=Path(B['projects'][project]['sourceRoot']);out=Path(os.environ.get('ST_BATCH4_OUTPUT',str(R/'analyze/completeness-batch4-20261019')))/project;g=json.loads((out/'application-graph.json').read_text());packed=json.loads((out/'viewer-documents.json').read_text())
 assets={k:base64.b64decode(v.split(',',1)[1]).decode(errors='replace').replace('\r\n','\n') for k,v in packed['assets'].items() if v.startswith('data:text/css;base64,')}
 for view in c['views']:
  parser=Links();parser.feed((root/view['file']).read_text())
  for line,raw in parser.links:
   row=dict(project=project,file=view['file'],line=line,original=raw)
   if raw.startswith(('http:','https:','//')):row['result']='EXTERNAL_NOT_FETCHED';results.append(row);continue
   path=raw[2:-1] if re.fullmatch(r'@\{/[^{}]+}',raw) else raw
   if path.startswith('/'):
    resource=root/('src/main/resources/static' if '/resources/templates/'in view['file'] else 'src/main/webapp')/path.lstrip('/')
   else:resource=(root/view['file']).parent/path
   if not resource.is_file():row['result']='SOURCE_MISSING_STYLE';results.append(row);continue
   row['resource']=str(resource.relative_to(root));css=resource.read_text().replace('\r\n','\n');prefix=css.strip()[:256];matching=[k for k,v in assets.items() if prefix in v]
   screens=[n for n in g['nodes'] if n['type']=='SCREEN' and n['attributes'].get('view')==view['file']];row['packedMatchingCssAssets']=matching;row['screens']=[n['id'] for n in screens]
   row['linkedScreens']=[n['id'] for n in screens if any('st-asset-sha256:'+k in packed['documents'].get(n['id'],'') for k in matching)]
   row['result']='PASS' if screens and len(row['linkedScreens'])==len(screens) else 'FAIL';results.append(row)
(Path(os.environ.get('ST_BATCH4_RESULTS',str(H)))/'style-results.json').write_text(json.dumps(results,indent=2)+'\n')
for project in B['projects']:print(project,dict(collections.Counter(r['result'] for r in results if r['project']==project)))
