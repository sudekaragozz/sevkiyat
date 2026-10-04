const allowedCharacters = /^[\d\s+\-().]+$/
const trMobile = /^5\d{9}$/

export const invalidPhoneMessage = 'Geçerli bir cep telefonu numarası girin (ör. 0532 123 45 67).'

export function normalizeTrMobile(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || !allowedCharacters.test(trimmed)) return null

  let digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 12 && digits.startsWith('90')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)

  return trMobile.test(digits) ? `+90${digits}` : null
}

export function formatTrMobile(value: string): string {
  const normalized = normalizeTrMobile(value)
  if (!normalized) return value
  const digits = normalized.slice(3)
  return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`
}
