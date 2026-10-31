export function decodeMcpResponse(body:string,contentType:string,id:number|null):any {
  const values=contentType.includes('text/event-stream')?body.split(/\r?\n\r?\n/).flatMap(block=>{const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');return data?[JSON.parse(data)]:[];}):[JSON.parse(body)];
  const value=values.find(v=>v.id===id);
  if(!value||value.jsonrpc!=='2.0'||value.error||!('result' in value))throw new Error('MCP response does not match its request.');
  return value.result;
}
