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

/** Runs `worker(item, slot)` for every item of every chain, at most `concurrency` chains at once. */
export async function runChains(chains, concurrency, worker) {
  let next = 0;
  const lane = async (slot) => {
    while (next < chains.length) {
      const chain = chains[next++];
      for (const item of chain) await worker(item, slot);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, chains.length) }, (_, slot) => lane(slot)),
  );
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
