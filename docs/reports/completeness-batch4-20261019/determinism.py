"""Two independent JVM/capture runs of the trusted analyzer; target source is inert."""
from pathlib import Path
import os,subprocess,json,hashlib,shutil
H=Path(__file__).resolve().parent;R=H.parents[2];D=H/'after';OUT=R/'analyze/completeness-batch4-fixed-20261019';env={**os.environ,'ST_BATCH4_OUTPUT':str(OUT),'ST_BATCH4_RESULTS':str(D)}
projects=json.loads((H/'baseline.json').read_text())['projects'];snapshots=[]
runs=int(os.environ.get("ST_DETERMINISM_RUNS","2"));assert 2<=runs<=10
for run in range(runs):
 with (D/f'determinism-run-{run+1}.log').open('w')as log:subprocess.run(['python3',str(H/'analyze.py')],cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
 records=json.loads((D/'analysis-runs.json').read_text());assert all(r['exitCode']==0 for r in records);(D/f'analysis-runs-{run+1}.json').write_text(json.dumps(records,indent=2)+'\n');files={}
 for name in projects:
  for relative in ['application-graph.json','preview-model.json','prototype-model.json','viewer-documents.json','report/screentrace-report.html','report-size.json','static-preview/element-styles.json']:
   p=OUT/name/relative;assert p.is_file(),p;files[name+'/'+relative]=hashlib.sha256(p.read_bytes()).hexdigest()
  for p in sorted((OUT/name/'screenshots').glob('*.png')):files[str(p.relative_to(OUT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 snapshots.append(files)
 debug=Path('/private/tmp/st-batch4-determinism-debug')/str(run+1)
 for name in projects:
  for rel in ['application-graph.json','static-preview/element-styles.json','preview-model.json']:
   target=debug/name/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(OUT/name/rel,target)
changed=sorted({k for snapshot in snapshots[1:] for k in snapshots[0].keys()|snapshot.keys() if snapshots[0].get(k)!=snapshot.get(k)});result={'runs':runs,'filesPerRun':list(map(len,snapshots)),'changed':changed,'hashes':snapshots,'result':'PASS' if not changed else 'FAIL'}
(D/'determinism.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='hashes'},indent=2));assert not changed
