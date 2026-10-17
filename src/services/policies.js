import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';

let runtime;

/** 数据库与 WASM 都随站点发布；浏览器只读 SQLite，不依赖在线后端。 */
export async function loadPolicies() {
  runtime ??= initSqlJs({ locateFile: () => wasmUrl }).catch((error) => {
    runtime = null;
    throw error;
  });
  const [SQL, response] = await Promise.all([
    runtime,
    fetch(`${import.meta.env.BASE_URL}data/policies.sqlite`, { cache: 'no-store' }),
  ]);
  if (!response.ok) throw new Error('城市数据库无法加载，请在本地运行 npm run db:init，并随站点发布数据库');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let db;
  try {
    db = new SQL.Database(bytes);
    if (db.exec('PRAGMA user_version')[0]?.values[0][0] !== 1) throw new Error('数据库版本不兼容');
    const query = db.exec(`SELECT c.name, c.synced_at, c.last_error, p.policy_json
      FROM cities c LEFT JOIN policies p ON c.name = p.city_name ORDER BY c.name`)[0];
    return (query?.values || []).map(([name, syncedAt, lastError, policyJson]) => ({
      name, syncedAt, lastError, policy: policyJson ? JSON.parse(policyJson) : null,
    }));
  } catch (error) {
    throw new Error(`无法读取城市数据库：${error.message}`);
  } finally {
    db?.close();
  }
}
