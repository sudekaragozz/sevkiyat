import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Pagination, Typography } from '@mui/material'
import AddOutlinedIcon from '@mui/icons-material/AddOutlined'
import { AgGridReact } from '@ag-grid-community/react'
import type { ColDef, FilterChangedEvent, ICellRendererParams } from '@ag-grid-community/core'
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { useReferenceData } from '../context/ReferenceDataContext'
import { nameOf } from '../api/utils'
import { fetchDistributionFilterOptions, fetchDistributions, startDistribution } from '../api/distributions'
import { MultiSelectFilter } from '../components/grid/MultiSelectFilter'
import type { ValuesFilterModel } from '../components/grid/MultiSelectFilter'
import { DateRangeFilter } from '../components/grid/DateRangeFilter'
import { NumberRangeFilter } from '../components/grid/NumberRangeFilter'
import type { RangeFilterModel } from '../components/grid/useRangeDraft'
import { CompleteDistributionDialog } from '../components/CompleteDistributionDialog'
import { CreateDistributionDialog } from '../components/CreateDistributionDialog'
import { distributionStatus } from '../constants'
import type { Distribution, DistributionFilters } from '../types'

const gridModules = [ClientSideRowModelModule]
const pageSize = 20

// Filtre seçenekleri backend'den gelir: yalnızca dağıtımlarda gerçekten kullanılan değerler.
const loadBranchOptions = () => fetchDistributionFilterOptions<number>('branch')
const loadCourierOptions = () => fetchDistributionFilterOptions<number>('courier')
const loadVehicleOptions = () => fetchDistributionFilterOptions<number>('vehicle')
const loadStatusOptions = () => fetchDistributionFilterOptions<string>('status')

// Kolon filtre modelleri (colId -> model) backend'in beklediği query param'lara çevrilir.
function toDistributionFilters(model: Record<string, unknown>): DistributionFilters {
  const values = <T,>(key: string) => (model[key] as ValuesFilterModel<T> | undefined)?.values
  const range = (key: string) => (model[key] as RangeFilterModel | undefined) ?? {}
  return {
    status: values<string>('status'),
    branch: values<number>('branch'),
    courier: values<number>('courier'),
    vehicle: values<number>('vehicle'),
    started_after: range('started_at').from,
    started_before: range('started_at').to,
    package_count_min: range('package_count').from,
    package_count_max: range('package_count').to,
  }
}

export default function DistributionsPage() {
  const { vehicles, branchNames, employeeNames } = useReferenceData()
  const navigate = useNavigate()

  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [filters, setFilters] = useState<DistributionFilters>({})
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [completeId, setCompleteId] = useState<number | null>(null)

  // Filtre veya sayfa hızlı değişirse önceki istek iptal edilir; eski yanıt yenisinin üstüne yazılmaz.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setLoadError(null)
    fetchDistributions(filters, page, pageSize, controller.signal)
      .then((data) => {
        setDistributions(data.results)
        setTotalPages(data.total_pages ?? 1)
        setPage(data.page_number ?? page)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setLoadError(error instanceof Error ? error.message : 'Dağıtımlar alınamadı.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filters, page, reloadKey])

  const reload = () => setReloadKey((key) => key + 1)

  const onFilterChanged = useCallback((event: FilterChangedEvent<Distribution>) => {
    setFilters(toDistributionFilters(event.api.getFilterModel()))
    setPage(1)
  }, [])

  const vehiclePlates = useMemo(() => new Map(vehicles.map((item) => [item.id, item.plate_number])), [vehicles])

  const start = async (id: number) => {
    setBusyId(id); setActionError(null)
    try {
      await startDistribution(id)
      reload()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Dağıtıma çıkarılamadı.')
    } finally {
      setBusyId(null)
    }
  }

  const columns = useMemo<ColDef<Distribution>[]>(() => [
    { field: 'id', headerName: 'ID', width: 90, filter: false },
    { field: 'branch', headerName: 'Şube', valueFormatter: ({ value }) => nameOf(branchNames, value), filter: MultiSelectFilter, filterParams: { loadOptions: loadBranchOptions } },
    { field: 'courier', headerName: 'Kurye', valueFormatter: ({ value }) => nameOf(employeeNames, value), filter: MultiSelectFilter, filterParams: { loadOptions: loadCourierOptions } },
    { field: 'vehicle', headerName: 'Araç', valueFormatter: ({ value }) => nameOf(vehiclePlates, value), filter: MultiSelectFilter, filterParams: { loadOptions: loadVehicleOptions } },
    { field: 'started_at', headerName: 'Dağıtıma Çıkma Tarihi', minWidth: 190, valueFormatter: ({ value }) => value ? new Date(value).toLocaleString('tr-TR') : '-', filter: DateRangeFilter },
    { field: 'status', headerName: 'Durum', valueFormatter: ({ value }) => distributionStatus[value] ?? value, filter: MultiSelectFilter, filterParams: { loadOptions: loadStatusOptions } },
    { field: 'package_count', headerName: 'Paket Sayısı', width: 140, minWidth: 140, flex: 0, valueFormatter: ({ value }) => `${value} paket`, filter: NumberRangeFilter },
    {
      headerName: 'Aksiyonlar', width: 340, minWidth: 340, flex: 0, sortable: false, filter: false, resizable: false,
      cellRenderer: ({ data }: ICellRendererParams<Distribution>) => {
        if (!data) return null
        return <Box sx={{ display: 'flex', gap: 1 }}>
          {data.status === 'READY_TO_GO' && <Button size="small" variant="contained" onClick={() => void start(data.id)} disabled={busyId === data.id}>Dağıtıma çıkar</Button>}
          {data.status === 'OUT_FOR_DELIVERY' && <Button size="small" variant="contained" color="error" onClick={() => setCompleteId(data.id)}>Sonlandır</Button>}
          <Button size="small" variant="outlined" onClick={() => navigate(`/distributions/${data.id}`)}>İncele</Button>
        </Box>
      },
    },
  ], [branchNames, employeeNames, vehiclePlates, busyId, navigate])

  return <Box>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
      <Box><Typography variant="h4" fontWeight={700}>Dağıtımlar</Typography><Typography color="text.secondary">Detay için İncele butonuna tıklayın.</Typography></Box>
      <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setCreateOpen(true)}>Dağıtım Oluştur</Button>
    </Box>

    {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
    {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

    {/* Grid yükleme sırasında da mounted kalır; aksi halde kolon filtrelerinin durumu sıfırlanır. */}
    <Box sx={{ position: 'relative' }}>
      <Box className="ag-theme-quartz grid-shell">
        <AgGridReact modules={gridModules} rowData={distributions} columnDefs={columns} defaultColDef={{ sortable: true, resizable: true, flex: 1 }} onFilterChanged={onFilterChanged} overlayNoRowsTemplate="Kayıt bulunamadı." />
      </Box>
      {loading && <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.6)', borderRadius: '10px' }}><CircularProgress /></Box>}
    </Box>
    {totalPages > 1 && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}><Pagination count={totalPages} page={page} onChange={(_event: ChangeEvent<unknown>, value: number) => setPage(value)} color="primary" /></Box>}

    <CreateDistributionDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(distribution) => { setCreateOpen(false); navigate(`/distributions/${distribution.id}`) }} />
    <CompleteDistributionDialog distributionId={completeId} onClose={() => setCompleteId(null)} onCompleted={() => { setCompleteId(null); reload() }} />
  </Box>
}
