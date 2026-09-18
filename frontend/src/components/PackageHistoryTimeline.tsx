import { useMemo } from 'react'
import { Box, Typography } from '@mui/material'
import { historyStatus } from '../constants'
import type { PackageHistory, Sefer } from '../types'
import { nameOf } from '../api/utils'

const formatDate = (value: string) => new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// Sefer varış kaydı (AT_BRANCH) hem branch hem sefer alanını doldurur (bkz. sefer_service.py
// arrive_sefer); bu yüzden hangi alanın önce kontrol edileceğine göre değil, kaydın statüsüne
// göre karar veriyoruz: sadece gerçekten "yolda" durumları sefer güzergahını gösterir.
const seferBasedStatuses = new Set(['IN_TRANSIT', 'LEFT_TRANSIT'])

export function PackageHistoryTimeline({ history, branchNames, employeeNames, seferById }: { history: PackageHistory[]; branchNames: Map<number, string>; employeeNames: Map<number, string>; seferById: Map<number, Sefer> }) {
  const sortedHistory = useMemo(
    // Bazı kayıtlar (örn. sefere yükleme anındaki LEAVE_BRANCH + IN_TRANSIT çifti) aynı
    // milisaniyede oluşuyor; JS'nin Date hassasiyeti milisaniye olduğu için created_at tek
    // başına sıralamayı garanti etmiyor, id'yi ikincil anahtar olarak kullanıyoruz.
    () => [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id - b.id),
    [history]
  )

  // Bir paket sefere yüklenirken (sefere_cikart) ve sefer gerçekten yola çıkınca (start_sefer)
  // aynı sefer için ayrı ayrı birer IN_TRANSIT kaydı oluşuyor; ilki henüz araç kalkmadan, salt
  // yükleme anında düşüyor ve kullanıcıya "yolda" demek yanıltıcı. Aynı sefer için sadece en son
  // (gerçek kalkış) IN_TRANSIT kaydını gösteriyoruz.
  const displayHistory = useMemo(() => {
    const lastInTransitIndexBySefer = new Map<number, number>()
    sortedHistory.forEach((item, index) => {
      if (item.status === 'IN_TRANSIT' && item.sefer != null) lastInTransitIndexBySefer.set(item.sefer, index)
    })
    return sortedHistory.filter((item, index) => {
      if (item.status !== 'IN_TRANSIT' || item.sefer == null) return true
      return lastInTransitIndexBySefer.get(item.sefer) === index
    })
  }, [sortedHistory])

  const seferRouteLabel = (seferId: number) => {
    const sefer = seferById.get(seferId)
    if (!sefer) return `Sefer #${seferId}`
    return `${branchNames.get(sefer.origin_branch) ?? `Şube #${sefer.origin_branch}`} → ${branchNames.get(sefer.destination_branch) ?? `Şube #${sefer.destination_branch}`}`
  }

  const historyLabel = (item: PackageHistory) => {
    if (seferBasedStatuses.has(item.status) && item.sefer != null) return seferRouteLabel(item.sefer)
    if (item.branch != null) return `${branchNames.get(item.branch) ?? `Şube #${item.branch}`} Şubesi`
    if (item.sefer != null) return seferRouteLabel(item.sefer)
    return 'Konum bilgisi yok'
  }

  if (displayHistory.length === 0) return <Typography color="text.secondary">Henüz hareket kaydı yok.</Typography>

  return <Box sx={{ ml: 1, borderLeft: '2px solid #c7d7ee' }}>
    {displayHistory.map((item, index) => <Box key={item.id} sx={{ position: 'relative', pl: 3, pb: index === displayHistory.length - 1 ? 0 : 3 }}>
      <Box sx={{ position: 'absolute', left: -7, top: 2, width: 12, height: 12, borderRadius: '50%', backgroundColor: index === displayHistory.length - 1 ? 'primary.main' : '#90a8c8', border: '2px solid white' }} />
      <Typography fontWeight={700}>{historyLabel(item)}</Typography>
      <Typography variant="body2">{index === 0 ? 'Kargo Oluşturuldu' : historyStatus[item.status] ?? item.status}</Typography>
      <Typography variant="body2" color="text.secondary">{formatDate(item.created_at)}{item.employee != null && ` · Çalışan: ${nameOf(employeeNames, item.employee)}`}</Typography>
    </Box>)}
  </Box>
}
