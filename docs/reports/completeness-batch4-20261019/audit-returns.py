import os
"""Independent finite source-view union; never evaluates predicates or calls product code."""
from pathlib import Path
import json,xml.etree.ElementTree as ET,collections
H=Path(__file__).resolve().parent;R=H.parents[2];B=json.loads((H/'baseline.json').read_text());C=json.loads((H/'source-census.json').read_text());results=[];sourceIssues=[]
def key(n):
 a=n.get('attributes',{});return 'tile:'+a['tilesDefinitionName'] if a.get('tilesDefinitionName') else 'file:'+a.get('view','')
for project,c in C.items():
 root=Path(B['projects'][project]['sourceRoot']);g=json.loads((Path(os.environ.get('ST_BATCH4_OUTPUT',str(R/'analyze/completeness-batch4-20261019')))/project/'application-graph.json').read_text());nodes={n['id']:n for n in g['nodes']};views={v['file'] for v in c['views']};eps=[r for r in c['java'] if r['kind']=='endpoint'];records=c['java']
 def physical(name):
  if project=='Hotel-Management-System-Spring-Boot':return 'src/main/resources/templates/'+name+'.html'
  return 'src/main/webapp/'+name+'.jsp'
 def expected_java(ep,seen=()):
  ident=(ep['file'],ep['method']);found=set();missing=set()
  if ident in seen or ep['rest']:return found,missing
  names=set()
  for row in records:
   if (row.get('file'),row.get('method'))!=ident:continue
   if row['kind']in ['modelAndView','viewAssignment'] and row.get('literalView'):names.add(row['literalView'])
   if row['kind']=='return':
    try:
     v=json.loads(row['expression'])
     if isinstance(v,str):names.add(v)
    except (ValueError,TypeError):pass
  for name in names:
   if name.startswith('redirect:') or name.startswith('forward:'):
    target=name.split(':',1)[1].split('?')[0];routes=[e for e in eps if e['path']==target and e['httpMethod'] in ['GET','ANY']]
    for route in routes:
     a,b=expected_java(route,seen+(ident,));found|=a;missing|=b
    if not routes:
     direct='src/main/webapp/'+target.lstrip('/')
     if direct in views:found.add('file:'+direct)
     else:missing.add(name)
   elif physical(name)in views:found.add('file:'+physical(name))
   else:missing.add(name)
  return found,missing
 def actual(handlers):
  todo=handlers[:];seen=set();found=set()
  while todo:
   nid=todo.pop()
   if nid in seen:continue
   seen.add(nid);n=nodes[nid]
   if n['type'] in ['SCREEN','VIEW']:
    found.add(key(n));continue
   todo.extend(e['to'] for e in g['relationships'] if e['from']==nid and e['type'] in ['RENDERS','FORWARDS_TO','HANDLED_BY'])
  return found
 for ep in eps:
  if ep['rest']:continue
  exp,missing=expected_java(ep);a=actual([n['id'] for n in nodes.values() if n['type']=='HANDLER' and n['source']['file']==ep['file'] and n['attributes'].get('method')==ep['method']]);status='SOURCE_MISSING_VIEW' if missing else 'PASS' if exp==a else 'FAIL'
  results.append({'project':project,'source':ep,'expectedTargets':sorted(exp),'actualTargets':sorted(a),'missing':sorted(exp-a),'extra':sorted(a-exp),'sourceMissingViews':sorted(missing),'result':status})
 if c['struts']:
  config=root/'src/main/webapp/WEB-INF/tiles-defs.xml';tiles={x.get('name'):x for x in ET.parse(config).getroot().findall('definition')};actions={a['path']:a for a in c['struts']}
  def struts(a,seen=()):
   if a['path'] in seen:return set()
   found=set();destinations=[f['path'] for f in a['forwards']]+[a[k] for k in ['forward','input'] if a.get(k)]
   for target in destinations:
    if target in tiles:found.add('tile:'+target)
    elif target.endswith('.jsp'):found.add('file:src/main/webapp'+target)
    elif target.endswith('.do') and target[:-3] in actions:found|=struts(actions[target[:-3]],seen+(a['path'],))
   return found
  for action in c['struts']:
   exp=struts(action);a=actual([n['id'] for n in nodes.values() if n['type']=='HANDLER' and n['attributes'].get('path')==action['path']]);results.append({'project':project,'source':action,'expectedTargets':sorted(exp),'actualTargets':sorted(a),'missing':sorted(exp-a),'extra':sorted(a-exp),'result':'PASS' if exp==a else 'FAIL'})
(Path(os.environ.get('ST_BATCH4_RESULTS',str(H)))/'return-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
for project in C:print(project,dict(collections.Counter(r['result'] for r in results if r['project']==project)))
