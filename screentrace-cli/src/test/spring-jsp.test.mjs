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
      import org.springframework.web.servlet.mvc.support.RedirectAttributes;

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
          m.addAttribute("customer", !manage && request.getParameter("owner") != null);
          return manage ? "staff" : "detail";
        }

        @RequestMapping(value="/item", method=RequestMethod.POST)
        String submit(@RequestParam("id") String id, RedirectAttributes flash) {
          if ("saved".equals(id)) return "redirect:/item/" + id;
          flash.addFlashAttribute("success", "Saved.");
          return "redirect:/item/" + id;
        }

        @RequestMapping(value="/manage/item/{id}/change", method=RequestMethod.POST)
        String update(@RequestParam("state") String state) { return "redirect:/manage/item/{id}"; }

        @RequestMapping(value="/back/login", method=RequestMethod.GET)
        String backLogin() { return "backLogin"; }

        @RequestMapping(value="/back/login", method=RequestMethod.POST)
        String signIn(javax.servlet.http.HttpSession session) {
          session.setAttribute("staff", Boolean.TRUE);
          return "redirect:/back";
        }

        @RequestMapping(value="/back", method=RequestMethod.GET)
        String backHome() { return "backHome"; }

        private final DraftService drafts = new DraftService();

        @RequestMapping(value="/draft/new", method=RequestMethod.GET)
        String newDraft(Model m) { Draft draft = new Draft(); return page(draft, m); }

        @RequestMapping(value="/draft/{id}/renew", method=RequestMethod.GET)
        String renewDraft(@PathVariable("id") String id, Model m) {
          Draft draft = drafts.renewal(id);
          return page(draft, m);
        }

        private String page(Draft draft, Model m) { m.addAttribute("draft", draft); return "draft"; }

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
      'src/main/java/demo/Guard.java',
      `package demo;
      import javax.servlet.*;
      import javax.servlet.http.*;
      public class Guard implements Filter {
        public void doFilter(ServletRequest input, ServletResponse output, FilterChain chain) throws java.io.IOException, ServletException {
          HttpServletRequest r = (HttpServletRequest) input;
          HttpServletResponse response = (HttpServletResponse) output;
          String path = r.getServletPath();
          HttpSession session = r.getSession(true);
          if (path.startsWith("/back") && !"/back/login".equals(path) && !Boolean.TRUE.equals(session.getAttribute("staff"))) {
            response.sendRedirect(r.getContextPath() + "/back/login");
            return;
          }
          chain.doFilter(r, response);
        }
      }`,
    );
    file(
      'src/main/java/demo/Draft.java',
      `package demo;
      public class Draft {
        private String previousId = "";
        public String getPreviousId() { return previousId; }
        public void setPreviousId(String v) { previousId = v; }
      }`,
    );
    file(
      'src/main/java/demo/DraftService.java',
      `package demo;
      public class DraftService {
        public Draft renewal(String id) { Draft d = new Draft(); d.setPreviousId(id); return d; }
      }`,
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
      <a class="back" href="<c:url value="@{manage ? '/manage/item/1' : '/'}"/>">← @{manage ? 'staff home' : 'home'}</a>
      <c:if test="@{manage}"><a href="<c:url value='/'/>">staff only</a></c:if>
      <c:if test="@{customer}"><a href="<c:url value='/'/>">customer only</a></c:if>
      <c:forEach items="@{items}" var="item">
        <c:url var="detail" value="@{manage ? '/manage' : ''}/item/@{item.id}"/>
        <a href="<c:out value='@{detail}'/>">item link</a>
      </c:forEach>
      <c:choose>
        <c:when test="@{itemState.code eq 'NEW'}">
          <form method="post" action="<c:url value='/manage/item/1/change'/>">
            <button name="state" value="OPEN">open item</button>
          </form>
        </c:when>
        <c:when test="@{itemState.code eq 'OPEN'}">
          <form method="post" action="<c:url value='/manage/item/1/change'/>">
            <button name="state" value="CLOSED">close item</button>
          </form>
        </c:when>
      </c:choose>
    `,
    );
    jsp(
      'form',
      `<c:url var="save" value="/item"/>
      <form method="post" action="<c:out value='@{save}'/>"><button>save</button></form>`,
    );
    for (const name of ['server', 'error', 'staffError']) jsp(name, '<h1>' + name + '</h1>');
    jsp(
      'backLogin',
      `<h1>員工登入</h1>
      <c:if test="@{sessionScope.staff eq true}"><a href="<c:url value='/back'/>">staff nav</a></c:if>
      <form method="post" action="<c:url value='/back/login'/>"><button>sign in</button></form>`,
    );
    jsp(
      'backHome',
      `<h1>Back office</h1>
      <c:if test="@{sessionScope.staff eq true}"><a href="<c:url value='/back'/>">staff nav</a></c:if>`,
    );
    jsp(
      'draft',
      `<h1>@{empty draft.previousId ? 'New draft' : 'Renew draft'}</h1>
      <c:if test="@{empty draft.previousId}"><a href="<c:url value='/'/>">home link</a></c:if>`,
    );
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
    const submitRedirects = graph.relationships.filter(
      (edge) =>
        edge.from === find('HANDLER', 'ControllerSource.submit()').id &&
        edge.type === 'FORWARDS_TO',
    );
    assert.equal(submitRedirects.length, 2);
    assert.equal(
      submitRedirects.filter((edge) =>
        edge.evidence.some((e) => e.parser === 'SpringSuccessRedirect' && e.detail === 'Saved.'),
      ).length,
      1,
    );
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
    // The unguarded return is the handler's normal path (ADR 0186).
    assert.deepEqual(
      submitRedirects.map((edge) => edge.evidence.some((e) => e.parser === 'SpringMainPath')).sort(),
      [false, true],
    );
    // Roles from the application's own access rule (ADR 0188).
    assert.equal(graph.schemaVersion, '2.4');
    const personas = Object.fromEntries(graph.application.personas.map((p) => [p.id, p]));
    assert.deepEqual(Object.keys(personas).sort(), ['guest', 'signed-in']);
    assert.equal(personas['signed-in'].name, '員工');
    assert.deepEqual(personas['signed-in'].startPaths, ['/back/login']);
    const backLogin = find('SCREEN', 'backLogin'),
      backHome = find('SCREEN', 'backHome');
    assert.deepEqual(JSON.parse(backHome.attributes.sessionFacts), { 'sessionScope.staff': true });
    assert.deepEqual(JSON.parse(backLogin.attributes.sessionFacts), { 'sessionScope.staff': false });
    const staffNav = graph.relationships.find(
      (e) => e.from === backLogin.id && e.type === 'CONTAINS' && nodes.get(e.to).name === 'staff nav',
    );
    assert.ok(staffNav.evidence.some((e) => e.detail?.startsWith('此畫面條件不成立')));
    assert.ok(targets(backHome, 'CONTAINS').includes('staff nav'));
    assert.equal(personas.guest.screens[backHome.id], 'EXCLUDED');
    const reached = (p) => p.flow.reached.filter((r) => r.reach === 'REACHABLE').map((r) => r.screenId);
    assert.ok(reached(personas['signed-in']).includes(backLogin.id));
    assert.ok(reached(personas['signed-in']).includes(backHome.id));
    assert.ok(!reached(personas.guest).includes(backHome.id));
    // One JSP page in two request modes, proven from where the model object comes from.
    const drafts = Object.fromEntries(
      graph.nodes
        .filter((node) => node.type === 'SCREEN' && node.name === 'draft')
        .map((node) => [node.attributes.jspStateLabel, node]),
    );
    assert.deepEqual(Object.keys(drafts).sort(), ['New draft', 'Renew draft']);
    assert.equal(drafts['Renew draft'].attributes.stateVariantOf, drafts['New draft'].id);
    assert.deepEqual(targets(find('HANDLER', 'ControllerSource.renewDraft()'), 'RENDERS'), [
      'draft',
    ]);
    assert.ok(
      graph.relationships.some(
        (edge) =>
          edge.type === 'RENDERS' &&
          edge.from === find('HANDLER', 'ControllerSource.renewDraft()').id &&
          edge.to === drafts['Renew draft'].id,
      ),
    );
    assert.ok(targets(drafts['New draft'], 'CONTAINS').includes('home link'));
    assert.ok(!targets(drafts['Renew draft'], 'CONTAINS').includes('home link'));
    const states = (name) =>
      Object.fromEntries(
        graph.nodes
          .filter((node) => node.name === name && node.attributes.jspStateValue)
          .map((node) => [node.attributes.jspStateValue, node]),
      );
    const variants = states('staff');
    assert.deepEqual(
      ['NEW', 'OPEN', 'CLOSED'].map((value) => variants[value].attributes.jspStateOrder),
      ['0', '1', '2'],
    );
    // Model facts of each controller branch decide ownership on the shared Tiles body (ADR 0185).
    const detail = find('SCREEN', 'detail');
    assert.ok(targets(variants.NEW, 'CONTAINS').includes('staff only'));
    assert.ok(!targets(variants.NEW, 'CONTAINS').includes('customer only'));
    assert.ok(!targets(detail, 'CONTAINS').includes('staff only'));
    assert.ok(targets(detail, 'CONTAINS').includes('customer only'));
    const back = find('COMPONENT', '← staff home／home');
    const scope = (screen) =>
      JSON.parse(
        graph.relationships
          .find((edge) => edge.from === screen.id && edge.to === back.id && edge.type === 'CONTAINS')
          .evidence.find((e) => e.parser === 'JspScreenFacts').detail,
      );
    assert.deepEqual(scope(detail).paths, ['/']);
    assert.deepEqual(scope(detail).facts, { manage: false });
    assert.deepEqual(scope(variants.NEW).paths, ['/manage/item/1']);
    assert.deepEqual(scope(variants.NEW).facts, { customer: false, manage: true });
    assert.deepEqual(
      scope(variants.NEW).endpoints.map((id) => nodes.get(id).name),
      ['GET /manage/item/{id}'],
    );
    // The customer page of the same JSP shows the same states, entered at the same value.
    const shared = states('detail');
    assert.deepEqual(Object.keys(shared).sort(), ['CLOSED', 'NEW', 'OPEN']);
    assert.equal(shared.NEW.id, detail.id);
    assert.equal(shared.OPEN.attributes.stateVariantOf, detail.id);
    assert.ok(
      shared.OPEN.evidence.some(
        (e) => e.parser === 'JspStateVariant' && e.detail.includes('共用 JSP 內容的畫面'),
      ),
    );
    assert.ok(!targets(shared.CLOSED, 'CONTAINS').includes('close item'));
    assert.deepEqual(Object.keys(variants).sort(), ['CLOSED', 'NEW', 'OPEN']);
    assert.equal(variants.NEW.attributes.stateVariantOf, undefined);
    assert.equal(variants.OPEN.attributes.stateVariantOf, variants.NEW.id);
    assert.ok(targets(variants.NEW, 'CONTAINS').includes('open item'));
    assert.ok(!targets(variants.NEW, 'CONTAINS').includes('close item'));
    assert.ok(!targets(variants.OPEN, 'CONTAINS').includes('open item'));
    assert.ok(targets(variants.OPEN, 'CONTAINS').includes('close item'));
    assert.ok(!targets(variants.CLOSED, 'CONTAINS').includes('close item'));
    for (const [label, state] of [
      ['open item', 'OPEN'],
      ['close item', 'CLOSED'],
    ]) {
      const button = graph.nodes.find(
        (node) => node.name === label && node.attributes.kind === 'SUBMIT',
      );
      assert.ok(button);
      assert.ok(
        graph.relationships.some(
          (edge) =>
            edge.from === button.id &&
            edge.to === variants[state].id &&
            edge.type === 'NAVIGATES_TO',
        ),
      );
    }
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
