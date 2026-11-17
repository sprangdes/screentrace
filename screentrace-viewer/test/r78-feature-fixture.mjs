// R78 (ADR 0156) fixture: owners (one controller), vets (one URL area), one stray screen, a form posting to an API.
import { node } from './fixture.mjs';

export const proof = (file, line = 1) => ({
  confidence: 'CONFIRMED',
  source: { file, line },
  evidence: [{ parser: 'Fixture', resolution: 'CONFIRMED', source: { file, line } }],
});
export const edge = (id, type, from, to) => ({ id, type, from, to, ...proof('web/x.jsp', 2) });

/** Owners (one controller, three screens), vets (one URL area), one stray screen; a form posting to an API. */
export function featureFixture() {
  const graph = {
    schemaVersion: '2.2',
    application: { name: '功能測試', path: '.', technologies: [] },
    nodes: [
      node('list', 'SCREEN', '飼主清單', { route: '/owners/list' }),
      node('edit', 'SCREEN', '編輯飼主', { route: '/owners/edit' }),
      node('done', 'SCREEN', '完成', { route: '/owners/done' }),
      node('vets', 'SCREEN', '獸醫清單', { route: '/vets/list' }),
      node('vet', 'SCREEN', '獸醫', { route: '/vets/show' }),
      node('about', 'SCREEN', '關於', { route: '/about' }),
      node('owner-c', 'HANDLER', 'OwnerController.list()', {
        class: 'demo.OwnerController',
        method: 'list',
        backendCalls: JSON.stringify([
          {
            depth: 1,
            from: 'OwnerController#list',
            to: 'OwnerService#find',
            layer: 'SERVICE',
            layerBasis: '@Service',
            resolution: 'CONFIRMED',
            source: { file: 'src/OwnerController.java', line: 9 },
          },
          {
            depth: 2,
            from: 'OwnerService#find',
            to: 'OwnerDao#query',
            layer: 'DAO',
            layerBasis: '@Repository',
            resolution: 'CONFIRMED',
            source: { file: 'src/OwnerService.java', line: 5 },
          },
          {
            depth: 2,
            from: 'OwnerService#find',
            to: 'Cache#get',
            layer: 'CLASS',
            resolution: 'AMBIGUOUS',
            reason: '2 個實作',
            source: { file: 'src/OwnerService.java', line: 6 },
          },
        ]),
      }),
      node('owner-c2', 'HANDLER', 'OwnerController.edit()', {
        class: 'demo.OwnerController',
        method: 'edit',
      }),
      node('save', 'ENDPOINT', 'POST /owners/save', { path: '/owners/save', httpMethod: 'POST' }),
      node('form', 'COMPONENT', '表單', { kind: 'FORM', tag: 'form' }),
      node('name', 'COMPONENT', '姓名', {
        kind: 'TEXT_INPUT',
        tag: 'input',
        field: 'lastName',
        formId: 'form',
      }),
      node('submit', 'COMPONENT', '儲存', { kind: 'SUBMIT', tag: 'button', formId: 'form' }),
      node('to-vet', 'COMPONENT', '獸醫', { kind: 'LINK', tag: 'a' }),
      node('model', 'FORM_MODEL', 'ownerForm', { 'field.lastName.type': 'String' }),
      node('header', 'TEMPLATE_FRAGMENT', 'header.jsp', {}),
    ],
    relationships: [
      edge('r1', 'RENDERS', 'owner-c', 'list'),
      edge('r2', 'RENDERS', 'owner-c2', 'edit'),
      edge('r3', 'RENDERS', 'owner-c2', 'done'),
      edge('c1', 'CONTAINS', 'edit', 'form'),
      edge('c2', 'CONTAINS', 'edit', 'name'),
      edge('c3', 'CONTAINS', 'edit', 'submit'),
      edge('c4', 'CONTAINS', 'vets', 'to-vet'),
      edge('n1', 'NAVIGATES_TO', 'to-vet', 'vet'),
      edge('b1', 'BINDS_TO', 'form', 'model'),
      edge('i1', 'INCLUDES', 'vet', 'header'),
      edge('i2', 'INCLUDES', 'about', 'header'),
      edge('h1', 'HANDLED_BY', 'save', 'owner-c2'),
      edge('t1', 'TRIGGERS', 'form', 'save'),
    ],
    behaviors: [
      {
        id: 'go-edit',
        triggerId: 'list',
        type: 'NAVIGATE',
        event: 'load',
        targetId: 'edit',
        evidence: [proof('web/list.jsp', 3).evidence[0]],
      },
      {
        id: 'submit-save',
        triggerId: 'form',
        type: 'SUBMIT_FORM',
        event: 'submit',
        targetId: 'save',
        evidence: [proof('web/edit.jsp', 4).evidence[0]],
      },
      {
        id: 'go-done',
        triggerId: 'submit',
        type: 'NAVIGATE',
        event: 'click',
        targetId: 'done',
        evidence: [proof('web/edit.jsp', 5).evidence[0]],
      },
    ],
    apiContracts: [
      {
        endpointId: 'save',
        request: {
          contentType: 'application/x-www-form-urlencoded',
          fields: [{ name: 'lastName', type: 'String', location: 'FORM', required: true }],
        },
        responses: [],
        ...proof('src/OwnerController.java', 20),
      },
    ],
    validationRules: [
      {
        id: 'rule-name',
        kind: 'required',
        fields: ['lastName'],
        layer: 'SERVER',
        parameters: {},
        evidence: [proof('src/OwnerForm.java', 3).evidence[0]],
      },
    ],
  };
  return {
    graph,
    preview: { version: '2', screens: [], elements: [], styles: {}, defaults: {} },
    documents: {},
    manifest: {},
    fingerprint: 'f'.repeat(64),
  };
}
