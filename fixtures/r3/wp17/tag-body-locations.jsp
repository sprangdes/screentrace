<%@ taglib prefix="demo" tagdir="/WEB-INF/tags" %>
<demo:layout menuUrl="/orders" menuLabel="Orders">
  <spring:url value="/records/{id}" var="url"/>
  <p>Record</p>
  <a href="${url}">Edit record</a>
</demo:layout>
<a href="/after">After layout</a>
