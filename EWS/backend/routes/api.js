const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const ewsController = require('../controllers/ewsController');
const trapController = require('../controllers/trapController');
const alarmController = require('../controllers/alarmController');
const logController = require('../controllers/logController');

// 1. Auth Routes
router.post('/auth/login', authController.login);
router.get('/auth/me', authController.getMe);
router.get('/auth/users', authController.getUsers);
router.put('/auth/profile', authController.updateProfile);
router.put('/auth/change-password', authController.changePassword);

// 2. EWS Nodes Routes
router.get('/ews', ewsController.getAllEws);
router.post('/ews', ewsController.createEws);
router.get('/ews/:id', ewsController.getEwsById);
router.delete('/ews/:id', ewsController.deleteEws);
router.put('/ews/:id/thresholds', ewsController.updateThresholds);
router.put('/ews/:id/telegram', ewsController.updateTelegramConfig);
router.post('/ews/:id/telegram/test', ewsController.testTelegram);
router.post('/ews/:id/control', ewsController.controlActuator);
router.post('/ews/:id/telkomsel/request-otp', ewsController.requestTelkomselOtp);
router.post('/ews/:id/telkomsel/verify-otp', ewsController.verifyTelkomselOtp);
router.post('/ews/:id/telkomsel/refresh', ewsController.refreshTelkomselQuota);
router.delete('/ews/:id/telkomsel', ewsController.deleteTelkomselConfig);

// 3. Pest Trap Routes
router.get('/traps', trapController.getAllTraps);
router.get('/traps/:id', trapController.getTrapById);
router.post('/traps/:id/control', trapController.controlTrap);

// 4. Alarm History & Mitigation Routes
router.get('/alarms', alarmController.getAlarms);
router.post('/alarms/:id/acknowledge', alarmController.acknowledgeAlarm);
router.post('/alarms/:id/resolve', alarmController.resolveAlarm);

// 5. Sensor Telemetry Logs & CSV Export
router.get('/logs/sensor', logController.getSensorLogs);
router.get('/logs/traps', logController.getTrapLogs);
router.get('/logs/export/csv', logController.exportSensorCsv);

// 6. HTTP Webhook Ingestion Fallback (untuk ESP32 jika menggunakan HTTP POST)
router.post('/telemetry/ews', logController.postEwsTelemetryHttp);
router.post('/telemetry/trap', logController.postTrapTelemetryHttp);

module.exports = router;
