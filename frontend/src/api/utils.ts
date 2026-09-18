export const normalize = <T,>(data: T[] | { results: T[] }) => Array.isArray(data) ? data : data.results ?? []

export const apiError = (data: Record<string, unknown> | null, fallback: string) =>
  (data?.detail as string) || Object.values(data ?? {}).flat().join(' ') || fallback

export const nameOf = (map: Map<number, string>, id: number | null) => (id == null ? '-' : map.get(id) ?? `Kayıt #${id}`)
