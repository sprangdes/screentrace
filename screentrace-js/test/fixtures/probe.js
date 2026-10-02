globalThis.__SCREENTRACE_PROBE__ = 'EXECUTED';
fetch('https://probe.invalid/never');
throw new Error('Target code must never run');
