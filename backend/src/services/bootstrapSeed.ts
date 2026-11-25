import bcrypt from "bcryptjs";
import { query } from "../config/db";
import { sha256Hex } from "../utils/crypto";

/**
 * Seed otomatis akun awal (HR Admin, IT Admin, Atasan, Karyawan) & 1 perangkat Kiosk Demo
 * bila tabel masih kosong saat pertama kali dijalankan.
 */
export async function runBootstrapSeed(): Promise<void> {
  const empCount = await query<{ count: string }>("SELECT COUNT(*) FROM employees");
  if (Number(empCount.rows[0]?.count || 0) === 0) {
    const passHash = await bcrypt.hash("Admin123!", 10);
    const pinHash = await bcrypt.hash("123456", 10);
    const defaultShiftId = "11111111-1111-1111-1111-111111111111";

    // 1. Admin HR
    const hrRes = await query<{ id: string }>(
      `INSERT INTO employees (nik, full_name, email, password_hash, role, department, position, shift_id, pin_hash, biometric_consent_status)
       VALUES ('HR-001', 'Siti Rahma (Admin HR)', 'hr@kantor.local', $1, 'hr_admin', 'Human Resources', 'HR Manager', $2, $3, 'pending')
       RETURNING id`,
      [passHash, defaultShiftId, pinHash]
    );

    // 2. Admin IT
    await query(
      `INSERT INTO employees (nik, full_name, email, password_hash, role, department, position, shift_id, pin_hash, biometric_consent_status)
       VALUES ('IT-001', 'Budi Santoso (Admin IT)', 'it@kantor.local', $1, 'it_admin', 'IT Infrastructure', 'IT Administrator', $2, $3, 'pending')`,
      [passHash, defaultShiftId, pinHash]
    );

    // 3. Atasan / Supervisor
    const supRes = await query<{ id: string }>(
      `INSERT INTO employees (nik, full_name, email, password_hash, role, department, position, shift_id, pin_hash, biometric_consent_status)
       VALUES ('SPV-001', 'Andi Wijaya (Atasan)', 'atasan@kantor.local', $1, 'supervisor', 'Engineering', 'Engineering Lead', $2, $3, 'pending')
       RETURNING id`,
      [passHash, defaultShiftId, pinHash]
    );

    // 4. Karyawan contoh
    await query(
      `INSERT INTO employees (nik, full_name, email, password_hash, role, department, position, shift_id, supervisor_id, pin_hash, biometric_consent_status)
       VALUES ('EMP-001', 'Dewi Lestari', 'karyawan@kantor.local', $1, 'employee', 'Engineering', 'Software Engineer', $2, $3, $4, 'pending')`,
      [passHash, defaultShiftId, supRes.rows[0].id, pinHash]
    );

    // 5. Kiosk Pintu Utama default dengan token dev mudah diuji
    const demoKioskToken = "kiosk_demo_pintu_utama_2026";
    await query(
      `INSERT INTO kiosks (device_code, name, location, token_hash, created_by)
       VALUES ('KIOSK-01', 'Tablet Pintu Masuk Utama', 'Lobi Lantai 1', $1, $2)
       ON CONFLICT (device_code) DO NOTHING`,
      [sha256Hex(demoKioskToken), hrRes.rows[0].id]
    );

    console.log("[SEED] Akun awal & Kiosk demo berhasil dibuat:");
    console.log("       HR Admin   : hr@kantor.local / Admin123!");
    console.log("       IT Admin   : it@kantor.local / Admin123!");
    console.log("       Atasan     : atasan@kantor.local / Admin123!");
    console.log("       Karyawan   : karyawan@kantor.local / Admin123! (PIN: 123456)");
    console.log("       Kiosk Token: kiosk_demo_pintu_utama_2026");
  }
}
