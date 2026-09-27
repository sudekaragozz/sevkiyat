import type { FilterOption } from '../components/grid/MultiSelectFilter'
import type { Distribution, DistributionFilterOptionField, DistributionFilters, DistributionPackage, Package, PaginatedDistributions } from '../types'
import { apiError } from './utils'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const data = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) throw new Error(apiError(data, `Sunucu yanıtı: ${response.status}`))
  return data as T
}

const post = <T,>(url: string, body?: unknown) => request<T>(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

// Dağıtımlar sayfasının tablosu: filtreleme ve sayfalama tamamen backend'de yapılır.
export function fetchDistributions(filters: DistributionFilters, pageNumber: number, pageSize: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ page_number: String(pageNumber), page_size: String(pageSize) })
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value) ? value.length > 0 : value) params.set(key, Array.isArray(value) ? value.join(',') : value)
  }
  return request<PaginatedDistributions>(`/api/distributions/?${params}`, { signal })
}

// Dağıtımlarda gerçekten kullanılan değerler (şube, kurye, araç, durum) — filtre dropdown'ları için.
export const fetchDistributionFilterOptions = <T extends string | number>(field: DistributionFilterOptionField) =>
  request<FilterOption<T>[]>(`/api/distributions/filter-options/?field=${field}`)

// Şubede bekleyen, varışı o şube olan ve açık bir dağıtımda olmayan paketler.
export const fetchEligiblePackages = (branchId: number, signal?: AbortSignal) =>
  request<Package[]>(`/api/distributions/eligible-packages/?branch=${branchId}`, { signal })

export const createDistribution = (payload: { branch: number; courier: number; vehicle: number; package_ids: number[] }) =>
  post<Distribution>('/api/distributions/', payload)

export const fetchDistribution = (id: number) => request<Distribution>(`/api/distributions/${id}/`)

export const fetchDistributionPackages = (id: number) => request<DistributionPackage[]>(`/api/distributions/${id}/packages/`)

export const startDistribution = (id: number) => post<Distribution>(`/api/distributions/${id}/start/`)

// Sonucu girilmemiş paketler backend'de otomatik "Teslim Edilemedi" olur.
export const completeDistribution = (id: number) => post<Distribution>(`/api/distributions/${id}/complete/`)

export const setPackageResult = (id: number, packageId: number, result: 'DELIVERED' | 'FAILED') =>
  post<DistributionPackage>(`/api/distributions/${id}/packages/${packageId}/result/`, { result })
