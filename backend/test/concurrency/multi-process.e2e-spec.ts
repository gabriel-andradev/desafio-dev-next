import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Real multi-process concurrency: independent Node.js processes hit the same SQLite file
 * (test/e2e.db, prepared by the e2e global setup) at the same instant.
 * Mirror of tests/Concurrency/WalletConcurrencyTest.php in the PHP repository.
 */
type WorkerResult = Record<string, unknown> & { ok: boolean };

const backendDir = path.join(__dirname, '..', '..');
const worker = path.join(__dirname, 'wallet-worker.ts');

function runWorker(args: string[]): Promise<WorkerResult> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', worker, ...args],
      {
        cwd: backendDir,
        env: process.env,
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', () => {
      // Only the RESULT: line counts (editor extensions may also write to stdout).
      const line = stdout
        .split(String.fromCharCode(10))
        .map((l) => l.trim())
        .find((l) => l.startsWith('RESULT:'));
      try {
        resolve(JSON.parse(line!.slice('RESULT:'.length)) as WorkerResult);
      } catch {
        resolve({ ok: false, error: `${stdout} ${stderr}`.trim() });
      }
    });
  });
}

/** Starts the workers together and releases them at the same instant (after all have booted). */
const together = (argsList: string[][]) => {
  const startAt = String(Date.now() + 15_000);
  return Promise.all(
    argsList.map(([mode, key]) =>
      runWorker([mode, startAt, ...(key ? [key] : [])]),
    ),
  );
};

describe('Concurrency between independent Node.js processes (e2e)', () => {
  beforeEach(async () => {
    const setup = await runWorker(['setup']);
    expect(setup).toEqual({ ok: true });
  }, 60_000);

  it('two simultaneous transfers (different keys) cannot spend the same balance', async () => {
    // Sender has R$ 100,00; two processes try to send R$ 80,00 at the same instant.
    const results = await together([
      ['transfer', 'key-a'],
      ['transfer', 'key-b'],
    ]);

    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].status).toBe(422); // insufficient balance, not SQLITE_BUSY / 500

    const state = await runWorker(['inspect']);
    expect(state).toMatchObject({
      sender: 2_000,
      receiver: 8_000,
      transfers: 1,
    });
  }, 90_000);

  it('two simultaneous requests with the same idempotency key credit only once', async () => {
    const results = await together([
      ['deposit', 'same-key-001'],
      ['deposit', 'same-key-001'],
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(results[0].id).toBe(results[1].id);
    expect(results.filter((r) => r.replay)).toHaveLength(1);

    const state = await runWorker(['inspect']);
    expect(state).toMatchObject({ receiver: 5_000, deposits: 1 });
  }, 90_000);

  it('a failure in the middle of a transfer in another process rolls everything back', async () => {
    const result = await runWorker(['fail-transfer']);
    expect(result.ok).toBe(false);

    const state = await runWorker(['inspect']);
    expect(state).toMatchObject({ sender: 10_000, receiver: 0, transfers: 0 });
  }, 60_000);
});
