import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material'
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined'
import { fetchAllPackages, fetchPackageHistory } from '../api/packages'
import { useReferenceData } from '../context/ReferenceDataContext'
import { historyStatus } from '../constants'
import type { Package, PackageHistory } from '../types'
import { nameOf } from '../api/utils'
import { PackageHistoryTimeline } from '../components/PackageHistoryTimeline'

export default function PackageDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { branchNames, employeeNames, seferById } = useReferenceData()
  const [pkg, setPkg] = useState<Package | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<PackageHistory[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setPkg(null)
    fetchAllPackages()
      .then((packages) => {
        if (cancelled) return
        const found = packages.find((item) => item.id === Number(id))
        setPkg(found ?? null)
        if (!found) setError('Paket bulunamadı.')
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Paket alınamadı.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    let cancelled = false
    setHistory([]); setHistoryError(null)
    fetchPackageHistory(Number(id))
      .then((items) => { if (!cancelled) setHistory(items) })
      .catch((err) => { if (!cancelled) setHistoryError(err instanceof Error ? err.message : 'Hareket kayıtları alınamadı.') })
    return () => { cancelled = true }
  }, [id])

  const latestStatus = useMemo(() => {
    if (history.length === 0) return null
    const sorted = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id - b.id)
    return sorted[sorted.length - 1].status
  }, [history])

  return <Box sx={{ maxWidth: 820 }}>
    <Button startIcon={<ArrowBackOutlinedIcon />} onClick={() => navigate('/packages')} sx={{ mb: 2 }}>Paketlere Dön</Button>

    {loading && <CircularProgress />}
    {!loading && error && <Alert severity="error">{error}</Alert>}

    {!loading && pkg && <>
      <Typography variant="h4" fontWeight={700}>{pkg.tracking_number}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>{nameOf(branchNames, pkg.origin_branch)} → {nameOf(branchNames, pkg.destination_branch)}</Typography>

      <Typography variant="h6" sx={{ mb: 1 }}>Paket Bilgileri</Typography>
      <Box sx={{ p: 3, border: '1px solid #d9e1ef', borderRadius: 2, background: '#fff', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
        <Box><Typography color="text.secondary">Takip numarası</Typography><Typography fontWeight={700}>{pkg.tracking_number}</Typography></Box>
        <Box><Typography color="text.secondary">Gönderen çalışan</Typography><Typography fontWeight={700}>{nameOf(employeeNames, pkg.employee)}</Typography></Box>
        <Box><Typography color="text.secondary">Çıkış şubesi</Typography><Typography fontWeight={700}>{nameOf(branchNames, pkg.origin_branch)}</Typography></Box>
        <Box><Typography color="text.secondary">Varış şubesi</Typography><Typography fontWeight={700}>{nameOf(branchNames, pkg.destination_branch)}</Typography></Box>
        <Box><Typography color="text.secondary">Desi</Typography><Typography fontWeight={700}>{pkg.desi}</Typography></Box>
        <Box><Typography color="text.secondary">Alıcı adı</Typography><Typography fontWeight={700}>{pkg.recipient_name}</Typography></Box>
        <Box><Typography color="text.secondary">Alıcı telefonu</Typography><Typography fontWeight={700}>{pkg.recipient_phone}</Typography></Box>
        <Box><Typography color="text.secondary">Ödeme tipi</Typography><Typography fontWeight={700}>{pkg.payment_type}</Typography></Box>
        <Box><Typography color="text.secondary">Mevcut durum</Typography><Typography fontWeight={700}>{latestStatus ? historyStatus[latestStatus] ?? latestStatus : '-'}</Typography></Box>
      </Box>

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Kargo Hareketleri</Typography>
      {historyError && <Alert severity="error" sx={{ mb: 2 }}>{historyError}</Alert>}
      <Box sx={{ p: 3, border: '1px solid #d9e1ef', borderRadius: 2, background: '#fff' }}>
        <PackageHistoryTimeline history={history} branchNames={branchNames} employeeNames={employeeNames} seferById={seferById} />
      </Box>
    </>}
  </Box>
}
