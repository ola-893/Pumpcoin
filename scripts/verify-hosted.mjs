const base = process.argv[2] ?? 'https://pumpcoin-one.vercel.app';
const report = [];
async function request(path, init = {}) {
  const response = await fetch(base + path, { ...init, signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { response, data };
}
for (const path of ['/', '/agents', '/register', '/pumpcoin-icon.svg', '/evidence/vault-local-evidence.json', '/api/health']) {
  const {response,data} = await request(path);
  report.push({path,status:response.status,type:response.headers.get('content-type'), ...(path === '/api/health' ? {data} : {})});
  if (!response.ok) throw new Error(`Failed ${path}: ${response.status}`);
}
const session = await request('/api/agent-registration/status');
const headers = { 'X-PumpCoin-Registration-Token': session.data.token, 'Content-Type': 'application/json' };
const directory = await request('/api/agent-registration/records', {headers});
if (!directory.response.ok || !Array.isArray(directory.data.records)) throw new Error('Directory API failed.');
report.push({path:'/api/agent-registration/records',status:directory.response.status,names:directory.data.records.map(r=>r.manifest.name)});
const record = directory.data.records.find(r => r.manifest.name === 'Muse Demo' && r.binding) ?? directory.data.records.find(r => r.binding);
const checks = await Promise.all(['/agent-state', '/native-state'].map(async route => {
  const {response,data} = await request('/api/agent-registration'+route,{method:'POST',headers,body:JSON.stringify({id:record.id,...(route==='/native-state'?{account:''}:{})})});
  return {path:route,status:response.status,data};
}));
report.push(...checks);
const market = await request('/api/market-data/monad');
report.push({path:'/api/market-data/monad',status:market.response.status,rows:market.data.rows?.length,error:market.data.error});
const denied = await request('/api/agent-registration/trader-start',{method:'POST',headers,body:JSON.stringify({id:record.id})});
report.push({path:'/trader-start',status:denied.response.status});
console.log(JSON.stringify(report,null,2));
if (checks.some(x=>x.status!==200)) process.exitCode=1;
