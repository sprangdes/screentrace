from source_markup import protect_nested_tags
from pathlib import Path
from html.parser import HTMLParser
import json
HERE=Path(__file__).resolve().parent;baseline=json.loads((HERE/'baseline.json').read_text());units=[];excluded=[]
class Scripts(HTMLParser):
 def __init__(self,project,file):super().__init__(convert_charrefs=False);self.project=project;self.file=file;self.start=None;self.code=''
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='script' and not a.get('src'):self.start=self.getpos()[0];self.code=''
  for k,v in attrs:
   if k.startswith('on') and v:units.append({'project':self.project,'file':self.file,'line':self.getpos()[0],'event':k[2:],'code':v})
 def handle_data(self,s):
  if self.start is not None:self.code+=s
 def handle_endtag(self,tag):
  if tag=='script' and self.start is not None:
   if self.code.strip():units.append({'project':self.project,'file':self.file,'line':self.start,'code':self.code})
   self.start=None
for project,meta in baseline['projects'].items():
 root=Path(meta['sourceRoot'])
 for f in sorted(root.rglob('*')):
  if not f.is_file():continue
  rel=str(f.relative_to(root))
  if not any(rel.startswith(p) for p in meta['sourcePrefixes']):continue
  if f.suffix in ['.jsp','.html','.jspf']:Scripts(project,rel).feed(protect_nested_tags(f.read_text(encoding=meta['sourceEncoding'])))
  if f.suffix=='.js':
   # Reviewed bundled-library locations/names; never classify a handler by minification alone.
   vendor=('/fontawesome/' in rel or '/plugins/' in rel or '/sweetalert/' in rel or f.name.lower() in {'bootstrap.bundle.js','app.min.js','bootstrap.min.js','fastclick.min.js','jquery-2.1.4.min.js','jquery-3.1.1.min.js','jquery.slimscroll.min.js','sweetalert2.min.js'})
   if vendor:excluded.append({'project':project,'file':rel,'reason':'reviewed bundled library'})
   else:units.append({'project':project,'file':rel,'line':1,'code':f.read_text(encoding=meta['sourceEncoding'])})
Path('/private/tmp/screentrace-batch5-20261020/js-inputs.json').write_text(json.dumps(units))
(HERE/'js-exclusions.json').write_text(json.dumps(excluded,indent=2));print('JS units',len(units),'excluded library files',len(excluded))
