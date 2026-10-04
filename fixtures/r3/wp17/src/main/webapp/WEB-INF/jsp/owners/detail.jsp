<spring:url value="{ownerId}/edit" var="editUrl"><spring:param name="ownerId" value="${owner.id}"/></spring:url>
<a href="${fn:escapeXml(editUrl)}">Edit Owner</a>
