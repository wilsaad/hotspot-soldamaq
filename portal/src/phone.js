export function normalizeBrazilPhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;

  if (!/^[1-9]{2}9?[0-9]{8}$/.test(withoutCountry)) {
    return null;
  }

  return `55${withoutCountry}`;
}

export function displayPhone(e164Digits) {
  const value = String(e164Digits || '').replace(/^55/, '');
  if (value.length === 11) return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
  if (value.length === 10) return `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
  return e164Digits;
}
