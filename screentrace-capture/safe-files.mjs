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
function within(root, candidate) { return candidate === root || candidate.startsWith(root + path.sep); }

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

export async function readUtf8Limited(root, file, maxBytes = 8 * 1024 * 1024) {
  return (await readBufferLimited(root, file, maxBytes)).toString('utf8');
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
