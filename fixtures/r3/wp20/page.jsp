<%@ taglib prefix="demo" tagdir="/WEB-INF/tags" %>
<demo:layout>
<demo:item title="Find records" url="/records/find"/>
<demo:item title="${dynamicTitle}" url="/records/detail"/>
<demo:bodyItem url="/help">Help guide</demo:bodyItem>
<demo:item title="${custom:decorate(title)}" url="/unknown"/>
</demo:layout>
