<%@ taglib prefix="demo" tagdir="/WEB-INF/tags" %>
<demo:item href="/home" title="home page"><span> Home </span></demo:item>
<demo:item href="/find" title="find records"><span> Find   records </span></demo:item>
<demo:item href="/dynamic" title="Safe title">${runtimeLabel}</demo:item>
<demo:item href="/empty" title="Empty title"></demo:item>
<demo:wrapper><b>Nested body</b></demo:wrapper>
<a id="aria" title="Title" aria-label="Accessible label">${unknown}</a>
<a id="title" title="Title label" name="Named" aria-label="${unknown}"></a>
<a id="named" name="Named"></a>
<a id="identified"></a>
<button>${unknown}</button><a href="/fallback">${unknown}</a>
<a id="literal"><span>${fn:escapeXml('Constant & label')}</span></a>
<a id="unknown-wrapper" title="Unknown fallback">${custom:decorate('Visible')}</a>
<a id="message"><spring:message text="Literal message"/></a>
<a id="message-code" title="Message fallback"><spring:message code="not.proven"/></a>
<a id="normalization">   This is a very long visible label with more than forty characters   </a>
<a id="hidden" title="Safe hidden">Visible <span hidden>Hidden</span></a>
<a id="conditional" title="Conditional fallback"><c:if test="${allowed}">Conditional</c:if></a>
<a id="broken-function" title="Safe malformed">${fn:escapeXml('broken'}</a>
<a id="entity-literal">&lt;script&gt;literal &amp; text&lt;/script&gt;</a>
