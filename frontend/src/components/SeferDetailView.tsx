import { useCallback, useEffect, useMemo, useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Typography } from '@mui/material'
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined'
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined'
import { fetchAllPackages, fetchPackageHistory, fetchSeferPackages } from '../api/packages'
import { seferStatus } from '../constants'
import type { Package, PackageHistory, Reference, Sefer, Vehicle } from '../types'
import { nameOf } from '../api/utils'
import { PackageHistoryTimeline } from './PackageHistoryTimeline'
import { ReferenceSelect } from './ReferenceSelect'

const activeSeferStatuses = new Set(['PLANNED', 'IN_TRANSIT'])

export function SeferDetailView({ sefer, vehicles, employees, branchNames, employeeNames, seferById, onBack, onPackagesChanged }: { sefer: Sefer; vehicles: Vehicle[]; employees: Reference[]; branchNames: Map<number, string>; employeeNames: Map<number, string>; seferById: Map<number, Sefer>; onBack: () => void; onPackagesChanged: () => void }) {
  const [allPackages, setAllPackages] = useState<Package[]>([])
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [packagesError, setPackagesError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [loaderEmployee, setLoaderEmployee] = useState<number | ''>('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  const loadAllPackages = useCallback(async () => {
    setPackagesLoading(true); setPackagesError(null)
    try {
      setAllPackages(await fetchAllPackages())
    } catch (error) { setPackagesError(error instanceof Error ? error.message : 'Paketler alınamadı.') } finally { setPackagesLoading(false) }
  }, [])
  useEffect(() => { void loadAllPackages() }, [loadAllPackages])

  // Sefer tamamlanıp paketler indiğinde Package.sefer temizlenir; bu seferin bugüne kadar
  // taşıdığı tüm paketleri (hâlâ üstünde olsun ya da inmiş olsun) backend'in PackageHistory
  // üzerinden bulduğu /api/sefer/<id>/packages/ uç noktasından alıyoruz.
  const [loadedPackages, setLoadedPackages] = useState<Package[]>([])
  const [loadedPackagesLoading, setLoadedPackagesLoading] = useState(false)
  const [loadedPackagesError, setLoadedPackagesError] = useState<string | null>(null)
  const loadLoadedPackages = useCallback(async () => {
    setLoadedPackagesLoading(true); setLoadedPackagesError(null)
    try {
      setLoadedPackages(await fetchSeferPackages(sefer.id))
    } catch (error) { setLoadedPackagesError(error instanceof Error ? error.message : 'Sefere yüklenmiş paketler alınamadı.') } finally { setLoadedPackagesLoading(false) }
  }, [sefer.id])
  useEffect(() => { void loadLoadedPackages() }, [loadLoadedPackages])

  // Seçilen paketin geçmişi, sadece o paket açıldığında tek başına çekilir — sefere yüklenmiş
  // tüm paketlerin geçmişi topluca istenmez. Bir kez çekilen paketin sonucu önbelleğe alınır,
  // tekrar açılıp kapatılırsa yeniden istek atılmaz.
  const [historyByPackage, setHistoryByPackage] = useState<Record<number, PackageHistory[]>>({})
  const [historyLoadingId, setHistoryLoadingId] = useState<number | null>(null)
  const [historyErrorId, setHistoryErrorId] = useState<Record<number, string>>({})

  const handlePackageExpand = async (packageId: number, expanded: boolean) => {
    if (!expanded || historyByPackage[packageId]) return
    setHistoryLoadingId(packageId)
    try {
      const items = await fetchPackageHistory(packageId)
      setHistoryByPackage((current) => ({ ...current, [packageId]: items }))
    } catch (error) {
      setHistoryErrorId((current) => ({ ...current, [packageId]: error instanceof Error ? error.message : 'Paket geçmişi alınamadı.' }))
    } finally {
      setHistoryLoadingId(null)
    }
  }

  const packageStatusLabel = (pkg: Package) => {
    if (pkg.sefer === sefer.id) return 'Yolda'
    if (pkg.current_branch != null) return nameOf(branchNames, pkg.current_branch)
    return 'Teslim Edildi'
  }
  // current_branch normally clears once a package is loaded onto a sefer, but a package can also
  // carry a stale `sefer` reference (e.g. seeded data) while still showing a current_branch — so
  // both signals are checked: physically at this branch, and not already committed to a sefer
  // that hasn't arrived/completed yet.
  const eligiblePackages = useMemo(() => allPackages.filter((pkg) => {
    if (pkg.current_branch !== sefer.origin_branch) return false
    if (pkg.sefer == null) return true
    const pkgSefer = seferById.get(pkg.sefer)
    return !pkgSefer || !activeSeferStatuses.has(pkgSefer.status)
  }), [allPackages, sefer.origin_branch, seferById])
  const canLoadPackages = sefer.status === 'PLANNED'

  const toggleSelected = (id: number) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])

  const submitLoad = async () => {
    if (selectedIds.length === 0 || loaderEmployee === '') { setUploadError('Çalışan ve en az bir paket seçilmelidir.'); return }
    setUploading(true); setUploadError(null); setUploadSuccess(null)
    const failures: string[] = []
    for (const id of selectedIds) {
      try {
        const response = await fetch(`/api/packages/${id}/sefere-cikart/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: Number(loaderEmployee), sefer_id: sefer.id }) })
        const data = await response.json().catch(() => null) as Record<string, unknown> | null
        if (!response.ok) throw new Error((data?.detail as string) || `Paket #${id} yüklenemedi.`)
      } catch (error) { failures.push(error instanceof Error ? error.message : `Paket #${id} yüklenemedi.`) }
    }
    setUploading(false); setSelectedIds([])
    await Promise.all([loadAllPackages(), loadLoadedPackages()])
    onPackagesChanged()
    if (failures.length > 0) setUploadError(failures.join(' ')); else setUploadSuccess('Seçilen paketler sefere yüklendi.')
  }

  return <Box sx={{ maxWidth: 900 }}>
    <Button startIcon={<ArrowBackOutlinedIcon />} onClick={onBack} sx={{ mb: 2 }}>Seferler listesine dön</Button>
    <Typography variant="h4" fontWeight={700}>{branchNames.get(sefer.origin_branch) ?? sefer.origin_branch} → {branchNames.get(sefer.destination_branch) ?? sefer.destination_branch}</Typography>
    <Box sx={{ mt: 2, p: 3, border: '1px solid #d9e1ef', borderRadius: 2, background: '#fff', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
      <Box><Typography color="text.secondary">Çıkış şubesi</Typography><Typography fontWeight={700}>{branchNames.get(sefer.origin_branch) ?? sefer.origin_branch}</Typography></Box>
      <Box><Typography color="text.secondary">Varış şubesi</Typography><Typography fontWeight={700}>{branchNames.get(sefer.destination_branch) ?? sefer.destination_branch}</Typography></Box>
      <Box><Typography color="text.secondary">Araç</Typography><Typography fontWeight={700}>{vehicles.find((item) => item.id === sefer.vehicle)?.plate_number ?? `Araç #${sefer.vehicle}`}</Typography></Box>
      <Box><Typography color="text.secondary">Çalışan</Typography><Typography fontWeight={700}>{employeeNames.get(sefer.loaded_by) ?? `Çalışan #${sefer.loaded_by}`}</Typography></Box>
      <Box><Typography color="text.secondary">Sefer durumu</Typography><Typography fontWeight={700}>{seferStatus[sefer.status] ?? sefer.status}</Typography></Box>
    </Box>

    <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Sefere yüklenmiş paketler</Typography>
    {loadedPackagesError && <Alert severity="error" sx={{ mb: 2 }}>{loadedPackagesError}</Alert>}
    {loadedPackagesLoading ? <CircularProgress size={28} /> : (loadedPackages.length === 0 ? <Typography color="text.secondary">Bu sefere henüz paket yüklenmedi.</Typography> : <Box>
      {loadedPackages.map((pkg) => <Accordion key={pkg.id} disableGutters sx={{ border: '1px solid #e3e9f3', '&:before': { display: 'none' } }} onChange={(_event, expanded) => void handlePackageExpand(pkg.id, expanded)}>
        <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', pr: 1 }}>
            <Typography>{pkg.tracking_number} — {pkg.recipient_name}</Typography>
            <Typography color="text.secondary">{pkg.desi} desi · {packageStatusLabel(pkg)}</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          {historyLoadingId === pkg.id ? <CircularProgress size={20} /> : historyErrorId[pkg.id] ? <Alert severity="error">{historyErrorId[pkg.id]}</Alert> : <PackageHistoryTimeline history={historyByPackage[pkg.id] ?? []} branchNames={branchNames} employeeNames={employeeNames} seferById={seferById} />}
        </AccordionDetails>
      </Accordion>)}
    </Box>)}

    {canLoadPackages ? <Box sx={{ mt: 4, p: 3, border: '1px solid #d9e1ef', borderRadius: 2, background: '#fff' }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Paket Ekle / Sefere Yükle</Typography>
      {packagesError && <Alert severity="error" sx={{ mb: 2 }}>{packagesError}</Alert>}
      {uploadError && <Alert severity="error" sx={{ mb: 2 }}>{uploadError}</Alert>}
      {uploadSuccess && <Alert severity="success" sx={{ mb: 2 }}>{uploadSuccess}</Alert>}
      <Box sx={{ maxWidth: 320, mb: 2 }}><ReferenceSelect id="loader-employee" label="Yükleyen çalışan" placeholder="Çalışan seçin" value={loaderEmployee} options={employees} disabled={uploading} onChange={setLoaderEmployee} /></Box>
      <Box sx={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e3e9f3', borderRadius: 1.5, p: 1 }}>
        {eligiblePackages.length === 0 ? <Typography color="text.secondary" sx={{ p: 1 }}>Çıkış şubesinde yüklenmeyi bekleyen paket yok.</Typography> : eligiblePackages.map((pkg) => <FormControlLabel key={pkg.id} sx={{ display: 'flex', ml: 0 }} control={<Checkbox checked={selectedIds.includes(pkg.id)} onChange={() => toggleSelected(pkg.id)} disabled={uploading} />} label={`${pkg.tracking_number} — ${pkg.recipient_name} (${pkg.desi} desi)`} />)}
      </Box>
      <Button variant="contained" sx={{ mt: 2 }} disabled={uploading || selectedIds.length === 0} onClick={() => void submitLoad()}>{uploading ? 'Yükleniyor…' : `Sefere Yükle (${selectedIds.length})`}</Button>
    </Box> : <Alert severity="info" sx={{ mt: 3 }}>Bu sefer artık planlama aşamasında olmadığı için yeni paket eklenemez.</Alert>}
  </Box>
}
