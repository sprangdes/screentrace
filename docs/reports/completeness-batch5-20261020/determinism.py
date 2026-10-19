"""Compare independent static-analysis runs; no target program executes."""
from pathlib import Path
import json,hashlib,subprocess,shutil
H=Path(__file__).resolve().parent;R=H.parents[2];O=R/'analyze/completeness-batch5-20261020';projects=json.loads((H/'baseline.json').read_text())['projects']
def hashes():
 result={}
 for p in projects:
  for rel in ['application-graph.json','preview-model.json','prototype-model.json','viewer-documents.json','report-size.json','report/screentrace-report.html','static-preview/element-styles.json']:
   f=O/p/rel;result[p+'/'+rel]=dict(bytes=f.stat().st_size,sha256=hashlib.sha256(f.read_bytes()).hexdigest())
  for f in sorted((O/p/'screenshots').glob('*.png')):result[str(f.relative_to(O))]=dict(bytes=f.stat().st_size,sha256=hashlib.sha256(f.read_bytes()).hexdigest())
 return result
first=hashes();(H/'artifact-hashes-first-run.json').write_text(json.dumps(first,indent=2)+'\n');shutil.copyfile(H/'analysis-runs.json',H/'analysis-runs-1.json')
with (H/'determinism-run-2.log').open('w')as log:subprocess.run(['python3',str(H/'analyze.py')],stdout=log,stderr=subprocess.STDOUT,check=True)
second=hashes();shutil.copyfile(H/'analysis-runs.json',H/'analysis-runs-2.json');changed=sorted(k for k in first.keys()|second.keys() if first.get(k)!=second.get(k));(H/'artifact-hashes.json').write_text(json.dumps(second,indent=2)+'\n');result=dict(runs=2,filesPerRun=[len(first),len(second)],changed=changed,result='FAIL' if changed else 'PASS');(H/'determinism.json').write_text(json.dumps(result,indent=2)+'\n');print(result)
