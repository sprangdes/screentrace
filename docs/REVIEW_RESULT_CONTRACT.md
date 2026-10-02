# Review result contract, version 2

`ReviewResultGenerator` reads `application-graph.json`, `preview-model.json`, and
`edit-overlay.json`. Both `screentrace export <project-name>` and the authenticated
browser `POST /review-result.json` use this generator. Version 2 retains version 1
review fields and adds migration metadata without changing the graph, analyzed
source, prototype, UI, or overlay semantics.

## Schema

The following is a field/type reference, not literal JSON. `?` marks an optional
field. All listed arrays are emitted even when empty; component `css` is always an
object. Optional text and objects are omitted when unavailable.

```text
ReviewResult {
  version: "2"
  generatedAt: ISO-8601 UTC timestamp
  application: { name: string, technologies: string[] }
  summary: {
    screens: { keep: integer, remove: integer, undecided: integer }
    components: { keep: integer, remove: integer, undecided: integer }
    apis: { total: integer }
  }
  screens: Screen[]
  apis: Api[]
  navigation: Navigation[]
}
Screen {
  id: string, route: string, name: string
  decision: "KEEP" | "REMOVE" | "UNDECIDED"
  source?: Source
  preview?: {
    staticDocument?: string, screenshot?: string
    width?: positive integer, height?: positive integer
  }
  components: Component[]
  pageApis: endpoint ID[]
  outgoingScreens: screen ID[]
}
Component {
  id: preview component ID, graphComponentId?: graph component ID
  type: string, label: string, target?: string, targetScreenId?: screen ID
  decision: "KEEP" | "REMOVE" | "UNDECIDED"
  bounds?: { x: integer, y: integer, width: integer, height: integer }
  css: { CSS property: string }
  source?: Source
  triggeredApis: endpoint ID[]
}
Api {
  id: endpoint ID, name: string, method?: string, path?: string
  source?: Source, confidence?: Confidence
  request?: { contentType?: string, bodyType?: string, fields: Field[] }
  responses: Response[]
  calledByScreens: screen ID[]
  triggeredByComponents: ComponentReference[]
}
Field {
  name?: string, type?: string, location?: string, required: boolean
  source?: Source, confidence?: Confidence
}
Response {
  status?: string, contentType?: string, bodyType?: string, fields: Field[]
  source?: Source, confidence?: Confidence
}
ComponentReference {
  screenId: screen ID
  componentId?: exported preview component ID
  graphComponentId?: graph component ID (fallback when preview is unavailable)
}
Navigation {
  fromScreenId: screen ID, toScreenId: screen ID
  componentId?: exported preview component ID, graphComponentId?: graph component ID
  label?: string, target?: string
}
Source { file: project-relative path, line?: positive integer }
Confidence = "CONFIRMED" | "INFERRED" | "AMBIGUOUS" | "UNRESOLVED"
```

Every graph `ENDPOINT` is exported, including endpoints without an `ApiContract`.
APIs have no review decision. `summary.apis.total` counts these exported endpoints.
A fallback component reference never claims a nonexistent preview `componentId`.
Preview component IDs are scoped to the containing screen; a graph component may
map to multiple captured components and screens.

## Data provenance

| Data | Existing source |
| --- | --- |
| Application name and technologies | `ApplicationGraph.Application` |
| Screen ID, route, name, source | Graph `SCREEN` node; route falls back to the existing node name |
| Component source | Graph `COMPONENT` node looked up by `PreviewComponent.graphComponentId` |
| `pageApis` / `calledByScreens` | Direct `SCREEN --CALLS--> ENDPOINT` |
| `triggeredApis` / `triggeredByComponents` | Direct `COMPONENT --TRIGGERS--> ENDPOINT`, mapped to exported preview IDs; `CONTAINS` supplies graph-only ownership fallback |
| Navigation / `outgoingScreens` | `SCREEN --CONTAINS--> COMPONENT --NAVIGATES_TO--> SCREEN`, or direct `SCREEN --NAVIGATES_TO--> SCREEN`; only one hop |
| API identity, method, path, source | `ENDPOINT` node; source falls back to the contract source |
| Request, response, field metadata and confidence | `ApplicationGraph.ApiContract`, `Request`, `Response`, `Field` |
| Static document, screenshot, dimensions | `PreviewModel.PreviewScreen` |
| Component ID, graph ID, type, label, target, target screen, bounds, CSS | `PreviewModel.PreviewComponent` |
| KEEP / REMOVE / UNDECIDED | Latest applicable overlay `changes.reviewStatus` |

`CONFIRMED -> KEEP`, `REMOVED -> REMOVE`, every other status or missing operation
`-> UNDECIDED`. Decisions apply only to screens and exported preview components.

API method uses `httpMethod`, then `method`; path uses `path`, then `route`. When
an attribute is missing, only a literal standard HTTP method plus request path
(e.g. `POST /api/orders`) is parsed from the endpoint name. No controller or JSP
is parsed again.

## Missing data and ordering

The current `Application` stores a local project `path`, not a context path.
Consequently `contextPath` is omitted. Component graph associations, source,
preview assets, bounds, target screens, and API method/path/contracts may also be
unavailable after static analysis. Such metadata stays absent; API responses and
relationship lists stay empty when no reliable data exists. Page calls never
include component triggers. Dangling references and wrong node-type relationships
are ignored.

Screens sort by route, then ID; components and APIs sort by ID. Navigation sorts
by `fromScreenId`, `toScreenId`, `componentId`, then graph component ID. API
component references sort by screen, preview component ID, then graph component
ID. Relationship ID arrays are distinct and sorted; duplicate navigation and API
component references are removed. Object keys, CSS properties, fields, and
responses also have stable ordering. Only `generatedAt` changes between equivalent
exports.

Indexes cover nodes, contracts, preview associations, component ownership, and
API relationships. Export does not repeatedly scan the complete relationship list
for each screen/component; sorting and materializing actual exported references
adds the corresponding output-size cost.

Only source and preview asset paths that are relative are exported; absolute
POSIX/Windows paths and URI/data values are omitted. Unknown/nonpositive source
lines and preview dimensions are omitted. No HTML, source-code contents, base64
images, tokens, or localStorage state are embedded. Existing `SafeProjectFiles`
checks, byte limits, write containment, loopback binding, mutation tokens, and
Host/Origin validation remain in place.

## Validation and example

`ReviewResultGeneratorTest` covers decisions and counts, preview/source mapping,
API calls/triggers and contracts, one-hop navigation, duplicates, ordering,
missing data, shared component mappings, and safe file access.
`ReviewExportContractTest` compares the actual CLI export method with the HTTP
handler's authenticated POST response and checks unauthorized/wrong-method
requests.

`mvn test` runs the complete reactor. The report test also writes a real exporter
result to `screentrace-report/target/review-result-example/review-result.json`.
A checked-in output from that test is available at
[`examples/review-result.json`](examples/review-result.json).
