const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runMigration() {
  console.log('🚀 Menjalankan migrasi DDL database MySQL...');
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  };

  try {
    const conn = await mysql.createConnection(dbConfig);
    const dbName = process.env.DB_NAME || 'ews_iot_db';
    
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await conn.changeUser({ database: dbName });

    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await conn.query(sql);

    console.log('✅ Migrasi skema database berhasil!');
    await conn.end();
  } catch (err) {
    console.error('❌ Gagal menjalankan migrasi:', err.message);
    process.exit(1);
  }
}

runMigration();
