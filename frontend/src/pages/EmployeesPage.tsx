import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ScanFace, Search, ShieldCheck, UserMinus } from "lucide-react";
import { apiFetch } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { Alert, ConfirmDialog, Modal, Notice, PageHeader, TableMessage } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { errMsg } from "../lib/format";

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

const EMPTY_FORM = {
  nik: "",
  fullName: "",
  email: "",
  department: "",
  position: "Staf",
  role: "employee",
  shiftId: "",
  pin: "",
};

export const EmployeesPage: React.FC = () => {
  const { user } = useAuth();
  const isHrOrIt = user?.role === "hr_admin" || user?.role === "it_admin";
  const [employees, setEmployees] = useState<EmployeeRow[] | null>(null);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const [consentTarget, setConsentTarget] = useState<EmployeeRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<EmployeeRow | null>(null);

  async function loadData() {
    try {
      const [empRes, shiftRes] = await Promise.all([
        apiFetch<{ employees: EmployeeRow[] }>("/employees?includeInactive=true"),
        apiFetch<{ shifts: ShiftOption[] }>("/shifts"),
      ]);
      setEmployees(empRes.employees);
      setShifts(shiftRes.shifts);
    } catch (e) {
      setEmployees([]);
      setNotice({ tone: "error", text: errMsg(e, "Gagal memuat karyawan") });
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (employees ?? []).filter(
      (e) =>
        (showInactive || e.is_active) &&
        (!q ||
          e.full_name.toLowerCase().includes(q) ||
          e.nik.toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q))
    );
  }, [employees, query, showInactive]);

  const inactiveCount = employees?.filter((e) => !e.is_active).length ?? 0;
  const needsFace =
    employees?.filter((e) => e.is_active && e.biometric_consent_status === "consented" && e.face_vector_count === 0)
      .length ?? 0;

  function openCreate() {
    setForm({ ...EMPTY_FORM, shiftId: shifts[0]?.id || "" });
    setFormError("");
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      await apiFetch("/employees", { method: "POST", body: JSON.stringify(form) });
      setShowCreate(false);
      setNotice({ tone: "success", text: `${form.fullName} berhasil ditambahkan.` });
      loadData();
    } catch (err) {
      setFormError(errMsg(err, "Gagal menambah karyawan"));
    } finally {
      setBusy(false);
    }
  }

  async function handleConsent(status: "consented" | "declined_pin_only") {
    if (!consentTarget) return;
    setBusy(true);
    try {
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
      setNotice({
        tone: "success",
        text:
          status === "consented"
            ? `${consentTarget.full_name} menyetujui biometrik. Lanjutkan dengan daftarkan wajah.`
            : `${consentTarget.full_name} akan absen memakai PIN + foto.`,
      });
      setConsentTarget(null);
      loadData();
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal menyimpan persetujuan") });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ message: string }>(`/employees/${deactivateTarget.id}/deactivate`, {
        method: "POST",
      });
      setNotice({ tone: "success", text: res.message });
      setDeactivateTarget(null);
      loadData();
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal menonaktifkan karyawan") });
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Karyawan & Wajah"
        description="Kelola data karyawan, persetujuan biometrik (UU PDP No. 27/2022), dan registrasi wajah."
        actions={
          isHrOrIt && (
            <button onClick={openCreate} className="btn btn-primary">
              <Plus className="h-4 w-4" /> Tambah karyawan
            </button>
          )
        }
      />

      {notice && (
        <Alert tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      {isHrOrIt && needsFace > 0 && (
        <Alert tone="info">
          {needsFace} karyawan sudah setuju biometrik tapi wajahnya belum didaftarkan.
        </Alert>
      )}

      <section className="card overflow-hidden">
        <div className="card-header">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, NIK, departemen"
              aria-label="Cari karyawan"
              className="input py-2 pl-9"
            />
          </div>
          {inactiveCount > 0 && (
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-brand-700"
              />
              Tampilkan nonaktif ({inactiveCount})
            </label>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Karyawan</th>
                <th>Departemen &amp; shift</th>
                <th>Biometrik</th>
                <th>Wajah terdaftar</th>
                {isHrOrIt && <th className="text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {employees === null && <TableMessage colSpan={5}>Memuat karyawan...</TableMessage>}
              {employees !== null && rows.length === 0 && (
                <TableMessage colSpan={5}>
                  {employees.length === 0
                    ? "Belum ada karyawan. Klik \"Tambah karyawan\" untuk mulai."
                    : "Tidak ada karyawan yang cocok dengan pencarian."}
                </TableMessage>
              )}
              {rows.map((emp) => (
                <tr key={emp.id} className={emp.is_active ? "hover:bg-slate-50/70" : "bg-slate-50 text-slate-500"}>
                  <td className="cell-primary">
                    <div className="flex items-center gap-2 font-semibold text-slate-900">
                      {emp.full_name}
                      {!emp.is_active && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          Nonaktif
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {emp.nik} · {emp.email}
                    </div>
                  </td>
                  <td data-label="Departemen">
                    <div>{emp.department}</div>
                    <div className="text-xs text-slate-500">{emp.shift_name || "Tanpa shift"}</div>
                  </td>
                  <td data-label="Biometrik">
                    <StatusBadge value={emp.biometric_consent_status} />
                  </td>
                  <td data-label="Wajah">
                    {emp.face_vector_count > 0 ? (
                      <span className="text-sm font-medium text-slate-900">{emp.face_vector_count} foto</span>
                    ) : (
                      <span className="text-sm text-slate-400">Belum</span>
                    )}
                  </td>
                  {isHrOrIt && (
                    <td className="cell-actions md:text-right">
                      {emp.is_active && (
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          {emp.biometric_consent_status === "consented" && (
                            <Link to={`/employees/${emp.id}/enroll`} className="btn btn-primary btn-sm">
                              <ScanFace className="h-3.5 w-3.5" />
                              {emp.face_vector_count > 0 ? "Daftar ulang" : "Daftarkan wajah"}
                            </Link>
                          )}
                          <button onClick={() => setConsentTarget(emp)} className="btn btn-secondary btn-sm">
                            <ShieldCheck className="h-3.5 w-3.5" /> Persetujuan
                          </button>
                          <button
                            onClick={() => setDeactivateTarget(emp)}
                            className="btn btn-ghost btn-sm text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                          >
                            <UserMinus className="h-3.5 w-3.5" /> Nonaktifkan
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate && (
        <Modal title="Tambah karyawan" size="lg" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {formError && (
              <div className="sm:col-span-2">
                <Alert tone="error">{formError}</Alert>
              </div>
            )}
            <div>
              <label htmlFor="f-nik" className="field-label">NIK</label>
              <input id="f-nik" required value={form.nik} onChange={set("nik")} placeholder="mis. EMP-010" className="input" />
            </div>
            <div>
              <label htmlFor="f-name" className="field-label">Nama lengkap</label>
              <input id="f-name" required value={form.fullName} onChange={set("fullName")} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="f-email" className="field-label">Email kantor</label>
              <input id="f-email" type="email" required value={form.email} onChange={set("email")} placeholder="nama@kantor.local" className="input" />
            </div>
            <div>
              <label htmlFor="f-dept" className="field-label">Departemen</label>
              <input id="f-dept" required value={form.department} onChange={set("department")} className="input" />
            </div>
            <div>
              <label htmlFor="f-pos" className="field-label">Jabatan</label>
              <input id="f-pos" value={form.position} onChange={set("position")} className="input" />
            </div>
            <div>
              <label htmlFor="f-shift" className="field-label">Shift</label>
              <select id="f-shift" value={form.shiftId} onChange={set("shiftId")} className="input">
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-role" className="field-label">Peran</label>
              <select id="f-role" value={form.role} onChange={set("role")} className="input">
                <option value="employee">Karyawan</option>
                <option value="supervisor">Atasan</option>
                <option value="hr_admin">Admin HR</option>
                <option value="it_admin">Admin IT</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="f-pin" className="field-label">PIN cadangan (6 angka)</label>
              <input
                id="f-pin"
                required
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={form.pin}
                onChange={set("pin")}
                className="input font-mono tracking-widest sm:w-40"
              />
              <p className="mt-1.5 text-xs text-slate-500">Dipakai saat wajah tidak dikenali atau karyawan menolak biometrik.</p>
            </div>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary">Batal</button>
              <button type="submit" disabled={busy} className="btn btn-primary">{busy ? "Menyimpan..." : "Simpan karyawan"}</button>
            </div>
          </form>
        </Modal>
      )}

      {consentTarget && (
        <Modal
          title="Persetujuan data biometrik"
          description={`${consentTarget.full_name} · ${consentTarget.nik}`}
          size="lg"
          onClose={() => setConsentTarget(null)}
        >
          <p className="text-sm text-slate-600">Sampaikan poin berikut ke karyawan sesuai UU PDP No. 27/2022:</p>
          <ol className="mt-3 list-decimal space-y-2 rounded-lg bg-slate-50 py-4 pl-9 pr-4 text-sm text-slate-700">
            <li>Yang disimpan hanya vektor wajah terenkripsi AES-256 di server internal.</li>
            <li>Foto registrasi dihapus begitu vektor selesai dibuat.</li>
            <li>Foto bukti absen harian dihapus otomatis setelah 90 hari.</li>
            <li>Semua data wajah dihapus permanen saat karyawan keluar atau dinonaktifkan.</li>
            <li>Karyawan berhak menolak dan tetap bisa absen dengan PIN + foto.</li>
          </ol>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => handleConsent("declined_pin_only")} disabled={busy} className="btn btn-secondary">
              Menolak, pakai PIN
            </button>
            <button onClick={() => handleConsent("consented")} disabled={busy} className="btn btn-primary">
              Setuju, daftarkan wajah
            </button>
          </div>
        </Modal>
      )}

      {deactivateTarget && (
        <ConfirmDialog
          title={`Nonaktifkan ${deactivateTarget.full_name}?`}
          confirmLabel="Nonaktifkan & hapus data wajah"
          danger
          busy={busy}
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        >
          Karyawan tidak bisa absen lagi, dan sesuai UU PDP seluruh vektor wajahnya akan{" "}
          <strong className="text-slate-900">dihapus permanen</strong>. Riwayat absensi tetap tersimpan.
        </ConfirmDialog>
      )}
    </div>
  );
};
