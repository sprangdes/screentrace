"""Targets remain byte-for-byte unchanged; tested reports match the saved artifacts."""
from pathlib import Path
import json,subprocess,hashlib
H=Path(__file__).resolve().parent;R=H.parents[2];b=json.loads((H/'baseline.json').read_text());rows=[]
for p,meta in b['projects'].items():
 root=Path(meta['checkoutRoot']);before=b['sourceHashes'][p];after={str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in root.rglob('*') if f.is_file() and '.git' not in f.relative_to(root).parts};row=dict(project=p,files=len(before),changed=sorted(k for k in before.keys()&after.keys() if before[k]!=after[k]),added=sorted(after.keys()-before.keys()),removed=sorted(before.keys()-after.keys()),gitStatus=subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True));rows.append(row)
(H/'source-integrity.json').write_text(json.dumps(rows,indent=2)+'\n');assert all(not any(r[k] for k in ['changed','added','removed','gitStatus']) for r in rows)
identities=[]
for name in ['ui-results.json','supplementary-results.json']:
 for record in json.loads((H/name).read_text())['infrastructure']:
  for key,relative in [('graphSha256','application-graph.json'),('reportSha256','report/screentrace-report.html')]:
   actual=hashlib.sha256((R/'analyze/completeness-batch6-20261020'/record['project']/relative).read_bytes()).hexdigest();identities.append(dict(suite=name,project=record['project'],file=relative,matches=actual==record[key]))
(H/'tested-artifact-identity.json').write_text(json.dumps(identities,indent=2)+'\n');assert all(r['matches'] for r in identities)
print(sum(r['files'] for r in rows),'source files unchanged;',len(identities),'tested artifact identities match')
