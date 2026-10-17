export const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

export async function api(path, body) {
  if (!isLocalHost) throw new Error('数据同步需要本地服务，请在电脑上运行 npm run dev');
  let response;
  try {
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch {
    throw new Error('无法连接本地同步服务，请运行 npm run dev 后重试');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('当前页面没有连接同步接口，请使用 npm run dev 启动'); }
  if (!response.ok) throw new Error(data.error || `接口错误 ${response.status}`);
  return data;
}
