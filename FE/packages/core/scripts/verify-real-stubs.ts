/**
 * Proves the USE_MOCKS=false path fails loudly: with the flag off, calls
 * every method on every service via the real `services` export and asserts
 * each one rejects with NOT_IMPLEMENTED. Exits non-zero if any method
 * resolves (i.e. silently returned data) or throws something else.
 *
 * Once a service gets a real implementation, add it to IMPLEMENTED below.
 */
const IMPLEMENTED = new Set<string>([]);

async function main(): Promise<number> {
  // Set before serviceProvider is loaded — it reads the flag once at import.
  process.env.USE_MOCKS = 'false';
  const { services, USE_MOCKS } = await import('../serviceProvider');
  const { isServiceError } = await import('../errors');

  if (USE_MOCKS) {
    console.error('FAIL: USE_MOCKS=false was not honoured — services are still mocked');
    return 1;
  }

  let failures = 0;
  let checked = 0;
  for (const [serviceName, service] of Object.entries(services)) {
    for (const [method, fn] of Object.entries(service as Record<string, (...a: unknown[]) => Promise<unknown>>)) {
      const op = `${serviceName}.${method}`;
      if (IMPLEMENTED.has(op)) continue;
      checked++;
      try {
        const result = fn({}, {}, {});
        if (!(result instanceof Promise)) throw new Error('did not return a promise');
        await result;
        console.error(`FAIL  ${op} resolved — it returned data instead of failing`);
        failures++;
      } catch (e) {
        if (isServiceError(e, 'NOT_IMPLEMENTED') && e.message.includes(op)) continue;
        console.error(`FAIL  ${op} threw the wrong error:`, e);
        failures++;
      }
    }
  }
  console.log(`${checked} real-service methods checked across ${Object.keys(services).length} services — ${failures} failures.`);
  return failures ? 1 : 0;
}

main().then((code) => process.exit(code));
