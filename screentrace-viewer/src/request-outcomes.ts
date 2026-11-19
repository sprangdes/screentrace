import type { Edge, Evidence, Node } from './contracts';

export function permitsRender(edge: Edge, endpoint?: string, requests: string[] = []): boolean {
  if (edge.type !== 'RENDERS') return true;
  for (const proof of edge.evidence || []) {
    if (proof.parser !== 'SpringRequestCondition') continue;
    try {
      const data = JSON.parse(proof.detail || 'null');
      if (endpoint && typeof data?.endpointId === 'string' && data.endpointId !== endpoint)
        return false;
      if (
        typeof data?.parameter === 'string' &&
        requests.length &&
        !requests.some((request) => permitsQuery(request, data))
      )
        return false;
    } catch {
      // Unreadable evidence cannot eliminate an outcome.
    }
  }
  return true;
}

function permitsQuery(
  raw: string,
  data: {
    parameter: string;
    defaultValue?: string;
    value: string;
    negated: string;
  },
): boolean {
  const url = raw.split('#', 1)[0],
    delimiter = url.indexOf('?');
  let value: string | undefined;
  if (delimiter >= 0)
    for (const parameter of url.slice(delimiter + 1).split('&')) {
      const separator = parameter.indexOf('=');
      const key = separator < 0 ? parameter : parameter.slice(0, separator);
      const candidate = separator < 0 ? '' : parameter.slice(separator + 1);
      if (/[{%+]/.test(key)) return true;
      if (key !== data.parameter) continue;
      if (value !== undefined) return true;
      value = candidate;
    }
  value ||= data.defaultValue;
  return (
    value === undefined ||
    !/^[A-Za-z0-9_.~-]*$/.test(value) ||
    (value === data.value) !== (data.negated === 'true')
  );
}

export function requestPaths(endpoint: string, trigger: Node | undefined, evidence: Evidence[]) {
  const prefix = endpoint + ' ';
  const alternatives = evidence
    .filter((e) => e.parser === 'JspRequestPath' && e.detail?.startsWith(prefix))
    .map((e) => e.detail!.slice(prefix.length));
  if (alternatives.length) return alternatives;
  const target = trigger?.attributes.target;
  return target?.startsWith('/') &&
    !target.startsWith('//') &&
    (trigger?.attributes.httpMethod || 'GET').toUpperCase() === 'GET'
    ? [target]
    : [];
}
