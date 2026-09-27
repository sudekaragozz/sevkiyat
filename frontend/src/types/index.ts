export type Reference = { id: number; name: string }

// Mirrors EmployeeSerializer (shipments/serializers.py): id, name, role.
export type EmployeeRole = 'DRIVER' | 'COURIER'
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

// Query params accepted by GET /api/trips/ (TripViewset). Multi-value filters are sent
// comma-separated; dates are YYYY-MM-DD and inclusive; package_count bounds are inclusive.
export type SeferFilters = {
  status?: string[]
  vehicle?: number[]
  loaded_by?: number[]
  origin_branch?: number[]
  destination_branch?: number[]
  loading_after?: string
  loading_before?: string
  package_count_min?: string
  package_count_max?: string
}

export type TripFilterOptionField = 'vehicle' | 'loaded_by' | 'origin_branch' | 'destination_branch' | 'status'

// GET /api/trips/ is only paginated when page_number is sent (the reference data uses the plain list).
export type PaginatedSefers = {
  count: number
  total_pages: number
  page_number: number
  page_size: number
  results: Sefer[]
}

// Mirrors PackageHistorySerializer exactly (shipments/serializers.py): id, package, trip,
// branch, employee, status, created_at.
export type PackageHistory = {
  id: number
  package: number
  trip: number | null
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
  trip: number | null
  recipient_name: string
  recipient_phone: string
  desi: string | number
  payment_type: string
  status: PackageStatus
  // Annotated only by GET /api/packages/ (first/last PackageHistory row); null on other endpoints.
  created_at: string | null
  last_movement_at: string | null
}

// Mirrors Package.Status (shipments/models.py).
export type PackageStatus = 'AT_BRANCH' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED'

export const PACKAGE_STATUS_LABELS: Record<PackageStatus, string> = {
  AT_BRANCH: 'Şubede',
  IN_TRANSIT: 'Yolda',
  OUT_FOR_DELIVERY: 'Dağıtımda',
  DELIVERED: 'Teslim Edildi',
  DELIVERY_FAILED: 'Teslim Edilemedi',
}

// Query params accepted by GET /api/packages/ (PackageViewset). Multi-value filters are sent
// comma-separated; dates are YYYY-MM-DD and inclusive.
export type PackageFilters = {
  tracking_number?: string[]
  recipient_name?: string[]
  payment_type?: string[]
  status?: PackageStatus[]
  employee?: number[]
  origin_branch?: number[]
  destination_branch?: number[]
  created_after?: string
  created_before?: string
  last_movement_after?: string
  last_movement_before?: string
}

export type PackageFilterOptionField = 'tracking_number' | 'recipient_name' | 'payment_type'

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

// Mirrors Distribution.Status / DistributionPackage.Result (shipments/models.py).
export type DistributionStatus = 'READY_TO_GO' | 'OUT_FOR_DELIVERY' | 'COMPLETED'
export type DistributionResult = 'PENDING' | 'DELIVERED' | 'FAILED'

// Mirrors DistributionSerializer (shipments/serializers.py).
export type Distribution = {
  id: number
  branch: number
  courier: number
  vehicle: number
  status: DistributionStatus
  created_at: string
  started_at: string | null
  completed_at: string | null
  package_count: number
}

// Query params accepted by GET /api/distributions/. Multi-value filters are sent comma-separated;
// dates are YYYY-MM-DD and inclusive; package_count bounds are inclusive.
export type DistributionFilters = {
  status?: string[]
  branch?: number[]
  courier?: number[]
  vehicle?: number[]
  started_after?: string
  started_before?: string
  package_count_min?: string
  package_count_max?: string
}

export type DistributionFilterOptionField = 'branch' | 'courier' | 'vehicle' | 'status'

export type PaginatedDistributions = {
  count: number
  total_pages: number
  page_number: number
  page_size: number
  results: Distribution[]
}

// GET /api/distributions/<id>/packages/: the package plus its result in this distribution.
export type DistributionPackage = Package & { result: DistributionResult }
