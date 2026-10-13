import { DatabaseSync } from "node:sqlite";
import type { Session } from "./reclaim.js";
import type { VerifiedFacts } from "./policy.js";

/** Persistent consumption, with immutable facts for idempotent CRE node reads/retries. */
export class EvidenceStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, body TEXT NOT NULL, authorized INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, proof_hash TEXT NOT NULL UNIQUE, body TEXT NOT NULL);`);
  }
  create(s: Session) { this.db.prepare("INSERT INTO sessions(id,body) VALUES (?,?)").run(s.id, JSON.stringify(s)); }
  get(id: string): { session: Session; authorized: boolean; consumed: boolean } {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id=?").get(id);
    if (!row) throw new Error("Unknown session");
    return { session: JSON.parse(row.body as string), authorized: row.authorized === 1, consumed: row.consumed === 1 };
  }
  authorize(s: Session) {
    const result = this.db.prepare("UPDATE sessions SET body=?, authorized=1 WHERE id=? AND authorized=0 AND consumed=0").run(JSON.stringify(s), s.id);
    if (result.changes !== 1) throw new Error("Session already authorized");
  }
  consume(id: string, facts: VerifiedFacts) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db.prepare("UPDATE sessions SET consumed=1 WHERE id=? AND authorized=1 AND consumed=0").run(id);
      if (result.changes !== 1) throw new Error("Session already consumed or unauthorized");
      this.db.prepare("INSERT INTO receipts(id,proof_hash,body) VALUES (?,?,?)").run(id, facts.proofHash, JSON.stringify(facts));
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  receipt(id: string): VerifiedFacts {
    const row = this.db.prepare("SELECT body FROM receipts WHERE id=?").get(id);
    if (!row) throw new Error("Unknown receipt");
    return JSON.parse(row.body as string);
  }
}
