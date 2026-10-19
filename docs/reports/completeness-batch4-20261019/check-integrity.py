import os
"""Compare every target file to the frozen pre-analysis hashes."""
import hashlib,json,subprocess
from pathlib import Path
h=Path(__file__).resolve().parent;b=json.loads((h/'baseline.json').read_text());results=[]
for p,c in b['projects'].items():
 root=Path(c['checkoutRoot']);after={str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in root.rglob('*') if f.is_file() and '.git' not in f.relative_to(root).parts};before=b['sourceHashes'][p]
 results.append(dict(project=p,files=len(before),changed=sorted(k for k in before.keys()&after.keys() if before[k]!=after[k]),added=sorted(after.keys()-before.keys()),removed=sorted(before.keys()-after.keys()),gitStatus=subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True)))
(Path(os.environ.get('ST_BATCH4_RESULTS',str(h)))/'source-integrity.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(not any(r[k] for k in ['changed','added','removed','gitStatus']) for r in results)
print(sum(r['files'] for r in results),'files unchanged')
frozen=json.loads((h/'artifact-hashes.json').read_text())['files'];output=h.parents[2]/'analyze/completeness-batch4-20261019'
changed=[]
for name,record in frozen.items():
 file=output/name
 if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest()!=record['sha256']:changed.append(name)
(Path(os.environ.get('ST_BATCH4_RESULTS',str(h)))/'baseline-artifact-integrity.json').write_text(json.dumps(dict(checked=len(frozen),changedOrMissing=changed),indent=2)+'\n')
assert not changed
print(len(frozen),'original artifacts unchanged')
