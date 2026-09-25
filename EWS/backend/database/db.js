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
      assigned_ews_id: null,
      department: 'Pusdalops BPBD & Tim Gabungan Mitigasi',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 'user-02',
      username: 'operator_ews1',
      password_hash: '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS',
      full_name: 'Budi Santoso (Pos Pantau 1)',
      role: 'operator_ews1',
      assigned_ews_id: 'EWS-01',
      department: 'Pos Pantau Sektor Utara - Lereng Pasir Madu',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 'user-03',
      username: 'operator_ews2',
      password_hash: '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS',
      full_name: 'Rian Pratama (Pos Pantau 2)',
      role: 'operator_ews2',
      assigned_ews_id: 'EWS-02',
      department: 'Pos Pantau Sektor Barat - Tebing Cikadu',
      avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 'user-04',
      username: 'operator_ews3',
      password_hash: '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS',
      full_name: 'Ahmad Fauzi (Pos Pantau 3)',
      role: 'operator_ews3',
      assigned_ews_id: 'EWS-03',
      department: 'Pos Pantau Sektor Timur - Jalur Aliran Talaga',
      avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 'user-05',
      username: 'operator_ews4',
      password_hash: '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS',
      full_name: 'Agus Setiawan (Pos Pantau 4)',
      role: 'operator_ews4',
      assigned_ews_id: 'EWS-04',
      department: 'Pos Pantau Sektor Selatan - Pemukiman Warga',
      avatar_url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 'user-06',
      username: 'warga_publik',
      password_hash: '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS',
      full_name: 'Akses Portal Terbuka Komunitas',
      role: 'public',
      assigned_ews_id: null,
      department: 'Warga Masyarakat & Relawan Desa',
      avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
    }
  ],
  ewsNodes: {},
  pestTraps: {},
  alarmLogs: [],
  sensorLogs: [],
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
    // 1. Coba koneksi ke server MySQL tanpa memilih nama database dulu
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

    // 2. Buat connection pool dengan database terpilih
    pool = mysql.createPool({
      ...dbConfig,
      database: dbName,
    });

    // 3. Test koneksi dan inisialisasi tabel jika belum ada
    const [rows] = await pool.query("SHOW TABLES LIKE 'ews_nodes'");
    if (rows.length === 0) {
      console.log('📦 Tabel belum terdeteksi. Menjalankan skema database otomatis...');
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
      await pool.query(schemaSql);

      console.log('🌱 Menjalankan data seeding awal...');
      const seedsSql = fs.readFileSync(path.join(__dirname, 'seeds.sql'), 'utf-8');
      await pool.query(seedsSql);
      console.log('✅ Skema dan Data Awal MySQL Berhasil Diinisialisasi!');
    } else {
      console.log('✅ Database MySQL terhubung dan siap.');
    }

    isConnected = true;
    return pool;
  } catch (err) {
    console.warn(`⚠️ Gagal terhubung ke MySQL (${err.message}).`);
    console.warn('💡 Backend akan menggunakan Mode Mock In-Memory sementara.');
    console.warn('👉 Anda dapat menyesuaikan konfigurasi di file backend/.env');
    isConnected = false;
    return null;
  }
}

// Helper query yang aman (otomatis fallback ke in-memory jika MySQL belum aktif)
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
