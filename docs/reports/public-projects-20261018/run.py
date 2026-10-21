import pathlib,subprocess,json,time,hashlib,concurrent.futures
base=pathlib.Path('/private/tmp/screentrace-public-20261018')
root=pathlib.Path('/Users/machi/IntelliJ/screentrace')
names=['mailreader','cookbook','spring-mvc-jsp-petclinic','spring-boot-todo-jsp','spring-boot-realworld-example-app']
def run(name):
 home=base/('struts-home' if name in ['mailreader','cookbook'] else 'home')
 cmd=['java','-Djava.awt.headless=true',f'-Duser.home={home}',f'-Dscreentrace.home={root}',f'-Dscreentrace.js.module={root}/screentrace-js/cli.mjs','-jar',str(root/'screentrace-cli/target/screentrace-cli-0.1.0-SNAPSHOT.jar'),'analyze',name]
 results=[]
 for i in [1,2]:
  start=time.monotonic()
  with (base/f'{name}-run{i}.log').open('w') as log:
   r=subprocess.run(cmd,cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
  out=base/'output'/name
  hashes={str(f.relative_to(out)):hashlib.sha256(f.read_bytes()).hexdigest() for f in out.rglob('*') if f.is_file() and f.suffix in ['.json','.html']}
  results.append(dict(exitCode=r.returncode,seconds=round(time.monotonic()-start,2),hashes=hashes))
 result=dict(project=name,runs=results,identical=results[0]['hashes']==results[1]['hashes'])
 (base/f'{name}-runs.json').write_text(json.dumps(result,indent=2))
 return {k:v for k,v in result.items() if k!='runs'}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for r in pool.map(run,names):print(json.dumps(r),flush=True)
