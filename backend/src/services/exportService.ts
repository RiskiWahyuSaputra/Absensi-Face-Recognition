import ExcelJS from "exceljs";

export interface MonthlyRecapRow {
  nik: string;
  fullName: string;
  department: string;
  shiftName: string;
  presentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  pinFallbackCount: number;
  absentDays: number;
}

export async function generateRecapExcelBuffer(
  month: string,
  rows: MonthlyRecapRow[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistem Absensi Face Recognition";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`Rekap ${month}`);
  sheet.columns = [
    { header: "NIK", key: "nik", width: 16 },
    { header: "Nama Karyawan", key: "fullName", width: 28 },
    { header: "Departemen", key: "department", width: 20 },
    { header: "Shift", key: "shiftName", width: 18 },
    { header: "Hadir (Hari)", key: "presentDays", width: 14 },
    { header: "Terlambat", key: "lateDays", width: 14 },
    { header: "Pulang Cepat", key: "earlyLeaveDays", width: 14 },
    { header: "Fallback PIN", key: "pinFallbackCount", width: 14 },
    { header: "Tidak Hadir", key: "absentDays", width: 14 },
  ];

  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function generateRecapCsv(rows: MonthlyRecapRow[]): string {
  const headers = [
    "NIK",
    "Nama Karyawan",
    "Departemen",
    "Shift",
    "Hadir (Hari)",
    "Terlambat",
    "Pulang Cepat",
    "Fallback PIN",
    "Tidak Hadir",
  ];
  const escapeCsv = (val: string | number) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.nik,
        r.fullName,
        r.department,
        r.shiftName,
        r.presentDays,
        r.lateDays,
        r.earlyLeaveDays,
        r.pinFallbackCount,
        r.absentDays,
      ]
        .map(escapeCsv)
        .join(",")
    );
  }
  return lines.join("\n");
}
