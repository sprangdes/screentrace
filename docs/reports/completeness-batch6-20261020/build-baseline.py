"""Independent source-only census, frozen before running ScreenTrace; never executes targets."""
from source_markup import protect_nested_tags
from pathlib import Path
import json,subprocess,hashlib,xml.etree.ElementTree as ET
from html.parser import HTMLParser
H=Path(__file__).resolve().parent;R=H.parents[2];B=Path('/private/tmp/screentrace-batch6-20261020')
SPECS=[('java7-struts1-jquery-bootstrap3-web-project','maiconfz/java7-struts1-jquery-bootstrap3-web-project','',['src/main/'],'utf-8','java7-struts1-jquery-bootstrap3-web-project'),('InventoryMGRSpringMVCCRUD','chiangs/InventoryMGRSpringMVCCRUD','',['src/','WebContent/'],'utf-8','InventoryMGRSpringMVCCRUD'),('springboot-todolist','Prayzez/springboot-todolist','',['src/main/'],'utf-8','springboot-todolist')]
class Markup(HTMLParser):
 def __init__(self,file):super().__init__(convert_charrefs=False);self.file=file;self.items=[];self.raw=0
 def handle_starttag(self,tag,attributes):
  if tag in ['script','style']:self.raw+=1;return
  if self.raw:return
  a=dict(attributes)
  if tag in ['a','html:link','form','form:form','html:form','button','input','textarea','select','html:text','html:textarea','html:select','html:submit','html:button','html:checkbox','html:hidden','html:password','form:input','form:password','form:textarea','form:select','form:checkbox','form:hidden','form:button','html:reset'] or any(k.startswith('on') for k in a):self.items.append(dict(file=self.file,line=self.getpos()[0],tag=tag,attrs=a))
 def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs)
 def handle_endtag(self,tag):
  if tag in ['script','style']:self.raw=max(0,self.raw-1)
jar=Path.home()/'.m2/repository/com/github/javaparser/javaparser-core/3.26.1/javaparser-core-3.26.1.jar';classes=B/'census-classes';classes.mkdir(exist_ok=True)
subprocess.run(['javac','-cp',str(jar),'-d',str(classes),str(H/'SourceCensus.java')],check=True)
projects={};hashes={};census={};metadata=[]
for name,repo,sub,prefixes,encoding,key in SPECS:
 checkout=B/'sources'/name;root=checkout/sub;metaFile=B/(key+'-metadata.json');meta=json.loads(metaFile.read_text()) if metaFile.exists() else next(r for r in json.loads((H/'non-duplication.json').read_text())['selectionMetadata'] if r['full_name']==repo);assert not meta['fork']
 projects[name]=dict(repository='https://github.com/'+repo,commit=subprocess.check_output(['git','-C',str(checkout),'rev-parse','HEAD'],text=True).strip(),checkoutRoot=str(checkout),sourceRoot=str(root),fork=meta['fork'],sourcePrefixes=prefixes,sourceEncoding=encoding)
 metadata.append({k:meta[k] for k in ['full_name','fork','size','default_branch','html_url']})
 hashes[name]={str(f.relative_to(checkout)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(checkout.rglob('*')) if f.is_file() and '.git' not in f.relative_to(checkout).parts}
 files=[f for f in sorted(root.rglob('*')) if f.is_file() and any(str(f.relative_to(root)).startswith(p) for p in prefixes)];javafiles=[str(f.relative_to(root)) for f in files if f.suffix=='.java'];manifest=B/(name+'-java.txt');manifest.write_text('\n'.join(javafiles));j=[json.loads(l) for l in subprocess.check_output(['java','-cp',str(classes)+':'+str(jar),'SourceCensus',str(root),str(manifest),encoding],text=True).splitlines()]
 views=[];controls=[];configs=[];scripts=[]
 for f in files:
  rel=str(f.relative_to(root))
  if f.suffix not in ['.jsp','.jspf','.html','.xml','.js']:continue
  try:text=f.read_text(encoding=encoding)
  except UnicodeDecodeError:text=f.read_text(encoding='utf-8')
  if f.suffix in ['.jsp','.jspf','.html']:
   views.append(dict(file=rel,line=1));p=Markup(rel);p.feed(protect_nested_tags(text));controls+=p.items
  if f.suffix=='.js':scripts.append(dict(file=rel,sha256=hashlib.sha256(f.read_bytes()).hexdigest()))
  if f.name=='struts-config.xml':
   tree=ET.fromstring(text)
   for action in tree.findall('.//action'):
    line=next(i for i,s in enumerate(text.splitlines(),1) if '<action ' in s and '"'+action.get('path')+'"' in s)
    start=sum(len(x)+1 for x in text.splitlines()[:line-1]);lineEnd=line+text[start:text.index('>',start)].count('\n')
    configs.append(dict(kind='strutsAction',file=rel,line=line,lineEnd=lineEnd,**action.attrib,forwards=[x.attrib for x in action.findall('forward')]))
 census[name]=dict(javaFilesParsed=len(javafiles),java=j,views=views,controls=controls,struts=configs,scripts=scripts)
previous=json.loads((H.parent/'completeness-batch5-20261020/non-duplication.json').read_text());exclusions=sorted(set(previous['previousRepositories']+previous['selectedRepositories']));selected=[p['repository'] for p in projects.values()];intersection=sorted(set(exclusions)&set(selected));assert not intersection
if (H/'baseline.json').exists():
 frozen=json.loads((H/'baseline.json').read_text());assert frozen['sourceHashes']==hashes,'Frozen source hashes changed; do not replace the baseline';assert {p:m['commit'] for p,m in frozen['projects'].items()}=={p:m['commit'] for p,m in projects.items()},'Pinned commits changed'
(H/'baseline.json').write_text(json.dumps(dict(toolCommit=frozen['toolCommit'] if (H/'baseline.json').exists() else subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),projects=projects,sourceHashes=hashes),ensure_ascii=False,indent=2)+'\n')
(H/'source-census.json').write_text(json.dumps(census,ensure_ascii=False,indent=2)+'\n')
(H/'non-duplication.json').write_text(json.dumps(dict(previousRepositories=exclusions,selectedRepositories=selected,intersection=intersection,allSelectedNonFork=True,selectionMetadata=metadata),indent=2)+'\n')
for name,c in census.items():print(name,'views',len(c['views']),'controls',len(c['controls']),'routes',len(c['struts'])+sum(x['kind']=='endpoint' for x in c['java']),'parseErrors',sum(x['kind']=='parseError' for x in c['java']))
