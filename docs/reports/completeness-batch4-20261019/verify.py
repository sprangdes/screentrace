"""Run trusted ScreenTrace checks. Never builds or executes the three target projects."""
from pathlib import Path
import concurrent.futures,json,subprocess,time,xml.etree.ElementTree as ET
H=Path(__file__).resolve().parent;R=H.parents[2];D=H/'after/verification';D.mkdir(parents=True,exist_ok=True)
suites={'java':['mvn','-q','test'],'js':['npm','--prefix','screentrace-js','test'],'capture':['node','--test','--test-concurrency=1',*[str(p.relative_to(R)) for p in sorted((R/'screentrace-capture').glob('*.test.mjs'))]],'viewer':['npm','--prefix','screentrace-viewer','test'],'e2e':['node','--test','--test-concurrency=1',*[str(p.relative_to(R)) for p in sorted((R/'screentrace-viewer/test').glob('*.e2e.mjs'))]]}
def run(item):
 name,cmd=item;start=time.monotonic()
 with (D/(name+'.log')).open('w') as log:r=subprocess.run(cmd,cwd=R,stdout=log,stderr=subprocess.STDOUT)
 result=dict(suite=name,exitCode=r.returncode,seconds=round(time.monotonic()-start,2),command=cmd)
 if name!='java':
  text=(D/(name+'.log')).read_text();result['counts']={k:int(next((l.rsplit(' ',1)[-1] for l in reversed(text.splitlines()) if l.startswith('# '+k+' ')),'0')) for k in ['tests','pass','fail','skipped']}
 return result
build=run(('build',['npm','--prefix','screentrace-viewer','run','build']))
if build['exitCode']:raise SystemExit('Viewer build failed')
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,suites.items()))
counts=dict(tests=0,failures=0,errors=0,skipped=0)
for path in sorted(R.glob('*/target/surefire-reports/TEST-*.xml')):
 suite=ET.parse(path).getroot()
 for key in counts:counts[key]+=int(suite.attrib.get(key,'0'))
next(r for r in results if r['suite']=='java')['counts']=counts
(H/'after/standard-suite.json').write_text(json.dumps(dict(build=build,suites=results),indent=2)+'\n');print(json.dumps([dict(suite=r['suite'],exitCode=r['exitCode'],counts=r.get('counts')) for r in results],indent=2))
raise SystemExit(0 if all(r['exitCode']==0 for r in results) else 1)
