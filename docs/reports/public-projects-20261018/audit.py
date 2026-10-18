from pathlib import Path
import json,collections,subprocess
base=Path('/private/tmp/screentrace-public-20261018')
names=['mailreader','cookbook','spring-mvc-jsp-petclinic','spring-boot-todo-jsp','spring-boot-realworld-example-app']
realworld=['DELETE /articles/{slug}','DELETE /articles/{slug}/comments/{id}','DELETE /articles/{slug}/favorite','DELETE /profiles/{username}/follow','GET /articles','GET /articles/feed','GET /articles/{slug}','GET /articles/{slug}/comments','GET /profiles/{username}','GET /tags','GET /user','POST /articles','POST /articles/{slug}/comments','POST /articles/{slug}/favorite','POST /profiles/{username}/follow','POST /users','POST /users/login','PUT /articles/{slug}','PUT /user']
todo=['GET /','GET /common/error/{code}','GET /todos','GET /todos/','GET /todos/dashboard','GET /todos/new','GET /todos/{id}','GET /todos/{id}/delete','GET /todos/{id}/done','POST /todos/save']
results=[]
for name in names:
 out=base/'output'/name;g=json.loads((out/'application-graph.json').read_text());v=json.loads((out/'preview-model.json').read_text())
 source=base/'sources'/('struts1/apps/'+name if name in ['mailreader','cookbook'] else name)
 ids=[n['id'] for n in g['nodes']];assert len(ids)==len(set(ids))
 assert all(e['from'] in ids and e['to'] in ids for e in g['relationships'])
 bad=[]
 for item in g['nodes']+g['relationships']+g.get('behaviors',[])+g.get('validationRules',[]):
  for ev in item.get('evidence',[]):
   s=ev['source'];f=source/s['file']
   if s['file'].startswith('workspace:'):continue
   if not f.is_file() or not (1<=s['line']<=len(f.read_bytes().splitlines())):bad.append(s)
 print(name, 'non-file evidence:',bad) if bad else None
 endpoints=sorted(n['name'] for n in g['nodes'] if n['type']=='ENDPOINT')
 if name=='spring-boot-realworld-example-app':assert endpoints==sorted(realworld)
 if name=='spring-boot-todo-jsp':assert endpoints==sorted(todo)
 repo=base/'sources'/('struts1' if name in ['mailreader','cookbook'] else name)
 status=subprocess.check_output(['git','-C',str(repo),'status','--porcelain','--untracked-files=all'],text=True);assert not status
 runs=json.loads((base/f'{name}-runs.json').read_text());assert runs['identical'];assert all(r['exitCode']==0 for r in runs['runs'])
 screens=v.get('screens',[])
 results.append(dict(project=name,commit=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip(),nodeCounts=dict(collections.Counter(n['type'] for n in g['nodes'])),relationships=len(g['relationships']),behaviors=len(g.get('behaviors',[])),diagnosticCounts=dict(collections.Counter(d['code'] for d in g.get('diagnostics',[]))),previewScreens=len(screens),thumbnails=sum(bool(s.get('thumbnail')) for s in screens),missingDocuments=sum(not s.get('staticDocument') for s in screens),endpoints=endpoints,sourceEvidenceCheck='PASS' if not bad else 'NON_FILE_SOURCE',nonFileEvidence=bad,targetUnchanged=True,reportBytes=(out/'report/screentrace-report.html').stat().st_size,repeat=runs))
(base/'audit.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('Completed: source evidence exceptions recorded; 5 graphs, unchanged sources, 29 Spring routes and deterministic repeats checked')
