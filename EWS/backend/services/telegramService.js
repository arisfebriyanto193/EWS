const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

/**
 * Service Integrasi Telegram Bot Resmi
 * Mengirim notifikasi telemetri, alert bahaya, dan uji koneksi
 * langsung ke Telegram Bot API (https://api.telegram.org)
 */

class TelegramService {
  /**
   * Mengirim pesan teks via Telegram Bot API
   * @param {string} botToken - Token bot dari @BotFather
   * @param {string|number} chatId - ID chat pengguna atau ID grup (-100xxxx)
   * @param {string} text - Isi pesan dalam format HTML
   * @returns {Promise<{success: boolean, message: string, data?: any, error?: string, rawError?: string}>}
   */
  static async sendMessage(botToken, chatId, text) {
    if (!botToken || !chatId) {
      return {
        success: false,
        error: 'Bot Token dan Chat ID wajib diisi!',
      };
    }

    const cleanToken = String(botToken)
      .trim()
      .replace(/^bot/i, '')
      .replace(/[\r\n\t\s]/g, '');
    const cleanChatId = String(chatId).trim();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: cleanChatId,
          text: text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        let errorDesc = result.description || 'Gagal mengirim pesan ke Telegram';
        
        // Terjemahan pesan error umum Telegram agar mudah dipahami pengguna
        if (errorDesc.includes('Unauthorized')) {
          errorDesc = 'Bot Token tidak valid atau salah. Periksa kembali token dari @BotFather.';
        } else if (errorDesc.includes('chat not found')) {
          errorDesc = 'Chat ID tidak ditemukan. Pastikan Anda sudah membuka bot di Telegram dan menekan tombol /start atau masukkan bot ke grup tujuan.';
        } else if (errorDesc.includes('bot was blocked by the user')) {
          errorDesc = 'Bot diblokir oleh pengguna. Buka unblock bot di Telegram Anda.';
        }

        console.error(`❌ [Telegram Error] ${errorDesc} (Raw: ${result.description})`);
        return {
          success: false,
          error: errorDesc,
          rawError: result.description,
        };
      }

      console.log(`✅ [Telegram Terkirim] Pesan berhasil dikirim ke Chat ID: ${cleanChatId}`);
      return {
        success: true,
        message: 'Pesan berhasil terkirim ke Telegram!',
        data: result.result,
      };
    } catch (err) {
      console.error('❌ [Telegram Network Error]', err.message);
      const isTimeout = err.name === 'AbortError';
      const msg = isTimeout
        ? 'Waktu koneksi ke Telegram API habis (timeout 12 detik).'
        : `Gagal terhubung ke Telegram API: ${err.message}. Pastikan server memiliki koneksi internet aktif.`;
      return {
        success: false,
        error: msg,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Mengirim pesan Uji Koneksi Sistem EWS
   */
  static async sendTestMessage(botToken, chatId, ewsData) {
    const timeStr = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'full',
      timeStyle: 'medium',
    });

    const ewsId = ewsData.id || 'EWS-TEST';
    const ewsName = ewsData.name || 'Pos Pemantau EWS';
    const location = ewsData.location || 'Sektor Pantauan Bencana';
    const pitch = ewsData.sensorData?.pitchAngle ?? 0.8;
    const roll = ewsData.sensorData?.rollAngle ?? 0.4;
    const rain = ewsData.sensorData?.rainfallRate ?? 0.0;
    const soil = ewsData.sensorData?.soilMoisture ?? 45.0;
    const batt = ewsData.sensorData?.batteryVoltage ?? 12.6;

    const htmlMessage = `
🚨 <b>NOTIFIKASI UJI SISTEM EWS & TELEMETRI IOT</b> 🚨
━━━━━━━━━━━━━━━━━━━━━━━━
📍 <b>Titik Pantau:</b> ${ewsName} (${ewsId})
📌 <b>Lokasi:</b> ${location}
⏱ <b>Waktu Uji:</b> ${timeStr} WIB

📊 <b>Status Telemetri Sensor:</b>
• Sudut Kemiringan (Pitch): <b>${pitch}°</b>
• Sudut Kemiringan (Roll): <b>${roll}°</b>
• Kelembapan Tanah: <b>${soil}%</b>
• Curah Hujan Sesaat: <b>${rain} mm/jam</b>
• Tegangan Baterai VRLA: <b>${batt} V (Optimal)</b>
• Status Sirine & Strobo: <b>STANDBY / NORMAL</b>

━━━━━━━━━━━━━━━━━━━━━━━━
✅ <b>STATUS SISTEM:</b>
Koneksi Bot Telegram <b>BERHASIL TERHUBUNG</b>. Notifikasi darurat bencana, peringatan dini (Siaga/Bahaya), dan laporan harian akan dikirim ke ruang obrolan ini.
`.trim();

    return await this.sendMessage(botToken, chatId, htmlMessage);
  }

  /**
   * Mengirim notifikasi Alarm Bahaya atau Siaga ke Telegram otomatis
   */
  static async sendAlarmAlert(telegramConfig, ewsNode, alarmType, cause, value) {
    if (!telegramConfig || !telegramConfig.enabled) {
      return;
    }

    if (alarmType === 'siaga' && !telegramConfig.notify_siaga && !telegramConfig.notifySiaga) {
      return;
    }
    if (alarmType === 'bahaya' && !telegramConfig.notify_bahaya && !telegramConfig.notifyBahaya) {
      return;
    }

    const isBahaya = alarmType === 'bahaya';
    const icon = isBahaya ? '🚨🚨 [STATUS: BAHAYA LONGSOR]' : '⚠️⚠️ [STATUS: SIAGA 1 WASPADA]';
    const sirenNote = isBahaya ? '🔊 SIRINE LOKAL 110dB & STROBO MERAH DIAKTIFKAN!' : '💡 STROBO KUNING AKTIF';

    const timeStr = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'full',
      timeStyle: 'medium',
    });

    const htmlMessage = `
${icon}
━━━━━━━━━━━━━━━━━━━━━━━━
<b>PERINGATAN DINI BENCANA GERAKAN TANAH / LONGSOR</b>
━━━━━━━━━━━━━━━━━━━━━━━━
📍 <b>Stasiun:</b> ${ewsNode.name || ewsNode.id}
📌 <b>Wilayah:</b> ${ewsNode.location || '-'}
⏱ <b>Waktu Deteksi:</b> ${timeStr} WIB

⚠️ <b>Pemicu Alarm:</b>
<b>${cause}</b>
📈 <b>Nilai Sensor:</b> ${value}

📢 <b>Status Lapangan:</b>
${sirenNote}

🚨 <b>Tindakan Yang Direkomendasikan:</b>
1. Segera evakuasi warga pada radius rawan lereng.
2. Tim Reaksi Cepat (TRC) BPBD menuju titik lokasi.
3. Pantau terus grafik telemetri melalui Dashboard Pusat.
━━━━━━━━━━━━━━━━━━━━━━━━
<i>Pesan otomatis dikirim oleh Gateway IoT EWS BPBD</i>
`.trim();

    return await this.sendMessage(
      telegramConfig.bot_token || telegramConfig.botToken,
      telegramConfig.chat_id || telegramConfig.chatId,
      htmlMessage
    );
  }
}

module.exports = TelegramService;
