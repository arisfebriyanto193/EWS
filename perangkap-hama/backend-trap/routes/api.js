const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const trapController = require('../controllers/trapController');
const logController = require('../controllers/logController');

// 1. Auth Routes
router.post('/auth/login', authController.login);
router.get('/auth/me', authController.getMe);
router.get('/auth/users', authController.getUsers);
router.put('/auth/profile', authController.updateProfile);
router.put('/auth/change-password', authController.changePassword);

// 2. Pest Trap Routes
router.get('/traps', trapController.getAllTraps);
router.post('/traps', trapController.createTrap);
router.get('/traps/:id', trapController.getTrapById);
router.put('/traps/:id', trapController.updateTrap);
router.delete('/traps/:id', trapController.deleteTrap);
router.post('/traps/:id/control', trapController.controlTrap);
router.get('/traps/:id/battery-history', trapController.getBatteryHistory);

// 3. Trap Logs & CSV Export
router.get('/logs/traps', logController.getTrapLogs);
router.get('/logs/export/csv', logController.exportTrapCsv);

// 4. HTTP Webhook Ingestion Fallback (untuk ESP32 jika menggunakan HTTP POST)
router.post('/telemetry/trap', logController.postTrapTelemetryHttp);

// 5. Fallback alarms endpoint if queried by shared components
router.get('/alarms', (req, res) => {
  res.json({ success: true, count: 0, data: [] });
});

module.exports = router;
