import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, FormControl, IconButton, InputLabel, MenuItem, Pagination, Select, Snackbar, Typography } from '@mui/material'
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined'
import AddOutlinedIcon from '@mui/icons-material/AddOutlined'
import { AgGridReact } from '@ag-grid-community/react'
import type { ColDef, FilterChangedEvent, ICellRendererParams } from '@ag-grid-community/core'
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { ReferenceSelect } from '../components/ReferenceSelect'
import { useReferenceData } from '../context/ReferenceDataContext'
import { apiError, nameOf } from '../api/utils'
import { fetchTripFilterOptions, fetchTrips } from '../api/trips'
import { MultiSelectFilter } from '../components/grid/MultiSelectFilter'
import type { ValuesFilterModel } from '../components/grid/MultiSelectFilter'
import { DateRangeFilter } from '../components/grid/DateRangeFilter'
import { NumberRangeFilter } from '../components/grid/NumberRangeFilter'
import type { RangeFilterModel } from '../components/grid/useRangeDraft'
import { seferStatus } from '../constants'
import type { Sefer, SeferFilters } from '../types'

const gridModules = [ClientSideRowModelModule]

// Filtre seçenekleri backend'den gelir: yalnızca seferlerde gerçekten kullanılan değerler.
const loadVehicleOptions = () => fetchTripFilterOptions<number>('vehicle')
const loadDriverOptions = () => fetchTripFilterOptions<number>('loaded_by')
const loadOriginOptions = () => fetchTripFilterOptions<number>('origin_branch')
const loadDestinationOptions = () => fetchTripFilterOptions<number>('destination_branch')
const loadStatusOptions = () => fetchTripFilterOptions<string>('status')

// Kolon filtre modelleri (colId -> model) backend'in beklediği query param'lara çevrilir.
function toSeferFilters(model: Record<string, unknown>): SeferFilters {
  const values = <T,>(key: string) => (model[key] as ValuesFilterModel<T> | undefined)?.values
  const range = (key: string) => (model[key] as RangeFilterModel | undefined) ?? {}
  return {
    status: values<string>('status'),
    vehicle: values<number>('vehicle'),
    loaded_by: values<number>('loaded_by'),
    origin_branch: values<number>('origin_branch'),
    destination_branch: values<number>('destination_branch'),
    loading_after: range('loading_date').from,
    loading_before: range('loading_date').to,
    package_count_min: range('package_count').from,
    package_count_max: range('package_count').to,
  }
}

export default function SefersPage() {
  const { vehicles, drivers, branches, branchNames, employeeNames, referenceLoading, referenceError, reloadSefers } = useReferenceData()
  const navigate = useNavigate()
  const [seferError, setSeferError] = useState<string | null>(null)
  const [busySefer, setBusySefer] = useState<number | null>(null)

  const [sefers, setSefers] = useState<Sefer[]>([])
  const [filters, setFilters] = useState<SeferFilters>({})
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
    fetchTrips(filters, page, pageSize, controller.signal)
      .then((data) => {
        setSefers(data.results)
        setTotalPages(data.total_pages ?? 1)
        setPage(data.page_number ?? page)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setLoadError(error instanceof Error ? error.message : 'Seferler alınamadı.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filters, page, pageSize, reloadKey])

  const onFilterChanged = useCallback((event: FilterChangedEvent<Sefer>) => {
    setFilters(toSeferFilters(event.api.getFilterModel()))
    setPage(1)
  }, [])

  const disabled = referenceLoading || Boolean(referenceError)
  const vehiclePlates = useMemo(() => new Map(vehicles.map((item) => [item.id, item.plate_number])), [vehicles])

  const runAction = async (id: number, action: 'start' | 'arrive') => {
    setBusySefer(id); setSeferError(null)
    try {
      const response = await fetch(`/api/trips/${id}/${action}/`, { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiError(data, `Sunucu yanıtı: ${response.status}`))
      setReloadKey((key) => key + 1)
      await reloadSefers()
    } catch (error) {
      setSeferError(error instanceof Error ? error.message : 'Sefer işlemi tamamlanamadı.')
    } finally {
      setBusySefer(null)
    }
  }

  const columns = useMemo<ColDef<Sefer>[]>(() => [
    { field: 'id', headerName: 'ID', width: 90, filter: false },
    { field: 'origin_branch', headerName: 'Çıkış', valueFormatter: ({ value }) => nameOf(branchNames, value), filter: MultiSelectFilter, filterParams: { loadOptions: loadOriginOptions } },
    { field: 'destination_branch', headerName: 'Varış', valueFormatter: ({ value }) => nameOf(branchNames, value), filter: MultiSelectFilter, filterParams: { loadOptions: loadDestinationOptions } },
    { field: 'status', headerName: 'Durum', valueFormatter: ({ value }) => seferStatus[value] ?? value, filter: MultiSelectFilter, filterParams: { loadOptions: loadStatusOptions } },
    { field: 'vehicle', headerName: 'Araç', valueFormatter: ({ value }) => nameOf(vehiclePlates, value), filter: MultiSelectFilter, filterParams: { loadOptions: loadVehicleOptions } },
    { field: 'loaded_by', headerName: 'Şoför', valueFormatter: ({ value }) => nameOf(employeeNames, value), filter: MultiSelectFilter, filterParams: { loadOptions: loadDriverOptions } },
    { field: 'loading_date', headerName: 'Yükleme Tarihi', minWidth: 170, valueFormatter: ({ value }) => value ? new Date(value).toLocaleString('tr-TR') : '-', filter: DateRangeFilter },
    { field: 'package_count', headerName: 'Paket Sayısı', width: 140, minWidth: 140, flex: 0, valueFormatter: ({ value }) => `${value} paket`, filter: NumberRangeFilter },
    {
      headerName: '', width: 280, minWidth: 280, flex: 0, sortable: false, filter: false, resizable: false,
      cellRenderer: ({ data }: ICellRendererParams<Sefer>) => {
        if (!data) return null
        return <Box sx={{ display: 'flex', gap: 1 }}>
          {data.status === 'PLANNED' && <Button size="small" variant="contained" onClick={() => void runAction(data.id, 'start')} disabled={busySefer === data.id}>Yola çıkar</Button>}
          {data.status === 'IN_TRANSIT' && <Button size="small" variant="contained" onClick={() => void runAction(data.id, 'arrive')} disabled={busySefer === data.id}>Varış yap</Button>}
          <Button size="small" variant="outlined" onClick={() => navigate(`/sefers/${data.id}`)}>İncele</Button>
        </Box>
      },
    },
  ], [branchNames, employeeNames, vehiclePlates, busySefer, navigate])

  // ---- Yeni Sefer Oluştur diyaloğu ----
  // Paket seçimi burada yapılmıyor; sefer önce boş oluşturulur, paketler sefer detay sayfasındaki
  // "Sefere Yükle" bölümünden (kapasite kontrolüyle, paket paket) eklenir.

  const [dialogOpen, setDialogOpen] = useState(false)

  const [originBranch, setOriginBranch] = useState<number | ''>('')
  const [destinationBranch, setDestinationBranch] = useState<number | ''>('')
  const [vehicle, setVehicle] = useState<number | ''>('')
  const [driver, setDriver] = useState<number | ''>('')

  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  const resetForm = () => {
    setOriginBranch(''); setDestinationBranch(''); setVehicle(''); setDriver(''); setFormError(null)
  }

  const openDialog = () => { resetForm(); setDialogOpen(true) }
  const closeDialog = () => { if (!submitting) setDialogOpen(false) }

  const destinationOptions = useMemo(
    () => branches.filter((branch) => branch.id !== originBranch),
    [branches, originBranch]
  )

  // Çıkış şubesi değiştiğinde, artık çıkışla aynı olan bir varış seçimi varsa temizle ve kullanıcıyı uyar.
  useEffect(() => {
    if (originBranch !== '' && destinationBranch !== '' && originBranch === destinationBranch) {
      setDestinationBranch('')
      setFormError('Çıkış ve varış şubesi aynı olamaz. Varış şubesini yeniden seçin.')
    }
  }, [originBranch, destinationBranch])

  const submitNewSefer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (originBranch === '') { setFormError('Çıkış şubesi seçilmelidir.'); return }
    if (destinationBranch === '') { setFormError('Varış şubesi seçilmelidir.'); return }
    if (originBranch === destinationBranch) { setFormError('Çıkış ve varış şubesi aynı olamaz.'); return }
    if (vehicle === '') { setFormError('Araç seçilmelidir.'); return }
    if (driver === '') { setFormError('Şoför seçilmelidir.'); return }

    setSubmitting(true)
    try {
      // Backend'in beklediği alan adları: vehicle, loaded_by, origin_branch, destination_branch.
      const response = await fetch('/api/trips/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle: Number(vehicle),
          loaded_by: Number(driver),
          origin_branch: Number(originBranch),
          destination_branch: Number(destinationBranch),
        }),
      })
      const data = await response.json().catch(() => null) as Record<string, unknown> | null
      if (!response.ok) throw new Error(apiError(data, `Sunucu yanıtı: ${response.status}`))
      const newSeferId = data?.id as number

      await reloadSefers()
      resetForm()
      setDialogOpen(false)
      setSubmitting(false)
      setCreateSuccess('Yeni sefer oluşturuldu. Şimdi paket yükleyebilirsiniz.')
      navigate(`/sefers/${newSeferId}`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Sefer oluşturulamadı.')
      setSubmitting(false)
    }
  }

  return <Box>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
      <Box><Typography variant="h4" fontWeight={700}>Seferler</Typography><Typography color="text.secondary">Detay için İncele butonuna tıklayın.</Typography></Box>
      <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={openDialog}>Sefer Oluştur</Button>
    </Box>

    {seferError && <Alert severity="error" sx={{ mb: 2 }}>{seferError}</Alert>}
    {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

    {/* Grid yükleme sırasında da mounted kalır; aksi halde kolon filtrelerinin durumu sıfırlanır. */}
    <Box sx={{ position: 'relative' }}>
      <Box className="ag-theme-quartz grid-shell">
        <AgGridReact modules={gridModules} rowData={sefers} columnDefs={columns} defaultColDef={{ sortable: true, resizable: true, flex: 1 }} onFilterChanged={onFilterChanged} overlayNoRowsTemplate="Kayıt bulunamadı." />
      </Box>
      {loading && <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.6)', borderRadius: '10px' }}><CircularProgress /></Box>}
    </Box>
    {totalPages > 1 && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}><Pagination count={totalPages} page={page} onChange={(_event: ChangeEvent<unknown>, value: number) => setPage(value)} color="primary" /></Box>}

    <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Yeni Sefer Oluştur
        <IconButton onClick={closeDialog} disabled={submitting}><CloseOutlinedIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box component="form" onSubmit={submitNewSefer} className="cargo-form">
          {formError && <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>{formError}</Alert>}

          <ReferenceSelect id="sefer-origin-branch" label="Çıkış Şubesi" placeholder="Çıkış şubesi seçin" value={originBranch} options={branches} disabled={disabled || submitting} onChange={setOriginBranch} />
          <ReferenceSelect id="sefer-destination-branch" label="Varış Şubesi" placeholder="Varış şubesi seçin" value={destinationBranch} options={destinationOptions} disabled={disabled || submitting || originBranch === ''} onChange={setDestinationBranch} />

          <FormControl fullWidth required disabled={disabled || submitting}>
            <InputLabel id="sefer-vehicle-label">Araç / Plaka</InputLabel>
            <Select labelId="sefer-vehicle-label" label="Araç / Plaka" value={vehicle === '' ? '' : String(vehicle)} onChange={(e) => setVehicle(Number(e.target.value))}>
              <MenuItem value="" disabled>Araç seçin</MenuItem>
              {vehicles.map((item) => <MenuItem key={item.id} value={item.id}>{item.plate_number}</MenuItem>)}
            </Select>
          </FormControl>

          <ReferenceSelect id="sefer-driver" label="Şoför" placeholder="Şoför seçin" value={driver} options={drivers} disabled={disabled || submitting} onChange={setDriver} />

          <Button type="submit" variant="contained" sx={{ gridColumn: '1 / -1' }} disabled={submitting || disabled}>{submitting ? 'Oluşturuluyor…' : 'Sefer Oluştur'}</Button>
        </Box>
      </DialogContent>
    </Dialog>

    <Snackbar open={Boolean(createSuccess)} autoHideDuration={5000} onClose={() => setCreateSuccess(null)}><Alert severity="success">{createSuccess}</Alert></Snackbar>
  </Box>
}
