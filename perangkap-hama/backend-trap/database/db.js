const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let pool = null;
let isConnected = false;

// Fallback in-memory store jika database MySQL belum terhubung
const memoryStore = {
  users: [
    {
      id: 'user-01',
      username: 'admin_bpbd',
      password_hash: '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS',
      full_name: 'Ir. Hendra Wijaya, M.T.',
      role: 'superadmin',
      assigned_trap_id: null,
      department: 'Tim Pengendalian Hama & Agrikultur Cerdas',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 'user-01b',
      username: 'admin_trap',
      password_hash: '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS',
      full_name: 'Ir. Hendra Wijaya, M.T.',
      role: 'superadmin',
      assigned_trap_id: null,
      department: 'Tim Pengendalian Hama & Agrikultur Cerdas',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 'user-02',
      username: 'operator_trap',
      password_hash: '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS',
      full_name: 'Budi Santoso',
      role: 'operator',
      assigned_trap_id: 'TRAP-01',
      department: 'Pos Pantau Lapangan Hama Sektor 1',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 'user-02b',
      username: 'operator_trap01',
      password_hash: '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS',
      full_name: 'Budi Santoso',
      role: 'operator',
      assigned_trap_id: 'TRAP-01',
      department: 'Pos Pantau Lapangan Hama Sektor 1',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    }
  ],
  pestTraps: {},
  trapLogs: []
};

async function initDb() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    queueLimit: 0,
  };

  try {
    console.log(`🔌 Menghubungkan ke MySQL di ${dbConfig.host}:${dbConfig.port}...`);
    const initialConn = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
    });

    const dbName = process.env.DB_NAME || 'ews_iot_db';
    await initialConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await initialConn.end();

    pool = mysql.createPool({
      ...dbConfig,
      database: dbName,
    });

    const [rows] = await pool.query("SHOW TABLES LIKE 'pest_traps'");
    if (rows.length === 0) {
      console.log('📦 Tabel pest_traps belum ada. Menjalankan skema database...');
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
      await pool.query(schemaSql);

      console.log('🌱 Menjalankan data seeding awal...');
      const seedsSql = fs.readFileSync(path.join(__dirname, 'seeds.sql'), 'utf-8');
      await pool.query(seedsSql);
      console.log('✅ Skema dan Data Awal Smart Trap MySQL Berhasil Diinisialisasi!');
    } else {
      console.log('✅ Database MySQL terhubung dan tabel pest_traps siap.');
    }

    isConnected = true;
    return pool;
  } catch (err) {
    console.warn(`⚠️ Gagal terhubung ke MySQL (${err.message}).`);
    console.warn('💡 Backend Trap akan menggunakan Mode Mock In-Memory sementara.');
    isConnected = false;
    return null;
  }
}

async function query(sql, params = []) {
  if (isConnected && pool) {
    try {
      const [results] = await pool.query(sql, params);
      return results;
    } catch (error) {
      console.error('❌ SQL Query Error:', error.message);
      throw error;
    }
  }
  return null;
}

module.exports = {
  initDb,
  query,
  getPool: () => pool,
  getIsConnected: () => isConnected,
  memoryStore
};
