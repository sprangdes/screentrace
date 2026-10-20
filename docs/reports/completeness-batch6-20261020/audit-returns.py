"""Compare source-derived possible physical destinations, without executing guards."""
from pathlib import Path
import json,collections
H=Path(__file__).resolve().parent;R=H.parents[2];O=R/'analyze/completeness-batch6-20261020';C=json.loads((H/'source-census.json').read_text());S='java7-struts1-jquery-bootstrap3-web-project';I='InventoryMGRSpringMVCCRUD';T='springboot-todolist';s='src/main/webapp/';i='WebContent/WEB-INF/';t='src/main/resources/templates/todo/'
# Struts sets are the finite forward closure, intentionally path-insensitive; missing named forwards are separate source defects.
expected={S:{'/home':[s+'home.jsp',s+'login.jsp'],'/login':[s+'home.jsp',s+'login.jsp'],'/users':[s+'home.jsp',s+'login.jsp',s+'user/list.jsp'],'/user/save':[s+'home.jsp',s+'login.jsp',s+'user/list.jsp',s+'user/save/form.jsp'],'/user/user-delete':[s+'home.jsp',s+'login.jsp',s+'user/list.jsp'],'/api/city/by-country':[]},I:{'getInventory':[i+'viewInventory.jsp'],'viewEdit':[i+'editProduct.jsp'],'editByID':[i+'editProduct.jsp',i+'viewInventory.jsp'],'viewAdd':[i+'addProduct.jsp'],'addByID':[i+'addProduct.jsp',i+'viewInventory.jsp'],'viewDelete':[i+'deleteProduct.jsp',i+'viewInventory.jsp'],'viewProduct':[i+'viewProduct.jsp']},T:{'index':[t+'index.html'],'detail':[t+'index.html',t+'detail.html'],'create':[t+'create.html'],'createPost':[t+'create.html',t+'index.html'],'update':[t+'index.html',t+'update.html'],'updatePost':[t+'index.html',t+'update.html'],'delete':[t+'index.html']}}
# Overloaded inventory methods are keyed by their actual endpoint path rather than by name alone.
inventoryPaths={'/DeleteProduct.do':[i+'deleteProduct.jsp'],'/DeleteProductData.do':[i+'viewInventory.jsp'],'/ViewProduct.do':[i+'viewProduct.jsp'],'/ViewProductData.do':[i+'viewProduct.jsp']}
rows=[]
for p,c in C.items():
 g=json.loads((O/p/'application-graph.json').read_text());nodes={n['id']:n for n in g['nodes']}
 for route in c['struts'] if p==S else [x for x in c['java'] if x['kind']=='endpoint']:
  if p==S:start=[n['id'] for n in g['nodes'] if n['type']=='HANDLER' and n['attributes'].get('path')==route['path']];exp=set(expected[p][route['path']])
  else:
   eps=[n['id'] for n in g['nodes'] if n['type']=='ENDPOINT' and n['source']['file']==route['file'] and n['attributes'].get('path')==route['path'] and n['attributes'].get('httpMethod')==route['httpMethod']];start=[e['to'] for e in g['relationships'] if e['type']=='HANDLED_BY' and e['from'] in eps];exp=set(inventoryPaths[route['path']] if p==I and route['path'] in inventoryPaths else expected[p][route['method']])
  todo=list(start);seen=set();actual=set()
  while todo:
   id=todo.pop()
   if id in seen:continue
   seen.add(id);n=nodes[id]
   if n['type'] in ['SCREEN','VIEW']:
    if n['attributes'].get('view'):actual.add(n['attributes']['view'])
    continue
   todo += [e['to'] for e in g['relationships'] if e['from']==id and e['type'] in ['RENDERS','FORWARDS_TO','HANDLED_BY','CALLS']]
  rows.append(dict(project=p,source=route,startHandlers=start,expectedTargets=sorted(exp),actualTargets=sorted(actual),missing=sorted(exp-actual),extra=sorted(actual-exp),result='PASS' if start and exp==actual else 'FAIL'))
(H/'return-results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
for p in C:print(p,dict(collections.Counter(r['result'] for r in rows if r['project']==p)))
