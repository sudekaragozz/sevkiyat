import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Dialog, DialogContent, DialogTitle, FormControl, IconButton, InputLabel, MenuItem, Select, Snackbar, Typography } from '@mui/material'
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined'
import AddOutlinedIcon from '@mui/icons-material/AddOutlined'
import { AgGridReact } from '@ag-grid-community/react'
import type { ColDef, ICellRendererParams } from '@ag-grid-community/core'
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { ReferenceSelect } from '../components/ReferenceSelect'
import { useReferenceData } from '../context/ReferenceDataContext'
import { apiError, nameOf } from '../api/utils'
import { seferStatus } from '../constants'
import type { Sefer } from '../types'

const gridModules = [ClientSideRowModelModule]

export default function SefersPage() {
  const { sefers, vehicles, drivers, branches, branchNames, employeeNames, referenceLoading, referenceError, reloadSefers } = useReferenceData()
  const navigate = useNavigate()
  const [seferError, setSeferError] = useState<string | null>(null)
  const [busySefer, setBusySefer] = useState<number | null>(null)

  const disabled = referenceLoading || Boolean(referenceError)
  const vehiclePlates = useMemo(() => new Map(vehicles.map((item) => [item.id, item.plate_number])), [vehicles])

  const runAction = async (id: number, action: 'start' | 'arrive') => {
    setBusySefer(id); setSeferError(null)
    try {
      const response = await fetch(`/api/sefer/${id}/${action}/`, { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiError(data, `Sunucu yanıtı: ${response.status}`))
      await reloadSefers()
    } catch (error) {
      setSeferError(error instanceof Error ? error.message : 'Sefer işlemi tamamlanamadı.')
    } finally {
      setBusySefer(null)
    }
  }

  const columns = useMemo<ColDef<Sefer>[]>(() => [
    { field: 'id', headerName: 'ID', width: 90 },
    { headerName: 'Güzergah', minWidth: 220, valueGetter: ({ data }) => data ? `${nameOf(branchNames, data.origin_branch)} → ${nameOf(branchNames, data.destination_branch)}` : '' },
    { field: 'status', headerName: 'Durum', valueFormatter: ({ value }) => seferStatus[value] ?? value },
    { field: 'vehicle', headerName: 'Araç', valueFormatter: ({ value }) => nameOf(vehiclePlates, value) },
    { field: 'loaded_by', headerName: 'Şoför', valueFormatter: ({ value }) => nameOf(employeeNames, value) },
    { field: 'loading_date', headerName: 'Yükleme Tarihi', minWidth: 170, valueFormatter: ({ value }) => value ? new Date(value).toLocaleString('tr-TR') : '-' },
    { field: 'package_count', headerName: 'Paket Sayısı', width: 130, minWidth: 130, flex: 0, valueFormatter: ({ value }) => `${value} paket` },
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
      const response = await fetch('/api/sefer/', {
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

    <Box className="ag-theme-quartz grid-shell">
      <AgGridReact modules={gridModules} rowData={sefers} columnDefs={columns} defaultColDef={{ sortable: true, filter: true, resizable: true, flex: 1 }} />
    </Box>

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
