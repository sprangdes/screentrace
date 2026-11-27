/** Auto-saving the review progress into a Markdown file the person chose (File System Access API, Chrome／Edge). */

export interface PermissionHandle {
  readonly name: string;
  /** Set by the browser on every FileSystemHandle; tells a stored file from a stored folder. */
  readonly kind?: 'file' | 'directory';
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
}
export interface FileHandle extends PermissionHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
/** The default folder: every report's progress md is created in it, without a save dialog. */
export interface FolderHandle extends PermissionHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
}
/** Remembered handles: each report's progress md under its application name, and the default folder. */
export interface HandleStore {
  load(key: string): Promise<PermissionHandle | undefined>;
  save(key: string, handle: PermissionHandle): Promise<void>;
  remove?(key: string): Promise<void>;
}
interface PickerWindow {
  showSaveFilePicker?: (options: object) => Promise<FileHandle>;
  showOpenFilePicker?: (options: object) => Promise<FileHandle[]>;
  showDirectoryPicker?: (options: object) => Promise<FolderHandle>;
  /** Test seam: replaces the IndexedDB handle store. */
  __screentraceHandleStore?: HandleStore;
}
const picker = () => window as unknown as PickerWindow;
const markdown = [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }];

export const autosaveSupported = () =>
  typeof picker().showSaveFilePicker === 'function' &&
  typeof picker().showOpenFilePicker === 'function';
export const chooseSaveFile = (suggestedName: string) =>
  picker().showSaveFilePicker!({ suggestedName, types: markdown });
export const chooseOpenFile = async () =>
  (await picker().showOpenFilePicker!({ types: markdown, multiple: false }))[0];
export const folderSupported = () => typeof picker().showDirectoryPicker === 'function';
export const chooseFolder = () =>
  picker().showDirectoryPicker!({ id: 'screentrace-progress', mode: 'readwrite' });
/** The file behind a remembered handle was moved or deleted. */
export const isMissing = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotFoundError';
export const isCancel = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

export async function writeFile(handle: FileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}
export async function readFile(handle: FileHandle): Promise<File> {
  return handle.getFile();
}

/** Handles survive reloads in IndexedDB; failures only lose the "continue" shortcut, never decisions. */
const indexedStore: HandleStore = {
  async load(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('handles').objectStore('handles').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async save(key, handle) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async remove(key) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('screentrace-progress', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export const handleStore = (): HandleStore => picker().__screentraceHandleStore || indexedStore;

const isFile = (handle: PermissionHandle): handle is FileHandle =>
  handle.kind !== 'directory' && typeof (handle as Partial<FileHandle>).getFile === 'function';
const isFolder = (handle: PermissionHandle): handle is FolderHandle =>
  handle.kind !== 'file' && typeof (handle as Partial<FolderHandle>).getFileHandle === 'function';
/** The progress md remembered for `key`; anything else stored there is ignored. */
export const loadFile = async (key: string) => {
  const handle = await handleStore().load(key);
  return handle && isFile(handle) ? handle : undefined;
};
/** The default folder shares the handle store under a key no application name can produce. */
const folderKey = '\u0000default-folder';
export const loadFolder = async () => {
  const handle = await handleStore().load(folderKey);
  return handle && isFolder(handle) ? handle : undefined;
};
export const saveFolder = (folder: FolderHandle) => handleStore().save(folderKey, folder);
/** The progress md's name in the default folder. Names are made filename-safe, so the
 * application name's hash keeps two applications ("a b" and "a-b", or "App" and "app" on
 * a case-insensitive disk) from sharing one file. */
export function folderFileName(applicationName: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < applicationName.length; i++)
    hash = Math.imul(hash ^ applicationName.charCodeAt(i), 0x01000193);
  const safe = applicationName.replace(/[\\/:*?"<>|\s]+/g, '-');
  return `screentrace-review-${safe}-${(hash >>> 0).toString(16).padStart(8, '0')}.md`;
}
/** The file named `name` in `folder`, or undefined when it does not exist yet. */
export async function existingFile(folder: FolderHandle, name: string) {
  try {
    return await folder.getFileHandle(name);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
    throw error;
  }
}
