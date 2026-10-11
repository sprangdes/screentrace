const PLACEHOLDER='（JSF 元件，未分析）';

export function renderUnsupportedJsfTags(source){
 const withoutCoreTags=source.replace(/<\/f:[\w-]+\s*>/gi,'').replace(/<f:[\w-]+\b[^>]*?\/>/gi,'').replace(/<f:[\w-]+\b[^>]*>/gi,'');
 return withoutCoreTags
  .replace(/<h:([\w-]+)\b[^>]*?\/>/gi,`<span class="st-jsf-unavailable">${PLACEHOLDER}</span>`)
  .replace(/<h:([\w-]+)\b[^>]*>/gi,`<span class="st-jsf-unavailable">${PLACEHOLDER}`)
  .replace(/<\/h:[\w-]+\s*>/gi,'</span>');
}
