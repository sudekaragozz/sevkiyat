import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Box, Button, Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined'
import { fetchDistribution, fetchDistributionPackages, setPackageResult, startDistribution } from '../api/distributions'
import { CompleteDistributionDialog } from '../components/CompleteDistributionDialog'
import { useReferenceData } from '../context/ReferenceDataContext'
import { distributionResult, distributionStatus } from '../constants'
import type { Distribution, DistributionPackage } from '../types'

const resultColor: Record<string, 'default' | 'success' | 'error'> = { PENDING: 'default', DELIVERED: 'success', FAILED: 'error' }

const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('tr-TR') : '-'

export default function DistributionDetailPage() {
  const { id } = useParams()
  const distributionId = Number(id)
  const navigate = useNavigate()
  const { vehicles, branchNames, employeeNames } = useReferenceData()

  const [distribution, setDistribution] = useState<Distribution | null>(null)
  const [items, setItems] = useState<DistributionPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyPackage, setBusyPackage] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [nextDistribution, nextItems] = await Promise.all([fetchDistribution(distributionId), fetchDistributionPackages(distributionId)])
      setDistribution(nextDistribution); setItems(nextItems)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Dağıtım alınamadı.')
    } finally {
      setLoading(false)
    }
  }, [distributionId])
  useEffect(() => { setLoading(true); setDistribution(null); void load() }, [load])

  const start = async () => {
    setStarting(true); setActionError(null)
    try {
      await startDistribution(distributionId)
      await load()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Dağıtıma çıkarılamadı.')
    } finally {
      setStarting(false)
    }
  }

  const mark = async (packageId: number, result: 'DELIVERED' | 'FAILED') => {
    setBusyPackage(packageId); setActionError(null)
    try {
      await setPackageResult(distributionId, packageId, result)
      await load()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Teslim sonucu kaydedilemedi.')
    } finally {
      setBusyPackage(null)
    }
  }

  const backButton = <Button startIcon={<ArrowBackOutlinedIcon />} onClick={() => navigate('/distributions')} sx={{ mb: 2 }}>Dağıtımlar listesine dön</Button>

  if (loading) return <CircularProgress />

  if (!distribution) {
    return <Box>
      {backButton}
      <Alert severity="error">{loadError ?? 'Dağıtım bulunamadı.'}</Alert>
    </Box>
  }

  const canMark = distribution.status === 'OUT_FOR_DELIVERY'
  const plate = vehicles.find((item) => item.id === distribution.vehicle)?.plate_number ?? `Araç #${distribution.vehicle}`

  return <Box sx={{ maxWidth: 1000 }}>
    {backButton}
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
      <Typography variant="h4" fontWeight={700}>Dağıtım #{distribution.id}</Typography>
      {distribution.status === 'READY_TO_GO' && <Button variant="contained" onClick={() => void start()} disabled={starting}>{starting ? 'Çıkarılıyor…' : 'Dağıtıma çıkar'}</Button>}
      {distribution.status === 'OUT_FOR_DELIVERY' && <Button variant="contained" color="error" onClick={() => setCompleteOpen(true)}>Sonlandır</Button>}
    </Box>
    <Box sx={{ mt: 2, p: 3, border: '1px solid #d9e1ef', borderRadius: 2, background: '#fff', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
      <Box><Typography color="text.secondary">Şube</Typography><Typography fontWeight={700}>{branchNames.get(distribution.branch) ?? `Şube #${distribution.branch}`}</Typography></Box>
      <Box><Typography color="text.secondary">Kurye</Typography><Typography fontWeight={700}>{employeeNames.get(distribution.courier) ?? `Çalışan #${distribution.courier}`}</Typography></Box>
      <Box><Typography color="text.secondary">Araç</Typography><Typography fontWeight={700}>{plate}</Typography></Box>
      <Box><Typography color="text.secondary">Durum</Typography><Typography fontWeight={700}>{distributionStatus[distribution.status] ?? distribution.status}</Typography></Box>
      <Box><Typography color="text.secondary">Dağıtıma çıkma</Typography><Typography fontWeight={700}>{formatDate(distribution.started_at)}</Typography></Box>
      <Box><Typography color="text.secondary">Tamamlanma</Typography><Typography fontWeight={700}>{formatDate(distribution.completed_at)}</Typography></Box>
    </Box>

    {loadError && <Alert severity="error" sx={{ mt: 2 }}>{loadError}</Alert>}
    {actionError && <Alert severity="error" sx={{ mt: 2 }}>{actionError}</Alert>}

    <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Paketler ({items.length})</Typography>
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Takip No</TableCell>
            <TableCell>Alıcı</TableCell>
            <TableCell>Telefon</TableCell>
            <TableCell align="right">Desi</TableCell>
            <TableCell>Sonuç</TableCell>
            <TableCell align="right">İşlem</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? <TableRow><TableCell colSpan={6}>Bu dağıtımda paket yok.</TableCell></TableRow> : items.map((item) => {
            const locked = !canMark || item.result !== 'PENDING' || busyPackage === item.id
            return <TableRow key={item.id}>
              <TableCell>{item.tracking_number}</TableCell>
              <TableCell>{item.recipient_name}</TableCell>
              <TableCell>{item.recipient_phone}</TableCell>
              <TableCell align="right">{item.desi}</TableCell>
              <TableCell><Chip size="small" label={distributionResult[item.result] ?? item.result} color={resultColor[item.result] ?? 'default'} /></TableCell>
              <TableCell align="right">
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button size="small" variant="contained" color="success" disabled={locked} onClick={() => void mark(item.id, 'DELIVERED')}>Teslim Edildi</Button>
                  <Button size="small" variant="outlined" color="error" disabled={locked} onClick={() => void mark(item.id, 'FAILED')}>Teslim Edilmedi</Button>
                </Box>
              </TableCell>
            </TableRow>
          })}
        </TableBody>
      </Table>
    </TableContainer>

    <CompleteDistributionDialog distributionId={completeOpen ? distribution.id : null} onClose={() => setCompleteOpen(false)} onCompleted={() => { setCompleteOpen(false); void load() }} />
  </Box>
}
