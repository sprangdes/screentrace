import json,collections,sys
g=json.load(open(sys.argv[1]+'/application-graph.json'))
N={n['id']:n for n in g['nodes']}
print(collections.Counter(n['type'] for n in g['nodes']))
print(collections.Counter(r['type'] for r in g.get('relationships',[])))
def lab(i):
    n=N.get(i); return (n.get('name') or n.get('label') or i) if n else i
for t in ('SCREEN','ENDPOINT','HANDLER'):
    for n in g['nodes']:
        if n['type']==t:
            a=n.get('attributes',{})
            print(t,'|',n.get('name'),'|',{k:v for k,v in a.items() if len(str(v))<120})
print('--- relationships (non-contains)')
for r in g.get('relationships',[]):
    if r['type'] not in('CONTAINS','DEFINED_IN','DECLARED_IN'):
        print(r['type'],'|',lab(r['from']),'->',lab(r['to']),'|',r.get('confidence'),'|',{k:v for k,v in r.get('attributes',{}).items() if len(str(v))<100})
print('--- diagnostics')
for d in g.get('diagnostics',[]): print(d.get('code'),'|',d.get('message')[:200])
