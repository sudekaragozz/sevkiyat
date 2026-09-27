import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Select, Step, StepLabel, Stepper, Typography } from '@mui/material'
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined'
import { createDistribution, fetchEligiblePackages } from '../api/distributions'
import { useReferenceData } from '../context/ReferenceDataContext'
import type { Distribution, Package } from '../types'
import { ReferenceSelect } from './ReferenceSelect'

const steps = ['Şube, Kurye ve Araç', 'Paketler']

// 1. adımda şube/kurye/araç, 2. adımda o şubede dağıtıma hazır paketler seçilir. Dağıtım
// paketleriyle birlikte tek istekte oluşturulur; kapasite kontrolünün asıl yeri backend'dir.
export function CreateDistributionDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (distribution: Distribution) => void }) {
  const { branches, couriers, vehicles, referenceLoading, referenceError } = useReferenceData()
  const [step, setStep] = useState(0)
  const [branch, setBranch] = useState<number | ''>('')
  const [courier, setCourier] = useState<number | ''>('')
  const [vehicle, setVehicle] = useState<number | ''>('')
  const [packages, setPackages] = useState<Package[]>([])
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Modal her açıldığında sıfırdan başlar.
  useEffect(() => {
    if (!open) return
    setStep(0); setBranch(''); setCourier(''); setVehicle(''); setPackages([]); setSelectedIds([]); setError(null)
  }, [open])

  // 2. adıma her geçişte liste yeniden çekilir; bu arada başka bir dağıtıma alınan paketler düşer.
  useEffect(() => {
    if (step !== 1 || branch === '') return
    const controller = new AbortController()
    setPackagesLoading(true); setError(null)
    fetchEligiblePackages(branch, controller.signal)
      .then((items) => {
        setPackages(items)
        const available = new Set(items.map((item) => item.id))
        setSelectedIds((current) => current.filter((id) => available.has(id)))
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Paketler alınamadı.') })
      .finally(() => { if (!controller.signal.aborted) setPackagesLoading(false) })
    return () => controller.abort()
  }, [step, branch])

  // Şube değişince önceki şubenin paket seçimi geçersizdir.
  const changeBranch = (id: number) => { setBranch(id); setSelectedIds([]) }

  const capacity = Number(vehicles.find((item) => item.id === vehicle)?.capacity ?? 0)
  const selectedDesi = useMemo(
    () => packages.filter((pkg) => selectedIds.includes(pkg.id)).reduce((sum, pkg) => sum + Number(pkg.desi), 0),
    [packages, selectedIds]
  )
  const overCapacity = selectedDesi > capacity
  const allSelected = packages.length > 0 && selectedIds.length === packages.length

  const toggle = (id: number) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleAll = () => setSelectedIds(allSelected ? [] : packages.map((pkg) => pkg.id))

  const close = () => { if (!submitting) onClose() }
  const back = () => { setError(null); setStep(0) }

  const submit = async () => {
    if (branch === '' || courier === '' || vehicle === '' || selectedIds.length === 0) return
    setSubmitting(true); setError(null)
    try {
      onCreated(await createDistribution({ branch, courier, vehicle, package_ids: selectedIds }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dağıtım oluşturulamadı.')
    } finally {
      setSubmitting(false)
    }
  }

  const disabled = referenceLoading || Boolean(referenceError) || submitting

  return <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
    <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      Yeni Dağıtım Oluştur
      <IconButton onClick={close} disabled={submitting}><CloseOutlinedIcon /></IconButton>
    </DialogTitle>
    <DialogContent dividers>
      <Stepper activeStep={step} sx={{ mb: 3 }}>{steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {step === 0 && <Box sx={{ display: 'grid', gap: 2 }}>
        <ReferenceSelect id="distribution-branch" label="Şube" placeholder="Şube seçin" value={branch} options={branches} disabled={disabled} onChange={changeBranch} />
        <ReferenceSelect id="distribution-courier" label="Kurye" placeholder="Kurye seçin" value={courier} options={couriers} disabled={disabled} onChange={setCourier} />
        <FormControl fullWidth required disabled={disabled}>
          <InputLabel id="distribution-vehicle-label">Araç / Plaka</InputLabel>
          <Select labelId="distribution-vehicle-label" label="Araç / Plaka" value={vehicle === '' ? '' : String(vehicle)} onChange={(e) => setVehicle(Number(e.target.value))}>
            <MenuItem value="" disabled>Araç seçin</MenuItem>
            {vehicles.map((item) => <MenuItem key={item.id} value={item.id}>{item.plate_number} ({item.capacity} desi)</MenuItem>)}
          </Select>
        </FormControl>
      </Box>}

      {step === 1 && (packagesLoading ? <CircularProgress size={28} /> : packages.length === 0 ? <Alert severity="info">Bu şubede dağıtıma çıkmaya hazır paket yok.</Alert> : <Box>
        <FormControlLabel control={<Checkbox checked={allSelected} indeterminate={selectedIds.length > 0 && !allSelected} onChange={toggleAll} disabled={submitting} />} label={`Tümünü seç (${packages.length})`} />
        <Box sx={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e3e9f3', borderRadius: 1.5, p: 1 }}>
          {packages.map((pkg) => <FormControlLabel key={pkg.id} sx={{ display: 'flex', ml: 0 }} control={<Checkbox checked={selectedIds.includes(pkg.id)} onChange={() => toggle(pkg.id)} disabled={submitting} />} label={`${pkg.tracking_number} — ${pkg.recipient_name} (${pkg.desi} desi)`} />)}
        </Box>
        <Typography sx={{ mt: 2 }} fontWeight={600} color={overCapacity ? 'error.main' : 'text.secondary'}>Seçilen: {selectedDesi.toFixed(2)} desi / Kapasite: {capacity.toFixed(2)} desi</Typography>
      </Box>)}
    </DialogContent>
    <DialogActions>
      {step === 0
        ? <Button variant="contained" onClick={() => setStep(1)} disabled={disabled || branch === '' || courier === '' || vehicle === ''}>İleri</Button>
        : <>
          <Button onClick={back} disabled={submitting}>Geri</Button>
          <Button variant="contained" onClick={() => void submit()} disabled={submitting || packagesLoading || selectedIds.length === 0 || overCapacity}>{submitting ? 'Kaydediliyor…' : `Kaydet (${selectedIds.length})`}</Button>
        </>}
    </DialogActions>
  </Dialog>
}
