<c:forEach items="${records}" var="record">
  <spring:url value="/records/{recordId}/edit" var="editUrl">
    <spring:param name="recordId" value="${record.id}"/>
    <spring:param name="mode" value="full"/>
  </spring:url>
  <a href="${fn:escapeXml(editUrl)}">Edit record</a>
</c:forEach>
