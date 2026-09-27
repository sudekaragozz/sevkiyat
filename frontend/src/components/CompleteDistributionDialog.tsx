import { useEffect, useState } from 'react'
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { completeDistribution, fetchDistributionPackages } from '../api/distributions'

// Onaydan önce sonucu girilmemiş paket sayısını gösterir; onaylanınca bu paketler backend'de
// otomatik "Teslim Edilemedi" olarak işaretlenir ve dağıtım tamamlanır.
export function CompleteDistributionDialog({ distributionId, onClose, onCompleted }: { distributionId: number | null; onClose: () => void; onCompleted: () => void }) {
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (distributionId == null) return
    let cancelled = false
    setPendingCount(null); setError(null)
    fetchDistributionPackages(distributionId)
      .then((items) => { if (!cancelled) setPendingCount(items.filter((item) => item.result === 'PENDING').length) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Paketler alınamadı.') })
    return () => { cancelled = true }
  }, [distributionId])

  const close = () => { if (!submitting) onClose() }

  const confirm = async () => {
    if (distributionId == null) return
    setSubmitting(true); setError(null)
    try {
      await completeDistribution(distributionId)
      onCompleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dağıtım sonlandırılamadı.')
    } finally {
      setSubmitting(false)
    }
  }

  return <Dialog open={distributionId != null} onClose={close} maxWidth="xs" fullWidth>
    <DialogTitle>Dağıtımı sonlandır</DialogTitle>
    <DialogContent>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {pendingCount == null
        ? !error && <CircularProgress size={24} />
        : <Typography>{pendingCount > 0
          ? `${pendingCount} paket otomatik olarak Teslim Edilemedi olarak işaretlenecek. Devam edilsin mi?`
          : 'Tüm paketlerin sonucu girildi. Dağıtım sonlandırılsın mı?'}</Typography>}
    </DialogContent>
    <DialogActions>
      <Button onClick={close} disabled={submitting}>Vazgeç</Button>
      <Button variant="contained" color="error" onClick={() => void confirm()} disabled={submitting || pendingCount == null}>{submitting ? 'Sonlandırılıyor…' : 'Sonlandır'}</Button>
    </DialogActions>
  </Dialog>
}
