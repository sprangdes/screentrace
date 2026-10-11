/** Resource token isolation, adapted from our capture/pack-preview tokenizer.
 * The browser retains responsibility for CSS parsing/layout; this pass only
 * permits embedded image/font/CSS resources and removes remote imports. */
function decode(value:string):string{return value.replace(/\\([\da-f]{1,6})\s?|\\([^\r\n])/gi,(_all,hex,char)=>hex?String.fromCodePoint(Math.min(parseInt(hex,16)||0xfffd,0x10ffff)):char);}
function identifier(source:string,start:number){let i=start,value='';while(i<source.length){if(/[\w-]/.test(source[i]))value+=source[i++];else if(source[i]==='\\'){const match=/^\\(?:[\da-f]{1,6}\s?|[^\r\n])/i.exec(source.slice(i));if(!match)break;value+=decode(match[0]);i+=match[0].length;}else break;}return {value:value.toLowerCase(),end:i};}
function quoted(source:string,start:number){const quote=source[start];let i=start+1,value='';for(;i<source.length;i++){if(source[i]==='\\')value+=source[i]+(source[++i]||'');else if(source[i]===quote)return {value:decode(value),end:i+1};else value+=source[i];}return {value:decode(value),end:i};}
function urlValue(source:string,start:number){let i=start+1;while(i<source.length&&/\s/.test(source[i]))i++;let value='';if(source[i]==='"'||source[i]==="'"){const token=quoted(source,i);value=token.value;i=token.end;}else{for(;i<source.length&&source[i]!==')';i++){if(source[i]==='\\')value+=source[i]+(source[++i]||'');else value+=source[i];}value=decode(value.trim());}while(i<source.length&&source[i]!==')')i++;return {value,end:Math.min(i+1,source.length)};}
function encodeCss(source:string){const bytes=new TextEncoder().encode(source);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:text/css;base64,'+btoa(binary);}
export function offlineResource(value:string,depth=0):string {
 if(/^data:(?:image\/[\w+.-]+|font\/[\w+.-]+);base64,[A-Za-z0-9+/=]*$/i.test(value))return value;
 if(depth<20&&/^data:text\/css;base64,[A-Za-z0-9+/=]*$/i.test(value)){try{return encodeCss(offlineCss(new TextDecoder().decode(Uint8Array.from(atob(value.slice(value.indexOf(',')+1)),c=>c.charCodeAt(0))),depth+1));}catch{return 'data:,';}}
 return 'data:,';
}
export function offlineCss(source:string,depth=0):string {
 let result='',i=0;const functions:string[]=[];
 while(i<source.length){
  if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2),next=end<0?source.length:end+2;result+=source.slice(i,next);i=next;continue;}
  if(source[i]==='"'||source[i]==="'"){const token=quoted(source,i);result+=functions.at(-1)?.endsWith('image-set')?JSON.stringify(offlineResource(token.value,depth)):source.slice(i,token.end);i=token.end;continue;}
  const start=i,isAt=source[i]==='@',token=identifier(source,isAt?i+1:i);
  if(token.end>(isAt?i+1:i)){let j=token.end;while(j<source.length&&/\s/.test(source[j]))j++;
   if(isAt&&token.value==='import'){let value:ReturnType<typeof quoted>|undefined;
    if(source[j]==='"'||source[j]==="'"){value=quoted(source,j);j=value.end;}else{const keyword=identifier(source,j);j=keyword.end;while(j<source.length&&/\s/.test(source[j]))j++;if(keyword.value==='url'&&source[j]==='('){value=urlValue(source,j);j=value.end;}}
    const tailStart=j;let parentheses=0;while(j<source.length){if(source[j]===';'&&parentheses===0)break;if(source[j]==='"'||source[j]==="'"){j=quoted(source,j).end;continue;}if(source.startsWith('/*',j)){const end=source.indexOf('*/',j+2);j=end<0?source.length:end+2;continue;}if(source[j]==='(')parentheses++;if(source[j]===')')parentheses--;j++;}
    const safe=value?offlineResource(value.value,depth):'data:,';if(safe.startsWith('data:text/css;base64,'))result+=`@import url("${safe}")${source.slice(tailStart,j)};`;i=Math.min(j+1,source.length);continue;
   }
   if(!isAt&&token.value==='url'&&source[j]==='('){const value=urlValue(source,j);result+=`url("${offlineResource(value.value,depth)}")`;i=value.end;continue;}
   if(!isAt&&source[j]==='('){functions.push(token.value);result+=source.slice(start,j+1);i=j+1;continue;}
   result+=source.slice(start,token.end);i=token.end;continue;
  }
  if(source[i]==='(')functions.push('');else if(source[i]===')')functions.pop();
  result+=source[i++];
 }
 return result;
}
