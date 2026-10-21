"""Verify exact commits and every original checkout file remains unchanged."""
import hashlib,json,subprocess
from pathlib import Path
here=Path(__file__).parent;b=json.loads((here/'baseline.json').read_text());results=[]
for name,p in b['projects'].items():
 root=Path(p['sourceRoot']);actual={str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in root.rglob('*') if f.is_file() and '.git' not in f.relative_to(root).parts}
 commit=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip();status=subprocess.check_output(['git','-C',str(root),'status','--porcelain','--untracked-files=all'],text=True)
 expected=b['sourceHashes'][name];changed=sorted(k for k in set(actual)|set(expected) if actual.get(k)!=expected.get(k))
 results.append(dict(project=name,commit=commit,commitMatches=commit==p['commit'],filesChecked=len(actual),changedFiles=changed,gitStatus=status,result='PASS' if commit==p['commit'] and not changed and not status else 'FAIL'))
(here/'source-integrity.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
raise SystemExit(0 if all(r['result']=='PASS' for r in results) else 1)
