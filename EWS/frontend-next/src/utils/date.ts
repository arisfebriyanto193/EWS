/**
 * Utility untuk konversi dan format zona waktu Waktu Indonesia Barat (WIB, UTC+7 / Asia/Jakarta)
 * Format standar: "tanggal-bulan-tahun terus jam" (DD-MM-YYYY HH:mm WIB)
 */

export function formatWIB(
  dateInput: string | number | Date | null | undefined,
  includeSeconds = false
): string {
  if (!dateInput) return '-';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const day = partMap.day || '01';
  const month = partMap.month || '01';
  const year = partMap.year || '2026';
  const hour = partMap.hour || '00';
  const minute = partMap.minute || '00';
  const second = partMap.second || '00';

  const timeStr = includeSeconds ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
  return `${day}-${month}-${year} ${timeStr} WIB`;
}

/**
 * Format jam dan menit saja dalam WIB: "HH:mm" (misal "01:00", "01:05", "01:10")
 */
export function formatWIBTimeOnly(
  dateInput: string | number | Date | null | undefined
): string {
  if (!dateInput) return '-';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Format tanggal saja dalam WIB: "DD-MM-YYYY"
 */
export function formatWIBDateOnly(
  dateInput: string | number | Date | null | undefined
): string {
  if (!dateInput) return '-';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const parts = formatter.formatToParts(d);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }
  return `${partMap.day}-${partMap.month}-${partMap.year}`;
}
