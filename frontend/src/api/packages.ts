import type { Package, PackageHistory, PaginatedPackageHistory, PaginatedPackages } from '../types'

// There is no GET /api/packages/<id>/ endpoint on the backend — only the paginated list at
// /api/packages/. To look up a single package (e.g. for the detail page or for a sefer's
// eligible-package check) we walk every page and filter client-side.
export async function fetchAllPackages(pageSize = 100): Promise<Package[]> {
  const first = await fetch(`/api/packages/?page_number=1&page_size=${pageSize}`)
  if (!first.ok) throw new Error(`Sunucu yanıtı: ${first.status}`)
  const firstData = await first.json() as PaginatedPackages | Package[]
  if (Array.isArray(firstData)) return firstData

  const totalPages = firstData.total_pages ?? 1
  const restPages = await Promise.all(
    Array.from({ length: Math.max(totalPages - 1, 0) }, (_, index) =>
      fetch(`/api/packages/?page_number=${index + 2}&page_size=${pageSize}`).then((response) => response.json() as Promise<PaginatedPackages>)
    )
  )
  return [...firstData.results, ...restPages.flatMap((page) => page.results)]
}

// Package history lives at a separate endpoint (GET /api/package-history/?package=<id>) —
// it is not nested inside the package payload, so it must be fetched on its own.
export async function fetchPackageHistory(packageId: number, pageSize = 100): Promise<PackageHistory[]> {
  const first = await fetch(`/api/package-history/?package=${packageId}&page_number=1&page_size=${pageSize}`)
  if (!first.ok) throw new Error(`Sunucu yanıtı: ${first.status}`)
  const firstData = await first.json() as PaginatedPackageHistory

  const totalPages = firstData.total_pages ?? 1
  const restPages = await Promise.all(
    Array.from({ length: Math.max(totalPages - 1, 0) }, (_, index) =>
      fetch(`/api/package-history/?package=${packageId}&page_number=${index + 2}&page_size=${pageSize}`).then((response) => response.json() as Promise<PaginatedPackageHistory>)
    )
  )
  return [...firstData.results, ...restPages.flatMap((page) => page.results)]
}

// Bir seferin bugüne kadar taşıdığı tüm paketler (hâlâ üstünde olsun ya da inmiş olsun) —
// sadece paket bilgisi, geçmiş dahil değil. Bir paketin tam geçmişi istenirse (kullanıcı o
// paketi seçtiğinde) ayrıca fetchPackageHistory(packageId) çağrılır — hepsi için birden değil.
export async function fetchSeferPackages(seferId: number): Promise<Package[]> {
  const response = await fetch(`/api/sefer/${seferId}/packages/`)
  if (!response.ok) throw new Error(`Sunucu yanıtı: ${response.status}`)
  return response.json() as Promise<Package[]>
}
