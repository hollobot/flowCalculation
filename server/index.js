import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openDatabase, createPolicyRepository, databasePath } from './database.js';
import { createSyncService } from './sync.js';

const development = process.argv.includes('--dev');
const port = Number(process.env.PORT || (development ? 5173 : 3001));
const db = openDatabase();
const sync = createSyncService(createPolicyRepository(db));
const server = createServer(handleRequest);
const vite = development ? await (await import('vite')).createServer({
  server: { middlewareMode: true, hmr: { server } },
  appType: 'spa',
}) : null;

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new Error('请求内容过长');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('请求内容必须是 JSON'); }
}

async function handleRequest(request, response) {
  try {
    const host = request.headers.host;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) {
      return json(response, 403, { error: '只允许本机访问' });
    }
    const path = new URL(request.url, `http://${host}`).pathname;
    if (path.startsWith('/api/')) {
      // 同源页面和本机命令行可调用；不向任意互联网网站开放本地写入接口。
      if (request.headers.origin && request.headers.origin !== `http://${host}`) {
        return json(response, 403, { error: '请在本地页面执行同步' });
      }
      if (request.method === 'GET' && path === '/api/health') return json(response, 200, { service: 'flow-calculation', local: true });
      if (request.method === 'GET' && path === '/api/sync') return json(response, 200, { job: sync.current() });
      if (request.method === 'POST' && ['/api/sync/city', '/api/sync/all'].includes(path)) {
        if (!request.headers['content-type']?.startsWith('application/json')) {
          return json(response, 415, { error: '请使用 application/json' });
        }
        const body = await readBody(request);
        let city;
        if (path.endsWith('/city')) {
          city = typeof body?.city === 'string' ? body.city.trim() : '';
          if (!city || city.length > 80 || /[\x00-\x1f/\\]/.test(city)) throw new Error('请输入有效的城市名称');
        }
        return json(response, 202, { job: sync.start(city) });
      }
      return json(response, 404, { error: '接口不存在' });
    }
    if (request.method === 'GET' && path === '/data/policies.sqlite') {
      // 读取期间不让出事件循环，避免与同进程的 SQLite 提交交错而返回半份数据库。
      const bytes = readFileSync(databasePath);
      response.writeHead(200, { 'Content-Type': 'application/vnd.sqlite3', 'Cache-Control': 'no-store' });
      return response.end(bytes);
    }
    if (vite) return vite.middlewares(request, response);
    json(response, 404, { error: '此进程只提供接口；使用 npm run dev 启动本地页面' });
  } catch (error) {
    json(response, error.status || 400, { error: error.message });
  }
}

server.listen(port, '127.0.0.1', () => console.log(`本地${development ? '页面与' : ''}同步服务：http://127.0.0.1:${port}`));
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请关闭占用进程或设置 PORT` : error.message);
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await vite?.close();
    db.close();
    process.exit(0);
  });
}
