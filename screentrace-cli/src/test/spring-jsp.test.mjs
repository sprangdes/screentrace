import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

test('Spring JSP resolves request branches and shared Tiles bodies', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'screentrace-spring-jsp-'));
  const source = path.join(root, 'projects', 'sample');
  const output = path.join(root, 'out');
  const file = (name, text) => {
    const target = path.join(source, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text.replaceAll('@{', '$' + '{'));
  };
  const jsp = (name, content) => file('src/main/webapp/WEB-INF/jsp/' + name + '.jsp', content);
  try {
    file(
      'pom.xml',
      '<project><dependencies><dependency><groupId>org.springframework</groupId><artifactId>spring-webmvc</artifactId></dependency></dependencies></project>',
    );
    file(
      'src/main/java/demo/ControllerSource.java',
      `
      package demo;
      import javax.servlet.http.HttpServletRequest;
      import org.springframework.stereotype.Controller;
      import org.springframework.ui.Model;
      import org.springframework.web.bind.annotation.*;
      import org.springframework.web.servlet.ModelAndView;

      @Controller class ControllerSource {
        @RequestMapping(value="/", method=RequestMethod.GET)
        String start() { return "index"; }

        @RequestMapping(value={"/item/new", "/item/{id}/copy"}, method=RequestMethod.GET)
        String workflow(@RequestParam(value="step", defaultValue="summary") String step) {
          return "edit".equals(step) ? form() : "summary";
        }

        private String form() { return "form"; }

        @RequestMapping(value={"/item/{id}", "/manage/item/{id}"}, method=RequestMethod.GET)
        String detail(HttpServletRequest request, Model m) {
          boolean manage = request.getServletPath().startsWith("/manage/");
          m.addAttribute("manage", manage);
          return manage ? "staff" : "detail";
        }

        @RequestMapping(value="/item", method=RequestMethod.POST)
        String submit(@RequestParam("id") String id) { return "redirect:/item/" + id; }

        @RequestMapping(value="/unknown", method=RequestMethod.GET)
        String unknown(@RequestParam("view") String view) { return view; }

        @ExceptionHandler(IllegalArgumentException.class)
        ModelAndView invalid(HttpServletRequest request) {
          boolean manage = request.getServletPath().startsWith("/manage/");
          ModelAndView view = new ModelAndView(manage ? "staffError" : "error");
          view.addObject("manage", manage);
          return view;
        }
      }
    `,
    );
    file(
      'src/main/webapp/WEB-INF/web.xml',
      `<web-app>
      <servlet><servlet-name>spring</servlet-name>
        <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class></servlet>
      <servlet-mapping><servlet-name>spring</servlet-name><url-pattern>/</url-pattern></servlet-mapping>
      <error-page><error-code>500</error-code><location>/WEB-INF/jsp/server.jsp</location></error-page>
    </web-app>`,
    );
    file(
      'src/main/webapp/WEB-INF/tiles.xml',
      `<tiles-definitions>
      <definition name="detail" template="/WEB-INF/jsp/layout.jsp">
        <put-attribute name="body" value="/WEB-INF/jsp/detail.jsp"/>
      </definition>
      <definition name="staff" template="/WEB-INF/jsp/layout.jsp">
        <put-attribute name="body" value="/WEB-INF/jsp/detail.jsp"/>
      </definition>
    </tiles-definitions>`,
    );
    jsp('layout', '<tiles:insertAttribute name="body"/>');
    jsp('index', `<a href="<c:url value='/item/new'/>">start</a>`);
    jsp(
      'summary',
      `
      <c:choose>
        <c:when test="@{empty item.id}">
          <c:url var="next" value="/item/new"><c:param name="step" value="edit"/></c:url>
        </c:when>
        <c:otherwise>
          <c:url var="next" value="/item/@{item.id}/copy"><c:param name="step" value="edit"/></c:url>
        </c:otherwise>
      </c:choose>
      <a href="<c:out value='@{next}'/>">edit item</a>
      <c:if test="@{other}"><c:url var="conditional" value="/item/new"/></c:if>
      <a href="<c:out value='@{conditional}'/>">unproven</a>
    `,
    );
    jsp(
      'detail',
      `
      <c:forEach items="@{items}" var="item">
        <c:url var="detail" value="@{manage ? '/manage' : ''}/item/@{item.id}"/>
        <a href="<c:out value='@{detail}'/>">item link</a>
      </c:forEach>
    `,
    );
    jsp(
      'form',
      `<c:url var="save" value="/item"/>
      <form method="post" action="<c:out value='@{save}'/>"><button>save</button></form>`,
    );
    for (const name of ['server', 'error', 'staffError']) jsp(name, '<h1>' + name + '</h1>');
    mkdirSync(path.join(root, '.screentrace'), { recursive: true });
    writeFileSync(
      path.join(root, '.screentrace', 'config.json'),
      JSON.stringify({
        projectRoot: path.dirname(source),
        outputRoot: output,
        contextPaths: { [source]: ['/sample'] },
      }),
    );

    const run = spawnSync(
      'java',
      [
        '-Duser.home=' + root,
        '-Dscreentrace.home=' + repo,
        '-Dscreentrace.js.module=' + path.join(repo, 'screentrace-js/cli.mjs'),
        '-jar',
        path.join(repo, 'screentrace-cli/target/screentrace-cli-0.1.0-SNAPSHOT.jar'),
        'analyze',
        source,
      ],
      { cwd: repo, encoding: 'utf8', timeout: 60_000 },
    );
    assert.equal(run.status, 0, run.error?.message || run.stderr);
    const graph = JSON.parse(
      readFileSync(path.join(output, 'sample/application-graph.json'), 'utf8'),
    );
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const find = (type, name) => {
      const node = graph.nodes.find((item) => item.type === type && item.name === name);
      assert.ok(node, 'Expected ' + type + ' ' + name);
      return node;
    };
    const targets = (node, relationship) =>
      graph.relationships
        .filter((edge) => edge.from === node.id && edge.type === relationship)
        .map((edge) => nodes.get(edge.to).name);
    const sorted = (values) => [...new Set(values)].sort();
    assert.deepEqual(sorted(targets(find('COMPONENT', 'start'), 'NAVIGATES_TO')), ['summary']);
    assert.deepEqual(sorted(targets(find('COMPONENT', 'edit item'), 'TRIGGERS')), [
      'GET /item/new',
      'GET /item/{id}/copy',
    ]);
    assert.deepEqual(sorted(targets(find('COMPONENT', 'edit item'), 'NAVIGATES_TO')), ['form']);
    assert.deepEqual(sorted(targets(find('COMPONENT', 'save'), 'NAVIGATES_TO')), ['detail']);
    assert.ok(targets(find('SCREEN', 'detail'), 'CONTAINS').includes('item link'));
    assert.ok(targets(find('SCREEN', 'staff'), 'CONTAINS').includes('item link'));
    assert.deepEqual(sorted(targets(find('COMPONENT', 'item link'), 'TRIGGERS')), [
      'GET /item/{id}',
      'GET /manage/item/{id}',
    ]);
    assert.deepEqual(sorted(targets(find('HANDLER', 'ControllerSource.invalid()'), 'RENDERS')), [
      'error',
      'staffError',
    ]);
    assert.deepEqual(targets(find('ENTRY_POINT', 'Servlet error 500'), 'RENDERS'), ['server']);
    assert.ok(
      graph.diagnostics.some(
        (d) => d.code === 'SPRING_RETURN_UNRESOLVED' && d.message.includes('view'),
      ),
    );
    assert.ok(
      graph.diagnostics.some(
        (d) => d.code === 'JSP_UNRESOLVED' && d.message.includes('conditional'),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
