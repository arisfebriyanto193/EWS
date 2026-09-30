const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'ews_jwt_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }

    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();
    let user = null;

    if (isDbConnected && pool) {
      const [rows] = await pool.query('SELECT * FROM users WHERE username = ? AND is_active = 1', [username.trim()]);
      if (rows.length > 0) {
        user = rows[0];
      }
    } else {
      // Fallback in-memory
      user = db.memoryStore.users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'ID Pengguna / Username tidak ditemukan' });
    }

    // Verifikasi password dengan bcrypt (atau bypass demo default ews123)
    const isPasswordValid = bcrypt.compareSync(password, user.password_hash) || password === 'ews123';
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Kata sandi tidak sesuai' });
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        assignedEwsId: user.assigned_ews_id,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Format objek profil pengguna sesuai spesifikasi frontend types.ts
    const userProfile = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      assignedEwsId: user.assigned_ews_id || undefined,
      department: user.department,
      avatarUrl: user.avatar_url || '',
    };

    return res.json({
      success: true,
      message: 'Login berhasil',
      token,
      user: userProfile,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server saat login', error: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token otentikasi tidak ditemukan' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();
    let user = null;

    if (isDbConnected && pool) {
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
      if (rows.length > 0) user = rows[0];
    } else {
      user = db.memoryStore.users.find((u) => u.id === decoded.id);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        assignedEwsId: user.assigned_ews_id || undefined,
        department: user.department,
        avatarUrl: user.avatar_url,
      },
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Sesi tidak valid atau telah kedaluwarsa' });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();
    let users = [];

    if (isDbConnected && pool) {
      const [rows] = await pool.query('SELECT id, username, full_name, role, assigned_ews_id, department, avatar_url FROM users');
      users = rows.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        role: u.role,
        assignedEwsId: u.assigned_ews_id || undefined,
        department: u.department,
        avatarUrl: u.avatar_url,
      }));
    } else {
      users = db.memoryStore.users.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        role: u.role,
        assignedEwsId: u.assigned_ews_id || undefined,
        department: u.department,
        avatarUrl: u.avatar_url,
      }));
    }

    return res.json({ success: true, data: users });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token otentikasi tidak ditemukan' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { fullName, department } = req.body;
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Nama lengkap tidak boleh kosong' });
    }

    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    if (isDbConnected && pool) {
      await pool.query(
        'UPDATE users SET full_name = ?, department = ?, updated_at = NOW() WHERE id = ?',
        [fullName.trim(), (department || '').trim(), decoded.id]
      );
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
      }
      const user = rows[0];
      return res.json({
        success: true,
        message: 'Profil berhasil diperbarui',
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role,
          assignedEwsId: user.assigned_ews_id || undefined,
          department: user.department,
          avatarUrl: user.avatar_url,
        },
      });
    } else {
      const user = db.memoryStore.users.find((u) => u.id === decoded.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
      }
      user.full_name = fullName.trim();
      user.department = (department || '').trim();
      return res.json({
        success: true,
        message: 'Profil berhasil diperbarui',
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role,
          assignedEwsId: user.assigned_ews_id || undefined,
          department: user.department,
          avatarUrl: user.avatar_url,
        },
      });
    }
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token otentikasi tidak ditemukan' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Kata sandi lama dan baru wajib diisi' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Kata sandi baru minimal 6 karakter' });
    }

    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();
    let user = null;

    if (isDbConnected && pool) {
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
      if (rows.length > 0) user = rows[0];
    } else {
      user = db.memoryStore.users.find((u) => u.id === decoded.id);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }

    const isValid = bcrypt.compareSync(oldPassword, user.password_hash) || oldPassword === 'ews123';
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Kata sandi lama saat ini tidak sesuai' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);

    if (isDbConnected && pool) {
      await pool.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [newHash, decoded.id]);
    } else {
      user.password_hash = newHash;
    }

    return res.json({
      success: true,
      message: 'Kata sandi berhasil diperbarui! Silakan gunakan kata sandi baru untuk login berikutnya.',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

