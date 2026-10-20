import os
"""Compare source-derived destination sets, including private/public and security dispatch boundaries."""
from pathlib import Path
import json,collections
H=Path(__file__).resolve().parent;R=H.parents[2];C=json.loads((H/'source-census.json').read_text());results=[]
S='Student-Management-system';M='Materials-Program-Management';E='Expenses-Tracker-WebApp';s='src/main/webapp/WEB-INF/views/';m='WebRoot/WEB-INF/jsp/basedata/';e='src/main/resources/templates/'
# Finite source oracle from controller return statements and explicit request context expressions.
expected={S:{'home':['index'],'addStudent':['addstudent'],'handleStudent':['index'],'StudentList':['studentlist'],'deleteStudent':['studentlist'],'updateForm':['updateform']},E:{'landingPage':['landing-page'],'addExpense':['add-expense'],'submitAdd':['list-page'],'list':['list-page'],'showUpdate':['update-page'],'update':['list-page'],'delete':['list-page'],'processFilter':['filter-result'],'showRegistrationForm':['registration-page'],'processRegistration':['registration-page','login-page'],'showLoginPage':['login-page']},M:{'/user/login':['WebRoot/index.jsp',m+'item_maint.jsp'],'/basedata/additem':[m+'item_add.jsp'],'/basedata/item':['WebRoot/index.jsp',m+'item_modify.jsp',m+'item_detail.jsp',m+'item_maint.jsp',m+'item_upload.jsp'],'/basedata/changelan':['WebRoot/index.jsp']}}
for project,c in C.items():
 g=json.loads((Path(os.environ.get('ST_BATCH5_OUTPUT',str(R/'analyze/completeness-batch5-20261020')))/project/'application-graph.json').read_text());nodes={n['id']:n for n in g['nodes']}
 routes=c['struts'] if project==M else [r for r in c['java'] if r['kind']=='endpoint']
 for route in routes:
  ident=route['path'] if project==M else route['method'];paths=expected[project][ident];exp=set(paths if project==M else [(s if project==S else e)+p+('.jsp' if project==S else '.html') for p in paths]);todo=[n['id'] for n in g['nodes'] if n['type']=='HANDLER' and (n['attributes'].get('path')==ident if project==M else n['source']['file']==route['file'] and n['attributes'].get('method')==ident)];seen=set();actual=set()
  while todo:
   current=todo.pop()
   if current in seen:continue
   seen.add(current);n=nodes[current]
   if n['type'] in ['SCREEN','VIEW']:
    if n['attributes'].get('view'):actual.add(n['attributes']['view'])
    continue
   todo += [edge['to'] for edge in g['relationships'] if edge['from']==current and edge['type'] in ['RENDERS','FORWARDS_TO','HANDLED_BY','CALLS']]
  results.append(dict(project=project,source=route,expectedTargets=sorted(exp),actualTargets=sorted(actual),missing=sorted(exp-actual),extra=sorted(actual-exp),result='PASS' if exp==actual else 'FAIL'))
(Path(os.environ.get('ST_BATCH5_RESULTS',str(H)))/'return-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
for p in C:print(p,dict(collections.Counter(r['result'] for r in results if r['project']==p)))
