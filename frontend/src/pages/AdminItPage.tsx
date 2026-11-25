import React, { useEffect, useState } from "react";
import { Check, Copy, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Alert, ConfirmDialog, Notice, PageHeader, TableMessage } from "../components/ui";
import { errMsg, fmtDateTime } from "../lib/format";

interface KioskRow {
  id: string;
  device_code: string;
  name: string;
  location: string;
  is_active: boolean;
  rate_limit_per_min: number;
  last_seen_at: string | null;
}

interface SettingRow {
  key: string;
  value: string;
  description: string;
}

interface AuditRow {
  id: string;
  action: string;
  actor_name: string | null;
  actor_role: string;
  target_employee_name: string | null;
  ip_address: string;
  created_at: string;
}

export const AdminItPage: React.FC = () => {
  const { user } = useAuth();
  const isItAdmin = user?.role === "it_admin";

  const [kiosks, setKiosks] = useState<KioskRow[] | null>(null);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [faceHealth, setFaceHealth] = useState<Record<string, string> | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditRow[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [newToken, setNewToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [kioskForm, setKioskForm] = useState({ deviceCode: "", name: "", location: "", rateLimitPerMin: 60 });
  const [busy, setBusy] = useState<string | null>(null);

  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<KioskRow | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);

  async function load() {
    try {
      const [kRes, sRes, aRes] = await Promise.all([
        apiFetch<{ kiosks: KioskRow[] }>("/admin/kiosks"),
        apiFetch<{ settings: SettingRow[]; faceServiceHealth: Record<string, string> }>("/admin/settings"),
        apiFetch<{ logs: AuditRow[] }>("/admin/biometric-audit-logs"),
      ]);
      setKiosks(kRes.kiosks);
      setSettings(sRes.settings);
      setFaceHealth(sRes.faceServiceHealth || {});
      setAuditLogs(aRes.logs);
    } catch (e) {
      setKiosks([]);
      setAuditLogs([]);
      setNotice({ tone: "error", text: errMsg(e, "Gagal memuat data admin") });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createKiosk(e: React.FormEvent) {
    e.preventDefault();
    setBusy("kiosk");
    try {
      const res = await apiFetch<{ kioskToken: string }>("/admin/kiosks", {
        method: "POST",
        body: JSON.stringify({ ...kioskForm, rateLimitPerMin: Number(kioskForm.rateLimitPerMin) }),
      });
      setNewToken(res.kioskToken);
      setCopied(false);
      setKioskForm({ deviceCode: "", name: "", location: "", rateLimitPerMin: 60 });
      load();
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal membuat kiosk") });
    } finally {
      setBusy(null);
    }
  }

  async function revokeKiosk() {
    if (!revokeTarget) return;
    setBusy("revoke");
    try {
      await apiFetch(`/admin/kiosks/${revokeTarget.id}/revoke`, { method: "POST" });
      setNotice({ tone: "success", text: `Token ${revokeTarget.name} dicabut.` });
      setRevokeTarget(null);
      load();
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal mencabut token") });
    } finally {
      setBusy(null);
    }
  }

  async function saveSetting(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const current = settings.find((s) => s.key === editing.key)?.value;
    if (editing.value.trim() === "" || editing.value === current) {
      setEditing(null);
      return;
    }
    setBusy("setting");
    try {
      await apiFetch(`/admin/settings/${editing.key}`, {
        method: "PUT",
        body: JSON.stringify({ value: editing.value.trim() }),
      });
      setNotice({ tone: "success", text: `${editing.key} diperbarui menjadi ${editing.value.trim()}.` });
      setEditing(null);
      load();
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal menyimpan pengaturan") });
    } finally {
      setBusy(null);
    }
  }

  async function triggerCleanup() {
    setBusy("cleanup");
    try {
      const res = await apiFetch<{ deletedCount: number; retentionDays: number }>(
        "/admin/cleanup-proof-photos",
        { method: "POST" }
      );
      setNotice({
        tone: "success",
        text: `Pembersihan selesai: ${res.deletedCount} foto lebih dari ${res.retentionDays} hari dihapus.`,
      });
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal membersihkan foto") });
    } finally {
      setBusy(null);
      setConfirmCleanup(false);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const healthy = faceHealth?.status === "ok" || faceHealth?.status === "healthy";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin IT & Audit"
        description="Token perangkat kiosk, ambang kecocokan wajah, retensi foto, dan log akses data biometrik."
        actions={
          isItAdmin && (
            <button onClick={() => setConfirmCleanup(true)} className="btn btn-secondary">
              <Trash2 className="h-4 w-4" /> Bersihkan foto &gt; 90 hari
            </button>
          )
        }
      />

      {notice && (
        <Alert tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      {/* Status layanan pengenalan wajah */}
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 text-sm sm:px-5">
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              faceHealth === null ? "bg-slate-300" : healthy ? "bg-brand-600" : "bg-rose-600"
            }`}
            aria-hidden
          />
          Layanan wajah:{" "}
          <span className={healthy ? "text-brand-700" : faceHealth === null ? "text-slate-500" : "text-rose-700"}>
            {faceHealth === null ? "memeriksa..." : faceHealth.status || "tidak diketahui"}
          </span>
        </div>
        {faceHealth && (
          <div className="text-slate-500">
            Detektor <span className="font-medium text-slate-700">{faceHealth.detector || "–"}</span> · Pengenal{" "}
            <span className="font-medium text-slate-700">{faceHealth.recognizer || "–"}</span>
          </div>
        )}
      </div>

      {newToken && (
        <Alert tone="warning" onClose={() => setNewToken("")}>
          <div className="font-semibold">Token kiosk baru. Salin sekarang, token hanya ditampilkan sekali.</div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 select-all break-all rounded-md border border-amber-200 bg-white px-3 py-2 font-mono text-xs">
              {newToken}
            </code>
            <button onClick={copyToken} className="btn btn-secondary btn-sm self-start sm:self-auto">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Tersalin" : "Salin"}
            </button>
          </div>
        </Alert>
      )}

      {/* Perangkat kiosk */}
      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Perangkat kiosk</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Perangkat</th>
                <th>Lokasi</th>
                <th>Batas permintaan</th>
                <th>Terakhir aktif</th>
                <th>Status</th>
                {isItAdmin && <th className="text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {kiosks === null && <TableMessage colSpan={6}>Memuat perangkat...</TableMessage>}
              {kiosks?.length === 0 && (
                <TableMessage colSpan={6}>Belum ada perangkat kiosk. Buat token di bawah.</TableMessage>
              )}
              {kiosks?.map((k) => (
                <tr key={k.id} className={k.is_active ? "" : "text-slate-500"}>
                  <td className="cell-primary">
                    <div className="font-semibold text-slate-900">{k.name}</div>
                    <div className="font-mono text-xs text-slate-500">{k.device_code}</div>
                  </td>
                  <td data-label="Lokasi">{k.location}</td>
                  <td data-label="Batas">{k.rate_limit_per_min}/menit</td>
                  <td data-label="Terakhir aktif" className="text-slate-600">
                    {k.last_seen_at ? fmtDateTime(k.last_seen_at) : "Belum pernah"}
                  </td>
                  <td data-label="Status">
                    {k.is_active ? (
                      <span className="text-sm font-semibold text-brand-700">Aktif</span>
                    ) : (
                      <span className="text-sm font-semibold text-rose-700">Dicabut</span>
                    )}
                  </td>
                  {isItAdmin && (
                    <td className="cell-actions md:text-right">
                      {k.is_active && (
                        <button onClick={() => setRevokeTarget(k)} className="btn btn-danger-soft btn-sm">
                          <ShieldAlert className="h-3.5 w-3.5" /> Cabut token
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isItAdmin && (
          <form
            onSubmit={createKiosk}
            className="grid gap-3 border-t border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
          >
            <div className="text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-4">Daftarkan kiosk baru</div>
            <div>
              <label htmlFor="k-code" className="field-label">Kode perangkat</label>
              <input id="k-code" required placeholder="mis. KIOSK-02" value={kioskForm.deviceCode}
                onChange={(e) => setKioskForm({ ...kioskForm, deviceCode: e.target.value })} className="input" />
            </div>
            <div>
              <label htmlFor="k-name" className="field-label">Nama</label>
              <input id="k-name" required placeholder="mis. Tablet Lobi" value={kioskForm.name}
                onChange={(e) => setKioskForm({ ...kioskForm, name: e.target.value })} className="input" />
            </div>
            <div>
              <label htmlFor="k-loc" className="field-label">Lokasi</label>
              <input id="k-loc" required placeholder="mis. Pintu Timur" value={kioskForm.location}
                onChange={(e) => setKioskForm({ ...kioskForm, location: e.target.value })} className="input" />
            </div>
            <button type="submit" disabled={busy === "kiosk"} className="btn btn-primary">
              <Plus className="h-4 w-4" /> Buat token
            </button>
          </form>
        )}
      </section>

      {/* Pengaturan */}
      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Ambang kecocokan & aturan</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {settings.map((s) => (
            <li key={s.key} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{s.description || s.key}</div>
                <div className="font-mono text-xs text-slate-500">{s.key}</div>
              </div>
              {editing?.key === s.key ? (
                <form onSubmit={saveSetting} className="flex items-center gap-2">
                  <label htmlFor={`set-${s.key}`} className="sr-only">Nilai {s.key}</label>
                  <input
                    id={`set-${s.key}`}
                    autoFocus
                    value={editing.value}
                    onChange={(e) => setEditing({ key: s.key, value: e.target.value })}
                    onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                    className="input w-32 py-1.5 font-mono"
                  />
                  <button type="submit" disabled={busy === "setting"} className="btn btn-primary btn-sm">Simpan</button>
                  <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost btn-sm">Batal</button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-sm font-semibold text-slate-900">
                    {s.value}
                  </span>
                  {isItAdmin && (
                    <button
                      onClick={() => setEditing({ key: s.key, value: s.value })}
                      aria-label={`Ubah ${s.key}`}
                      className="btn btn-ghost btn-sm"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Ubah
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Log audit */}
      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Log akses data biometrik</h2>
          <span className="text-xs text-slate-500">Wajib dicatat menurut UU PDP No. 27/2022</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Aksi</th>
                <th>Waktu</th>
                <th>Oleh</th>
                <th>Data karyawan</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs === null && <TableMessage colSpan={5}>Memuat log audit...</TableMessage>}
              {auditLogs?.length === 0 && (
                <TableMessage colSpan={5}>
                  Belum ada akses data biometrik. Registrasi dan penghapusan wajah akan tercatat di sini.
                </TableMessage>
              )}
              {auditLogs?.map((l) => (
                <tr key={l.id}>
                  <td className="cell-primary font-mono text-xs font-semibold text-slate-900">{l.action}</td>
                  <td data-label="Waktu" className="whitespace-nowrap text-slate-600">{fmtDateTime(l.created_at)}</td>
                  <td data-label="Oleh">
                    {l.actor_name || "Sistem"} <span className="text-xs text-slate-500">({l.actor_role})</span>
                  </td>
                  <td data-label="Karyawan">{l.target_employee_name || "–"}</td>
                  <td data-label="IP" className="font-mono text-xs text-slate-600">{l.ip_address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {revokeTarget && (
        <ConfirmDialog
          title={`Cabut token ${revokeTarget.name}?`}
          confirmLabel="Cabut token"
          danger
          busy={busy === "revoke"}
          onConfirm={revokeKiosk}
          onCancel={() => setRevokeTarget(null)}
        >
          Tablet di {revokeTarget.location} tidak akan bisa mengirim absen lagi sampai diberi token baru.
        </ConfirmDialog>
      )}

      {confirmCleanup && (
        <ConfirmDialog
          title="Bersihkan foto bukti lama?"
          confirmLabel="Hapus foto lama"
          danger
          busy={busy === "cleanup"}
          onConfirm={triggerCleanup}
          onCancel={() => setConfirmCleanup(false)}
        >
          Semua foto bukti absen yang lebih dari 90 hari akan dihapus permanen. Log absensinya tetap tersimpan.
        </ConfirmDialog>
      )}
    </div>
  );
};
