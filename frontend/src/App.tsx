import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { SelectChangeEvent } from '@mui/material'
import { Alert, AppBar, Box, Button, Checkbox, CircularProgress, Drawer, FormControl, InputLabel, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Select, Snackbar, TextField, Toolbar, Typography } from '@mui/material'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined'
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined'
import { AgGridReact } from '@ag-grid-community/react'
import type { ColDef } from '@ag-grid-community/core'
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'

type Reference = { id: number; name: string }
type Package = { id: number; tracking_number: string; employee: number; origin_branch: number; destination_branch: number; recipient_name: string; recipient_phone: string; desi: string | number; payment_type: string }
type Vehicle = { id: number; plate_number: string; capacity: string | number }
type VehicleLoadingForm = { vehicle: number | ''; packages: number[]; loaded_by: number | '' }
type CargoForm = { employee: number | ''; recipient_name: string; recipient_phone: string; origin_branch: number | ''; destination_branch: number | ''; desi: string; payment_type: string }
const initialForm: CargoForm = { employee: '', recipient_name: '', recipient_phone: '', origin_branch: '', destination_branch: '', desi: '', payment_type: 'Peşin' }
const initialVehicleLoadingForm: VehicleLoadingForm = { vehicle: '', packages: [], loaded_by: '' }
const gridModules = [ClientSideRowModelModule]
const drawerWidth = 250
const normalize = <T,>(data: T[] | { results: T[] }) => Array.isArray(data) ? data : data.results ?? []

type ReferenceSelectProps = {
  id: string
  label: string
  placeholder: string
  value: number | ''
  options: Reference[]
  disabled: boolean
  onChange: (id: number) => void
}

function ReferenceSelect({ id, label, placeholder, value, options, disabled, onChange }: ReferenceSelectProps) {
  const labelId = `${id}-label`
  const selectValue = value === '' ? '' : String(value)

  return (
    <FormControl fullWidth required disabled={disabled}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        id={id}
        label={label}
        value={selectValue}
        onChange={(event: SelectChangeEvent<string>) => onChange(Number(event.target.value))}
      >
        <MenuItem value="" disabled>{placeholder}</MenuItem>
        {options.map((option) => (
          <MenuItem key={option.id} value={String(option.id)}>{option.name}</MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'acceptance' | 'packages' | 'vehicle-loading'>('acceptance')
  const [packages, setPackages] = useState<Package[]>([])
  const [employees, setEmployees] = useState<Reference[]>([])
  const [branches, setBranches] = useState<Reference[]>([])
  const [loading, setLoading] = useState(false)
  const [referenceLoading, setReferenceLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [form, setForm] = useState<CargoForm>(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loadingPackages, setLoadingPackages] = useState<Package[]>([])
  const [vehicleLoadingForm, setVehicleLoadingForm] = useState<VehicleLoadingForm>(initialVehicleLoadingForm)
  const [vehicleLoadingReferencesLoading, setVehicleLoadingReferencesLoading] = useState(false)
  const [vehicleLoadingReferencesError, setVehicleLoadingReferencesError] = useState<string | null>(null)
  const [vehicleLoadingSubmitting, setVehicleLoadingSubmitting] = useState(false)
  const [vehicleLoadingError, setVehicleLoadingError] = useState<string | null>(null)
  const [vehicleLoadingSuccess, setVehicleLoadingSuccess] = useState(false)

  const loadReferences = useCallback(async () => {
    setReferenceLoading(true); setReferenceError(null)
    try {
      const [employeeResponse, branchResponse] = await Promise.all([fetch('/api/employees/'), fetch('/api/branches/')])
      if (!employeeResponse.ok || !branchResponse.ok) throw new Error('Çalışan veya şube listesi alınamadı.')
      const [employeeData, branchData]: [Reference[] | { results: Reference[] }, Reference[] | { results: Reference[] }] = await Promise.all([employeeResponse.json(), branchResponse.json()])
      setEmployees(normalize(employeeData)); setBranches(normalize(branchData))
    } catch (error) { setReferenceError(error instanceof Error ? error.message : 'Seçim listeleri yüklenemedi.') } finally { setReferenceLoading(false) }
  }, [])
  const loadPackages = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const response = await fetch('/api/packages/')
      if (!response.ok) throw new Error(`Sunucu yanıtı: ${response.status}`)
      setPackages(normalize(await response.json() as Package[] | { results: Package[] }))
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Paketler alınamadı.') } finally { setLoading(false) }
  }, [])
  const loadVehicleLoadingReferences = useCallback(async () => {
    setVehicleLoadingReferencesLoading(true); setVehicleLoadingReferencesError(null)
    try {
      const [vehicleResponse, packageResponse, employeeResponse] = await Promise.all([fetch('/api/vehicles/'), fetch('/api/packages/'), fetch('/api/employees/')])
      if (!vehicleResponse.ok || !packageResponse.ok || !employeeResponse.ok) throw new Error('Araç, paket veya çalışan listesi alınamadı.')
      const [vehicleData, packageData, employeeData]: [Vehicle[] | { results: Vehicle[] }, Package[] | { results: Package[] }, Reference[] | { results: Reference[] }] = await Promise.all([vehicleResponse.json(), packageResponse.json(), employeeResponse.json()])
      setVehicles(normalize(vehicleData)); setLoadingPackages(normalize(packageData)); setEmployees(normalize(employeeData))
    } catch (error) { setVehicleLoadingReferencesError(error instanceof Error ? error.message : 'Yükleme seçim listeleri alınamadı.') } finally { setVehicleLoadingReferencesLoading(false) }
  }, [])
  useEffect(() => { void loadReferences() }, [loadReferences])
  useEffect(() => { if (activeTab === 'packages') void loadPackages() }, [activeTab, loadPackages])
  useEffect(() => { if (activeTab === 'vehicle-loading') void loadVehicleLoadingReferences() }, [activeTab, loadVehicleLoadingReferences])

  const employeeNames = useMemo(() => new Map(employees.map((item) => [item.id, item.name])), [employees])
  const branchNames = useMemo(() => new Map(branches.map((item) => [item.id, item.name])), [branches])
  const columnDefs = useMemo<ColDef<Package>[]>(() => {
    const name = (items: Map<number, string>, id: number) => items.get(id) ?? `Kayıt #${id}`
    return [
      { field: 'id', headerName: 'ID', width: 85, filter: 'agNumberColumnFilter' },
      { field: 'tracking_number', headerName: 'Takip numarası', minWidth: 180 },
      { field: 'employee', headerName: 'Çalışan', minWidth: 155, valueFormatter: ({ value }) => name(employeeNames, value) },
      { field: 'origin_branch', headerName: 'Çıkış şubesi', minWidth: 165, valueFormatter: ({ value }) => name(branchNames, value) },
      { field: 'destination_branch', headerName: 'Varış şubesi', minWidth: 165, valueFormatter: ({ value }) => name(branchNames, value) },
      { field: 'recipient_name', headerName: 'Alıcı adı', minWidth: 165 },
      { field: 'recipient_phone', headerName: 'Alıcı telefonu', minWidth: 160 },
      { field: 'desi', headerName: 'Desi', width: 105, filter: 'agNumberColumnFilter', valueFormatter: ({ value }) => Number(value).toLocaleString('tr-TR') },
      { field: 'payment_type', headerName: 'Ödeme tipi', minWidth: 145 },
    ]
  }, [employeeNames, branchNames])
  const update = (field: keyof CargoForm, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const updateReference = (field: 'employee' | 'origin_branch' | 'destination_branch', value: string) => setForm((current) => ({ ...current, [field]: Number(value) }))
  const submitCargo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setSubmitError(null)
    try {
      const response = await fetch('/api/packages/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, employee: Number(form.employee), origin_branch: Number(form.origin_branch), destination_branch: Number(form.destination_branch) }) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.detail || JSON.stringify(payload) || `Sunucu yanıtı: ${response.status}`)
      setTrackingNumber(payload.tracking_number ?? 'Takip numarası döndürülmedi'); setForm(initialForm)
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Kargo kabul işlemi tamamlanamadı.') } finally { setSubmitting(false) }
  }
  const submitVehicleLoading = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setVehicleLoadingError(null)
    if (vehicleLoadingForm.vehicle === '' || vehicleLoadingForm.loaded_by === '' || vehicleLoadingForm.packages.length === 0) { setVehicleLoadingError('Araç, en az bir paket ve yüklemeyi yapan çalışan seçilmelidir.'); return }
    setVehicleLoadingSubmitting(true)
    try {
      const response = await fetch('/api/vehicle-loadings/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vehicleLoadingForm) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) { const message = Array.isArray(payload?.non_field_errors) ? payload.non_field_errors.join(' ') : payload?.detail || JSON.stringify(payload) || ('Sunucu yanıtı: ' + response.status); throw new Error(message) }
      setVehicleLoadingForm(initialVehicleLoadingForm); setVehicleLoadingSuccess(true); void loadVehicleLoadingReferences()
    } catch (error) { setVehicleLoadingError(error instanceof Error ? error.message : 'Paketler yüklenemedi.') } finally { setVehicleLoadingSubmitting(false) }
  }
  const referenceDisabled = referenceLoading || Boolean(referenceError)

  return <Box sx={{ display: 'flex', minHeight: '100vh' }}>
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}><Toolbar><LocalShippingOutlinedIcon sx={{ mr: 1.5 }} /><Typography variant="h6" component="h1" fontWeight={700}>Sevkiyat Yönetimi</Typography></Toolbar></AppBar>
    <Drawer variant="permanent" sx={{ width: drawerWidth, flexShrink: 0, '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' } }}><Toolbar /><List sx={{ px: 1, pt: 2 }}>
      <ListItemButton selected={activeTab === 'acceptance'} onClick={() => setActiveTab('acceptance')}><ListItemIcon><AddBoxOutlinedIcon color={activeTab === 'acceptance' ? 'primary' : 'inherit'} /></ListItemIcon><ListItemText primary="Kargo Kabul" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
      <ListItemButton selected={activeTab === 'packages'} onClick={() => setActiveTab('packages')}><ListItemIcon><Inventory2OutlinedIcon color={activeTab === 'packages' ? 'primary' : 'inherit'} /></ListItemIcon><ListItemText primary="Paketler" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
      <ListItemButton selected={activeTab === 'vehicle-loading'} onClick={() => setActiveTab('vehicle-loading')}><ListItemIcon><LocalShippingOutlinedIcon color={activeTab === 'vehicle-loading' ? 'primary' : 'inherit'} /></ListItemIcon><ListItemText primary="Araç Yükleme" primaryTypographyProps={{ fontWeight: 600 }} /></ListItemButton>
    </List></Drawer>
    <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 }, mt: 8, overflow: 'hidden' }}>
      {activeTab === 'acceptance' ? <Box sx={{ maxWidth: 780 }}>
        <Typography variant="h4" component="h2" fontWeight={700}>Kargo Kabul</Typography><Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>Yeni kargo kaydını oluşturun.</Typography>
        {referenceError && <Alert severity="error" sx={{ mb: 3 }}>{referenceError}</Alert>}{submitError && <Alert severity="error" sx={{ mb: 3 }}>{submitError}</Alert>}
        <Box component="form" onSubmit={submitCargo} className="cargo-form">
          <ReferenceSelect id="employee" label="Çalışan" placeholder="Çalışan seçin" value={form.employee} options={employees} disabled={referenceDisabled} onChange={(id) => updateReference('employee', String(id))} />
          <TextField label="Alıcı adı" value={form.recipient_name} onChange={(e) => update('recipient_name', e.target.value)} required fullWidth />
          <TextField label="Alıcı telefonu" value={form.recipient_phone} onChange={(e) => update('recipient_phone', e.target.value)} required fullWidth />
          <ReferenceSelect id="origin-branch" label="Çıkış şubesi" placeholder="Çıkış şubesi seçin" value={form.origin_branch} options={branches} disabled={referenceDisabled} onChange={(id) => updateReference('origin_branch', String(id))} />
          <ReferenceSelect id="destination-branch" label="Varış şubesi" placeholder="Varış şubesi seçin" value={form.destination_branch} options={branches} disabled={referenceDisabled} onChange={(id) => updateReference('destination_branch', String(id))} />
          <TextField label="Desi" type="number" value={form.desi} onChange={(e) => update('desi', e.target.value)} required fullWidth inputProps={{ min: 0.01, step: 0.01 }} />
          <TextField select label="Ödeme tipi" value={form.payment_type} onChange={(e) => update('payment_type', e.target.value)} required fullWidth><MenuItem value="Peşin">Peşin</MenuItem><MenuItem value="Alıcı ödemeli">Alıcı ödemeli</MenuItem><MenuItem value="Kredi kartı">Kredi kartı</MenuItem></TextField>
          <Box sx={{ gridColumn: '1 / -1', pt: 1 }}><Button type="submit" variant="contained" size="large" disabled={submitting || referenceDisabled}>{submitting ? 'Gönderiliyor…' : 'Kargoyu Kabul Et'}</Button></Box>
        </Box>
      </Box> : activeTab === 'vehicle-loading' ? <Box sx={{ maxWidth: 780 }}>
        <Typography variant="h4" component="h2" fontWeight={700}>Araç Yükleme</Typography><Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>Paketleri seçtiğiniz araca yükleyin.</Typography>
        {vehicleLoadingReferencesError && <Alert severity="error" sx={{ mb: 3 }}>{vehicleLoadingReferencesError}</Alert>}{vehicleLoadingError && <Alert severity="error" sx={{ mb: 3 }}>{vehicleLoadingError}</Alert>}
        <Box component="form" onSubmit={submitVehicleLoading} className="cargo-form">
          <FormControl fullWidth required disabled={vehicleLoadingReferencesLoading || Boolean(vehicleLoadingReferencesError)}><InputLabel id="vehicle-label">Araç</InputLabel><Select labelId="vehicle-label" id="vehicle" label="Araç" value={vehicleLoadingForm.vehicle === '' ? '' : String(vehicleLoadingForm.vehicle)} onChange={(event) => setVehicleLoadingForm((current) => ({ ...current, vehicle: Number(event.target.value) }))}><MenuItem value="" disabled>Araç seçin</MenuItem>{vehicles.map((vehicle) => <MenuItem key={vehicle.id} value={String(vehicle.id)}>{vehicle.plate_number} — Kapasite: {Number(vehicle.capacity).toLocaleString('tr-TR')} desi</MenuItem>)}</Select></FormControl>
          <ReferenceSelect id="loaded-by" label="Yüklemeyi yapan çalışan" placeholder="Çalışan seçin" value={vehicleLoadingForm.loaded_by} options={employees} disabled={vehicleLoadingReferencesLoading || Boolean(vehicleLoadingReferencesError)} onChange={(id) => setVehicleLoadingForm((current) => ({ ...current, loaded_by: id }))} />
          <FormControl fullWidth required disabled={vehicleLoadingReferencesLoading || Boolean(vehicleLoadingReferencesError)} sx={{ gridColumn: '1 / -1' }}><InputLabel id="loading-packages-label">Paketler</InputLabel><Select labelId="loading-packages-label" id="loading-packages" label="Paketler" multiple value={vehicleLoadingForm.packages.map(String)} renderValue={(selected) => String(selected.length) + ' paket seçildi'} onChange={(event) => { const value = event.target.value; setVehicleLoadingForm((current) => ({ ...current, packages: (typeof value === 'string' ? value.split(',') : value).map(Number) })) }}>{loadingPackages.map((item) => <MenuItem key={item.id} value={String(item.id)}><Checkbox checked={vehicleLoadingForm.packages.includes(item.id)} /><ListItemText primary={item.tracking_number} secondary={item.recipient_name + ' • ' + Number(item.desi).toLocaleString('tr-TR') + ' desi'} /></MenuItem>)}</Select></FormControl>
          <Box sx={{ gridColumn: '1 / -1', pt: 1 }}><Button type="submit" variant="contained" size="large" disabled={vehicleLoadingSubmitting || vehicleLoadingReferencesLoading || Boolean(vehicleLoadingReferencesError)}>{vehicleLoadingSubmitting ? 'Yükleniyor…' : 'Paketleri Yükle'}</Button></Box>
        </Box>
      </Box> : <>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}><Box><Typography variant="h4" component="h2" fontWeight={700}>Paketler</Typography><Typography color="text.secondary" sx={{ mt: 0.5 }}>Gönderi kayıtlarını görüntüleyin ve filtreleyin.</Typography></Box><Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={() => { void loadReferences(); void loadPackages() }} disabled={loading}>Yenile</Button></Box>
        {loadError ? <Box className="message error-message">Paketler yüklenemedi. ({loadError})</Box> : loading ? <Box className="message"><CircularProgress size={28} /><Typography>Paketler yükleniyor…</Typography></Box> : <Box className="ag-theme-quartz grid-shell"><AgGridReact<Package> modules={gridModules} rowData={packages} columnDefs={columnDefs} defaultColDef={{ sortable: true, filter: true, resizable: true, flex: 1 }} pagination paginationPageSize={20} paginationPageSizeSelector={[20, 50, 100]} animateRows overlayNoRowsTemplate="Gösterilecek paket kaydı bulunamadı." /></Box>}
      </>}
    </Box>
    <Snackbar open={Boolean(trackingNumber)} autoHideDuration={8000} onClose={() => setTrackingNumber(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}><Alert severity="success" variant="filled" onClose={() => setTrackingNumber(null)} sx={{ fontSize: '1rem' }}>Kargo kabul edildi. Takip numarası: <strong>{trackingNumber}</strong></Alert></Snackbar>
    <Snackbar open={vehicleLoadingSuccess} autoHideDuration={5000} onClose={() => setVehicleLoadingSuccess(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}><Alert severity="success" variant="filled" onClose={() => setVehicleLoadingSuccess(false)} sx={{ fontSize: '1rem' }}>Paketler araca başarıyla yüklendi.</Alert></Snackbar>
  </Box>
}
