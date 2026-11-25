-- ==============================================================================
-- Sistem Absensi Face Recognition - PostgreSQL 16 + pgvector Schema
-- Kompatibel dengan Supabase PostgreSQL & Docker PostgreSQL (UU PDP No. 27/2022)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Pengaturan Sistem (ambang kecocokan, liveness, aturan absen)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Shift Kerja
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    late_tolerance_minutes INTEGER NOT NULL DEFAULT 15,
    early_leave_tolerance_minutes INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Hari Libur Nasional / Kantor
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holiday_date DATE NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Karyawan & Pengguna Sistem
-- Role: employee, supervisor, hr_admin, it_admin
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nik VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'supervisor', 'hr_admin', 'it_admin')),
    department VARCHAR(100) NOT NULL DEFAULT 'Umum',
    position VARCHAR(100) NOT NULL DEFAULT 'Staf',
    shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    supervisor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    pin_hash TEXT, -- Fallback PIN (bcrypt) bila wajah gagal 3x atau menolak biometrik
    biometric_consent_status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (biometric_consent_status IN ('pending', 'consented', 'declined_pin_only')),
    biometric_consented_at TIMESTAMPTZ,
    biometric_consent_note TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deactivated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_nik ON employees(nik);
CREATE INDEX IF NOT EXISTS idx_employees_supervisor ON employees(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);

-- 5. Vektor Wajah Terenkripsi (UU PDP: AES-256-GCM; foto registrasi TIDAK disimpan)
-- Kolom pgvector opsional disediakan untuk arsitektur skala besar bila diaktifkan,
-- namun secara default hanya embedding_encrypted yang terisi demi keamanan AES-256.
CREATE TABLE IF NOT EXISTS face_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    pose_label VARCHAR(50) NOT NULL DEFAULT 'front',
    embedding_encrypted TEXT NOT NULL, -- Format: iv_hex:authTag_hex:ciphertext_hex (AES-256-GCM)
    embedding_vector vector(128),      -- Opsional jika mode pgvector plaintext diaktifkan
    quality_score REAL,
    is_adaptive BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_employee ON face_embeddings(employee_id);

-- 6. Perangkat Kiosk (Token unik per perangkat, bisa dicabut bila tablet hilang)
CREATE TABLE IF NOT EXISTS kiosks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    location VARCHAR(150) NOT NULL,
    token_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash dari token kiosk
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
    last_seen_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Log Absensi Harian (F-03, F-04, F-05)
CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    kiosk_id UUID REFERENCES kiosks(id) ON DELETE SET NULL,
    attendance_date DATE NOT NULL,
    attendance_type VARCHAR(20) NOT NULL CHECK (attendance_type IN ('check_in', 'check_out')),
    status VARCHAR(30) NOT NULL CHECK (status IN ('on_time', 'late', 'early_leave', 'normal')),
    method VARCHAR(20) NOT NULL CHECK (method IN ('face', 'pin_fallback', 'manual_correction')),
    match_score REAL,
    liveness_score REAL,
    proof_photo_path TEXT,
    proof_photo_deleted_at TIMESTAMPTZ,
    needs_hr_review BOOLEAN NOT NULL DEFAULT FALSE,
    hr_reviewed_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    hr_reviewed_at TIMESTAMPTZ,
    hr_review_note TEXT,
    is_offline_synced BOOLEAN NOT NULL DEFAULT FALSE,
    client_recorded_at TIMESTAMPTZ,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_logs(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_logs(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_review ON attendance_logs(needs_hr_review) WHERE needs_hr_review = TRUE;

-- 8. Koreksi Absensi & Audit Persetujuan Atasan
CREATE TABLE IF NOT EXISTS attendance_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    attendance_log_id UUID REFERENCES attendance_logs(id) ON DELETE SET NULL,
    attendance_date DATE NOT NULL,
    attendance_type VARCHAR(20) NOT NULL CHECK (attendance_type IN ('check_in', 'check_out')),
    requested_time TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    reviewed_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrections_employee ON attendance_corrections(employee_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON attendance_corrections(status);

-- 9. Log Akses Data Biometrik (UU PDP: hanya Admin HR & Admin IT, semua akses tercatat)
CREATE TABLE IF NOT EXISTS biometric_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    actor_role VARCHAR(30) NOT NULL,
    action VARCHAR(80) NOT NULL, -- e.g. ENROLL_FACE, DELETE_FACE, DEACTIVATE_EMPLOYEE, VIEW_STATUS, UPDATE_THRESHOLD
    target_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    ip_address VARCHAR(64),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biometric_audit_created ON biometric_access_logs(created_at DESC);

-- ==============================================================================
-- Seed Data Awal (Default Shifts, Pengaturan, Akun Admin & Kiosk Demo)
-- Password default semua akun seed: "Admin123!" (bcrypt cost 10)
-- PIN default semua akun seed: "123456" (bcrypt cost 10)
-- ==============================================================================

INSERT INTO system_settings (key, value, description) VALUES
    ('match_threshold', '0.45', 'Ambang skor cosine similarity SFace (semakin tinggi semakin ketat)'),
    ('liveness_threshold', '0.50', 'Ambang skor anti-spoofing pasif (Silent-Face)'),
    ('duplicate_window_minutes', '5', 'F-04: Absen ganda dalam rentang menit ini diabaikan'),
    ('checkout_min_hours', '4', 'F-03: Jarak jam minimum setelah masuk agar tercatat sebagai pulang'),
    ('proof_photo_retention_days', '90', 'UU PDP: Foto bukti absen dihapus otomatis setelah N hari'),
    ('max_face_fail_before_pin', '3', 'Jumlah gagal wajah berturut-turut sebelum fallback ke PIN')
ON CONFLICT (key) DO NOTHING;

INSERT INTO shifts (id, name, start_time, end_time, late_tolerance_minutes, early_leave_tolerance_minutes) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Reguler Pagi', '08:00:00', '17:00:00', 15, 0),
    ('22222222-2222-2222-2222-222222222222', 'Shift Siang', '13:00:00', '21:00:00', 15, 0),
    ('33333333-3333-3333-3333-333333333333', 'Fleksibel', '09:00:00', '18:00:00', 30, 0)
ON CONFLICT (name) DO NOTHING;

-- Hash bcrypt untuk "Admin123!" dan PIN "123456" akan di-seed otomatis oleh backend bootstrap jika tabel employees masih kosong,
-- sehingga tidak perlu hardcode hash di SQL.
