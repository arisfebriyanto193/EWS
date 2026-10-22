#!/usr/bin/env python3
"""
==============================================================================
SIMULATOR PERANGKAP HAMA CERDAS (SMART PEST TRAP) - ESP32 VIRTUAL CLIENT
==============================================================================
Program ini mensimulasikan perangkat fisik ESP32 secara realistis untuk
pengujian Web Monitoring IoT EWS (Frontend & Backend).

Fitur Simulator:
1. Menghubungkan ke WebSocket Server (ws:// atau wss://) persis seperti ESP32.
2. Otomatis Berlangganan (Subscribe) ke topik perintah: traps/{trapId}/command
3. Mengirimkan telemetri berkala ke: traps/{trapId}/telemetry
4. Data sensor simulasi yang masuk akal (Realistic Telemetry):
   - Tegangan Baterai (11.8V - 12.8V dengan fluktuasi alami)
   - Arus Solar Panel (0 mA saat malam/mendung, 200 - 650 mA saat siang)
   - Jarak Sensor VL53L0X (180 mm saat kosong, menurun seiring penumpukan hama)
   - Counter Hama (PIR & Sensor Fotolistrik)
   - Persentase Kapasitas Wadah (0 - 100%)
   - Siklus otomatis Blower (aktif sejenak saat ada hama, lalu mati sendiri)
   - Preset Warna LED Atraktor NeoPixel WS2812B
5. Sinkronisasi Dua Arah (Two-Way Sync):
   - Menerima kontrol dari web (saklar UV, saklar blower, mode, jadwal, preset)
   - Langsung mengaplikasikan dan mengirim feedback telemetri ke server.
6. Kontrol Interaktif via Terminal (Keyboard Shortcuts):
   - [H] / [T] : Trigger simulasi hama masuk (+1 hama, blower aktif)
   - [B]       : Toggle status Blower
   - [L]       : Toggle status Lampu LED UV
   - [M]       : Ganti Mode (otomatis -> manual -> otomatis_led)
   - [P]       : Ganti Preset Spektrum Warna LED
   - [R]       : Reset Counter Hama ke 0
   - [S]       : Kirim Telemetri Instan (Force Publish)
   - [Q]       : Keluar dari Simulator
==============================================================================
"""

import argparse
import asyncio
import json
import math
import os
import random
import select
import ssl
import sys
import termios
import time
import tty
from datetime import datetime

try:
    import websockets
except ImportError:
    print("[ERROR] Library 'websockets' belum terinstall.")
    print("Silakan jalankan: pip install websockets")
    sys.exit(1)

# ==============================================================================
# WARNA TERMINAL ANSI UNTUK TAMPILAN ELEGAN
# ==============================================================================
C_RESET  = "\033[0m"
C_BOLD   = "\033[1m"
C_DIM    = "\033[2m"
C_RED    = "\033[91m"
C_GREEN  = "\033[92m"
C_YELLOW = "\033[93m"
C_BLUE   = "\033[94m"
C_MAGENTA= "\033[95m"
C_CYAN   = "\033[96m"
C_WHITE  = "\033[97m"
C_BG_BLUE= "\033[44m"


# ==============================================================================
# DEFAULT PRESET WARNA LED NEOPIXEL ATRAKTOR HAMA
# ==============================================================================
DEFAULT_PRESETS = [
    {"id": "preset-1", "name": "UV / Ungu (395nm)", "r": 80,  "g": 0,   "b": 255},
    {"id": "preset-2", "name": "Hijau (520nm)",    "r": 0,   "g": 255, "b": 0},
    {"id": "preset-3", "name": "Biru (460nm)",     "r": 0,   "g": 120, "b": 255},
    {"id": "preset-4", "name": "Amber (590nm)",    "r": 255, "g": 180, "b": 0},
    {"id": "preset-5", "name": "Putih Hangat",     "r": 255, "g": 220, "b": 150},
]


# ==============================================================================
# KELAS SIMULATOR ESP32
# ==============================================================================
class ESP32TrapSimulator:
    def __init__(self, ws_url: str, trap_id: str, interval: float = 3.0, auto_pest: bool = True):
        self.ws_url = ws_url
        self.trap_id = trap_id
        self.telemetry_interval = interval
        self.auto_pest = auto_pest  # Simulasi hama lewat secara acak

        # State Hardware & Pengaturan (Persis ESP32)
        self.uv_led_status = True
        self.led_is_on = True
        self.blower_status = False
        self.blower_off_time = 0.0

        self.pest_counter = 12
        self.current_distance = 168  # mm (jarak sensor VL53L0X ke dasar wadah)
        self.battery_voltage = 12.54 # Volt
        self.solar_current = 420     # mA

        self.mode = "otomatis"       # otomatis | manual | otomatis_led
        self.active_preset = 0
        self.presets = [dict(p) for p in DEFAULT_PRESETS]

        self.start_time = "18:00"
        self.end_time = "06:00"
        self.led_rotation_interval = 15
        self.manual_interval_min = 15
        self.manual_duration_sec = 3
        self.blower_mode = "sensor"  # sensor | time
        self.led_running = False

        self.is_fast_telemetry = True
        self.last_client_activity = time.time()
        self.running = True
        self.ws = None
        self.force_send_event = asyncio.Event()

    # --------------------------------------------------------------------------
    # SIMULASI FISIK SENSOR REALISTIS
    # --------------------------------------------------------------------------
    def update_sensor_physics(self):
        """Memperbarui nilai sensor secara realistis (voltase baterai, solar, jarak wadah)"""
        now = datetime.now()
        hour = now.hour + now.minute / 60.0

        # 1. Solar Charging Current (mA)
        # Menghasilkan arus saat jam 06:00 - 18:00 dengan puncak di jam 12:00
        if 6.0 <= hour <= 18.0:
            sun_intensity = math.sin((hour - 6.0) / 12.0 * math.pi)
            base_solar = 550.0 * sun_intensity
            # Fluktuasi awan acak
            noise = random.uniform(-40.0, 40.0)
            self.solar_current = max(0, int(base_solar + noise))
        else:
            self.solar_current = 0

        # 2. Battery Voltage (V)
        # Baterai naik saat solar aktif, dan turun sedikit jika beban blower/led aktif
        load_drop = 0.0
        if self.blower_status:
            load_drop += 0.25  # Blower menyedot daya signifikan
        if self.uv_led_status and self.led_is_on:
            load_drop += 0.08  # LED atraktor menyala

        solar_boost = (self.solar_current / 600.0) * 0.4
        base_v = 12.35 + solar_boost - load_drop
        noise_v = random.uniform(-0.03, 0.03)
        self.battery_voltage = round(max(11.4, min(13.2, base_v + noise_v)), 2)

        # 3. Wadah & Jarak Sensor VL53L0X
        # Wadah penuh jika jarak makin kecil (misal kosong = 180mm, penuh = 20mm)
        # 500 hama ~ 100% kapasitas
        capacity = min(100, max(0, int((self.pest_counter / 400.0) * 100)))
        self.container_capacity_percent = capacity
        self.current_distance = max(15, int(180 - (capacity * 1.6)))

        # 4. Timer Blower Otomatis Mati
        if self.blower_status and time.time() >= self.blower_off_time:
            self.blower_status = False
            self.log("BLOWER", "Blower dinonaktifkan (durasi hisap selesai).", C_YELLOW)

        # 5. Simulasi Deteksi Hama Secara Alami (Acak)
        if self.auto_pest and random.random() < 0.12:  # ~12% kemungkinan tiap interval
            self.trigger_pest_event(source="Sensor Alami VL53L0X / PIR")

    def trigger_pest_event(self, source: str = "Manual Trigger"):
        """Memicu deteksi hama masuk ke dalam corong perangkap"""
        self.pest_counter += 1
        self.blower_status = True
        self.blower_off_time = time.time() + self.manual_duration_sec
        self.log(
            "HAMA!",
            f"{source} mendeteksi hama masuk! Total Hama: {C_BOLD}{self.pest_counter}{C_RESET} | Blower AKTIF selama {self.manual_duration_sec} detik.",
            C_GREEN,
        )
        self.force_send_event.set()

    # --------------------------------------------------------------------------
    # FORMAT TELEMETRI JSON (SESUAI DOKUMENTASI ESP32 & BACKEND)
    # --------------------------------------------------------------------------
    def build_telemetry_payload(self) -> dict:
        self.update_sensor_physics()
        preset_name = self.presets[self.active_preset]["name"] if 0 <= self.active_preset < len(self.presets) else "Custom"

        # Adaptive Fast Telemetry Status
        is_client_active = (time.time() - self.last_client_activity) < 30.0

        payload = {
            "trapId": self.trap_id,
            "uvLedStatus": self.uv_led_status,
            "ledIsOn": self.led_is_on and self.uv_led_status,
            "blowerStatus": self.blower_status,
            "pirTriggerCount": self.pest_counter,
            "photoelectricCount": self.pest_counter,
            "containerCapacityPercent": self.container_capacity_percent,
            "batteryVoltage": f"{self.battery_voltage:.2f}",
            "solarChargingCurrent": self.solar_current,
            "currentDistance": self.current_distance,
            "mode": self.mode,
            "activePreset": self.active_preset,
            "ledColor": preset_name,
            "manualIntervalMin": self.manual_interval_min,
            "manualDurationSec": self.manual_duration_sec,
            "blowerMode": self.blower_mode,
            "ledRunning": self.led_running,
            "isFastTelemetry": is_client_active,
            "telemetryIntervalSec": 3 if is_client_active else 300,
            "startTime": self.start_time,
            "endTime": self.end_time,
            "ledRotationInterval": self.led_rotation_interval,
            "presets": self.presets,
        }

        return {
            "action": "publish",
            "topic": f"traps/{self.trap_id}/telemetry",
            "payload": payload,
        }

    # --------------------------------------------------------------------------
    # PENANGANAN PERINTAH MASUK DARI WEB (COMMAND HANDLER)
    # --------------------------------------------------------------------------
    def handle_incoming_command(self, raw_data: dict):
        self.last_client_activity = time.time()
        self.log("COMMAND", f"Menerima pesan dari Web: {json.dumps(raw_data)}", C_CYAN)

        # Buka bungkus payload jika bersarang
        data = raw_data
        while isinstance(data, dict) and "payload" in data and isinstance(data["payload"], dict):
            data = data["payload"]

        modified = False

        # 1. Saklar Lampu LED UV
        if "uvLedStatus" in data:
            self.uv_led_status = bool(data["uvLedStatus"])
            self.log("CONTROL", f"Saklar UV LED diubah -> {'ON' if self.uv_led_status else 'OFF'}", C_MAGENTA)
            modified = True
        elif "ledIsOn" in data:
            self.uv_led_status = bool(data["ledIsOn"])
            self.log("CONTROL", f"Saklar UV LED diubah -> {'ON' if self.uv_led_status else 'OFF'}", C_MAGENTA)
            modified = True

        # 2. Saklar Blower
        if "blowerStatus" in data:
            cmd = bool(data["blowerStatus"])
            if cmd and not self.blower_status:
                self.blower_status = True
                self.blower_off_time = time.time() + self.manual_duration_sec
                self.log("CONTROL", f"Blower dinyalakan selama {self.manual_duration_sec} detik dari Web.", C_GREEN)
            elif not cmd:
                self.blower_status = False
                self.log("CONTROL", "Blower dimatikan langsung dari Web.", C_YELLOW)
            modified = True

        # 3. Ubah Mode
        if "mode" in data:
            m = str(data["mode"]).lower().replace("-", "_")
            if m in ["manual", "otomatis", "otomatis_led"]:
                self.mode = m
                self.log("CONTROL", f"Mode kerja diubah -> {self.mode.upper()}", C_BLUE)
                modified = True

        # 4. Preset Aktif
        if "activePreset" in data:
            try:
                p = int(data["activePreset"])
                if 0 <= p < len(self.presets):
                    self.active_preset = p
                    self.log("CONTROL", f"Preset LED aktif diubah -> Preset {p+1} ({self.presets[p]['name']})", C_BLUE)
                    modified = True
            except ValueError:
                pass

        # 5. Konfigurasi Waktu & Durasi
        if "startTime" in data:
            self.start_time = str(data["startTime"])
            modified = True
        if "endTime" in data:
            self.end_time = str(data["endTime"])
            modified = True
        if "ledRotationInterval" in data:
            self.led_rotation_interval = int(data["ledRotationInterval"])
            modified = True
        if "manualIntervalMin" in data:
            self.manual_interval_min = int(data["manualIntervalMin"])
            modified = True
        if "manualDurationSec" in data:
            self.manual_duration_sec = int(data["manualDurationSec"])
            modified = True

        # 6. Mode Blower & LED Running
        if "blowerMode" in data or "blower_mode" in data:
            self.blower_mode = str(data.get("blowerMode") or data.get("blower_mode"))
            self.log("CONTROL", f"Mode Blower diubah -> {self.blower_mode}", C_BLUE)
            modified = True
        if "ledRunning" in data or "led_running" in data:
            self.led_running = bool(data.get("ledRunning") if "ledRunning" in data else data.get("led_running"))
            self.log("CONTROL", f"Rotasi Warna LED Running -> {self.led_running}", C_BLUE)
            modified = True

        # 7. Update Array Preset
        if "presets" in data and isinstance(data["presets"], list):
            for i, p_item in enumerate(data["presets"]):
                if i >= len(self.presets):
                    break
                target_idx = i
                if "index" in p_item:
                    target_idx = int(p_item["index"])
                elif "idx" in p_item:
                    target_idx = int(p_item["idx"])
                elif "id" in p_item and isinstance(p_item["id"], int):
                    target_idx = p_item["id"] - 1

                if 0 <= target_idx < len(self.presets):
                    if "name" in p_item: self.presets[target_idx]["name"] = str(p_item["name"])
                    if "r" in p_item: self.presets[target_idx]["r"] = int(p_item["r"])
                    if "g" in p_item: self.presets[target_idx]["g"] = int(p_item["g"])
                    if "b" in p_item: self.presets[target_idx]["b"] = int(p_item["b"])
            self.log("CONTROL", "Pengaturan spektrum warna preset diperbarui dari Web.", C_GREEN)
            modified = True

        # 8. Perintah Khusus (Command string)
        if "command" in data:
            cmd = str(data["command"]).upper()
            if cmd in ["FAST_TELEMETRY", "REQUEST_DATA", "REQUEST_TELEMETRY"]:
                self.log("HEARTBEAT", "Permintaan telemetri cepat on-demand dari Web diterima.", C_CYAN)
                modified = True
            elif cmd == "TRIGGER_ZAP":
                self.blower_status = True
                self.blower_off_time = time.time() + self.manual_duration_sec
                self.log("ZAP", f"Trigger zap diterima! Blower aktif {self.manual_duration_sec} detik.", C_YELLOW)
                modified = True
            elif cmd == "RESET_COUNTER":
                self.pest_counter = 0
                self.log("RESET", "Counter hama berhasil di-reset ke 0.", C_YELLOW)
                modified = True

        if modified:
            self.force_send_event.set()

    # --------------------------------------------------------------------------
    # FORMAT LOGGING DI TERMINAL
    # --------------------------------------------------------------------------
    def log(self, tag: str, message: str, color: str = C_WHITE):
        t_str = datetime.now().strftime("%H:%M:%S")
        print(f"{C_DIM}[{t_str}]{C_RESET} {color}[{tag:^9}]{C_RESET} {message}", flush=True)

    # --------------------------------------------------------------------------
    # TUGAS PENGIRIM TELEMETRI BERKALA (ASYNC LOOP)
    # --------------------------------------------------------------------------
    async def telemetry_loop(self):
        while self.running:
            try:
                # Tunggu interval atau force send
                try:
                    await asyncio.wait_for(self.force_send_event.wait(), timeout=self.telemetry_interval)
                    self.force_send_event.clear()
                except asyncio.TimeoutError:
                    pass

                if self.ws and self.ws.state.name == "OPEN":
                    telemetry_msg = self.build_telemetry_payload()
                    msg_str = json.dumps(telemetry_msg)
                    await self.ws.send(msg_str)
                    p = telemetry_msg["payload"]
                    self.log(
                        "TELEMETRY",
                        f"Terkirim ke Server -> V: {C_BOLD}{p['batteryVoltage']}V{C_RESET} | "
                        f"Solar: {p['solarChargingCurrent']}mA | "
                        f"Hama: {C_GREEN}{p['pirTriggerCount']}{C_RESET} | "
                        f"Wadah: {p['containerCapacityPercent']}% | "
                        f"Blower: {'ON' if p['blowerStatus'] else 'OFF'} | "
                        f"LED: {'ON' if p['uvLedStatus'] else 'OFF'} ({p['ledColor']})",
                        C_CYAN,
                    )
            except Exception as e:
                self.log("ERR-TX", f"Gagal mengirim telemetri: {e}", C_RED)
                await asyncio.sleep(2)

    # --------------------------------------------------------------------------
    # TUGAS PENERIMA PESAN DARI WEBSOCKET
    # --------------------------------------------------------------------------
    async def receive_loop(self):
        while self.running:
            try:
                if not self.ws or self.ws.state.name != "OPEN":
                    await asyncio.sleep(0.5)
                    continue

                raw_msg = await self.ws.recv()
                try:
                    data = json.loads(raw_msg)
                    topic = data.get("topic", "")
                    msg_type = data.get("type", "")

                    if msg_type == "connected":
                        self.log("GATEWAY", f"Pesan sambutan gateway: {data.get('message', '')}", C_GREEN)
                    elif msg_type == "subscribed":
                        self.log("SUB-OK", f"Berhasil langganan topik: {data.get('topic')}", C_GREEN)
                    elif topic == f"traps/{self.trap_id}/command" or topic == f"traps/+/{self.trap_id}":
                        self.handle_incoming_command(data)
                    elif "action" in data and data["action"] == "command":
                        self.handle_incoming_command(data)
                    else:
                        # Log pesan informasi umum lainnya
                        pass
                except json.JSONDecodeError:
                    self.log("WARN", f"Format pesan bukan JSON: {raw_msg}", C_YELLOW)

            except websockets.exceptions.ConnectionClosed:
                break
            except Exception as e:
                self.log("ERR-RX", f"Kesalahan saat menerima data: {e}", C_RED)
                break

    # --------------------------------------------------------------------------
    # LOOP KONEKSI & RECONNECT WEBSOCKET
    # --------------------------------------------------------------------------
    async def connection_manager(self):
        cmd_topic = f"traps/{self.trap_id}/command"
        ssl_ctx = None
        if self.ws_url.startswith("wss://"):
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE

        while self.running:
            try:
                self.log("CONNECT", f"Menghubungkan ke WebSocket Gateway: {C_BOLD}{self.ws_url}{C_RESET} ...", C_YELLOW)
                connect_args = {"ssl": ssl_ctx} if ssl_ctx else {}

                async with websockets.connect(self.ws_url, **connect_args) as websocket:
                    self.ws = websocket
                    self.log("ONLINE", f"{C_BOLD}Terhubung ke Server EWS!{C_RESET} Trap ID: {self.trap_id}", C_GREEN)

                    # 1. Kirim Pesan Berlangganan (Subscribe)
                    sub_message = {
                        "action": "subscribe",
                        "topic": cmd_topic
                    }
                    await self.ws.send(json.dumps(sub_message))
                    self.log("SUBSCRIBE", f"Berlangganan ke topik perintah: {C_BOLD}{cmd_topic}{C_RESET}", C_CYAN)

                    # 2. Kirim Telemetri Pertama Segera
                    initial_telemetry = self.build_telemetry_payload()
                    await self.ws.send(json.dumps(initial_telemetry))
                    self.log("INIT-TX", "Telemetri awal berhasil disinkronkan ke Web.", C_GREEN)

                    # 3. Jalankan Task Rx dan Tx bersamaan
                    tx_task = asyncio.create_task(self.telemetry_loop())
                    rx_task = asyncio.create_task(self.receive_loop())

                    done, pending = await asyncio.wait(
                        [tx_task, rx_task],
                        return_when=asyncio.FIRST_COMPLETED
                    )
                    for task in pending:
                        task.cancel()

            except (websockets.exceptions.WebSocketException, OSError) as e:
                self.log("OFFLINE", f"Koneksi terputus / gagal: {e}. Menghubungkan ulang dalam 4 detik...", C_RED)
            except Exception as e:
                self.log("ERROR", f"Error tak terduga: {e}", C_RED)

            self.ws = None
            if self.running:
                await asyncio.sleep(4)

    # --------------------------------------------------------------------------
    # INPUT KEYBOARD INTERAKTIF (NON-BLOCKING TERMINAL)
    # --------------------------------------------------------------------------
    async def keyboard_listener(self):
        """Membaca tombol keyboard untuk simulasi instan tanpa menekan Enter"""
        if not sys.stdin.isatty():
            return  # Mode non-interaktif

        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            tty.setcbreak(fd)
            loop = asyncio.get_event_loop()

            while self.running:
                r, _, _ = await loop.run_in_executor(None, select.select, [sys.stdin], [], [], 0.2)
                if r:
                    char = sys.stdin.read(1).lower()
                    if char in ["h", "t"]:
                        self.trigger_pest_event("Trigger Tombol Keyboard")
                    elif char == "b":
                        self.blower_status = not self.blower_status
                        if self.blower_status:
                            self.blower_off_time = time.time() + self.manual_duration_sec
                        self.log("MANUAL", f"Blower dialihkan ke -> {'ON' if self.blower_status else 'OFF'}", C_YELLOW)
                        self.force_send_event.set()
                    elif char == "l":
                        self.uv_led_status = not self.uv_led_status
                        self.log("MANUAL", f"Lampu UV dialihkan ke -> {'ON' if self.uv_led_status else 'OFF'}", C_MAGENTA)
                        self.force_send_event.set()
                    elif char == "m":
                        modes = ["otomatis", "manual", "otomatis_led"]
                        idx = (modes.index(self.mode) + 1) % len(modes)
                        self.mode = modes[idx]
                        self.log("MANUAL", f"Mode berganti ke -> {self.mode.upper()}", C_BLUE)
                        self.force_send_event.set()
                    elif char == "p":
                        self.active_preset = (self.active_preset + 1) % len(self.presets)
                        self.log("MANUAL", f"Preset LED berganti ke -> {self.presets[self.active_preset]['name']}", C_BLUE)
                        self.force_send_event.set()
                    elif char == "r":
                        self.pest_counter = 0
                        self.log("MANUAL", "Counter hama berhasil di-reset ke 0!", C_GREEN)
                        self.force_send_event.set()
                    elif char == "s":
                        self.log("MANUAL", "Memaksa pengiriman telemetri instan...", C_CYAN)
                        self.force_send_event.set()
                    elif char == "q":
                        self.log("EXIT", "Menghentikan simulator...", C_YELLOW)
                        self.running = False
                        break
        except Exception:
            pass
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)


# ==============================================================================
# BANNER SELAMAT DATANG & BANTUAN TERMINAL
# ==============================================================================
def print_banner(args):
    print(f"{C_CYAN}{C_BOLD}╔══════════════════════════════════════════════════════════════════════════╗")
    print(f"║     🦗 SIMULATOR PERANGKAP HAMA PINTAR (SMART PEST TRAP) ESP32 🦗        ║")
    print(f"╚══════════════════════════════════════════════════════════════════════════╝{C_RESET}")
    print(f"  Target Server   : {C_BOLD}{args.url}{C_RESET}")
    print(f"  Trap Device ID  : {C_BOLD}{args.trap_id}{C_RESET}")
    print(f"  Interval Kirim  : {args.interval} detik")
    print(f"  Simulasi Alami  : {'Aktif (Hama Masuk Acak)' if not args.no_auto_pest else 'Nonaktif (Hanya Manual)'}")
    print(f"{C_DIM}--------------------------------------------------------------------------{C_RESET}")
    print(f"{C_YELLOW}{C_BOLD}Tombol Pintas Keyboard (Langsung Tekan Tanpa Enter):{C_RESET}")
    print(f"  {C_GREEN}[H] / [T]{C_RESET} : Simulasi Hama Masuk Corong (+1 Hama & Blower Hisap {args.duration} dtk)")
    print(f"  {C_GREEN}[B]      {C_RESET} : Toggle Saklar Blower (ON / OFF)")
    print(f"  {C_GREEN}[L]      {C_RESET} : Toggle Saklar Lampu LED UV (ON / OFF)")
    print(f"  {C_GREEN}[M]      {C_RESET} : Ganti Mode Kerja (Otomatis -> Manual -> Otomatis-LED)")
    print(f"  {C_GREEN}[P]      {C_RESET} : Ganti Preset Warna LED NeoPixel WS2812B")
    print(f"  {C_GREEN}[R]      {C_RESET} : Reset Counter Hama ke 0")
    print(f"  {C_GREEN}[S]      {C_RESET} : Force Publish Telemetri Instan ke WebSocket")
    print(f"  {C_GREEN}[Q]      {C_RESET} : Keluar dari Simulator")
    print(f"{C_DIM}══════════════════════════════════════════════════════════════════════════{C_RESET}\n")


# ==============================================================================
# MAIN ENTRYPOINT
# ==============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="Simulator Python Perangkap Hama Cerdas (ESP32 Virtual) untuk Web IoT EWS",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--url",
        default=os.getenv("WS_URL", "wss://hamakusens.elektrodinus.id/ws"),
        help="URL WebSocket Gateway Backend (contoh: ws://localhost:5001/ws atau wss://hamakusens.elektrodinus.id/ws)",
    )
    parser.add_argument(
        "--trap-id",
        default=os.getenv("TRAP_ID", "TRAP-01"),
        help="ID Perangkat Perangkap Hama",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=3.0,
        help="Interval pengiriman telemetri (detik)",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=3,
        help="Durasi aktif blower saat terpicu sensor (detik)",
    )
    parser.add_argument(
        "--no-auto-pest",
        action="store_true",
        help="Nonaktifkan deteksi hama acak berkala (hanya terpicu jika menekan tombol keyboard atau command web)",
    )

    args = parser.parse_args()
    print_banner(args)

    simulator = ESP32TrapSimulator(
        ws_url=args.url,
        trap_id=args.trap_id,
        interval=args.interval,
        auto_pest=not args.no_auto_pest,
    )
    simulator.manual_duration_sec = args.duration

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        tasks = [
            simulator.connection_manager(),
            simulator.keyboard_listener(),
        ]
        loop.run_until_complete(asyncio.gather(*tasks))
    except KeyboardInterrupt:
        print(f"\n{C_YELLOW}[EXIT] Simulator dihentikan oleh pengguna.{C_RESET}")
    finally:
        simulator.running = False
        loop.close()


if __name__ == "__main__":
    main()
