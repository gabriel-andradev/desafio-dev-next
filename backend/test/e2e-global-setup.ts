import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Recreates test/e2e.db (and only that file) from the real migrations before the suites run.
 */
export default function globalSetup(): void {
  const databaseFile = path.join(__dirname, 'e2e.db').split(path.sep).join('/');

  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(`${databaseFile}${suffix}`, { force: true });
  }

  const result = spawnSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: `file:${databaseFile}` },
    shell: true,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(`Could not prepare the e2e database:\n${result.stderr}`);
  }
}
