"""Summarize measured results; known product failures remain FAIL."""
from pathlib import Path
from collections import Counter
import json, hashlib

H = Path(__file__).resolve().parent
R = H.parents[2]
load = lambda name: json.loads((H / name).read_text())
counts = lambda rows: dict(Counter(row['result'] for row in rows))
original, supplement = load('ui-results.json'), load('supplementary-results.json')
excluded = ['I03', 'I05', 'I11', 'I13']
cases = [r for r in original['cases'] if r['id'] not in excluded] + supplement['cases']
journeys = [r for r in original['journeys'] if r['id'] != 'IJ1'] + supplement['journeys']
assert len(cases) == 42 and len(journeys) == 6
assert len({r['id'] for r in cases}) == len(cases)
for r in original['infrastructure'] + supplement['infrastructure']:
    assert not r['pageErrors'] and not r['externalRequests']
    assert r['sandbox'] == 'allow-same-origin'
summary = dict(
    toolCommit=load('baseline.json')['toolCommit'],
    original=dict(cases=counts(original['cases']), journeys=counts(original['journeys'])),
    supplementary=dict(cases=counts(supplement['cases']), journeys=counts(supplement['journeys'])),
    excludedInvalidOriginalCases=excluded, excludedInvalidOriginalJourneys=['IJ1'],
    effective=dict(cases=counts(cases), journeys=counts(journeys)),
    projects={p: dict(cases=counts([r for r in cases if r['project'] == p]),
                     ids=[r['id'] for r in cases if r['project'] == p])
              for p in load('baseline.json')['projects']},
    caseResults=[dict(id=r['id'], project=r['project'], result=r['result']) for r in cases],
    journeyResults=[dict(id=r['id'], result=r['result']) for r in journeys],
    returns=counts(load('return-results.json')),
    styles=counts(load('style-results.json')),
    determinism=load('determinism.json'),
    sourceFiles=sum(r['files'] for r in load('source-integrity.json')),
    testedArtifactsMatch=all(r['matches'] for r in load('tested-artifact-identity.json')),
    pixelEquivalence='NOT_ESTABLISHED',
    runtimeEquivalence='NOT_ESTABLISHED; source-only expectations, offline generated viewer',
)
(H / 'validation-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
paths = [p for p in H.rglob('*') if p.is_file() and '__pycache__' not in p.parts
         and p.name != 'evidence-hashes.json']
manifest = {str(p.relative_to(H)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}
jar = R / 'screentrace-cli/target/screentrace-cli-0.1.0-SNAPSHOT.jar'
(H / 'evidence-hashes.json').write_text(json.dumps(dict(
    cliJarSha256=hashlib.sha256(jar.read_bytes()).hexdigest(), files=manifest), indent=2) + '\n')
print(json.dumps(summary['effective']))
