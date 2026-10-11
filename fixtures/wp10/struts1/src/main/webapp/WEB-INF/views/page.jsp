<!DOCTYPE html><html><head><title>合成訂單畫面</title><link rel="stylesheet" href="/styles.css"><script src="/js/jquery.min.js"></script><script src="/js/bootstrap.min.js"></script><script src="/js/jquery-ui.js"></script><script src="/js/jquery.validate.js"></script><script src="/js/select2.js"></script><script src="/js/datepicker.js"></script></head><body>
<h1>合成訂單</h1><div id="container" class="choices">
<form id="edit-form" action="/fixture/save" method="post" onsubmit="validateEmail()">
<label for="email">電子郵件</label><input id="email" name="email" type="email" required pattern=".+@.+" minlength="2" maxlength="80" onchange="send()">
<input name="site" type="url"><input name="amount" type="number" min="1" max="99"><input name="day" type="date"><input name="upload" type="file">
<textarea name="notes"></textarea><select id="choice" name="choice"><option>A</option></select><select name="many" multiple><option>B</option></select>
<input type="checkbox" name="enabled"><input type="radio" name="mode" value="one"><input type="hidden" name="hidden" value="x">
<button id="review-button" type="button" class="choice" onclick="send()">合成確認按鈕</button><input type="submit" value="送出"><button type="reset">重設</button>
</form></div><table><tr><td>樣式資料</td></tr></table><div class="other">其他元素</div>
<button data-toggle="modal" data-target="#legacy-modal">開啟舊彈窗</button><div id="legacy-modal" class="modal" role="dialog">舊彈窗</div>
<button data-bs-toggle="modal" data-bs-target="#modern-modal">開啟彈窗</button><dialog id="modern-modal">彈窗</dialog>
<a href="javascript:send()">JS 連結</a><a href="${unknownUrl}">未知 EL</a><a href='<%= dynamicTarget %>'>scriptlet</a>
<%@ include file="parts/one.jspf" %><jsp:include page="parts/two.jspf"/>
<c:if test="${enabled}"><button id="conditional">條件按鈕</button></c:if>
<c:choose><c:when test="${ready}"><input name="ready"></c:when><c:otherwise><input name="fallback"></c:otherwise></c:choose>
<c:forEach items="${rows}" var="row"><button class="repeated">迴圈</button></c:forEach>
<c:url var="literalUrl" value="/orders/{name}"><c:param name="name" value="${unknown}"/></c:url><a href="${literalUrl}">URL 樣板</a><a href="${fn:escapeXml(literalUrl)}">跳脫 URL</a>
<spring:url var="springUrl" value="/orders/{name}"><spring:param name="name" value="${unknown}"/></spring:url><a href="${springUrl}">Spring URL</a>
<c:url var="changed" value="/one"/><c:url var="changed" value="/two"/><a href="${changed}">重新賦值</a>
<c:choose><c:when test="${ready}"><c:url var="branched" value="/one"/></c:when><c:otherwise><c:url var="branched" value="/two"/></c:otherwise></c:choose><a href="${branched}">分支變數</a>
<a href="${fn:unknown(literalUrl)}">未知函式</a><a href="${fn:toUpperCase(literalUrl)}">其他函式</a><a href="${includedUrl}">跨檔變數</a>
<c:set var="setUrl" value="/set"/><a href="${setUrl}">不解析 c:set</a>
<script src="/js/owned.min.js"></script><script src="${pageContext.request.contextPath}/js/context.js"></script>
<c:url var="scriptUrl" value="/js/helper.js"/><script src="${scriptUrl}"></script><spring:url var="springScript" value="/js/helper.js"/><script src="${springScript}"></script>
<script type="module" src="/js/module.js"></script><script>const = ; fetch('/fixture/recovered')</script>
<script>globalThis.wp10Probe='EXECUTED';fetch('/fixture/api/exact');</script>
<html:form action="/save.do"><html:text property="email"/><html:password property="password"/><html:textarea property="notes"/><html:select property="choice"><html:options collection="choices"/><html:optionsCollection name="choices"/></html:select><html:checkbox property="enabled"/><html:multibox property="flags"/><html:radio property="mode"/><html:file property="upload"/><html:hidden property="hidden"/><html:submit property="op" value="save"/><html:button value="open"/><html:cancel/><html:reset/><html:link action="/save.do">存檔</html:link></html:form>
<html:form action="/lookup.do"><html:submit property="op" value="save"/></html:form><html:form action="/mapping.do"><html:submit value="save"/></html:form>
<bean:write name="editForm" property="email"/><logic:iterate name="rows"><html:text property="row"/></logic:iterate><logic:present name="editForm" value="yes"><html:button value="present"/></logic:present>
<logic:notPresent name="editForm" value="yes"><html:button value="notPresent"/></logic:notPresent>
<logic:equal name="editForm" value="yes"><html:button value="equal"/></logic:equal>
<logic:notEqual name="editForm" value="yes"><html:button value="notEqual"/></logic:notEqual>
<logic:empty name="editForm" value="yes"><html:button value="empty"/></logic:empty>
<logic:notEmpty name="editForm" value="yes"><html:button value="notEmpty"/></logic:notEmpty>
<logic:greaterThan name="editForm" value="yes"><html:button value="greaterThan"/></logic:greaterThan>
<logic:lessThan name="editForm" value="yes"><html:button value="lessThan"/></logic:lessThan>
<!-- 自行撰寫的註解，不是輸入元素 <button id="comment-fake"> -->
<sample:badge value="${badge}"/>
<script src="${undefinedPrefix}/js/context.js"></script><script src="${pageContext.servletContext.contextPath}/js/context.js"></script>
<script src="${undefinedPrefix}/js/missing.js"></script><script src="/x${undefinedPrefix}/js/context.js"></script><script src="http://${undefinedPrefix}/js/context.js"></script><script src="//${undefinedPrefix}/js/context.js"></script><script src="${one}${two}/js/context.js"></script>
<c:set var="definedPrefix" value="/different"/><script src="${definedPrefix}/js/context.js"></script>
</body></html>
