<%--
<a href="/fake">ignored</a>
--%>
<% String probe = "<button>fake</button>"; %>
<form:form modelAttribute="order" action="${dynamic}" onsubmit="return validateOrder()">
<c:if test="${visible}"><input id="email" name="email" type="email" required pattern=".+@.+" minlength="3" maxlength="60" /></c:if>
<c:choose><c:when test="${flag}"><form:input path="title" /></c:when><c:otherwise><html:password property="password" /></c:otherwise></c:choose>
<c:forEach items="${items}" var="item"><select multiple name="tags" onchange="loadOptions(this)"><option>A</option></select></c:forEach>
<logic:present name="order"><textarea name="notes"></textarea></logic:present>
<logic:notPresent name="order"><input type="checkbox" name="enabled"></logic:notPresent>
<logic:equal name="order" property="state" value="open"><input type="radio" name="state"></logic:equal>
<input type="date" min="2020-01-01" max="2030-01-01" name="date">
<select name="state"><option>A</option></select><input type="file" name="file"><input type="submit"><button type="button" data-bs-toggle="modal" data-bs-target="#details">Details</button>
<a href="${target}" onclick="navigate()">Go</a><input type="hidden" name="token"><table id="items"></table>
</form:form>
<dialog id="details"></dialog>
<jsp:include page="nested.jspf" />
