import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { digest } from './encoding.js';
import type { Evidence, PolicyChallenge, PracticeEvent, Receipt, Session, SignedPolicy } from './types.js';

export class ResearchStore {
  readonly db:DatabaseSync;
  constructor(path:string) {
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);if(path!==':memory:')chmodSync(path,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS policies(hash TEXT PRIMARY KEY, registration TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, registration TEXT NOT NULL, policy TEXT NOT NULL REFERENCES policies(hash), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS evidence(hash TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions(session TEXT NOT NULL REFERENCES sessions(id), sequence INTEGER NOT NULL, hash TEXT UNIQUE NOT NULL, evidence TEXT NOT NULL REFERENCES evidence(hash), data TEXT NOT NULL, PRIMARY KEY(session,sequence));
      CREATE TABLE IF NOT EXISTS events(session TEXT NOT NULL REFERENCES sessions(id), id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session,id));
      CREATE TABLE IF NOT EXISTS leases(session TEXT PRIMARY KEY REFERENCES sessions(id), owner TEXT NOT NULL, until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS controls(session TEXT PRIMARY KEY REFERENCES sessions(id), stopped INTEGER NOT NULL);`);
    this.db.exec('CREATE TABLE IF NOT EXISTS runtimes(session TEXT PRIMARY KEY REFERENCES sessions(id), owner TEXT NOT NULL, until INTEGER NOT NULL)');
  }
  close(){this.db.close();}
  challenge(c:PolicyChallenge){this.db.prepare('INSERT INTO challenges VALUES(?,?)').run(c.id,JSON.stringify(c));}
  getChallenge(id:string):PolicyChallenge|undefined {const r=this.db.prepare('SELECT data FROM challenges WHERE id=?').get(id) as {data:string}|undefined;return r&&JSON.parse(r.data);}
  savePolicy(p:SignedPolicy,sessions:Session[]){this.transaction(()=>{if(!this.getChallenge(p.id))throw new Error('Research authorization was already consumed.');this.db.prepare('INSERT INTO policies VALUES(?,?,?)').run(p.hash,p.policy.registrationId,JSON.stringify(p));for(const s of sessions)this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(s.id,s.registrationId,s.policyHash,JSON.stringify(s));this.db.prepare('DELETE FROM challenges WHERE id=?').run(p.id);});}
  policies(id:string):SignedPolicy[]{return (this.db.prepare('SELECT data FROM policies WHERE registration=? ORDER BY rowid DESC').all(id) as {data:string}[]).map(r=>JSON.parse(r.data));}
  policy(hash:string):SignedPolicy {const r=this.db.prepare('SELECT data FROM policies WHERE hash=?').get(hash) as {data:string}|undefined;if(!r)throw new Error('Signed research policy not found.');return JSON.parse(r.data);}
  sessions(id:string):Session[]{return (this.db.prepare('SELECT data FROM sessions WHERE registration=? ORDER BY rowid DESC').all(id) as {data:string}[]).map(r=>JSON.parse(r.data));}
  session(id:string):Session {const r=this.db.prepare('SELECT data FROM sessions WHERE id=?').get(id) as {data:string}|undefined;if(!r)throw new Error('Practice session not found.');return JSON.parse(r.data);}
  rows(id:string){return (this.db.prepare('SELECT d.data, e.data AS snapshot FROM decisions d JOIN evidence e ON e.hash=d.evidence WHERE d.session=? ORDER BY sequence').all(id) as {data:string;snapshot:string}[]).map(r=>({receipt:JSON.parse(r.data) as Receipt,evidence:JSON.parse(r.snapshot) as Evidence}));}
  events(id:string):PracticeEvent[]{return (this.db.prepare('SELECT data FROM events WHERE session=? ORDER BY rowid').all(id) as {data:string}[]).map(r=>JSON.parse(r.data));}
  status(id:string,state:Session['state'],message:string,observedAt?:string){const s=this.session(id);s.state=state;s.message=message;if(observedAt)s.observedAt=observedAt;this.db.prepare('UPDATE sessions SET data=? WHERE id=?').run(JSON.stringify(s),id);}
  acquire(id:string,owner:string,now:number){return this.transaction(()=>{const r=this.db.prepare('SELECT owner,until FROM leases WHERE session=?').get(id) as {owner:string;until:number}|undefined;if(r&&r.until>now&&r.owner!==owner)throw new Error('This practice session is already running.');this.db.prepare('INSERT OR REPLACE INTO leases VALUES(?,?,?)').run(id,owner,now+300000);});}
  release(id:string,owner:string){this.db.prepare('DELETE FROM leases WHERE session=? AND owner=?').run(id,owner);}
  heartbeat(id:string,owner:string){const result=this.db.prepare('UPDATE leases SET until=? WHERE session=? AND owner=?').run(Date.now()+300000,id,owner);if(result.changes!==1)throw new Error('Practice writer lease was lost.');}
  requestStop(id:string,stopped:boolean){this.db.prepare('INSERT OR REPLACE INTO controls VALUES(?,?)').run(id,stopped?1:0);}
  stopped(id:string){return (this.db.prepare('SELECT stopped FROM controls WHERE session=?').get(id) as {stopped:number}|undefined)?.stopped===1;}
  leased(id:string){const r=this.db.prepare('SELECT until FROM leases WHERE session=?').get(id) as {until:number}|undefined;return !!r&&r.until>Date.now();}
  runtimeOwner(id:string){const r=this.db.prepare('SELECT owner,until FROM runtimes WHERE session=?').get(id) as {owner:string;until:number}|undefined;return r&&r.until>Date.now()?r.owner:undefined;}
  acquireRuntime(id:string,owner:string){this.transaction(()=>{if(this.runtimeOwner(id)&&this.runtimeOwner(id)!==owner)throw new Error('A supervised practice runtime already owns this session.');this.db.prepare('INSERT OR REPLACE INTO runtimes VALUES(?,?,?)').run(id,owner,Date.now()+180000);});}
  heartbeatRuntime(id:string,owner:string){if(this.db.prepare('UPDATE runtimes SET until=? WHERE session=? AND owner=?').run(Date.now()+180000,id,owner).changes!==1)throw new Error('Practice runtime lease was lost.');}
  releaseRuntime(id:string,owner:string){this.db.prepare('DELETE FROM runtimes WHERE session=? AND owner=?').run(id,owner);}
  commit(s:Session,r:Receipt,e:Evidence,events:PracticeEvent[],owner:string){this.transaction(()=>{const lease=this.db.prepare('SELECT owner,until FROM leases WHERE session=?').get(s.id) as {owner:string;until:number}|undefined;if(!lease||lease.owner!==owner||lease.until<Date.now())throw new Error('Practice writer lease expired.');const previous=this.session(s.id);if(previous.sequence+1!==r.body.sequence||previous.head!==r.body.previousHash||r.hash!==digest(r.body)||digest(e)!==r.body.evidenceHash)throw new Error('Concurrent or inconsistent practice commit.');this.db.prepare('INSERT OR IGNORE INTO evidence VALUES(?,?)').run(digest(e),JSON.stringify(e));this.db.prepare('INSERT INTO decisions VALUES(?,?,?,?,?)').run(s.id,r.body.sequence,r.hash,digest(e),JSON.stringify(r));for(const ev of events)this.db.prepare('INSERT INTO events VALUES(?,?,?)').run(s.id,ev.id,JSON.stringify(ev));this.db.prepare('UPDATE sessions SET data=? WHERE id=?').run(JSON.stringify(s),s.id);});}
  verifyCounts(id:string){const decisions=(this.db.prepare('SELECT COUNT(*) AS n FROM decisions WHERE session=?').get(id) as {n:number}).n;const joined=(this.db.prepare('SELECT COUNT(*) AS n FROM decisions d JOIN evidence e ON d.evidence=e.hash WHERE d.session=?').get(id) as {n:number}).n;if(decisions!==joined)throw new Error('Stored history is missing evidence.');return decisions;}
  private transaction<T>(f:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const v=f();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
