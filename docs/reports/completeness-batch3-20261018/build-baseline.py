"""Freeze checkouts and independent source census before reading analysis output."""
from pathlib import Path
import json,subprocess,hashlib
from html.parser import HTMLParser
import xml.etree.ElementTree as ET
HERE=Path(__file__).resolve().parent;BASE=Path('/private/tmp/screentrace-batch3-20261018');sources=BASE/'sources'
repos={'contract-management-system':'r-watanabe-02/contract-management-system','Fintech-Finance-Banking-Application':'deep1020/Fintech-Finance-Banking-Application','SpringMVC-IMS':'amiSotun/SpringMVC-IMS','airline_system':'isilkiziltas/airlines_system'}
projects={};hashes={};census={}
class Markup(HTMLParser):
 def __init__(self,file):super().__init__(convert_charrefs=False);self.file=file;self.items=[];self.raw=0
 def handle_starttag(self,tag,attributes):
  if tag in ['script','style']:self.raw+=1;return
  if self.raw:return
  a=dict(attributes)
  if tag in ['a','html:link','form','form:form','html:form','button','input','textarea','select','html:text','html:textarea','html:select','html:submit','html:button','html:checkbox','html:hidden','html:password','form:input','form:password','form:textarea','form:select','form:checkbox','form:hidden','form:button','html:reset'] or any(k.startswith('on') for k in a):self.items.append({'file':self.file,'line':self.getpos()[0],'tag':tag,'attrs':a})
 def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs)
 def handle_endtag(self,tag):
  if tag in ['script','style']:self.raw=max(0,self.raw-1)
jar=Path('/Users/machi/.m2/repository/com/github/javaparser/javaparser-core/3.26.1/javaparser-core-3.26.1.jar');classes=BASE/'census-classes';classes.mkdir(exist_ok=True)
subprocess.run(['javac','-cp',str(jar),'-d',str(classes),str(HERE/'SourceCensus.java')],check=True)
for name,repo in repos.items():
 checkout=sources/('airlines_system' if name=='airline_system' else name);root=checkout/'airline_system' if name=='airline_system' else checkout
 metadata=json.loads(subprocess.check_output(['curl','-fsSL','https://api.github.com/repos/'+repo]));assert not metadata['fork']
 projects[name]={'repository':'https://github.com/'+repo,'commit':subprocess.check_output(['git','-C',str(checkout),'rev-parse','HEAD'],text=True).strip(),'checkoutRoot':str(checkout),'sourceRoot':str(root),'fork':metadata['fork'],'sourcePrefixes':['src/java/','web/'] if name=='SpringMVC-IMS' else ['src/main/']}
 allfiles=[f for f in checkout.rglob('*') if f.is_file() and '.git' not in f.relative_to(checkout).parts]
 hashes[name]={str(f.relative_to(checkout)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(allfiles)}
 files=[f for f in root.rglob('*') if f.is_file() and any(str(f.relative_to(root)).startswith(p) for p in projects[name]['sourcePrefixes'])]
 javafiles=[str(f.relative_to(root)) for f in sorted(files) if f.suffix=='.java'];manifest=BASE/(name+'-java.txt');manifest.write_text('\n'.join(javafiles))
 output=subprocess.check_output(['java','-cp',str(classes)+':'+str(jar),'SourceCensus',str(root),str(manifest)],text=True);java=[json.loads(line) for line in output.splitlines()]
 views=[];controls=[];configs=[]
 for f in sorted(files):
  rel=str(f.relative_to(root));text=f.read_text(errors='replace') if f.suffix in ['.jsp','.jspf','.html','.xml'] else ''
  if f.suffix in ['.jsp','.jspf','.html']:
   views.append({'file':rel,'line':1});parser=Markup(rel);parser.feed(text);controls+=parser.items
  if f.name=='struts-config.xml':
   tree=ET.fromstring(text)
   for action in tree.findall('.//action'):
    line=next(i for i,s in enumerate(text.splitlines(),1) if '<action ' in s and '"'+action.get('path')+'"' in s)
    configs.append({'kind':'strutsAction','file':rel,'line':line,**action.attrib,'forwards':[x.attrib for x in action.findall('forward')]})
 census[name]={'javaFilesParsed':len(javafiles),'java':java,'views':views,'controls':controls,'struts':configs}
(HERE/'baseline.json').write_text(json.dumps({'toolCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'projects':projects,'sourceHashes':hashes},ensure_ascii=False,indent=2))
(HERE/'source-census.json').write_text(json.dumps(census,ensure_ascii=False,indent=2))
for p,c in census.items():print(p,'views',len(c['views']),'controls',len(c['controls']),'endpoints',sum(x['kind']=='endpoint' for x in c['java'])+len(c['struts']),'parseErrors',sum(x['kind']=='parseError' for x in c['java']))
