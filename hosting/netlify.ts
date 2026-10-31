import type { IncomingMessage, ServerResponse } from 'node:http';
import { hostedApi } from './api.js';

/** Adapt Netlify's web handler without exposing the local Vite operator plugins. */
export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/\.netlify\/functions\/pump-api(?=\/)/, '');
  const headers = Object.fromEntries(request.headers);
  headers.host = url.host;
  const req = { headers, method: request.method, url: url.pathname + url.search,
    body: ['GET','HEAD'].includes(request.method) ? undefined : await request.text() } as IncomingMessage & {body?: unknown};
  let status = 500, responseHeaders: Record<string,string> = {}, body = '';
  const res = {
    writeHead(code: number, values: Record<string,string>) { status = code; responseHeaders = values; },
    end(value: string) { body = value; },
  } as unknown as ServerResponse;
  await hostedApi(req, res);
  return new Response(body, {status, headers: responseHeaders});
}
