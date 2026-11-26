/** Auto-saving the review progress into a Markdown file the person chose (File System Access API, Chrome／Edge). */

export interface PermissionHandle {
  readonly name: string;
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
export interface HandleStore {
  load(key: string): Promise<FileHandle | undefined>;
  save(key: string, handle: FileHandle): Promise<void>;
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

/** The default folder shares the handle store under a key no application name can produce. */
const folderKey = '\u0000default-folder';
export const loadFolder = async () =>
  (await handleStore().load(folderKey)) as unknown as FolderHandle | undefined;
export const saveFolder = (folder: FolderHandle) =>
  handleStore().save(folderKey, folder as unknown as FileHandle);
/** The file named `name` in `folder`, or undefined when it does not exist yet. */
export async function existingFile(folder: FolderHandle, name: string) {
  try {
    return await folder.getFileHandle(name);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
    throw error;
  }
}
