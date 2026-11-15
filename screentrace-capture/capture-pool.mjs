/**
 * Ordered concurrent work for the preview capture (HC-004, ADR 0138). Screens are captured on
 * several pages at once, but every result is merged in screen order, so the output does not depend
 * on which page finishes first.
 */

/** Reads `--capture-concurrency=N` (1 captures one screen at a time, as before R47). */
export function captureConcurrency(args, fallback = 4) {
  const raw = args.find((arg) => arg.startsWith('--capture-concurrency='));
  if (!raw) return fallback;
  const value = Number(raw.split('=')[1]);
  if (!Number.isSafeInteger(value) || value < 1 || value > 32)
    throw new Error('無效預覽設定：capture-concurrency');
  return value;
}

/**
 * Groups items that write the same output file into one chain, kept in their original order, so
 * the later one still overwrites the earlier one. Chains are listed by their first item.
 */
export function outputChains(items, fileKey) {
  const chains = new Map();
  for (const item of items) {
    const key = fileKey(item);
    if (!chains.has(key)) chains.set(key, []);
    chains.get(key).push(item);
  }
  return [...chains.values()];
}

/** Reads `--deadline=<epoch milliseconds>`, after which no new screen starts; null if absent. */
export function captureDeadline(args) {
  const raw = args.find((arg) => arg.startsWith('--deadline='));
  if (!raw) return null;
  const value = Number(raw.split('=')[1]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('無效預覽設定：deadline');
  return value;
}

/**
 * Runs `worker(item, slot)` for every item of every chain, at most `concurrency` chains at once.
 * Before each item `mayStart()` is asked; once it answers false, no further item starts, items
 * already running finish, and the items never started are returned in their original order
 * (RV-105).
 */
export async function runChains(chains, concurrency, worker, mayStart = () => true) {
  let next = 0,
    stopped = false;
  const skipped = new Set();
  const lane = async (slot) => {
    while (next < chains.length) {
      const chain = chains[next++];
      for (const item of chain) {
        if (stopped || !mayStart()) {
          stopped = true;
          skipped.add(item);
          continue;
        }
        await worker(item, slot);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, chains.length) }, (_, slot) => lane(slot)),
  );
  return chains.flat().filter((item) => skipped.has(item));
}

/** One task at a time, in call order; for steps that use module-level state. */
export function exclusive() {
  let tail = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}
