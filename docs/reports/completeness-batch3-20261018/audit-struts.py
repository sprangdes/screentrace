"""Check every configured Struts action's possible terminal JSP set."""
import json
from pathlib import Path
h=Path(__file__).resolve().parent;r=h.parents[2];p='contract-management-system'
s=json.loads((h/'source-census.json').read_text())[p];g=json.loads((r/'analyze/completeness-batch3-20261018'/p/'application-graph.json').read_text());nodes={n['id']:n for n in g['nodes']};actions={a['path']:a for a in s['struts']}
def expected(a,seen=()):
 if a['path'] in seen:return set()
 out=set()
 for f in a['forwards']:
  path=f['path']
  if path.endswith('.jsp'):out.add('src/main/webapp'+path)
  elif path.endswith('.do') and path[:-3] in actions:out|=expected(actions[path[:-3]],seen+(a['path'],))
 return out
results=[]
for a in actions.values():
 todo=[n['id'] for n in nodes.values() if n['type']=='HANDLER' and n['attributes'].get('path')==a['path']];seen=set();actual=set()
 while todo:
  n=todo.pop()
  if n in seen:continue
  seen.add(n);v=nodes[n]
  if v['type']=='SCREEN':actual.add(v['attributes']['view']);continue
  todo.extend(e['to'] for e in g['relationships'] if e['from']==n and e['type'] in ['FORWARDS_TO','RENDERS','HANDLED_BY'])
 exp=expected(a);results.append(dict(source=a,expectedViews=sorted(exp),actualViews=sorted(actual),result='PASS' if exp==actual else 'FAIL'))
(h/'struts-return-results.json').write_text(json.dumps(results,indent=2)+'\n');print(len(results),sum(r['result']=='PASS' for r in results),'pass')
