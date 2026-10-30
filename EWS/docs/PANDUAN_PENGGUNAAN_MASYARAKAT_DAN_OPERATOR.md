# BUKU PANDUAN PENGGUNAAN SISTEM PERINGATAN DINI TANAH LONGSOR (EWS) & PERANGKAP HAMA
**Panduan Praktis Pengoperasian Web Dashboard Monitoring, Pengenalan Sirine Lapangan, dan Prosedur Kesiapsiagaan Bencana untuk Masyarakat & Operator Desa**

---

| Profil Dokumen | Keterangan |
| :--- | :--- |
| **Nama Sistem** | Sistem Peringatan Dini Bencana Longsor (EWS) & Perangkap Hama Terintegrasi |
| **Sasaran Pembaca** | Warga Masyarakat, Tokoh Desa, Relawan Siaga Bencana, Petani, dan Operator Lapangan |
| **Tujuan Dokumen** | Memberikan pemahaman praktis cara memantau status keamanan lereng melalui website, mengenali arti bunyi sirine di tiang lapangan, dan mengetahui tindakan penyelamatan darurat. |
| **Akses Web Monitoring** | Dapat dibuka melalui HP Android/iPhone atau Laptop/Komputer via Browser |
| **Tahun Terbit** | 2026 |

---

## 1. Mengenal Sistem di Lingkungan Anda

Selamat datang di sistem perlindungan wilayah desa berbasis teknologi digital! Di lingkungan tempat tinggal dan perkebunan warga, telah terpasang dua jenis perangkat penting:

1. **4 Titik Tiang Peringatan Dini Longsor (EWS - Early Warning System)**:
   Dipasang pada lereng atau tebing rawan longsor. Alat ini memantau secara terus-menerus kemiringan tanah, curah hujan yang turun, kelembapan tanah, dan getaran di sekitar tebing.
2. **5 Titik Unit Perangkap Hama Bertenaga Surya**:
   Dipasang di sekitar area pertanian dan persawahan. Menggunakan lampu pemikat khusus bertenaga sinar matahari untuk membasmi serangga perusak tanaman pertanian tanpa obat kimia beracun.

```
                   ┌──────────────────────────────────────┐
                   │    TIANG SENSOR EWS DI LERENG TEBING │
                   │                                      │
                   │   [Panel Surya] Menyerap Matahari    │
                   │   [Lampu Strobo] Berkedip Merah      │
                   │   [Sirine Nyaring] Pengingat Bahaya  │
                   │   [Box Kontrol] Membaca Pergerakan   │
                   │   [Sensor Hujan] Mengukur Air Turun  │
                   └──────────────────┬───────────────────┘
                                      │
               Mengirim Data Otomatis Lewat Sinyal HP (GSM)
                                      ▼
                   ┌──────────────────────────────────────┐
                   │    LAYAR MONITORING DI HP / LAPTOP   │
                   │                                      │
                   │   - Lampu Hijau: AMAN                │
                   │   - Lampu Kuning: WASPADA            │
                   │   - Lampu Merah: BAHAYA / EVAKUASI   │
                   └──────────────────────────────────────┘
```

---

## 2. Mengenali Perangkat Fisik & Arti Bunyi Sirine di Lapangan

Setiap tiang EWS yang berdiri di lereng memiliki perlengkapan peringatan langsung yang dapat dilihat dan didengar oleh seluruh warga sekitar:

![Tampilan Peta dan Lokasi Sebaran Titik](file:///home/aris/Dokumen/projeck/EWS_new/EWS/EWS/docs/images/screenshot_overview.png)

### 2.1 Makna Bunyi Sirine dan Lampu Strobo

| Tanda di Tiang EWS | Status Kondisi | Arti untuk Warga | Tindakan yang Harus Dilakukan |
| :---: | :---: | :--- | :--- |
| **Lampu Hijau Berkedip Tenang**<br>*(Sirine Mati)* | **AMAN** | Lereng stabil, curah hujan wajar, tanah tidak bergeser. | Warga dapat beraktivitas seperti biasa di kebun dan rumah. |
| **Lampu Kuning / Strobo Berkedip Cepat**<br>*(Sirine Mati)* | **WASPADA / SIAGA** | Hujan lebat turun terus-menerus, tanah sangat becek atau ada getaran tanah kecil. | Tingkatkan kewaspadaan. Perhatikan rembesan air keruh di tebing. Jangan tidur di kamar yang menempel langsung ke tebing. |
| **Sirine Berbunyi Keras Meraung-raung (115 dB)**<br>*(Lampu Strobo Merah Menyala)* | **BAHAYA / EVAKUASI** | **Tanah lereng telah bergerak atau retak! Bahaya longsor segera terjadi!** | **SEGERA KELUAR RUMAH!** Berjalan tenang tapi cepat menuju **Titik Kumpul / Posko Evakuasi** yang aman di dataran terbuka. |

> [!IMPORTANT]
> **PENTING UNTUK DIINGAT:**
> Sirine EWS dirancang tetap menyala secara otomatis langsung dari tiang meskipun listrik PLN padam atau sinyal internet HP mati. Jika sirine berbunyi, jangan menunggu perintah tambahan, segera selamatkan diri dan keluarga!

### 2.2 Aturan Menjaga Tiang EWS Bersama
* Dilarang memanjat tiang atau menggantung barang pada kawat penopang tiang.
* Dilarang membuang dedaunan, puntung rokok, atau sampah ke dalam corong corong penampung hujan di atas tiang.
* Segera laporkan ke pihak desa jika melihat tiang tampak miring atau kabel terkelupas akibat tertimpa dahan pohon.

---

## 3. Cara Mengakses Web Monitoring Lewat HP dan Laptop

Warga dan operator desa dapat memantau kondisi keamanan lereng kapan saja melalui telepon genggam pintar (HP Android / iPhone) atau komputer.

![Dashboard Utama Web Monitoring EWS](file:///home/aris/Dokumen/projeck/EWS_new/EWS/EWS/docs/images/screenshot_dashboard.png)

### 3.1 Langkah Membuka Website
1. Sambungkan HP ke jaringan internet (Data Seluler atau Wi-Fi).
2. Buka aplikasi peramban internet (Google Chrome, Firefox, Safari, atau Opera).
3. Ketikkan alamat website monitoring yang disediakan oleh aparat desa (misalnya: `https://backend-iot.qbyte.web.id/` atau alamat portal lokal desa).
4. Layar Beranda (*Dashboard*) akan langsung terbuka menampilkan rangkuman kondisi 4 Titik EWS dan Perangkap Hama.

---

## 4. Panduan Membaca Tampilan Website

### 4.1 Melihat Status Cepat 4 Titik EWS di Beranda
Pada bagian atas layar, terdapat 4 kotak kartu yang mewakili masing-masing tiang pemantau:
* **EWS-01**: Lereng Blok Atas
* **EWS-02**: Tebing Jalur Pemukiman
* **EWS-03**: Lereng Akses Jalan Raya
* **EWS-04**: Tebing Sisi Hulu Aliran Sungai

Perhatikan warna tulisan pada setiap kartu:
* Kotak berwarna **Hijau** dengan tulisan **AMAN (OK)** menandakan kondisi lereng sangat baik.
* Kotak berwarna **Oranye/Kuning** dengan tulisan **SIAGA** menandakan tanah mulai basah jenuh atau hujan mulai sangat lebat.
* Kotak berwarna **Merah Terang** dengan tulisan **BAHAYA** menandakan sirine sedang aktif dan lereng bergerak.

---

### 4.2 Melihat Peta Satelit Interaktif (`Menu Peta`)
Klik tombol menu **"Peta Satelit"** atau **"Overview"** di menu samping:
* Anda akan melihat peta foto satelit asli dari desa.
* Titik biru/hijau menunjukkan lokasi tiang EWS. Jika titik berkedip merah, berarti di lokasi itulah ancaman bahaya sedang terdeteksi.
* Titik berbentuk perangkap menunjukkan lokasi lampu perangkap hama di areal sawah/ladang.

---

### 4.3 Membuka Detail Pengukuran Sensor (`Menu EWS`)
Klik salah satu nama titik (misal **EWS-01**) untuk melihat angka pengukuran lengkap:

![Tampilan Detail Sensor dan Instrumen Kemiringan](file:///home/aris/Dokumen/projeck/EWS_new/EWS/EWS/docs/images/screenshot_ews_detail.png)

Pada halaman ini warga dan operator dapat melihat:
1. **Bola Kemiringan (Inclinometer)**:
   Menampilkan lingkaran pemantau kemiringan. Jika titik gelembung masih berada di dalam lingkaran hijau, artinya tiang dan tanah masih tegak lurus aman.
2. **Pengukur Curah Hujan (Rainfall Gauge)**:
   Menampilkan angka curah hujan dalam milimeter (mm). Jika angka di atas 20 mm/jam, air hujan sudah tergolong lebat.
3. **Status Baterai & Daya Matahari**:
   Menampilkan indikator daya aki (normal di kisaran 12.0 V sampai 13.8 V). Ini memastikan bahwa tiang EWS selalu memiliki energi cadangan yang cukup.

---

### 4.4 Memantau Perangkap Hama Pertanian (`Menu Perangkap Hama`)
Petani dapat memanfaatkan halaman ini untuk mengetahui aktivitas hama di lahan pertanian mereka:

![Tampilan Monitoring Perangkap Hama](file:///home/aris/Dokumen/projeck/EWS_new/EWS/EWS/docs/images/screenshot_traps.png)

* **Status Lampu Pemikat**: Menampilkan apakah lampu UV otomatis menyala saat malam hari untuk menarik serangga hama.
* **Jumlah Tangkapan Hama**: Grafik jumlah serangga yang terperangkap setiap harinya. Jika grafik meningkat drastis, kelompok tani desa dapat bersiap melakukan penanganan dini terhadap tanaman.

---

### 4.5 Melihat Catatan Riwayat Peringatan (`Menu Riwayat Alarm`)
Halaman ini mencatat buku harian digital mengenai seluruh bunyi sirine:

![Tampilan Riwayat Alarm](file:///home/aris/Dokumen/projeck/EWS_new/EWS/EWS/docs/images/screenshot_alarms.png)

* Kapan alarm berbunyi (Hari, Tanggal, Jam).
* Apa penyebabnya (apakah karena getaran sesaat, hujan lebat, atau pergerakan tebing).
* Siapa petugas/operator posko yang telah memeriksa dan mengamankan lokasi.

---

## 5. Menerima Pemberitahuan Darurat Lewat Telegram di HP

Untuk memastikan warga tidak tertinggal informasi meskipun sedang tidak membuka website, sistem telah dilengkapi bot pengirim pesan otomatis ke grup Telegram Desa:

1. Pastikan Anda telah memasang aplikasi **Telegram** di telepon pintar Anda.
2. Minta tautan (*link*) grup resmi **"Siaga Bencana & EWS Desa"** kepada perangkat desa atau operator posko.
3. Setiap kali sensor mendeteksi perubahan kondisi dari Aman ke Siaga atau Bahaya, bot Telegram akan langsung mengirimkan pesan darurat berbunyi:
   > 🚨 **PERINGATAN DINI LONGSOR (EWS-02)**  
   > **Waktu:** 29 Oktober 2026 - 15:45 WIB  
   > **Status:** BAHAYA!  
   > **Penyebab:** Pergeseran kemiringan lereng melebihi ambang batas aman (Roll: 16.5°).  
   > **Himbauan:** Warga RT 03 / RW 02 sekitar lereng dimohon segera berkumpul di Balai Desa!

---

## 6. Prosedur Penyelamatan Diri Saat Bahaya Longsor

Apabila Anda mendengar **sirine EWS meraung** atau menerima **pesan peringatan darurat**:

```
 ┌────────────────────────────────────────────────────────┐
 │           4 LANGKAH KESELAMATAN DARURAT WARGA          │
 │                                                        │
 │   1. TETAP TENANG & JANGAN PANIK                       │
 │      Segera beritahu seluruh anggota keluarga di rumah │
 │                                                        │
 │   2. AMANKAN KELISTRIKAN CEPAT                         │
 │      Matikan kompor gas dan turunkan saklar meteran    │
 │      listrik jika sempat                               │
 │                                                        │
 │   3. BAWA TAS SIAGA BENCANA                            │
 │      Bawa dokumen penting, dompet, obat pribadi,       │
 │      lampu senter, dan HP yang telah disiapkan         │
 │                                                        │
 │   4. SEGERA MENUJU TITIK KUMPUL EVAKUASI               │
 │      Gunakan jalur evakuasi yang menjauhi arah tebing. │
 │      Menujulah ke lapangan terbuka atau balai desa.   │
 └────────────────────────────────────────────────────────┘
```

### Nomor Kontak Posko Siaga Bencana:
* **Posko Utama BPBD / Desa**: (021) 123-4567 / WhatsApp Posko: 0812-XXXX-XXXX
* **Ketua Tim Relawan Lapangan**: Bpk. Slamet (0813-XXXX-XXXX)
* **Layanan Darurat Ambulans / Medis**: 118 / 119
* **Layanan Kepolisian / Bhabinkamtibmas**: 110
