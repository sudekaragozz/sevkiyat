import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { SelectChangeEvent } from '@mui/material'
import { Alert, AppBar, Box, Button, CircularProgress, Drawer, FormControl, InputLabel, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Select, Snackbar, TextField, Toolbar, Typography } from '@mui/material'
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
type Sefer = { id: number; vehicle: number; loaded_by: number; origin_branch: number; destination_branch: number; previous_sefer: number | null; status: string; loading_date: string }
type PackageHistory = { id: number; sefer: number | null; origin_branch: number; destination_branch: number; sequence_no: number; status: string }
type Package = { id: number; tracking_number: string; employee: number; origin_branch: number; destination_branch: number; current_branch: number | null; sefer: number | null; recipient_name: string; recipient_phone: string; desi: string | number; payment_type: string; history: PackageHistory[] }
type Vehicle = { id: number; plate_number: string; capacity: string | number }
type CargoForm = { employee: number | ''; origin_branch: number | ''; destination_branch: number | ''; recipient_name: string; recipient_phone: string; desi: string; payment_type: string }

const initialForm: CargoForm = { employee: '', origin_branch: '', destination_branch: '', recipient_name: '', recipient_phone: '', desi: '', payment_type: 'Peşin' }
const gridModules = [ClientSideRowModelModule]
const drawerWidth = 250
const normalize = <T,>(data: T[] | { results: T[] }) => Array.isArray(data) ? data : data.results ?? []
const historyStatus: Record<string, string> = { CREATED: 'Kargoya Verildi', IN_TRANSIT: 'Yola Çıktı', AT_BRANCH: 'Şubeye Ulaştı', OUT_FOR_DELIVERY: 'Dağıtıma Çıktı', DELIVERED: 'Teslim Edildi' }
const seferStatus: Record<string, string> = { PLANNED: 'Planlandı', LOADING: 'Yükleniyor', IN_TRANSIT: 'Yolda', ARRIVED: 'Vardı', COMPLETED: 'Tamamlandı' }

function ReferenceSelect({ id, label, placeholder, value, options, disabled, onChange }: { id: string; label: string; placeholder: string; value: number | ''; options: Reference[]; disabled: boolean; onChange: (id: number) => void }) {
  const labelId = `${id}-label`
  return <FormControl fullWidth required disabled={disabled}><InputLabel id={labelId}>{label}</InputLabel><Select labelId={labelId} id={id} label={label} value={value === '' ? '' : String(value)} onChange={(e: SelectChangeEvent<string>) => onChange(Number(e.target.value))}><MenuItem value="" disabled>{placeholder}</MenuItem>{options.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</Select></FormControl>
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'acceptance' | 'packages' | 'sefers'>('acceptance')
  const [packages, setPackages] = useState<Package[]>([])
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null)
  const [sefers, setSefers] = useState<Sefer[]>([])
  const [employees, setEmployees] = useState<Reference[]>([])
  const [branches, setBranches] = useState<Reference[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [form, setForm] = useState<CargoForm>(initialForm)
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [referenceLoading, setReferenceLoading] = useState(true)
  const [createdPackage, setCreatedPackage] = useState<Package | null>(null)
  const [seferError, setSeferError] = useState<string | null>(null)
  const [busySefer, setBusySefer] = useState<number | null>(null)
  const [nextForm, setNextForm] = useState({ previous: '', vehicle: '', loaded_by: '', destination_branch: '' })
  const [nextSuccess, setNextSuccess] = useState<string | null>(null)

  const loadReferences = useCallback(async () => {
    setReferenceLoading(true); setReferenceError(null)
    try {
      const [employeeResponse, branchResponse] = await Promise.all([fetch('/api/employees/'), fetch('/api/branches/')])
      if (!employeeResponse.ok || !branchResponse.ok) throw new Error('Çalışan veya şube listesi alınamadı.')
      const [employeeData, branchData] = await Promise.all([employeeResponse.json(), branchResponse.json()])
      setEmployees(normalize(employeeData)); setBranches(normalize(branchData))
    } catch (error) { setReferenceError(error instanceof Error ? error.message : 'Seçim listeleri yüklenemedi.') } finally { setReferenceLoading(false) }
  }, [])
  const loadSeferResources = useCallback(async () => {
    setSeferError(null)
    try {
      const [seferResponse, vehicleResponse] = await Promise.all([fetch('/api/sefer/'), fetch('/api/vehicles/')])
      if (!seferResponse.ok || !vehicleResponse.ok) throw new Error('Sefer veya araç listesi alınamadı.')
      const [seferData, vehicleData] = await Promise.all([seferResponse.json(), vehicleResponse.json()])
      setSefers(normalize(seferData)); setVehicles(normalize(vehicleData))
    } catch (error) { setSeferError(error instanceof Error ? error.message : 'Sefer listeleri yüklenemedi.') }
  }, [])
  const loadPackages = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try { const response = await fetch('/api/packages/'); if (!response.ok) throw new Error(`Sunucu yanıtı: ${response.status}`); setPackages(normalize(await response.json())) } catch (error) { setLoadError(error instanceof Error ? error.message : 'Paketler alınamadı.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { void loadReferences() }, [loadReferences])
  useEffect(() => { if (activeTab === 'packages') void loadPackages() }, [activeTab, loadPackages])
  useEffect(() => { if (activeTab === 'sefers') void loadSeferResources() }, [activeTab, loadSeferResources])

  const employeeNames = useMemo(() => new Map(employees.map((item) => [item.id, item.name])), [employees])
  const branchNames = useMemo(() => new Map(branches.map((item) => [item.id, item.name])), [branches])
  const seferById = useMemo(() => new Map(sefers.map((item) => [item.id, item])), [sefers])
  const nameOf = (map: Map<number, string>, id: number | null) => id == null ? '-' : map.get(id) ?? `Kayıt #${id}`
  const update = (field: keyof CargoForm, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const updateReference = (field: 'employee' | 'origin_branch' | 'destination_branch', value: string) => setForm((current) => ({ ...current, [field]: Number(value) }))
  const apiError = (data: Record<string, unknown> | null, fallback: string) => data?.detail as string || Object.values(data ?? {}).flat().join(' ') || fallback

  const submitCargo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setSubmitError(null); setCreatedPackage(null)
    if (form.employee === '' || form.origin_branch === '' || form.destination_branch === '') { setSubmitError('Çalışan, çıkış şubesi ve varış şubesi seçilmelidir.'); setSubmitting(false); return }
    const payload = { employee: Number(form.employee), origin_branch: Number(form.origin_branch), destination_branch: Number(form.destination_branch), recipient_name: form.recipient_name, recipient_phone: form.recipient_phone, desi: form.desi, payment_type: form.payment_type }
    try { const response = await fetch('/api/packages/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json().catch(() => null) as Package & Record<string, unknown> | null; if (!response.ok) throw new Error(apiError(data, `Sunucu yanıtı: ${response.status}`)); setCreatedPackage(data as Package); setForm(initialForm); void loadPackages() } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Kargo kabul işlemi tamamlanamadı.') } finally { setSubmitting(false) }
  }
  const runAction = async (id: number, action: 'start' | 'arrive') => { setBusySefer(id); setSeferError(null); try { const response = await fetch(`/api/sefer/${id}/${action}/`, { method: 'POST' }); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(apiError(data, `Sunucu yanıtı: ${response.status}`)); await loadSeferResources(); await loadPackages() } catch (error) { setSeferError(error instanceof Error ? error.message : 'Sefer işlemi tamamlanamadı.') } finally { setBusySefer(null) } }
  const createNext = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!nextForm.previous || !nextForm.vehicle || !nextForm.loaded_by || !nextForm.destination_branch) { setSeferError('Önceki sefer, araç, çalışan ve varış şubesi seçilmelidir.'); return }; setBusySefer(Number(nextForm.previous)); try { const response = await fetch(`/api/sefer/${nextForm.previous}/create_next/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vehicle: Number(nextForm.vehicle), loaded_by: Number(nextForm.loaded_by), destination_branch: Number(nextForm.destination_branch) }) }); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(apiError(data, `Sunucu yanıtı: ${response.status}`)); setNextSuccess('Yeni sefer oluşturuldu.'); setNextForm({ previous: '', vehicle: '', loaded_by: '', destination_branch: '' }); await loadSeferResources() } catch (error) { setSeferError(error instanceof Error ? error.message : 'Sonraki sefer oluşturulamadı.') } finally { setBusySefer(null) } }

  const columns = useMemo<ColDef<Package>[]>(() => [{ field: 'id', headerName: 'ID', width: 75 }, { field: 'tracking_number', headerName: 'Takip numarası', minWidth: 175 }, { field: 'employee', headerName: 'Çalışan', valueFormatter: ({ value }) => nameOf(employeeNames, value) }, { field: 'origin_branch', headerName: 'Çıkış', valueFormatter: ({ value }) => nameOf(branchNames, value) }, { field: 'destination_branch', headerName: 'Varış', valueFormatter: ({ value }) => nameOf(branchNames, value) }, { field: 'sefer', headerName: 'Durum', valueFormatter: ({ value }) => value == null ? '-' : seferStatus[seferById.get(value)?.status ?? ''] ?? 'Durum bilinmiyor' }, { field: 'recipient_name', headerName: 'Alıcı' }, { field: 'payment_type', headerName: 'Ödeme' }], [employeeNames, branchNames, seferById])

function PackageTimeline({ packageData, branchNames, seferById }: { packageData: Package; branchNames: Map<number, string>; seferById: Map<number, Sefer> }) {
  const history = [...(packageData.history ?? [])].sort((a, b) => a.sequence_no - b.sequence_no)
  return <Box sx={{ mt: 3, p: 3, border: '1px solid #d9e1ef', borderRadius: 2, background: '#fff' }}>
    <Typography variant="h6">{packageData.tracking_number} — Kargo hareketleri</Typography>
    <Typography color="text.secondary" sx={{ mb: 2 }}>Mevcut şube: {branchNames.get(packageData.current_branch ?? 0) ?? packageData.current_branch ?? '-'} · Durum: {packageData.sefer == null ? '-' : seferStatus[seferById.get(packageData.sefer)?.status ?? ''] ?? 'Durum bilinmiyor'}</Typography>
    {history.length === 0 ? <Typography color="text.secondary">Henüz hareket kaydı yok.</Typography> : <Box sx={{ ml: 1, borderLeft: '2px solid #c7d7ee' }}>{history.map((item, index) => <Box key={item.id} sx={{ position: 'relative', pl: 3, pb: index === history.length - 1 ? 0 : 3 }}>
      <Box sx={{ position: 'absolute', left: -7, top: 2, width: 12, height: 12, borderRadius: '50%', backgroundColor: index === history.length - 1 ? 'primary.main' : '#90a8c8', border: '2px solid white' }} />
      <Typography fontWeight={700}>{historyStatus[item.status] ?? item.status}</Typography>
      <Typography variant="body2" color="text.secondary">{branchNames.get(item.origin_branch) ?? item.origin_branch} → {branchNames.get(item.destination_branch) ?? item.destination_branch}</Typography>
    </Box>)}</Box>}
  </Box>
}
  const disabled = referenceLoading || Boolean(referenceError)

  return <Box sx={{ display: 'flex', minHeight: '100vh' }}><AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}><Toolbar><LocalShippingOutlinedIcon sx={{ mr: 1.5 }} /><Typography variant="h6" fontWeight={700}>Sevkiyat Yönetimi</Typography></Toolbar></AppBar><Drawer variant="permanent" sx={{ width: drawerWidth, flexShrink: 0, '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' } }}><Toolbar /><List sx={{ px: 1, pt: 2 }}><ListItemButton selected={activeTab === 'acceptance'} onClick={() => setActiveTab('acceptance')}><ListItemIcon><AddBoxOutlinedIcon /></ListItemIcon><ListItemText primary="Kargo Kabul" /></ListItemButton><ListItemButton selected={activeTab === 'packages'} onClick={() => setActiveTab('packages')}><ListItemIcon><Inventory2OutlinedIcon /></ListItemIcon><ListItemText primary="Paketler" /></ListItemButton><ListItemButton selected={activeTab === 'sefers'} onClick={() => setActiveTab('sefers')}><ListItemIcon><LocalShippingOutlinedIcon /></ListItemIcon><ListItemText primary="Seferler" /></ListItemButton></List></Drawer><Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 }, mt: 8, overflow: 'hidden' }}>{referenceError && <Alert severity="error" sx={{ mb: 3 }}>{referenceError}</Alert>}
    {activeTab === 'acceptance' && <Box sx={{ maxWidth: 820 }}><Typography variant="h4" fontWeight={700}>Kargo Kabul</Typography><Typography color="text.secondary" sx={{ mt: .5, mb: 3 }}>Yeni kargo kaydını oluşturun.</Typography>{submitError && <Alert severity="error" sx={{ mb: 3 }}>{submitError}</Alert>}<Box component="form" onSubmit={submitCargo} className="cargo-form"><ReferenceSelect id="employee" label="Çalışan" placeholder="Çalışan seçin" value={form.employee} options={employees} disabled={disabled} onChange={(id) => updateReference('employee', String(id))} /><TextField label="Alıcı adı" value={form.recipient_name} onChange={(e) => update('recipient_name', e.target.value)} required fullWidth /><TextField label="Alıcı telefonu" value={form.recipient_phone} onChange={(e) => update('recipient_phone', e.target.value)} required fullWidth /><ReferenceSelect id="origin-branch" label="Çıkış şubesi" placeholder="Çıkış şubesi seçin" value={form.origin_branch} options={branches} disabled={disabled} onChange={(id) => updateReference('origin_branch', String(id))} /><ReferenceSelect id="destination-branch" label="Varış şubesi" placeholder="Varış şubesi seçin" value={form.destination_branch} options={branches} disabled={disabled} onChange={(id) => updateReference('destination_branch', String(id))} /><TextField label="Desi" type="number" value={form.desi} onChange={(e) => update('desi', e.target.value)} required fullWidth inputProps={{ min: .01, step: .01 }} /><TextField select label="Ödeme tipi" value={form.payment_type} onChange={(e) => update('payment_type', e.target.value)} required fullWidth><MenuItem value="Peşin">Peşin</MenuItem><MenuItem value="Alıcı ödemeli">Alıcı ödemeli</MenuItem><MenuItem value="Kredi kartı">Kredi kartı</MenuItem></TextField><Box sx={{ gridColumn: '1 / -1', pt: 1 }}><Button type="submit" variant="contained" size="large" disabled={submitting || disabled}>{submitting ? 'Gönderiliyor…' : 'Kargoyu Kabul Et'}</Button></Box></Box>{createdPackage && <Alert severity="success" sx={{ mt: 3 }}><Typography fontWeight={700}>Kargo oluşturuldu: {createdPackage.tracking_number}</Typography><Typography>Mevcut şube: {nameOf(branchNames, createdPackage.current_branch)} · Durum: {createdPackage.sefer == null ? '-' : seferStatus[seferById.get(createdPackage.sefer)?.status ?? ''] ?? 'Durum bilinmiyor'}</Typography><Typography>Geçmiş: {[...(createdPackage.history ?? [])].sort((a, b) => a.sequence_no - b.sequence_no).map((item) => `${item.sequence_no}. ${historyStatus[item.status] ?? item.status}`).join(' → ') || 'Yok'}</Typography></Alert>}</Box>}
    {activeTab === 'packages' && <Box><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}><Box><Typography variant="h4" fontWeight={700}>Paketler</Typography><Typography color="text.secondary">Detay için satıra tıklayın.</Typography></Box><Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={() => { void loadReferences(); void loadPackages() }}>Yenile</Button></Box>{loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}{loading ? <CircularProgress /> : <Box className="ag-theme-quartz grid-shell"><AgGridReact modules={gridModules} rowData={packages} columnDefs={columns} onRowClicked={(event) => setSelectedPackage(event.data ?? null)} defaultColDef={{ sortable: true, filter: true, resizable: true, flex: 1 }} pagination paginationPageSize={20} /></Box>}{selectedPackage && <PackageTimeline packageData={selectedPackage} branchNames={branchNames} seferById={seferById} />}</Box>}
    {activeTab === 'sefers' && <Box><Typography variant="h4" fontWeight={700}>Seferler</Typography>{seferError && <Alert severity="error" sx={{ my: 2 }}>{seferError}</Alert>}<Box sx={{ mt: 3, display: 'grid', gap: 2 }}>{sefers.map((item) => <Box key={item.id} sx={{ p: 2, border: '1px solid #d9e1ef', borderRadius: 2, background: '#fff', display: 'flex', justifyContent: 'space-between', gap: 2 }}><Box><Typography fontWeight={700}>{nameOf(branchNames, item.origin_branch)} → {nameOf(branchNames, item.destination_branch)}</Typography><Typography color="text.secondary">{seferStatus[item.status] ?? item.status} · Araç #{item.vehicle}</Typography></Box><Box>{item.status === 'PLANNED' && <Button size="small" variant="contained" onClick={() => void runAction(item.id, 'start')} disabled={busySefer === item.id}>Yola çıkar</Button>}{item.status === 'IN_TRANSIT' && <Button size="small" variant="contained" onClick={() => void runAction(item.id, 'arrive')} disabled={busySefer === item.id}>Varış yap</Button>}</Box></Box>)}</Box><Box component="form" onSubmit={createNext} className="cargo-form" sx={{ mt: 3 }}><Typography sx={{ gridColumn: '1 / -1' }} variant="h6">Sonraki sefer oluştur</Typography><FormControl fullWidth required><InputLabel>Önceki sefer</InputLabel><Select label="Önceki sefer" value={nextForm.previous} onChange={(e) => setNextForm((v) => ({ ...v, previous: e.target.value }))}><MenuItem value="" disabled>Sefer seçin</MenuItem>{sefers.filter((item) => item.status === 'ARRIVED').map((item) => <MenuItem key={item.id} value={item.id}>{nameOf(branchNames, item.origin_branch)} → {nameOf(branchNames, item.destination_branch)}</MenuItem>)}</Select></FormControl><FormControl fullWidth required><InputLabel>Araç</InputLabel><Select label="Araç" value={nextForm.vehicle} onChange={(e) => setNextForm((v) => ({ ...v, vehicle: e.target.value }))}><MenuItem value="" disabled>Araç seçin</MenuItem>{vehicles.map((item) => <MenuItem key={item.id} value={item.id}>{item.plate_number}</MenuItem>)}</Select></FormControl><ReferenceSelect id="next-employee" label="Çalışan" placeholder="Çalışan seçin" value={nextForm.loaded_by === '' ? '' : Number(nextForm.loaded_by)} options={employees} disabled={disabled} onChange={(id) => setNextForm((v) => ({ ...v, loaded_by: String(id) }))} /><ReferenceSelect id="next-branch" label="Varış şubesi" placeholder="Şube seçin" value={nextForm.destination_branch === '' ? '' : Number(nextForm.destination_branch)} options={branches} disabled={disabled} onChange={(id) => setNextForm((v) => ({ ...v, destination_branch: String(id) }))} /><Button type="submit" variant="contained" sx={{ gridColumn: '1 / -1' }}>Sonraki seferi oluştur</Button></Box></Box>}
  </Box><Snackbar open={Boolean(nextSuccess)} autoHideDuration={5000} onClose={() => setNextSuccess(null)}><Alert severity="success">{nextSuccess}</Alert></Snackbar></Box>
}
