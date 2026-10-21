"""Compare pinned sources, frozen original artifacts and the reports actually tested."""
from pathlib import Path
import json,hashlib,subprocess
A=Path(__file__).resolve().parent;H=A.parent;R=H.parents[2];O=R/'analyze/completeness-batch5-fixed-20261020';B=json.loads((H/'baseline.json').read_text())
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
sources=[]
for project,meta in B['projects'].items():
 root=Path(meta['checkoutRoot']);before=B['sourceHashes'][project];after={str(f.relative_to(root)):sha(f) for f in root.rglob('*') if f.is_file() and '.git' not in f.relative_to(root).parts};sources.append(dict(project=project,files=len(before),unchanged=before==after,gitStatus=subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True)))
(A/'source-integrity.json').write_text(json.dumps(sources,indent=2)+'\n');assert all(r['unchanged'] and not r['gitStatus'] for r in sources)
frozen=json.loads((H/'artifact-hashes.json').read_text());original=[dict(file=name,matches=sha(R/'analyze/completeness-batch5-20261020'/name)==record['sha256']) for name,record in frozen.items()];(A/'original-artifact-integrity.json').write_text(json.dumps(original,indent=2)+'\n');assert all(r['matches'] for r in original)
identities=[]
for suite in ['final/ui-results.json','final/corrected-results.json']:
 for record in json.loads((A/suite).read_text())['infrastructure']:
  for key,relative in [('graphSha256','application-graph.json'),('reportSha256','report/screentrace-report.html')]:identities.append(dict(suite=suite,project=record['project'],file=relative,matches=sha(O/record['project']/relative)==record[key]))
(A/'tested-artifact-identity.json').write_text(json.dumps(identities,indent=2)+'\n');assert all(r['matches'] for r in identities)
print(sum(r['files'] for r in sources),'source files unchanged;',len(original),'original artifacts unchanged;',len(identities),'tested identities match')
