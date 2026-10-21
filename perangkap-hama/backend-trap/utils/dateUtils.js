/**
 * Utility untuk konversi dan format zona waktu Waktu Indonesia Barat (WIB, UTC+7 / Asia/Jakarta)
 * Format standar: "tanggal-bulan-tahun terus jam" (DD-MM-YYYY HH:mm:ss WIB atau DD-MM-YYYY HH:mm WIB)
 */

function getWibParts(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  return {
    day: map.day,
    month: map.month,
    year: map.year,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/**
 * Format tanggal ke format WIB: "DD-MM-YYYY HH:mm:ss WIB" atau "DD-MM-YYYY HH:mm WIB"
 */
function formatWib(dateInput, includeSeconds = true) {
  const p = getWibParts(dateInput);
  if (!p) return '-';
  const timeStr = includeSeconds ? `${p.hour}:${p.minute}:${p.second}` : `${p.hour}:${p.minute}`;
  return `${p.day}-${p.month}-${p.year} ${timeStr} WIB`;
}

module.exports = {
  getWibParts,
  formatWib,
};
