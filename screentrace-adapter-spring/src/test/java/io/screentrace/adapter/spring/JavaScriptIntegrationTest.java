package io.screentrace.adapter.spring;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class JavaScriptIntegrationTest {
  Path project(String page,String js) throws Exception {
    var root=Files.createTempDirectory("javascript-graph");var jsp=root.resolve("src/main/webapp/form.jsp");Files.createDirectories(jsp.getParent());Files.writeString(jsp,page);
    var script=root.resolve("src/main/webapp/app.js");Files.writeString(script,js);return root;
  }
  @Test void adaptersReadJsonPreserveLoadAndFailedBindingAndNeverRunProbe() throws Exception {
    var root=project("<button id='save'>Save</button><input name='email' id='email'/><script src='/app.js'></script>","");var probe=root.resolve("executed-probe");
    Files.writeString(root.resolve("src/main/webapp/app.js"),"require('node:fs').writeFileSync('"+probe+"','EXECUTED');fetch('/load');$('#missing').on('click',function(){fetch('/failed');});$('#save').click(function(){fetch('/clicked');});");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));assertFalse(Files.exists(probe));
    var calls=graph.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API).toList();assertEquals(3,calls.size());
    assertTrue(calls.stream().anyMatch(b->b.event().equals("load")&&graph.nodes().stream().anyMatch(n->n.id().equals(b.triggerId())&&n.type()==NodeType.SCREEN)));
    assertTrue(calls.stream().anyMatch(b->b.evidence().stream().anyMatch(e->e.resolution()==ResolutionStatus.UNRESOLVED&&e.detail().contains("#missing"))));
    assertTrue(ApiUsage.derive(graph,Map.of(),Map.of()).entrySet().stream().filter(e->graph.nodes().stream().anyMatch(n->n.id().equals(e.getKey())&&"javascript-request".equals(n.attributes().get("origin")))).allMatch(e->e.getValue().status()==ApiUsage.Status.IN_USE));
    assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
  }
  @Test void sourceOnlyIncludeLoadCustomValidationAndCallbacksEnterCanonicalGraph() throws Exception {
    var root=project("<form id='form'><input id='email' name='email'/><button id='save' onclick='send()'>Save</button></form><%@ include file='only-script.jspf' %><script src='/app.js'></script>","function send(){$.ajax({url:'/send',success:function(){location.href='/next';}});}$('#form').validate({rules:{email:{required:true}}});");
    Files.writeString(root.resolve("src/main/webapp/only-script.jspf"),"<script>fetch('/include-load');</script>");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));assertTrue(graph.validationRules().stream().anyMatch(r->r.layer()==ValidationLayer.CLIENT));
    assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.NAVIGATE&&b.parentId()!=null));assertTrue(graph.nodes().stream().anyMatch(n->"/include-load".equals(n.attributes().get("path"))));
    assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
  }
  @Test void repeatedAnalysisIsDeterministicAndSyntaxErrorDoesNotLoseOtherUnits() throws Exception {
    var root=project("<script>const = ;fetch('/recovered')</script><script>fetch('/ok')</script>","");
    var inventory=new ProjectScanner().scan(root);var first=new SpringMvcAnalyzer().analyze(inventory);var second=new SpringMvcAnalyzer().analyze(inventory);
    assertEquals(first,second);assertTrue(first.diagnostics().stream().anyMatch(d->d.code().equals("JS_SYNTAX_ERROR")));assertTrue(first.behaviors().stream().anyMatch(b->b.expression().equals("fetch('/ok')")));
  }
  @Test void localModuleFilesAndJspConstantsHaveDefinitionEvidence() throws Exception {
    var root=project("<c:set var='api' value='/api'/><script>fetch('${api}/known');</script><script type='module' src='/app.js'></script>","import {send} from './helper.js';send();");
    Files.writeString(root.resolve("src/main/webapp/helper.js"),"export function send(){fetch('/module');}");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    assertTrue(graph.nodes().stream().anyMatch(n->"/api/known".equals(n.attributes().get("path"))));
    assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.CALL_API&&b.evidence().stream().anyMatch(e->e.detail().contains("JSP 常值定義：api"))));
    assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.CALL_API&&b.evidence().stream().anyMatch(e->e.source().file().endsWith("helper.js"))));
  }
  @Test void eventBoundStaticDivBecomesAnOtherComponentWithSourceAndCaller() throws Exception {
    var root=project("<div id='choice' class='choice'>Pick</div><script>$('.choice').click(function(){fetch('/div');});</script>","");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));var call=graph.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API).findFirst().orElseThrow();
    var component=graph.nodes().stream().filter(n->n.id().equals(call.triggerId())).findFirst().orElseThrow();assertEquals(NodeType.COMPONENT,component.type());assertEquals("OTHER",component.attributes().get("kind"));assertEquals("choice",component.attributes().get("id"));assertEquals(1,component.source().line());assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(graph,java.util.Map.of(),java.util.Map.of()).get(call.targetId()).status());assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
  }
  @Test void multilineScriptOpeningTagRetainsActualOperationLine() throws Exception {
    var root=project("<script\n type='module'>\nfetch('/line');\n</script>","");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.CALL_API&&b.expression().equals("fetch('/line')")&&b.evidence().stream().anyMatch(e->e.source().file().endsWith("form.jsp")&&e.source().line()==3)));
  }
  @Test void angularScopeHandlersAreBoundByControllerAndTraceNestedHttpCallsWithoutExecution() throws Exception {
    var root=project("<div ng-controller='CartController'><button id='clear' ng-click='clearCart()'>Clear</button><form id='order' ng-submit='placeOrder()'></form><div ng-init='initCartId(7)'></div></div><script src='/app.js'></script>","");
    Files.writeString(root.resolve("src/main/webapp/app.js"),"angular.module('shop').controller('CartController', function($scope){$scope.initCartId=function(id){$scope.refreshCart(id);};$scope.refreshCart=function(id){$http.get('/rest/cart/'+id);};$scope.clearCart=function(){$http({method:'DELETE',url:'/rest/cart/'+$scope.cartId});};$scope.placeOrder=function(){$http.put('/rest/cart/add/'+$scope.productId);};});");
    Files.createDirectories(root.resolve("src/main/java"));
    Files.writeString(root.resolve("src/main/java/CartApi.java"),"import org.springframework.web.bind.annotation.*;@RestController class CartApi{@GetMapping(\"/rest/cart/{cartId}\") String get(){return \"\";}@DeleteMapping(\"/rest/cart/{cartId}\") void clear(){}@PutMapping(\"/rest/cart/add/{productId}\") void add(){}}\n");
    var probe=root.resolve("executed-angular-probe");Files.writeString(root.resolve("src/main/webapp/never.js"),"require('node:fs').writeFileSync('"+probe+"','EXECUTED');");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));assertFalse(Files.exists(probe));
    assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.CALL_API&&b.event().equals("load")&&b.evidence().stream().anyMatch(e->e.parser().equals("RouteTemplateInference")&&e.resolution()==ResolutionStatus.INFERRED)));
    assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.CALL_API&&b.triggerId()!=null&&graph.nodes().stream().anyMatch(n->n.id().equals(b.triggerId())&&"clear".equals(n.attributes().get("id")))));
    assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("ANGULAR_SCOPE_DEPTH_LIMIT"))==false);
  }
  @Test void angularRequestDescriptionMatchesJavaEndpointPathForParametersAndScopeProperties() throws Exception {
    var root=project("<main ng-controller='Cart'><button id='add' ng-click='addToCart(productId)'>Add</button><button id='clear' ng-click='clearCart()'>Clear</button><script src='/app.js'></script></main>","");
    Files.writeString(root.resolve("src/main/webapp/app.js"),"angular.module('shop').controller('Cart',function($scope){$scope.addToCart=function(productId){$http.put('/x/add/'+productId);};$scope.clearCart=function(){$http.delete('/x/cart/'+$scope.cartId);};});");
    Files.createDirectories(root.resolve("src/main/java"));
    Files.writeString(root.resolve("src/main/java/CartApi.java"),"import org.springframework.web.bind.annotation.*;@RestController class CartApi{@PutMapping(\"/x/add/{productId}\") void add(){}@DeleteMapping(\"/x/cart/{cartId}\") void clear(){}}\n");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    var calls=graph.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API).toList();
    assertEquals(2,calls.size());
    var json=new com.fasterxml.jackson.databind.ObjectMapper();
    for(var call:calls){
      var jsUrl=call.evidence().stream().filter(e->e.parser().equals("AcornStaticAnalyzer")).map(e->{try{return json.readTree(e.detail()).path("url").asText(null);}catch(Exception ignored){return null;}}).filter(Objects::nonNull).findFirst().orElseThrow();
      var target=graph.nodes().stream().filter(n->n.id().equals(call.targetId())).findFirst().orElseThrow();
      assertEquals(jsUrl,target.attributes().get("path"));
    }
    assertTrue(graph.nodes().stream().anyMatch(n->n.type()==NodeType.ENDPOINT&&"/x/add/{productId}".equals(n.attributes().get("path"))));
    assertTrue(graph.nodes().stream().anyMatch(n->n.type()==NodeType.ENDPOINT&&"/x/cart/{cartId}".equals(n.attributes().get("path"))));
  }
  @Test void configuredContextPathProjectionKeepsBehaviorUrlAndJavaEndpointPathIdentical() throws Exception {
    var root=project("<script src='/app.js'></script>","");
    Files.writeString(root.resolve("src/main/webapp/app.js"),"fetch('/shop/api/'+itemId);");
    Files.writeString(root.resolve("Controller.java"),"import org.springframework.web.bind.annotation.*;@RestController class Controller {@GetMapping(\"/api/{id}\") String get(){return \"\";}}\n");
    Files.writeString(root.resolve("application.properties"),"server.servlet.context-path=/shop\n");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));var json=new com.fasterxml.jackson.databind.ObjectMapper();
    var call=graph.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API).findFirst().orElseThrow();
    var jsUrl=call.evidence().stream().filter(e->e.parser().equals("AcornStaticAnalyzer")).map(e->{try{return json.readTree(e.detail()).path("url").asText(null);}catch(Exception ignored){return null;}}).filter(Objects::nonNull).findFirst().orElseThrow();
    var target=graph.nodes().stream().filter(n->n.id().equals(call.targetId())).findFirst().orElseThrow();
    assertEquals(target.attributes().get("path"),jsUrl);
  }
  @Test void angularUnknownControllerAndScopeDepthLimitRemainExplicitlyUnresolved() throws Exception {
    var root=project("<main ng-controller='Missing'><button id='unknown' ng-click='ghost()'>Unknown</button></main><main ng-controller='Chain'><button id='deep' ng-click='go0()'>Deep</button></main><script src='/app.js'></script>","");String chain=java.util.stream.IntStream.range(0,12).mapToObj(i->"$scope.go"+i+"=function(){"+(i==11?"fetch('/too-deep');":"$scope.go"+(i+1)+"();")+"};").reduce("",String::concat);Files.writeString(root.resolve("src/main/webapp/app.js"),"angular.module('shop').controller('Chain',function($scope){"+chain+"});");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("ANGULAR_CONTROLLER_UNRESOLVED")),graph.diagnostics().toString());assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("ANGULAR_SCOPE_DEPTH_LIMIT")),graph.diagnostics().toString());assertFalse(graph.behaviors().stream().anyMatch(b->"/too-deep".equals(b.expression())));
  }
  @Test void angularNgInitOnControllerElementIsAScreenLoadSource() throws Exception {
    var root=project("<div ng-controller='Cart' ng-init='loadCart()'></div><script src='/app.js'></script>","");Files.writeString(root.resolve("src/main/webapp/app.js"),"angular.module('shop').controller('Cart',function($scope){$scope.loadCart=function(){$http.get('/cart');};});");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));var screen=graph.nodes().stream().filter(n->n.type()==NodeType.SCREEN).findFirst().orElseThrow();assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.CALL_API&&b.event().equals("load")&&b.triggerId().equals(screen.id())),graph.behaviors().toString());
  }
  @Test void staticSpringResourceMappingFindsScriptsWithoutLaunchingThem() throws Exception {
    var root=project("<main ng-controller='Cart'><button id='load' ng-click='load()'>Load</button><script src='/resources/js/controller.js'></script></main>","");Files.createDirectories(root.resolve("src/main/webapp/WEB-INF"));Files.writeString(root.resolve("src/main/webapp/WEB-INF/dispatcher-servlet.xml"),"<beans xmlns:mvc='http://www.springframework.org/schema/mvc'><mvc:resources mapping='/resources/**' location='/WEB-INF/resources/'/></beans>");Path js=root.resolve("src/main/webapp/WEB-INF/resources/js/controller.js");Files.createDirectories(js.getParent());Files.writeString(js,"angular.module('m').controller('Cart',function($scope){$scope.load=function(){fetch('/api');};});");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.CALL_API&&b.evidence().stream().anyMatch(e->e.source().file().endsWith("dispatcher-servlet.xml")&&e.detail().contains("靜態資源映射"))),graph.behaviors().toString()+" diagnostics="+graph.diagnostics());
  }
}
