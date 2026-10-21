"""Freeze and compare complete generated artifacts; excludes only CLI timing logs."""
from pathlib import Path
import hashlib,json,sys
H=Path(__file__).resolve().parent;R=H.parents[2];O=R/'analyze/completeness-batch3-fixed-20261018';D=H/'after'
projects=json.loads((H/'baseline.json').read_text())['projects']
def digest(p):return {'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
files={str(p.relative_to(O)):digest(p) for name in projects for p in sorted((O/name).rglob('*')) if p.is_file()}
structure={}
for name in projects:
 for file in ['application-graph.json','preview-model.json','static-preview/element-styles.json']:
  value=json.loads((O/name/file).read_text())
  if file!='application-graph.json':
   screens=value.get('screens',{})
   for screen in screens.values() if isinstance(screens,dict) else screens:
    screen.pop('thumbnail',None)
  structure[name+'/'+file]=hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
if '--snapshot' in sys.argv:
 (D/'determinism-run1-structure.json').write_text(json.dumps(structure,indent=2)+'\n')
 (D/'determinism-run1.json').write_text(json.dumps(files,indent=2)+'\n');print('Snapshot',len(files),'files')
else:
 before=json.loads((D/'determinism-run1.json').read_text());result={'files':len(files),'changed':[k for k in sorted(before.keys()&files.keys()) if before[k]!=files[k]],'added':sorted(files.keys()-before.keys()),'removed':sorted(before.keys()-files.keys())}
 previousStructure=json.loads((D/'determinism-run1-structure.json').read_text());result['structureChangedExcludingThumbnails']=[k for k in sorted(structure) if previousStructure.get(k)!=structure[k]]
 result['canonicalGraphChanged']=[k for k in result['changed'] if k.endswith('/application-graph.json')]
 (D/'determinism-results.json').write_text(json.dumps(result,indent=2)+'\n')
 (D/'artifact-hashes.json').write_text(json.dumps({'jar':digest(R/'screentrace-cli/target/screentrace-cli-0.1.0-SNAPSHOT.jar'),'generatedFiles':files},indent=2)+'\n')
 print(json.dumps(result));raise SystemExit(1 if any(result[k] for k in ['changed','added','removed']) else 0)
