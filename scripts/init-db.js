import { openDatabase, databasePath } from '../server/database.js';

const db = openDatabase();
db.close();
console.log(`政策数据库已就绪：${databasePath}`);
