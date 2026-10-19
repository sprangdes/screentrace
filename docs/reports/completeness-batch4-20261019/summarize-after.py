"""Summarize unchanged source assertions; failed/invalid cases remain in raw results."""
from pathlib import Path
import collections,hashlib,json
H=Path(__file__).resolve().parent;D=H/'after';R=H.parents[2];OUT=R/'analyze/completeness-batch4-fixed-20261019'
integrity=json.loads((D/'source-integrity.json').read_text());historical=json.loads((D/'baseline-artifact-integrity.json').read_text());assert all(not any(r[k] for k in ['changed','added','removed','gitStatus']) for r in integrity);assert not historical['changedOrMissing']
ui=json.loads((D/'ui-results.json').read_text());supp=json.loads((D/'supplementary-results.json').read_text());returns=json.loads((D/'return-results.json').read_text());styles=json.loads((D/'style-results.json').read_text());count=lambda rows:dict(collections.Counter(r['result'] for r in rows))
identities=[]
for record in ui['infrastructure']:
 for key,relative in [('graphSha256','application-graph.json'),('reportSha256','report/screentrace-report.html')]:
  actual=hashlib.sha256((OUT/record['project']/relative).read_bytes()).hexdigest();identities.append({'project':record['project'],'file':relative,'matches':actual==record.get(key)})
for key,relative in [('graphSha256','application-graph.json'),('reportSha256','report/screentrace-report.html')]:
 actual=hashlib.sha256((OUT/'Hotel-Management-System-Spring-Boot'/relative).read_bytes()).hexdigest();identities.append({'project':'Hotel-Management-System-Spring-Boot','suite':'supplementary','file':relative,'matches':actual==supp.get(key)})
(D/'ui-tested-artifact-identity.json').write_text(json.dumps(identities,indent=2)+'\n');assert all(i['matches'] for i in identities)
valid=[c for c in ui['cases'] if c['id']!='H11']+[c for c in supp['results'] if c['id'] in ['X01','X02','X04']]
summary={'status':'PARTIAL_FUNCTIONAL_EQUIVALENCE','validChecks':count(valid),'validDenominator':len(valid),'originalCasesUnchanged':count(ui['cases']),'originalJourneysUnchanged':count(ui['journeys']),'supplementaryUnchangedPlusX04':count(supp['results']),'invalidOriginalExpectations':['H11','X03'],'unresolvedValidCases':[c['id'] for c in valid if c['result']!='PASS'],'returns':count(returns),'styles':count(styles),'pageErrors':sum(len(p['pageErrors']) for p in ui['infrastructure'])+len(supp['pageErrors']),'httpRequests':sum(len(p['externalRequests']) for p in ui['infrastructure'])+len(supp['externalRequests']),'sourceFilesUnchanged':sum(r['files'] for r in integrity),'baselineArtifactsUnchanged':historical['checked'],'additionalBoundaryChecks':{key:json.loads((D/name).read_text())['result'] for key,name in [('X05','keypress-regression.json'),('X06','disclosure-regression.json')]},'openFindings':['WF-035','WF-036'],'sourceMissingViews':3,'noFrontendAjaxInThisCohort':True,'standardSuite':json.loads((D/'standard-suite.json').read_text())['suites'],'finalBoundaryTests':json.loads((D/'final-boundary-tests.json').read_text())}
(D/'validation-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
review={'H11':{'originalAssertionsPreserved':True,'invalid':['ISO dates instead of source dd-MM-yyyy','unconditional guest-name expectation','phone absent from source success page']},'X03':{'originalAssertionsPreserved':True,'invalid':['phone absent from source success page'],'validDateSubassertions':'both pass after fixes'},'X04':{'checks':['source success view','01-11-2026','03-11-2026'],'result':next(x['result'] for x in supp['results'] if x['id']=='X04')},'source':'src/main/resources/templates/visitor/booking-success.html','sourcePhoneFieldCount':0,'sourceDateLines':[49,53],'X05SourceLineCorrection':{'historicalProbeLine':46,'actualOnkeypressAttributeLine':45,'historicalProbePreserved':True},'historicalResultsNeverRewritten':True}
(D/'source-expectation-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
findings=json.loads((H/'findings.json').read_text())
for finding in findings:
 finding['originalStatus']=finding['status'];finding['status']='SOURCE_MISSING_VIEW' if finding['id']=='SRC-001' else 'OFFLINE_AFFORDANCE_ONLY' if finding['id']=='EXT-001' else 'FIXED_BOUNDED_SCOPE';finding['verification']='after/ui-results.json, after/return-results.json, after/style-results.json, after/supplementary-results.json'
 if finding['id']=='WF-024':finding['remainingDataCase']='L08 tracked separately as WF-036; physical view resolution passes'
 if finding['id']=='WF-027':finding['remainingDataCase']='S09 tracked separately as WF-035; endpoint and destination sets pass'
 if finding['id']=='NC-004':finding['scopeCorrection']='Direct submitted dates pass X04; phone is absent from source, nested guest lookup remains unknown'
findings += [{'id':'WF-034','project':'demo-struts1','title':'巢狀 URL 的動態查詢值阻斷已知路徑','status':'FIXED','cases':['S08'],'source':{'file':'src/main/webapp/WEB-INF/view/spotifyListPagination.jsp','line':46}}, {'id':'WF-035','project':'demo-struts1','title':'自訂 Hibernate DAO 成功分支的提交資料未回填到分頁列表','status':'OPEN','cases':['S09'],'priority':'P1','source':{'file':'src/main/java/com/demo/struts1/action/Spotify/SpotifyCreateAction.java','line':43},'boundary':'No custom DAO / transaction / pagination demonstration contract; never executed'}, {'id':'WF-036','project':'App1Assignment5','title':'外部 HTTP 寫入後 GET 清單的資料回顯尚未支援','status':'OPEN','cases':['L08','LJ2'],'priority':'P1','source':{'file':'src/main/java/com/controller/AddController.java','line':77},'boundary':'No remote HTTP response contract; never contacted the service or guessed persistence success'}]
findings.append({'id':'WF-037','project':'Hotel-Management-System-Spring-Boot','title':'原生 autofocus 的樣式擷取時序不一致','status':'FIXED','source':{'file':'src/main/resources/templates/admin/login.html','line':31},'verification':'after/focus-style-reproduction.json reproduces both exact historical hashes; tool settles unique native autofocus before style capture; target scripts remain disabled'})
findings.append({'id':'WF-038','project':'demo-struts1','title':'離線缺少外部 CSS 時下拉選單初始未收合','status':'FIXED_BOUNDED_SCOPE','source':{'file':'src/main/webapp/WEB-INF/view/common/loadScript.jsp','line':70},'verification':'after/disclosure-before-initial-state-fix.json FAIL; after/disclosure-regression.json PASS; source-proven closed aria state with unique graph-owned disclosure, no explicit local display rule'})
(D/'findings.json').write_text(json.dumps(findings,ensure_ascii=False,indent=2)+'\n')
files={}
for project in json.loads((H/'baseline.json').read_text())['projects']:
 for name in ['application-graph.json','preview-model.json','prototype-model.json','viewer-documents.json','report/screentrace-report.html','report-size.json','static-preview/element-styles.json']:
  p=OUT/project/name
  if p.is_file():data=p.read_bytes();files[project+'/'+name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
jar=R/'screentrace-cli/target/screentrace-cli-0.1.0-SNAPSHOT.jar'
(D/'artifact-hashes.json').write_text(json.dumps({'jar':{'bytes':jar.stat().st_size,'sha256':hashlib.sha256(jar.read_bytes()).hexdigest()},'files':files},indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
