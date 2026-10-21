import os
"""Compare the independent complete source inventory against canonical output."""
from pathlib import Path
import json,collections
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];OUT=Path(os.environ.get('ST_BATCH6_OUTPUT',str(ROOT/'analyze/completeness-batch6-20261020')));baseline=json.loads((HERE/'baseline.json').read_text());census=json.loads((HERE/'source-census.json').read_text());js=json.loads((HERE/'js-census.json').read_text());results={}
for project,source in census.items():
 g=json.loads((OUT/project/'application-graph.json').read_text());nodes=g['nodes'];backend=[n for n in nodes if n['type']=='ENDPOINT' and n.get('attributes',{}).get('origin')!='javascript-request'];endpoints=[];matched=set()
 for route in [n for n in source['java'] if n['kind']=='endpoint']+source['struts']:
  matches=[]
  for n in backend:
   a=n['attributes'];loc=n.get('source',{})
   if loc.get('file')!=route['file'] or not route['line']<=loc.get('line',0)<=route.get('lineEnd',route['line']):continue
   if route['kind']=='strutsAction':okay=a.get('logicalPath')==route['path']
   else:okay=a.get('path')==route['path'] and route['httpMethod'] in a.get('httpMethod','ANY').replace('|',',').split(',')
   if okay:matches.append(n['id']);matched.add(n['id'])
  endpoints.append({'source':route,'matchedNodes':matches,'result':'PRESENT' if matches else 'MISSING'})
 views=[]
 for view in source['views']:
  matches=[n for n in nodes if n['type'] in ['SCREEN','VIEW','TEMPLATE_FRAGMENT'] and (n.get('attributes',{}).get('view')==view['file'] or n.get('source',{}).get('file')==view['file'])]
  views.append({'source':view,'matchedNodes':[n['id'] for n in matches],'types':sorted({n['type'] for n in matches}),'result':'PRESENT' if matches else 'MISSING'})
 controls=[];used=set()
 for control in source['controls']:
  matches=[]
  for n in nodes:
   if n['id'] in used or n['type']!='COMPONENT':continue
   loc=n.get('source',{});a=n['attributes']
   if loc.get('file')!=control['file'] or loc.get('line')!=control['line'] or a.get('tag','').lower()!=control['tag']:continue
   if any(control['attrs'].get(key) and a.get(key) and control['attrs'][key]!=a[key] for key in (['id','property','path'] if control['attrs'].get('th:field') else ['id','name','property','path'])):continue
   matches.append(n)
  n=matches[0] if matches else None
  if n:used.add(n['id'])
  controls.append({'source':control,'matchedNode':n['id'] if n else None,'result':'PRESENT' if n else 'MISSING'})
 requests=[]
 for call in [x for x in js['rows'] if x['project']==project and x['kind']=='request']:
  matches=[]
  for b in g.get('behaviors',[]):
   if b['type']!='CALL_API':continue
   for e in b.get('evidence',[]):
    if e.get('source',{}).get('file')==call['file'] and e.get('source',{}).get('line')==call['line'] and e.get('parser')=='AcornStaticAnalyzer':matches.append(b);break
  requests.append({'source':call,'matchedBehaviors':[b['id'] for b in matches],'targetIds':sorted({b['targetId'] for b in matches if b.get('targetId')}),'result':'PRESENT' if matches else 'MISSING'})
 # Evidence is checked as traceability, independently of route correctness or confidence.
 traced=[n for n in nodes if n['type'] in ['SCREEN','VIEW','TEMPLATE_FRAGMENT','COMPONENT','ENDPOINT','HANDLER']];missingProof=[n['id'] for n in traced if not n.get('evidence') or not n.get('source',{}).get('file') or n.get('source',{}).get('line',0)<1]
 framework=[]
 for route in [r for r in source['java'] if r['kind']=='frameworkEndpoint']:
  matches=[n['id'] for n in backend if n['attributes'].get('path')==route['path']];framework.append({'source':route,'matchedNodes':matches,'result':'PRESENT' if matches else 'MISSING'})
 summary={'frameworkEntryPoints':{'source':len(framework),'present':sum(x['result']=='PRESENT' for x in framework)},'views':{'source':len(views),'present':sum(x['result']=='PRESENT' for x in views)},'routes':{'source':len(endpoints),'present':sum(x['result']=='PRESENT' for x in endpoints)},'controls':{'source':len(controls),'present':sum(x['result']=='PRESENT' for x in controls)},'jsRequests':{'source':len(requests),'present':sum(x['result']=='PRESENT' for x in requests)},'nodesMissingSourceEvidence':missingProof,'unmatchedBackendEndpoints':[{'id':n['id'],'attributes':n['attributes'],'source':n.get('source'),'confidence':n['confidence']} for n in backend if n['id'] not in matched],'graphNodesByType':dict(collections.Counter(n['type'] for n in nodes)),'diagnosticsByCode':dict(collections.Counter(d.get('code','noCode') for d in g.get('diagnostics',[])))}
 results[project]={'summary':summary,'frameworkEntryPoints':framework,'views':views,'endpoints':endpoints,'controls':controls,'jsRequests':requests}
 print(project,json.dumps(summary,ensure_ascii=False))
(Path(os.environ.get('ST_BATCH6_RESULTS',str(HERE)))/'census-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
