import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Pagination, Typography } from '@mui/material'
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined'
import { AgGridReact } from '@ag-grid-community/react'
import type { ColDef, FilterChangedEvent, ICellRendererParams, ValueFormatterParams } from '@ag-grid-community/core'
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { useReferenceData } from '../context/ReferenceDataContext'
import { fetchPackages } from '../api/packages'
import { nameOf } from '../api/utils'
import { AsyncMultiSelectFilter, MultiSelectFilter } from '../components/grid/MultiSelectFilter'
import type { FilterOption, ValuesFilterModel } from '../components/grid/MultiSelectFilter'
import { DateRangeFilter } from '../components/grid/DateRangeFilter'
import type { DateRangeFilterModel } from '../components/grid/DateRangeFilter'
import { PACKAGE_STATUS_LABELS } from '../types'
import type { Package, PackageFilters, PackageStatus } from '../types'

const gridModules = [ClientSideRowModelModule]

const statusOptions = (Object.entries(PACKAGE_STATUS_LABELS) as [PackageStatus, string][]).map(([value, label]) => ({ value, label }))

const formatDate = ({ value }: ValueFormatterParams<Package, string | null>) => value ? new Date(value).toLocaleString('tr-TR') : '-'

// Kolon filtre modelleri (colId -> model) backend'in beklediği query param'lara çevrilir.
function toPackageFilters(model: Record<string, unknown>): PackageFilters {
  const values = <T,>(key: string) => (model[key] as ValuesFilterModel<T> | undefined)?.values
  const range = (key: string) => (model[key] as DateRangeFilterModel | undefined) ?? {}
  return {
    tracking_number: values<string>('tracking_number'),
    recipient_name: values<string>('recipient_name'),
    payment_type: values<string>('payment_type'),
    status: values<PackageStatus>('status'),
    employee: values<number>('employee'),
    origin_branch: values<number>('origin_branch'),
    destination_branch: values<number>('destination_branch'),
    created_after: range('created_at').from,
    created_before: range('created_at').to,
    last_movement_after: range('last_movement_at').from,
    last_movement_before: range('last_movement_at').to,
  }
}

function InceleCell({ data }: ICellRendererParams<Package>) {
  const navigate = useNavigate()
  if (!data) return null
  return <Button size="small" variant="outlined" onClick={() => navigate(`/packages/${data.id}`)}>İncele</Button>
}

export default function PackagesPage() {
  const { employees, branches, employeeNames, branchNames, reloadReferences } = useReferenceData()
  const [packages, setPackages] = useState<Package[]>([])
  const [filters, setFilters] = useState<PackageFilters>({})
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Filtre veya sayfa hızlı değişirse önceki istek iptal edilir; eski yanıt yenisinin üstüne yazılmaz.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setLoadError(null)
    fetchPackages(filters, page, pageSize, controller.signal)
      .then((data) => {
        setPackages(data.results)
        setTotalPages(data.total_pages ?? 1)
        setPage(data.page_number ?? page)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setLoadError(error instanceof Error ? error.message : 'Paketler alınamadı.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filters, page, pageSize, reloadKey])

  const onFilterChanged = useCallback((event: FilterChangedEvent<Package>) => {
    setFilters(toPackageFilters(event.api.getFilterModel()))
    setPage(1)
  }, [])

  const employeeOptions = useMemo<FilterOption<number>[]>(() => employees.map((item) => ({ value: item.id, label: item.name })), [employees])
  const branchOptions = useMemo<FilterOption<number>[]>(() => branches.map((item) => ({ value: item.id, label: item.name })), [branches])

  const columns = useMemo<ColDef<Package>[]>(() => [
    { field: 'id', headerName: 'ID', width: 75, filter: false },
    { field: 'tracking_number', headerName: 'Takip numarası', minWidth: 175, filter: AsyncMultiSelectFilter, filterParams: { field: 'tracking_number' } },
    { field: 'employee', headerName: 'Çalışan', valueFormatter: ({ value }) => nameOf(employeeNames, value), filter: MultiSelectFilter, filterParams: { options: employeeOptions } },
    { field: 'origin_branch', headerName: 'Çıkış', valueFormatter: ({ value }) => nameOf(branchNames, value), filter: MultiSelectFilter, filterParams: { options: branchOptions } },
    { field: 'destination_branch', headerName: 'Varış', valueFormatter: ({ value }) => nameOf(branchNames, value), filter: MultiSelectFilter, filterParams: { options: branchOptions } },
    { field: 'status', headerName: 'Durum', minWidth: 140, valueFormatter: ({ value }) => PACKAGE_STATUS_LABELS[value as PackageStatus] ?? value, filter: MultiSelectFilter, filterParams: { options: statusOptions } },
    { field: 'recipient_name', headerName: 'Alıcı', filter: AsyncMultiSelectFilter, filterParams: { field: 'recipient_name' } },
    { field: 'payment_type', headerName: 'Ödeme', filter: AsyncMultiSelectFilter, filterParams: { field: 'payment_type' } },
    { field: 'created_at', headerName: 'Oluşturulma', minWidth: 170, valueFormatter: formatDate, filter: DateRangeFilter },
    { field: 'last_movement_at', headerName: 'Son hareket', minWidth: 170, valueFormatter: formatDate, filter: DateRangeFilter },
    { headerName: '', width: 130, sortable: false, filter: false, resizable: false, cellRenderer: InceleCell },
  ], [employeeNames, branchNames, employeeOptions, branchOptions])

  return <Box>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
      <Box><Typography variant="h4" fontWeight={700}>Paketler</Typography><Typography color="text.secondary">Detay için İncele butonuna tıklayın.</Typography></Box>
      <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={() => { void reloadReferences(); setReloadKey((key) => key + 1) }}>Yenile</Button>
    </Box>
    {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}
    {/* Grid yükleme sırasında da mounted kalır; aksi halde kolon filtrelerinin durumu sıfırlanır. */}
    <Box sx={{ position: 'relative' }}>
      <Box className="ag-theme-quartz grid-shell">
        <AgGridReact modules={gridModules} rowData={packages} columnDefs={columns} defaultColDef={{ sortable: true, resizable: true, flex: 1 }} onFilterChanged={onFilterChanged} overlayNoRowsTemplate="Kayıt bulunamadı." />
      </Box>
      {loading && <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.6)', borderRadius: '10px' }}><CircularProgress /></Box>}
    </Box>
    {totalPages > 1 && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}><Pagination count={totalPages} page={page} onChange={(_event: ChangeEvent<unknown>, value: number) => setPage(value)} color="primary" /></Box>}
  </Box>
}
