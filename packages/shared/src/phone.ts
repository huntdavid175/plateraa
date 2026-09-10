/**
 * Normalises a Ghanaian phone number to E.164 (`+233XXXXXXXXX`), the key customers are
 * deduplicated on. Accepts "024 123 4567", "0241234567", "233241234567", "+233 24 123 4567".
 * Returns null for anything that isn't a Ghanaian number.
 */
export function normalizeGhanaPhone(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, '');
  let national: string;
  if (/^\+233\d{9}$/.test(compact)) national = compact.slice(4);
  else if (/^00233\d{9}$/.test(compact)) national = compact.slice(5);
  else if (/^233\d{9}$/.test(compact)) national = compact.slice(3);
  else if (/^0\d{9}$/.test(compact)) national = compact.slice(1);
  else return null;

  // After the trunk 0, Ghanaian mobile numbers start with 2 or 5 and fixed lines with 3.
  if (!/^[235]\d{8}$/.test(national)) return null;
  return `+233${national}`;
}
