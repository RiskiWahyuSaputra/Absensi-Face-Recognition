import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ScanFace, UserMinus, ShieldCheck } from "lucide-react";
import { apiFetch } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";

interface EmployeeRow {
  id: string;
  nik: string;
  full_name: string;
  email: string;
  role: string;
  department: string;
  position: string;
  shift_name: string | null;
  biometric_consent_status: string;
  face_vector_count: number;
  is_active: boolean;
}

interface ShiftOption {
  id: string;
  name: string;
}

export const EmployeesPage: React.FC = () => {
  const { user } = useAuth();
  const isHrOrIt = user?.role === "hr_admin" || user?.role === "it_admin";
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [consentTarget, setConsentTarget] = useState<EmployeeRow | null>(null);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    nik: "",
    fullName: "",
    email: "",
    department: "Engineering",
    position: "Staf",
    role: "employee",
    shiftId: "",
    pin: "123456",
  });

  async function loadData() {
    const [empRes, shiftRes] = await Promise.all([
      apiFetch<{ employees: EmployeeRow[] }>("/employees?includeInactive=true"),
      apiFetch<{ shifts: ShiftOption[] }>("/shifts"),
    ]);
    setEmployees(empRes.employees);
    setShifts(shiftRes.shifts);
    if (shiftRes.shifts.length > 0 && !form.shiftId) {
      setForm((f) => ({ ...f, shiftId: shiftRes.shifts[0].id }));
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      await apiFetch("/employees", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setForm({
        nik: "",
        fullName: "",
        email: "",
        department: "Engineering",
        position: "Staf",
        role: "employee",
        shiftId: shifts[0]?.id || "",
        pin: "123456",
      });
      setMessage("Karyawan baru berhasil ditambahkan.");
      loadData();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menambah karyawan");
    }
  }

  async function handleConsent(status: "consented" | "declined_pin_only") {
    if (!consentTarget) return;
    await apiFetch(`/employees/${consentTarget.id}/biometric-consent`, {
      method: "POST",
      body: JSON.stringify({
        status,
        note:
          status === "consented"
            ? "Formulir persetujuan biometrik UU PDP No. 27/2022 ditandatangani"
            : "Karyawan memilih alternatif PIN",
      }),
    });
    setConsentTarget(null);
    loadData();
  }

  async function handleDeactivate(emp: EmployeeRow) {
    if (
      !window.confirm(
        `Nonaktifkan ${emp.full_name}? Sesuai UU PDP (F-07), seluruh vektor wajah karyawan ini akan dihapus permanen.`
      )
    ) {
      return;
    }
    const res = await apiFetch<{ message: string }>(`/employees/${emp.id}/deactivate`, {
      method: "POST",
    });
    setMessage(res.message);
    loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Karyawan &amp; Data Biometrik</h1>
          <p className="text-sm text-slate-500">
            Kelola data karyawan, persetujuan UU PDP No. 27/2022, dan registrasi vektor wajah terenkripsi.
          </p>
        </div>
        {isHrOrIt && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Karyawan
          </button>
        )}
      </div>

      {message && (
        <div className="p-3.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm">
          {message}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-5 py-3">NIK / Nama</th>
                <th className="px-5 py-3">Departemen &amp; Shift</th>
                <th className="px-5 py-3">Persetujuan UU PDP</th>
                <th className="px-5 py-3">Vektor Wajah</th>
                <th className="px-5 py-3">Status</th>
                {isHrOrIt && <th className="px-5 py-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => (
                <tr key={emp.id} className={!emp.is_active ? "opacity-55 bg-slate-50" : ""}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{emp.full_name}</div>
                    <div className="text-xs text-slate-500">
                      {emp.nik} · {emp.email}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div>{emp.department}</div>
                    <div className="text-xs text-slate-500">{emp.shift_name || "-"}</div>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge value={emp.biometric_consent_status} />
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {emp.face_vector_count > 0 ? `${emp.face_vector_count} vektor (AES-256)` : "Belum terdaftar"}
                  </td>
                  <td className="px-5 py-3">
                    {emp.is_active ? (
                      <span className="text-xs text-emerald-700 font-medium">Aktif</span>
                    ) : (
                      <span className="text-xs text-rose-700 font-medium">Nonaktif</span>
                    )}
                  </td>
                  {isHrOrIt && (
                    <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                      {emp.is_active && (
                        <>
                          <button
                            onClick={() => setConsentTarget(emp)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Persetujuan
                          </button>
                          {emp.biometric_consent_status === "consented" && (
                            <Link
                              to={`/employees/${emp.id}/enroll`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-medium text-white"
                            >
                              <ScanFace className="w-3.5 h-3.5" />
                              Daftarkan Wajah
                            </Link>
                          )}
                          <button
                            onClick={() => handleDeactivate(emp)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-xs font-medium text-rose-700 cursor-pointer"
                            title="Nonaktifkan & hapus data wajah (F-07)"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            Nonaktifkan
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah Karyawan */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6">
            <h2 className="text-lg font-bold mb-4">Tambah Karyawan Baru</h2>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">NIK</label>
                <input
                  required
                  value={form.nik}
                  onChange={(e) => setForm({ ...form, nik: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nama Lengkap</label>
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Departemen</label>
                <input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Shift</label>
                <select
                  value={form.shiftId}
                  onChange={(e) => setForm({ ...form, shiftId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                >
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Peran</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                >
                  <option value="employee">Karyawan</option>
                  <option value="supervisor">Atasan</option>
                  <option value="hr_admin">Admin HR</option>
                  <option value="it_admin">Admin IT</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">PIN Fallback (6 digit)</label>
                <input
                  required
                  pattern="\d{6}"
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-sm cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium cursor-pointer"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Formulir Persetujuan Biometrik UU PDP No. 27/2022 */}
      {consentTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4">
            <h2 className="text-lg font-bold">Persetujuan Data Biometrik (UU PDP No. 27/2022)</h2>
            <p className="text-sm text-slate-600">
              Karyawan: <strong>{consentTarget.full_name}</strong> ({consentTarget.nik})
            </p>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
              <p>1. Hanya vektor matematika wajah (terenkripsi AES-256) yang disimpan di server internal perusahaan.</p>
              <p>2. Foto registrasi langsung dihapus setelah ekstraksi vektor selesai.</p>
              <p>3. Foto bukti absen harian dihapus otomatis setelah 90 hari.</p>
              <p>4. Seluruh data wajah dihapus permanen saat karyawan keluar/dinonaktifkan.</p>
              <p>5. Karyawan berhak menolak dan menggunakan alternatif PIN + foto.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleConsent("declined_pin_only")}
                className="flex-1 py-2.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-sm font-medium cursor-pointer"
              >
                Tolak Biometrik (Pakai PIN)
              </button>
              <button
                onClick={() => handleConsent("consented")}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium cursor-pointer"
              >
                Setujui Registrasi Wajah
              </button>
            </div>
            <button
              onClick={() => setConsentTarget(null)}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
