"""Extract source text as inert JSON for a separate Acorn census."""
from pathlib import Path
from html.parser import HTMLParser
from source_markup import protect_nested_tags
import json
H=Path(__file__).resolve().parent;B=json.loads((H/'baseline.json').read_text());units=[]
class Scripts(HTMLParser):
 def __init__(self,p,f):super().__init__(convert_charrefs=False);self.project=p;self.file=f;self.start=None;self.body=''
 def handle_starttag(self,tag,attributes):
  a=dict(attributes)
  if tag=='script' and not a.get('src'):self.start=self.getpos()[0];self.body=''
  for key,value in a.items():
   if value and (key.startswith('on') or key=='href' and value.lower().startswith('javascript:')):units.append(dict(project=self.project,file=self.file,line=self.getpos()[0],code=value if key.startswith('on') else value[len('javascript:'):],kind='event',attribute=key))
 def handle_data(self,data):
  if self.start is not None:self.body+=data
 def handle_endtag(self,tag):
  if tag=='script' and self.start is not None:units.append(dict(project=self.project,file=self.file,line=self.start,code=self.body,kind='inline'));self.start=None
for p,m in B['projects'].items():
 root=Path(m['sourceRoot'])
 for f in sorted(root.rglob('*')):
  if not f.is_file() or not any(str(f.relative_to(root)).startswith(x) for x in m['sourcePrefixes']):continue
  if f.suffix in ['.jsp','.jspf','.html']:Scripts(p,str(f.relative_to(root))).feed(protect_nested_tags(f.read_text()))
  if f.suffix=='.js':units.append(dict(project=p,file=str(f.relative_to(root)),line=1,code=f.read_text(),kind='external'))
(H/'js-inputs.json').write_text(json.dumps(units,ensure_ascii=False,indent=2)+'\n');print(len(units),'inert script/event units')
