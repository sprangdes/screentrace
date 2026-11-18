import { analyze } from './analyzer.mjs';
import { analyzeReact } from './react/analyzer.mjs';
import { analyzeStateLabels } from './react/state-labels.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
if (request.mode === 'react') {
  process.stdout.write(JSON.stringify(analyzeReact(request)));
} else if (request.mode === 'state-labels') {
  process.stdout.write(JSON.stringify(analyzeStateLabels(request)));
} else {
  const sources = [...(request.sources ?? [])].sort(
    (a, b) => a.file.localeCompare(b.file) || (a.line ?? 1) - (b.line ?? 1),
  );
  process.stdout.write(JSON.stringify(analyze({ ...request, sources })));
}
