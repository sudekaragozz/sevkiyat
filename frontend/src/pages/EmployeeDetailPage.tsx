import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, CircularProgress, Typography } from '@mui/material'
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined'
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined'
import { fetchEmployeePackages, fetchSeferPackages } from '../api/packages'
import { useReferenceData } from '../context/ReferenceDataContext'
import { seferStatus } from '../constants'
import { PackageAccordionList } from '../components/PackageAccordionList'
import { nameOf } from '../api/utils'
import type { Package, Sefer } from '../types'

function SeferPackagesAccordion({ sefer, branchNames, employeeNames, seferById, vehiclePlates }: { sefer: Sefer; branchNames: Map<number, string>; employeeNames: Map<number, string>; seferById: Map<number, Sefer>; vehiclePlates: Map<number, string> }) {
  const [packages, setPackages] = useState<Package[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExpand = async (expanded: boolean) => {
    if (!expanded || packages !== null) return
    setLoading(true); setError(null)
    try {
      setPackages(await fetchSeferPackages(sefer.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paketler alınamadı.')
    } finally {
      setLoading(false)
    }
  }

  return <Accordion disableGutters sx={{ border: '1px solid #e3e9f3', '&:before': { display: 'none' } }} onChange={(_event, expanded) => void handleExpand(expanded)}>
    <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', pr: 1 }}>
        <Typography>{nameOf(branchNames, sefer.origin_branch)} → {nameOf(branchNames, sefer.destination_branch)} · {nameOf(vehiclePlates, sefer.vehicle)}</Typography>
        <Typography color="text.secondary">{seferStatus[sefer.status] ?? sefer.status}</Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails>
      {loading ? <CircularProgress size={20} /> : error ? <Alert severity="error">{error}</Alert> : <PackageAccordionList packages={packages ?? []} branchNames={branchNames} employeeNames={employeeNames} seferById={seferById} emptyMessage="Bu seferde paket bulunmuyor." />}
    </AccordionDetails>
  </Accordion>
}

export default function EmployeeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { employees, sefers, vehicles, branchNames, employeeNames, seferById, referenceLoading } = useReferenceData()
  const employee = employees.find((item) => item.id === Number(id))
  const vehiclePlates = useMemo(() => new Map(vehicles.map((item) => [item.id, item.plate_number])), [vehicles])

  const [packages, setPackages] = useState<Package[]>([])
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [packagesError, setPackagesError] = useState<string | null>(null)
  const loadPackages = useCallback(async () => {
    if (!employee || employee.role !== 'COURIER') return
    setPackagesLoading(true); setPackagesError(null)
    try {
      setPackages(await fetchEmployeePackages(employee.id))
    } catch (error) {
      setPackagesError(error instanceof Error ? error.message : 'Paketler alınamadı.')
    } finally {
      setPackagesLoading(false)
    }
  }, [employee])
  useEffect(() => { void loadPackages() }, [loadPackages])

  const driverSefers = useMemo(() => {
    if (!employee || employee.role !== 'DRIVER') return []
    return sefers.filter((item) => item.loaded_by === employee.id)
  }, [employee, sefers])

  if (referenceLoading && !employee) return <CircularProgress />

  if (!employee) return <Box>
    <Button startIcon={<ArrowBackOutlinedIcon />} onClick={() => navigate('/employees')} sx={{ mb: 2 }}>Çalışanlar listesine dön</Button>
    <Alert severity="error">Çalışan bulunamadı.</Alert>
  </Box>

  return <Box sx={{ maxWidth: 900 }}>
    <Button startIcon={<ArrowBackOutlinedIcon />} onClick={() => navigate('/employees')} sx={{ mb: 2 }}>Çalışanlar listesine dön</Button>
    <Typography variant="h4" fontWeight={700}>{employee.name}</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>{employee.role === 'DRIVER' ? 'Şoför' : 'Kurye'}</Typography>

    {employee.role === 'COURIER' ? <>
      <Typography variant="h6" sx={{ mb: 1 }}>Taşıdığı Paketler</Typography>
      {packagesError && <Alert severity="error" sx={{ mb: 2 }}>{packagesError}</Alert>}
      {packagesLoading ? <CircularProgress size={28} /> : <PackageAccordionList packages={packages} branchNames={branchNames} employeeNames={employeeNames} seferById={seferById} emptyMessage="Bu kurye henüz bir paketle ilgilenmemiş." />}
    </> : <>
      <Typography variant="h6" sx={{ mb: 1 }}>Sürdüğü Seferler</Typography>
      {driverSefers.length === 0 ? <Typography color="text.secondary">Bu şoför henüz bir sefer sürmemiş.</Typography> : <Box>
        {driverSefers.map((sefer) => <SeferPackagesAccordion key={sefer.id} sefer={sefer} branchNames={branchNames} employeeNames={employeeNames} seferById={seferById} vehiclePlates={vehiclePlates} />)}
      </Box>}
    </>}
  </Box>
}
