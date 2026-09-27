import type { FilterOption } from '../components/grid/MultiSelectFilter'
import type { PaginatedSefers, SeferFilters, TripFilterOptionField } from '../types'

// Seferler sayfasının tablosu: filtreleme ve sayfalama tamamen backend'de yapılır.
export async function fetchTrips(filters: SeferFilters, pageNumber: number, pageSize: number, signal?: AbortSignal): Promise<PaginatedSefers> {
  const params = new URLSearchParams({ page_number: String(pageNumber), page_size: String(pageSize) })
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value) ? value.length > 0 : value) params.set(key, Array.isArray(value) ? value.join(',') : value)
  }
  const response = await fetch(`/api/trips/?${params}`, { signal })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.detail ?? `Sunucu yanıtı: ${response.status}`)
  return data as PaginatedSefers
}

// Seferlerde gerçekten kullanılan değerler (araç, şoför, şube, durum) — filtre dropdown'ları için.
export async function fetchTripFilterOptions<T extends string | number>(field: TripFilterOptionField): Promise<FilterOption<T>[]> {
  const response = await fetch(`/api/trips/filter-options/?field=${field}`)
  if (!response.ok) throw new Error(`Sunucu yanıtı: ${response.status}`)
  return response.json() as Promise<FilterOption<T>[]>
}
