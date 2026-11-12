import * as path from 'path';

/**
 * Every e2e worker talks to a dedicated SQLite file, never to the developer's dev.db
 * (the suites delete all rows before running).
 */
const databaseFile = path.join(__dirname, 'e2e.db').split(path.sep).join('/');

process.env.DATABASE_URL = `file:${databaseFile}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-only-secret';
