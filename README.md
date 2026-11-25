# Sistem Absensi Face Recognition (On-Premise / VPS)

Implementasi lengkap **Fase 1 (MVP)** sesuai dokumen **PRD Sistem Absensi Face Recognition** — dirancang untuk berjalan di VPS data center Indonesia (Docker Compose) dengan kepatuhan **UU PDP No. 27/2022** dan biaya lisensi model AI **Rp 0** (MIT / Apache 2.0).

## Arsitektur Sistem

| Lapisan | Teknologi | Peran |
|---|---|---|
| **Kiosk & Dashboard** | React 18 + Vite + TypeScript + Tailwind CSS + PWA + IndexedDB | Kiosk tablet Chrome (deteksi otomatis, fallback PIN, antrean offline) & Dashboard HR / Atasan / Karyawan / Admin IT |
| **Backend REST API** | Node.js + Express + TypeScript | Aturan masuk/pulang (F-03/F-04), enkripsi vektor AES-256-GCM, token per kiosk, koreksi & persetujuan, ekspor Excel/CSV, auto-delete foto bukti 90 hari |
| **Face Service** | Python 3 + FastAPI + OpenCV | Deteksi wajah **OpenCV YuNet (MIT)**, ekstraksi vektor 128-dim **OpenCV SFace (Apache 2.0)**, anti-spoofing pasif (**Silent-Face ONNX / multi-cue + cek kedip/gerakan**), cek kualitas foto registrasi |
| **Database** | PostgreSQL 16 + `pgvector` | Data karyawan, shift, hari libur, log absensi, koreksi, audit biometrik, dan vektor wajah terenkripsi AES-256 |

## Fitur Fase 1 (MVP) yang Diimplementasikan

- **F-01**: Kiosk mendeteksi wajah otomatis tanpa menekan tombol.
- **F-02**: Anti-spoofing (liveness) menolak foto cetak, layar HP, dan video + pengecekan 2 frame (kedip/gerakan alami).
- **F-03**: Absen pertama hari itu = Masuk; absen berikutnya setelah ≥ 4 jam = Pulang; status otomatis (Tepat Waktu / Terlambat / Pulang Cepat) sesuai shift & toleransi.
- **F-04**: Absen ganda dalam < 5 menit diabaikan.
- **F-05**: Setiap absen menyimpan waktu server, ID kiosk, skor kecocokan, skor liveness, dan foto bukti.
- **F-06**: Skor di bawah ambang tidak tercatat; setelah **3× gagal**, otomatis beralih ke **Fallback PIN + Foto** yang ditandai untuk ditinjau HR.
- **F-07**: HR dapat menonaktifkan karyawan dan seluruh vektor wajahnya langsung dihapus permanen.
- **F-08**: Karyawan dapat login untuk melihat riwayat absen dan status koreksi sendiri.
- **Mode Offline Kiosk**: Saat internet/VPS putus, absen wajah maupun PIN masuk antrean **IndexedDB** dan otomatis disinkronkan saat koneksi pulih.
- **Registrasi Wajah oleh HR**: Formulir persetujuan UU PDP No. 27/2022 (+ opsi tolak & pakai PIN), panduan 3–5 pose dengan cek kualitas real-time, foto registrasi **tidak disimpan**, lalu uji verifikasi langsung.
- **Ekspor Rekap Bulanan**: Ekspor langsung ke **Excel (`.xlsx`)** dan **CSV**.
- **Keamanan & UU PDP**: Vektor wajah dienkripsi **AES-256-GCM** dengan kunci di luar database (`FACE_ENCRYPTION_KEY`), token unik per perangkat kiosk (bisa dicabut bila tablet hilang) + rate limiting, pembersihan otomatis foto bukti > 90 hari, dan log audit akses data biometrik.

## Cara Menjalankan dengan Supabase (Tanpa Docker / Testing Lokal)

1. Buat project di [Supabase](https://supabase.com) (pilih region **Singapore `ap-southeast-1`** agar latensi rendah).
2. Ambil **Connection String (URI)** dari *Supabase Dashboard → Connect → Session Pooler (port 5432)*.
3. Salin `.env.example` menjadi `backend/.env` dan isi `DATABASE_URL` serta `DATABASE_SSL=true`.
4. Jalankan migrasi skema & seed akun demo langsung dari terminal (otomatis membuat tabel + ekstensi `pgvector` + akun demo):
   ```bash
   cd backend && npm run db:migrate
   ```
   *(Atau copy-paste isi `database/init.sql` ke **Supabase SQL Editor** lalu jalankan).*
5. Jalankan 3 layanan lokal:
   - **Face Service**: `cd face-service && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python scripts/download_models.py --output-dir models && uvicorn app.main:app --port 8000`
   - **Backend**: `cd backend && npm run dev`
   - **Frontend**: `cd frontend && npm run dev` (buka `http://localhost:5173`)

## Cara Menjalankan dengan Docker Compose (Produksi VPS)

1. Salin konfigurasi environment dan ganti semua kunci rahasia:
   ```bash
   cp .env.example .env
   # Generate kunci AES-256 (64 hex chars):
   openssl rand -hex 32
   ```
   Masukkan hasilnya ke `FACE_ENCRYPTION_KEY` di `.env`, lalu ganti `POSTGRES_PASSWORD` dan `JWT_SECRET`.

2. Jalankan seluruh layanan:
   ```bash
   docker compose up -d --build
   ```

3. Akses aplikasi:
   - **Dashboard HR / Login**: `http://localhost:8080/login`
   - **Mode Kiosk Tablet**: `http://localhost:8080/kiosk`

### Akun Demo Awal (Auto-Seed saat Database Kosong)

Semua akun awal memakai password `Admin123!` dan PIN fallback `123456`:
- **Admin HR**: `hr@kantor.local`
- **Admin IT**: `it@kantor.local`
- **Atasan**: `atasan@kantor.local`
- **Karyawan**: `karyawan@kantor.local` (NIK: `EMP-001`)
- **Token Kiosk Demo**: `kiosk_demo_pintu_utama_2026`

## Skrip Operasional & Keamanan VPS

- `scripts/backup-db.sh`: Backup harian PostgreSQL terenkripsi AES-256 (`pg_dump` + `openssl`).
- `scripts/vps-hardening-checklist.sh`: Checklist firewall UFW (hanya port `443` & `22`), `fail2ban`, `unattended-upgrades`, dan SSH key-only.
- `face-service/scripts/download_models.py`: Mengunduh bobot ONNX resmi OpenCV YuNet (MIT) dan SFace (Apache 2.0).

## Menjalankan Unit Test Lokal

```bash
# Backend (TypeScript build + Node test runner)
cd backend && npm install && npm run build && npm test

# Frontend (TypeScript check + Vite production build)
cd frontend && npm install && npm run build

# Face Service (Python FastAPI + OpenCV)
cd face-service && pip install -r requirements.txt && pytest
```
