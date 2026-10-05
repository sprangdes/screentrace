import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const userGuide=path.join(root,'docs/USER_GUIDE.md');
const requiredStatements=[
  '不會啟動或修改被分析專案',
  '不會執行專案腳本、不連線',
  '未被使用不等於可刪除',
  '不要手動修改 md 附錄 A',
  '未解析（UNRESOLVED）',
  '有歧義（AMBIGUOUS）',
  '依證據推定（INFERRED）',
  '截圖皆來自自行撰寫的合成專案',
  '暫存在瀏覽器',
  '換電腦',
  '換檔案位置',
  '私密瀏覽',
  '清除瀏覽器資料',
  '匯出 md 保存',
  '5 MB',
  '64 MiB'
];
const shots=['overview-flow.png','overview-global-nav.png','zoom-viewer.png','simulate-link.png','simulate-submit.png','simulate-dialog.png','coverage.png','inspect-mode.png','review-mode.png','api-page.png','analysis-info.png','library-override.png'];
const chapters=['了解這份報表','開啟報表並查看總覽','查看單一畫面','試著操作畫面','查看按鈕、API 與來源','標記保留、移除或未確認','查看 API 頁','查看元件庫建議並手動覆寫','匯出、匯入並交付 AI','判斷分析結果是否可信','常見問題與詞彙表'];

test('requester guide is task-focused, safe, plain-language and illustrated',async()=>{
  const text=await readFile(userGuide,'utf8'),lines=text.trimEnd().split(/\r?\n/);
  assert.ok(lines.length<=250,`USER_GUIDE.md has ${lines.length} lines`);
  assert.doesNotMatch(text,/\bWP\d+\b|\bR\d\b|\bOQ-\d+\b|\bADR\s*\d+\b|ANCHOR/);
  assert.doesNotMatch(text,/(?:\.java\b|\.ts\b|\.mjs\b|ApiUsage|GraphIntegrityValidator|ApplicationGraph|pom\.xml|AGENTS\.md|screentrace-[a-z-]+)/i);
  assert.deepEqual([...text.matchAll(/^## \d+\. (.+)$/gm)].map(match=>match[1]),chapters,'guide chapters must follow the requester task flow');
  for(const chapter of chapters){const at=text.indexOf(`## ${chapters.indexOf(chapter)+1}. ${chapter}`),next=text.indexOf('\n## ',at+1),opening=text.slice(at,next<0?text.length:next).split(/\r?\n/).find(line=>line&&!line.startsWith('#'));assert.match(opening,/^你可以/ ,`chapter must open with its user task: ${chapter}`);}
  for(const statement of requiredStatements)assert.ok(text.includes(statement),`missing required statement: ${statement}`);
  for(const shot of shots)assert.ok(text.includes(`images/user-guide/${shot}`),`guide must reference ${shot}`);
  const imageDir=path.join(root,'docs/images/user-guide'),actual=(await readdir(imageDir)).filter(name=>name.endsWith('.png')).sort();
  assert.deepEqual(actual,[...shots].sort(),'guide screenshot directory must contain only its referenced images');
  for(const shot of shots)assert.ok((await stat(path.join(imageDir,shot))).size>0,`${shot} is empty`);
});

test('all relative links and image links in Markdown under docs resolve',async()=>{
  const markdown=[];
  async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile()&&entry.name.endsWith('.md'))markdown.push(file);}}
  const docs=path.join(root,'docs');await walk(docs);
  for(const source of markdown){const text=await readFile(source,'utf8');for(const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){let target=match[1].trim().split(/\s+/)[0].replace(/^<|>$/g,'');if(!target||/^(?:[a-z]+:|#|\/\/)/i.test(target))continue;target=decodeURIComponent(target.split('#')[0].split('?')[0]);if(!target)continue;const resolved=path.resolve(path.dirname(source),target);await stat(resolved).catch(()=>assert.fail(`${path.relative(root,source)} links to missing ${target}`));}}
});
