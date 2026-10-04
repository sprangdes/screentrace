<c:url var="searchUrl" value="/records"/>
<form action="${searchUrl}" method="get"><input name="name"/><button type="submit">Search records</button></form>
<button type="button" id="ajax">Load without navigation</button>
<script>document.getElementById('ajax').addEventListener('click',()=>fetch('/records'));</script>
