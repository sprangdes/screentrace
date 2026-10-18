"""Independent source possible-view union audit, not evaluation of branch predicates."""
import json
from pathlib import Path
H=Path(__file__).resolve().parent; R=H.parents[2]
census=json.loads((H/'source-census.json').read_text()); results=[]
for project,c in census.items():
 g=json.loads((R/'analyze/completeness-batch3-20261018'/project/'application-graph.json').read_text());nodes={n['id']:n for n in g['nodes']}
 if not c['java']:continue
 records=c['java']; eps=[r for r in records if r['kind']=='endpoint']; views={v['file'] for v in c['views']}
 def source_targets(ep,seen=()):
  key=(ep['file'],ep['method'])
  if key in seen or ep['rest']:return set()
  names=set()
  for r in records:
   if (r.get('file'),r.get('method'))!=key:continue
   if r['kind']=='modelAndView' and r.get('literalView'):names.add(r['literalView'])
   elif r['kind']=='return':
    try:
     v=json.loads(r['expression'])
     if isinstance(v,str):names.add(v)
    except (ValueError,TypeError):pass
  targets=set()
  for name in names:
   if name.startswith('redirect:'):
    route=name[9:].split('?')[0]
    for e in eps:
     if e['path']==route and e['httpMethod'] in ('GET','ANY'):targets|=source_targets(e,seen+(key,))
   else:
    prefix='src/main/resources/templates/' if project=='airline_system' else ('web/WEB-INF/jsp/' if project=='SpringMVC-IMS' else 'src/main/webapp/WEB-INF/jsp/')
    v=prefix+name+('.html' if project=='airline_system' else '.jsp')
    if v in views:targets.add(v)
  return targets
 for ep in eps:
  expected=source_targets(ep)
  if ep['rest']:continue
  handlers=[n['id'] for n in g['nodes'] if n['type']=='HANDLER' and n.get('source',{}).get('file')==ep['file'] and n['attributes'].get('method')==ep['method']]
  todo=handlers[:];seen=set();actual=set()
  while todo:
   nid=todo.pop()
   if nid in seen:continue
   seen.add(nid);n=nodes[nid]
   if n['type'] in ('SCREEN','VIEW'):
    if n['attributes'].get('view') in views:actual.add(n['attributes']['view'])
    continue
   todo.extend(e['to'] for e in g['relationships'] if e['from']==nid and e['type'] in ('RENDERS','FORWARDS_TO','HANDLED_BY'))
  results.append(dict(project=project,endpoint=ep,expectedViews=sorted(expected),actualViews=sorted(actual),missing=sorted(expected-actual),extra=sorted(actual-expected),result='PASS' if expected==actual else 'FAIL',basis=[r for r in records if r['kind'] in ('return','modelAndView') and r['file']==ep['file'] and r['method']==ep['method']]))
(H/'return-results.json').write_text(json.dumps(results,indent=2,ensure_ascii=False)+'\n')
for project in census:
 rs=[r for r in results if r['project']==project];print(project,len(rs),sum(r['result']=='PASS' for r in rs),'pass',sum(len(r['missing']) for r in rs),'missing',sum(len(r['extra']) for r in rs),'extra')
