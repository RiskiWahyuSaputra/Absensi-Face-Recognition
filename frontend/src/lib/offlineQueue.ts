/**
 * Mode Offline Kiosk (Wajib Fase 1 PRD):
 * Bila internet kantor / VPS putus, antrean absen (foto + timestamp + PIN jika fallback)
 * disimpan aman di IndexedDB dan otomatis dikirim ulang saat server kembali tersambung.
 */

export interface OfflineAttendanceItem {
  id?: number;
  mode: "face" | "pin";
  imageBase64: string;
  secondaryImageBase64?: string;
  nik?: string;
  pin?: string;
  clientRecordedAt: string;
}

const DB_NAME = "absensi_kiosk_offline_db";
const STORE_NAME = "pending_attendance";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOfflineAttendance(
  item: Omit<OfflineAttendanceItem, "id">
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllQueuedAttendance(): Promise<OfflineAttendanceItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as OfflineAttendanceItem[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedAttendance(id: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
