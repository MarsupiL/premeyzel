// Keep French searches forgiving of accents, case and incidental spaces.
export function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr')
    .replaceAll('œ', 'oe')
    .trim()
    .replace(/\s+/g, ' ');
}
