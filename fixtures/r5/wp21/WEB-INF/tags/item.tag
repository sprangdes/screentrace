<%@ attribute name="title" %><%@ attribute name="href" %>
<a href="${href}" title="${fn:escapeXml(title)}"><jsp:doBody/></a>
