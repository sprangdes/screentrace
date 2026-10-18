"""Compare source-derived expectations with actual graph paths; retain failures."""
from pathlib import Path
import json,collections,sys
HERE=Path(__file__).parent;ROOT=HERE.resolve().parents[2];OUT=ROOT/'analyze/workflows-20261018'
baseline=json.loads((HERE/'baseline.json').read_text());results=[]
def opening_line(case):
 text=(Path(baseline['projects'][case['project']]['sourceRoot'])/case['sourceView']).read_text(errors='replace')
 cursor=0
 while cursor<len(text):
  start=text.find('<',cursor)
  if start<0:break
  quote=None;end=start+1
  while end<len(text):
   char=text[end]
   if quote:
    if char==quote:quote=None
   elif char in ['"',"'"]:quote=char
   elif char=='>':break
   end+=1
  first=text.count('\n',0,start)+1;last=text.count('\n',0,end)+1
  if first<=case['triggerLine']<=last:return first
  cursor=end+1
 return case['triggerLine']
for case in baseline['cases']:
 graph=json.loads((OUT/case['project']/'application-graph.json').read_text());nodes={n['id']:n for n in graph['nodes']}
 components=[n for n in graph['nodes'] if n['type']=='COMPONENT' and n.get('source',{}).get('file')==case['sourceView'] and n.get('source',{}).get('line') in [case['triggerLine'],opening_line(case)]]
 behaviors=[b for b in graph.get('behaviors',[]) if b.get('triggerId') in [n['id'] for n in components]]
 roots={n['id'] for n in components}|{b['targetId'] for b in behaviors if b.get('targetId')}
 seen=set();queue=list(roots)
 while queue:
  id=queue.pop()
  if id in seen:continue
  seen.add(id)
  queue.extend(e['to'] for e in graph['relationships'] if e['from']==id and e['type'] in ['TRIGGERS','CALLS','HANDLED_BY','RENDERS','FORWARDS_TO','REDIRECTS_TO','NAVIGATES_TO'])
 views=sorted(set(nodes[id]['attributes'].get('view','') for id in seen if nodes[id]['type']=='SCREEN'))
 routes=sorted(set(nodes[id]['attributes'].get('path','') for id in seen if nodes[id]['type']=='ENDPOINT'))
 expected=set(case['expectedViews']);missing=sorted(expected-set(views));extra=sorted(set(views)-expected)
 result='PASS' if not missing and not extra else 'FAIL'
 if case['kind']=='api':result='TRACE_PRESENT' if case['expectedRoute'] in routes else 'FAIL'
 elif case['kind']!='navigate':result='FUNCTION_REQUIRES_UI_CHECK'
 results.append({'id':case['id'],'project':case['project'],'result':result,'matchedComponents':[{'id':n['id'],'kind':n['attributes'].get('kind'),'name':n['name']} for n in components],'behaviorTypes':sorted(set(b['type'] for b in behaviors)),'actualViews':views,'actualRoutes':routes,'expectedViews':case['expectedViews'],'missingViews':missing,'extraViews':extra})
((HERE/'after' if '--after' in sys.argv else HERE)/'graph-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
for p in baseline['projects']:print(p,dict(collections.Counter(r['result'] for r in results if r['project']==p)))
