const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runSeed() {
  console.log('🌱 Menjalankan seeding data awal ke database MySQL...');
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ews_iot_db',
    multipleStatements: true,
  };

  try {
    const conn = await mysql.createConnection(dbConfig);
    const sql = fs.readFileSync(path.join(__dirname, 'seeds.sql'), 'utf-8');
    await conn.query(sql);

    console.log('✅ Seeding data awal berhasil!');
    await conn.end();
  } catch (err) {
    console.error('❌ Gagal menjalankan seeding:', err.message);
    process.exit(1);
  }
}

runSeed();
