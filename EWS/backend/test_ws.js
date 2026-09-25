const WebSocket = require('ws');

async function testWebSocket() {
  console.log('🧪 Memulai pengujian komunikasi WebSocket...');

  // 1. ESP32 Client Simulator
  const esp32 = new WebSocket('ws://localhost:3440', {
    headers: { 'User-Agent': 'Arduino-ESP32-Tester' }
  });

  // 2. Web Browser Client Simulator
  const webClient = new WebSocket('ws://localhost:3440', {
    headers: { 'Origin': 'http://localhost:3000' }
  });

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => { if (++connected === 2) resolve(); };
    esp32.on('open', () => { console.log('✅ ESP32 simulator terhubung'); check(); });
    webClient.on('open', () => { console.log('✅ Web Client simulator terhubung'); check(); });
  });

  // Setup listeners
  webClient.on('message', (msg) => {
    const data = JSON.parse(msg.toString());
    console.log(`🌐 [Web Client Menerima Pesan]: Topik "${data.topic || data.type}"`);
    if (data.topic === 'ews/EWS-01/telemetry' && data.payload && data.payload.sensorData) {
      console.log('   ↳ Status EWS-01:', data.payload.status, '| Pitch:', data.payload.sensorData.pitchAngle);
    }
    if (data.topic === 'alarms' && data.payload) {
      console.log('   🚨 [ALARM ALERT BROADCAST]:', data.payload.event, data.payload.status);
    }
  });

  esp32.on('message', (msg) => {
    const data = JSON.parse(msg.toString());
    console.log(`⚡ [ESP32 Menerima Pesan]: Topik "${data.topic || data.type}"`);
    if (data.topic === 'ews/EWS-01/command' && data.payload) {
      console.log('   ↳ Perintah diterima:', data.payload.command);
    }
  });

  // ESP32 subscribe ke command
  esp32.send(JSON.stringify({ action: 'subscribe', topic: 'ews/EWS-01/command' }));
  // Web client subscribe ke telemetry dan alarms
  webClient.send(JSON.stringify({ action: 'subscribe', topic: 'ews/EWS-01/telemetry' }));
  webClient.send(JSON.stringify({ action: 'subscribe', topic: 'alarms' }));

  await new Promise(r => setTimeout(r, 600));

  // ESP32 publish telemetri normal
  console.log('\n📤 [Test 1] ESP32 mengirim data telemetri normal...');
  esp32.send(JSON.stringify({
    action: 'publish',
    topic: 'ews/EWS-01/telemetry',
    payload: {
      pitchAngle: 0.18,
      rollAngle: -0.05,
      soilMoisture: 44.0,
      soilTemperature: 25.0,
      rainfallRate: 0.0,
      rainfallCumulative: 18.4,
      vibrationLevel: 0.015,
      batteryVoltage: 12.8,
      batteryCurrent: 410,
      solarCurrent: 1800,
      gsmSignalDbm: -68,
      gsmStatus: 'online',
      uptimeHours: 350
    }
  }));

  await new Promise(r => setTimeout(r, 1000));

  // Web Client mengirim perintah aktifkan sirine bahaya
  console.log('\n📤 [Test 2] Web Client mengirim instruksi bahaya ke ESP32...');
  webClient.send(JSON.stringify({
    action: 'publish',
    topic: 'ews/EWS-01/command',
    payload: {
      command: 'TRIGGER_ALARM',
      type: 'bahaya',
      siren: true,
      strobo: true,
      issuedBy: 'Operator BPBD'
    }
  }));

  await new Promise(r => setTimeout(r, 1000));

  // ESP32 mengirim format RAW yang memicu ambang batas bahaya
  console.log('\n📤 [Test 3] ESP32 mengirim format RAW memicu threshold Bahaya (Pitch 3.8)...');
  esp32.send('ews/EWS-01/telemetry|{"pitchAngle":3.85,"rollAngle":1.2,"rainfallRate":55.0,"vibrationLevel":0.35}');

  await new Promise(r => setTimeout(r, 1500));

  console.log('\n🏁 Semua pengujian WebSocket selesai dengan sukses!');
  esp32.close();
  webClient.close();
  process.exit(0);
}

testWebSocket().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
