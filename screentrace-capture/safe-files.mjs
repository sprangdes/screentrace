import { createReadStream } from 'node:fs';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import path from 'node:path';

export async function resolveExistingFileWithin(root, candidate) {
  return resolveExistingWithin(root, candidate, 'file');
}
export async function resolveExistingDirectoryWithin(root, candidate) {
  return resolveExistingWithin(root, candidate, 'directory');
}
async function resolveExistingWithin(root, candidate, kind) {
  const rootReal = await realpath(root);
  const rootLexical = path.resolve(root);
  const absolute = path.resolve(candidate);
  const boundary = within(rootLexical, absolute) ? rootLexical : within(rootReal, absolute) ? rootReal : null;
  if (!boundary) throw new Error(`Path escapes allowed root: ${candidate}`);
  let cursor = boundary;
  for (const segment of path.relative(boundary, absolute).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error(`Symbolic link refused: ${cursor}`);
  }
  const resolved = await realpath(absolute);
  if (!within(rootReal, resolved)) throw new Error(`Real path escapes allowed root: ${candidate}`);
  const info = await lstat(resolved);
  if (kind === 'file' ? !info.isFile() : !info.isDirectory()) throw new Error(`Expected regular ${kind}: ${candidate}`);
  return resolved;
}
function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function assertOutputPathWithin(root, candidate) {
  const rootReal = await realpath(root);
  const rootLexical = path.resolve(root);
  const absolute = path.resolve(candidate);
  const boundary = within(rootLexical, absolute) ? rootLexical : within(rootReal, absolute) ? rootReal : null;
  if (!boundary) throw new Error(`Output path escapes allowed root: ${candidate}`);
  let cursor = boundary;
  const segments = path.relative(boundary, absolute).split(path.sep).filter(Boolean);
  for (const segment of segments.slice(0, -1)) {
    cursor = path.join(cursor, segment);
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`Output traverses symbolic link: ${cursor}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  try { if ((await lstat(absolute)).isSymbolicLink()) throw new Error(`Output is symbolic link: ${absolute}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let existing = absolute;
  while (existing !== boundary) {
    try {
      const resolved = await realpath(existing);
      if (!within(rootReal, resolved)) throw new Error(`Output real path escapes allowed root: ${candidate}`);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      existing = path.dirname(existing);
    }
  }
  return absolute;
}

export async function createDirectoryWithin(root, candidate) {
  const rootReal = await realpath(root);
  const rootLexical = path.resolve(root);
  const absolute = path.resolve(candidate);
  const boundary = within(rootLexical, absolute) ? rootLexical : within(rootReal, absolute) ? rootReal : null;
  if (!boundary) throw new Error(`Output directory escapes allowed root: ${candidate}`);
  let current = boundary;
  for (const segment of path.relative(boundary, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Unsafe output directory component: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(current);
    }
    const resolved = await realpath(current);
    if (!within(rootReal, resolved)) throw new Error(`Output directory escapes allowed root: ${candidate}`);
  }
  return realpath(absolute);
}

/**
 * application-graph.json is ScreenTrace's own output, so its budget only guards memory. Large legacy apps exceed
 * tens of MB (chrisekelley/zeprs: ~40 MB); V8 cannot hold a string much over 512 MiB.
 */
export const MAX_ANALYSIS_GRAPH_BYTES = 256 * 1024 * 1024;

export async function readAnalysisGraph(output, maxBytes = MAX_ANALYSIS_GRAPH_BYTES) {
  let text;
  try {
    text = await readUtf8Limited(output, path.join(output, 'application-graph.json'), maxBytes);
  } catch (error) {
    if (/byte limit/.test(error.message)) throw new Error(`application-graph.json exceeds the ${maxBytes}-byte preview budget; static previews were not rendered`);
    throw error;
  }
  return JSON.parse(text);
}

export async function readUtf8Limited(root, file, maxBytes = 8 * 1024 * 1024) {
  const bytes=await readBufferLimited(root,file,maxBytes);
  const encoding=declaredSourceEncoding(file,bytes);
  return encoding==='UTF-8'?bytes.toString('utf8'):new TextDecoder(encoding,{fatal:true}).decode(bytes);
}

export function declaredSourceEncoding(file,bytes){
 if(!/\.(jspf?|html?|tagx?)$/i.test(file))return 'UTF-8';
 const header=bytes.subarray(0,8192).toString('latin1').replace(/<%--[\s\S]*?--%>|<!--[\s\S]*?-->/g,'');
 const values=[...new Set([...header.matchAll(/<%@\s*page\b[^%]*?\bpageEncoding\s*=\s*['"]([A-Za-z0-9_-]+)['"]/gi)].map(m=>m[1].toUpperCase()))];
 if(values.length>1)throw Error('Conflicting source encoding declarations');
 const value=values[0]||'UTF-8';if(!['UTF-8','UTF8','GB18030','GBK','GB2312','ISO-8859-1','US-ASCII'].includes(value))throw Error('Unsupported declared source encoding: '+value);return value;
}

export async function readBufferLimited(root, file, maxBytes = 8 * 1024 * 1024) {
  const safe = await resolveExistingFileWithin(root, file);
  const chunks = [];
  let total = 0;
  const handle = await open(safe, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    for await (const chunk of createReadStream(safe, { fd: handle.fd, autoClose: false })) {
      total += chunk.byteLength;
      if (total > maxBytes) throw new Error(`File exceeds ${maxBytes} byte limit: ${file}`);
      chunks.push(chunk);
    }
  } finally {
    await handle.close();
  }
  return Buffer.concat(chunks, total);
}

export async function writeBufferWithin(root, file, content) {
  const safe = await assertOutputPathWithin(root, file);
  const handle = await open(safe, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await handle.writeFile(content); }
  finally { await handle.close(); }
}
