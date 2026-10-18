"""Analyze only the three new source checkouts; never build or run target code."""
import concurrent.futures,json,pathlib,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE=pathlib.Path('/private/tmp/screentrace-batch2-20261018')
OUT=ROOT/'analyze/workflows-batch2-20261018'
projects=list(json.loads((pathlib.Path(__file__).parent/'baseline.json').read_text())['projects'])
def run(name):
 home=BASE/('home-'+name)
 config=home/'.screentrace/config.json';config.parent.mkdir(parents=True,exist_ok=True)
 config.write_text(json.dumps({'projectRoot':str(BASE/'sources'),'outputRoot':str(OUT)}))
 cmd=['java','-Djava.awt.headless=true',f'-Duser.home={home}',f'-Dscreentrace.home={ROOT}',f'-Dscreentrace.js.module={ROOT}/screentrace-js/cli.mjs','-jar',str(ROOT/'screentrace-cli/target/screentrace-cli-0.1.0-SNAPSHOT.jar'),'analyze',name]
 start=time.monotonic()
 with (OUT/f'{name}.log').open('w') as log:r=subprocess.run(cmd,cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
 return {'project':name,'exitCode':r.returncode,'seconds':round(time.monotonic()-start,2)}
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(run,projects))
 (OUT/'analysis-runs.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
