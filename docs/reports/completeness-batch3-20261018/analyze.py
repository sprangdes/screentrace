"""Run ScreenTrace only. The target applications are never built or started."""
import concurrent.futures,json,pathlib,subprocess,time
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[2];OUT=ROOT/'analyze/completeness-batch3-20261018';BASE=pathlib.Path('/private/tmp/screentrace-batch3-20261018');projects=json.loads((HERE/'baseline.json').read_text())['projects']
OUT.mkdir(parents=True,exist_ok=True)
def run(name):
 source=pathlib.Path(projects[name]['sourceRoot']);home=BASE/('home-'+name);config=home/'.screentrace/config.json';config.parent.mkdir(parents=True,exist_ok=True);config.write_text(json.dumps({'projectRoot':str(source.parent),'outputRoot':str(OUT)}))
 cmd=['java','-Djava.awt.headless=true',f'-Duser.home={home}',f'-Dscreentrace.home={ROOT}',f'-Dscreentrace.js.module={ROOT}/screentrace-js/cli.mjs','-jar',str(ROOT/'screentrace-cli/target/screentrace-cli-0.1.0-SNAPSHOT.jar'),'analyze',source.name]
 start=time.monotonic()
 with (OUT/f'{name}.log').open('w') as log:r=subprocess.run(cmd,cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
 return {'project':name,'exitCode':r.returncode,'seconds':round(time.monotonic()-start,2),'command':cmd}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:r=list(pool.map(run,projects))
(HERE/'analysis-runs.json').write_text(json.dumps(r,indent=2));print(json.dumps([{k:v for k,v in x.items() if k!='command'} for x in r],indent=2))
