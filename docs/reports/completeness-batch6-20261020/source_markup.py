"""Test-only lexical protection for source JSP tags nested inside HTML attributes.
No rendering/evaluation: escape atomic self-closing url/message tags in memory, preserving lines.
"""
import re,html
_TAG=re.compile(r'<(?:c:url|spring:url|bean:message)\b(?:[^\'"<>]|"[^"]*"|\'[^\']*\')*?/\s*>',re.I)
def protect_nested_tags(text):return _TAG.sub(lambda m:html.escape(m.group(),quote=True),text)
