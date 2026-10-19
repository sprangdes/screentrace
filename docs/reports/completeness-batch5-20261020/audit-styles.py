"""Source-proven resource locations and screen inclusion; never fetch external assets."""
from pathlib import Path
from html.parser import HTMLParser
from source_markup import protect_nested_tags
import json,base64,collections,posixpath
H=Path(__file__).resolve().parent;R=H.parents[2];B=json.loads((H/'baseline.json').read_text());C=json.loads((H/'source-census.json').read_text());results=[]
class Tags(HTMLParser):
 def __init__(self):super().__init__();self.tags=[]
 def handle_starttag(self,tag,attrs):self.tags.append((tag,dict(attrs),self.getpos()[0]))
for project,meta in B['projects'].items():
 root=Path(meta['sourceRoot']);o=R/'analyze/completeness-batch5-20261020'/project;g=json.loads((o/'application-graph.json').read_text());packed=json.loads((o/'viewer-documents.json').read_text());assets={k:base64.b64decode(v.split(',',1)[1]).decode(errors='replace').replace('\r\n','\n') for k,v in packed['assets'].items() if v.startswith('data:text/css;base64,')}
 for view in C[project]['views']:
  file=view['file'];text=(root/file).read_text(encoding=meta['sourceEncoding']);parser=Tags();parser.feed(protect_nested_tags(text))
  for tag,a,line in parser.tags:
   if tag!='link' or a.get('rel')!='stylesheet':continue
   raw=a.get('th:href',a.get('href',''));row=dict(project=project,file=file,line=line,original=raw)
   if raw.startswith(('http:','https:','//')):row['result']='EXTERNAL_NOT_FETCHED';results.append(row);continue
   uri=raw[2:-1] if raw.startswith('@{') and raw.endswith('}') else raw
   if uri.startswith('<c:url') or uri.startswith('<spring:url'):
    p=Tags();p.feed(uri);uri=p.tags[0][1].get('value','')
   if project=='Materials-Program-Management':
    # All five private JSPs are forwarded from /basedata/item.do; ../style is rooted at public WebRoot/style.
    resource='WebRoot/'+posixpath.normpath(posixpath.join('basedata',uri))
   elif project=='Student-Management-system':resource='src/main/webapp/WEB-INF/resources/'+uri.removeprefix('/resources/')
   else:resource='src/main/resources/static/'+uri.lstrip('/')
   row['resource']=resource
   if not(root/resource).is_file():row['result']='SOURCE_MISSING_STYLE';results.append(row);continue
   css=(root/resource).read_text(encoding=meta['sourceEncoding']).replace('\r\n','\n');prefix=css.strip()[:256];matching=[k for k,v in assets.items() if prefix in v];owners=[file]
   if file.endswith('/base.jsp'):owners=[v['file'] for v in C[project]['views'] if './base.jsp' in(root/v['file']).read_text(encoding=meta['sourceEncoding'])]
   screens=[n for n in g['nodes'] if n['type']=='SCREEN' and n['attributes'].get('view') in owners];row.update(expectedConsumers=owners,screens=[n['id'] for n in screens],packedMatchingCssAssets=matching,linkedScreens=[n['id'] for n in screens if any('st-asset-sha256:'+k in packed['documents'].get(n['id'],'') for k in matching)]);row['result']='PASS' if screens and len(row['linkedScreens'])==len(screens) else 'FAIL';results.append(row)
(H/'style-results.json').write_text(json.dumps(results,indent=2)+'\n')
for p in C:print(p,dict(collections.Counter(r['result'] for r in results if r['project']==p)))
