const codeNumber = code => {
  const match = /^NV-(\d+)$/i.exec(String(code || '').trim());
  const number = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
};
const formatCode = number => `NV-${String(number).padStart(3, '0')}`;

// Preserve issued codes. A persisted high-water mark prevents reuse after deletion.
export function ensureEmployeeCodes(db) {
  const employees = Array.isArray(db.employees) ? db.employees : [];
  const storedSequence = Number.isSafeInteger(db.employeeCodeSequence) && db.employeeCodeSequence >= 0 ? db.employeeCodeSequence : 0;
  let sequence = employees.reduce((max, employee) => Math.max(max, codeNumber(employee.code)), storedSequence);
  let changed = false;
  const ordered = employees.map((employee, index) => {
    const timestamp = Date.parse(employee.createdAt || '');
    const legacyTimestamp = /^emp-(\d{13})$/.exec(String(employee.id || ''));
    return { employee, index, time: Number.isFinite(timestamp) ? timestamp : legacyTimestamp ? Number(legacyTimestamp[1]) : null };
  }).sort((a, b) => {
    // Seed/legacy records without timestamps keep their saved order, before new records.
    if (a.time === null || b.time === null) return a.time === b.time ? a.index - b.index : a.time === null ? -1 : 1;
    return a.time - b.time || a.index - b.index;
  });
  const used = new Set();
  for (const { employee } of ordered) {
    let number = codeNumber(employee.code);
    if (!number || used.has(number)) number = ++sequence;
    used.add(number);
    const code = formatCode(number);
    if (employee.code !== code) { employee.code = code; changed = true; }
  }
  if (db.employeeCodeSequence !== sequence) { db.employeeCodeSequence = sequence; changed = true; }
  return changed;
}

export function nextEmployeeCode(db) {
  ensureEmployeeCodes(db);
  if (db.employeeCodeSequence >= Number.MAX_SAFE_INTEGER) throw new Error('Employee code sequence exhausted');
  db.employeeCodeSequence += 1;
  return formatCode(db.employeeCodeSequence);
}
