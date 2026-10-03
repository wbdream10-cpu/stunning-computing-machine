import { DatabaseSync } from 'node:sqlite';

// Small D1-compatible surface used by the existing configuration service.
export function openDatabase(filename) {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  function prepare(sql) {
    const statement = db.prepare(sql);
    let values = [];
    return {
      bind(...bound) { values = bound; return this; },
      async first() { return statement.get(...values) ?? null; },
      async all() { return { results: statement.all(...values) }; },
      async run() { return { success: true, meta: { changes: Number(statement.run(...values).changes) } }; },
      execute() { return { success: true, meta: { changes: Number(statement.run(...values).changes) } }; },
    };
  }
  return {
    prepare,
    exec(sql) { db.exec(sql); },
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.execute());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close() { db.close(); },
  };
}
