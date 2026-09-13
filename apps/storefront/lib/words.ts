/** "+233241234567" as people write it: "024 123 4567". */
export function phoneWords(phone: string): string {
  if (!/^\+233\d{9}$/.test(phone)) return phone;
  const national = `0${phone.slice(4)}`;
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}
