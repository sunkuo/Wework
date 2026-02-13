import mysql from "mysql2/promise";
import { config } from "./config.js";

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

export async function query(sql, params) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

export async function queryOne(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function checkConnection() {
  const conn = await getPool().getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
  return true;
}

const REQUIRED_TABLES = ["sessions", "events"];

export async function checkTables() {
  const rows = await query("SHOW TABLES");
  // SHOW TABLES 返回的列名形如 Tables_in_<dbname>
  const tables = rows.map((row) => Object.values(row)[0]);
  const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
  if (missing.length > 0) {
    throw new Error(
      `MySQL 缺少必要的表: ${missing.join(", ")}。请先执行建表 SQL。`
    );
  }
  return true;
}
