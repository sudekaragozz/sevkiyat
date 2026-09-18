export type Reference = { id: number; name: string }

// Mirrors EmployeeSerializer (shipments/serializers.py): id, name, role.
export type EmployeeRole = 'SOFOR' | 'KURYE'
export type Employee = { id: number; name: string; role: EmployeeRole }

export type Sefer = {
  id: number
  vehicle: number
  loaded_by: number
  origin_branch: number
  destination_branch: number
  previous_sefer: number | null
  status: string
  loading_date: string
  package_count: number
}

// Mirrors PackageHistorySerializer exactly (shipments/serializers.py): id, package, sefer,
// branch, employee, status, created_at.
export type PackageHistory = {
  id: number
  package: number
  sefer: number | null
  branch: number | null
  status: string
  created_at: string
  employee: number | null
}

export type Package = {
  id: number
  tracking_number: string
  employee: number
  origin_branch: number
  destination_branch: number
  current_branch: number | null
  sefer: number | null
  recipient_name: string
  recipient_phone: string
  desi: string | number
  payment_type: string
}

export type PaginatedPackages = {
  count: number
  total_pages: number
  page_number: number
  page_size: number
  results: Package[]
}

// Response shape of GET /api/package-history/ (shipments/views.py PackageHistoryView).
export type PaginatedPackageHistory = {
  count: number
  total_pages: number
  page_number: number
  page_size: number
  results: PackageHistory[]
}

export type Vehicle = { id: number; plate_number: string; capacity: string | number }

export type CargoForm = {
  employee: number | ''
  origin_branch: number | ''
  destination_branch: number | ''
  recipient_name: string
  recipient_phone: string
  desi: string
  payment_type: string
}
