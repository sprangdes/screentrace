"""Two independent ScreenTrace runs, preserving the original WP75 outputs."""
from pathlib import Path
import json,hashlib,subprocess,os,shutil
A=Path(__file__).resolve().parent;H=A.parent;R=H.parents[2];O=R/'analyze/completeness-batch5-fixed-20261020';F=A/'final';projects=json.loads((H/'baseline.json').read_text())['projects']
def hashes():
 result={}
 for project in projects:
  for name in ['application-graph.json','preview-model.json','prototype-model.json','viewer-documents.json','report-size.json','report/screentrace-report.html','static-preview/element-styles.json']:
   f=O/project/name;result[str(f.relative_to(O))]=dict(bytes=f.stat().st_size,sha256=hashlib.sha256(f.read_bytes()).hexdigest())
  for f in sorted((O/project/'screenshots').glob('*.png')):result[str(f.relative_to(O))]=dict(bytes=f.stat().st_size,sha256=hashlib.sha256(f.read_bytes()).hexdigest())
 return result
first=hashes();(A/'artifact-hashes-first-run.json').write_text(json.dumps(first,indent=2)+'\n');shutil.copyfile(F/'analysis-runs.json',A/'analysis-runs-1.json')
env={**os.environ,'ST_BATCH5_OUTPUT':str(O),'ST_BATCH5_RESULTS':str(F)}
with (A/'determinism-run-2.log').open('w') as log:subprocess.run(['python3',str(H/'analyze.py')],env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
second=hashes();(A/'artifact-hashes.json').write_text(json.dumps(second,indent=2)+'\n');shutil.copyfile(F/'analysis-runs.json',A/'analysis-runs-2.json');changed=sorted(k for k in first.keys()|second.keys() if first.get(k)!=second.get(k));result=dict(runs=2,filesPerRun=[len(first),len(second)],changed=changed,result='FAIL' if changed else 'PASS');(A/'determinism.json').write_text(json.dumps(result,indent=2)+'\n');print(result);assert not changed
