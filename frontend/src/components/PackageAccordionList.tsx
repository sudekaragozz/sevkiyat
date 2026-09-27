import { useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, CircularProgress, Typography } from '@mui/material'
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined'
import { fetchPackageHistory } from '../api/packages'
import type { Package, PackageHistory, Sefer } from '../types'
import { nameOf } from '../api/utils'
import { PackageHistoryTimeline } from './PackageHistoryTimeline'

export function PackageAccordionList({ packages, branchNames, employeeNames, seferById, emptyMessage }: { packages: Package[]; branchNames: Map<number, string>; employeeNames: Map<number, string>; seferById: Map<number, Sefer>; emptyMessage: string }) {
  const [historyByPackage, setHistoryByPackage] = useState<Record<number, PackageHistory[]>>({})
  const [historyLoadingId, setHistoryLoadingId] = useState<number | null>(null)
  const [historyErrorId, setHistoryErrorId] = useState<Record<number, string>>({})

  const handleExpand = async (packageId: number, expanded: boolean) => {
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
    if (pkg.trip != null) return 'Yolda'
    if (pkg.current_branch != null) return nameOf(branchNames, pkg.current_branch)
    return 'Teslim Edildi'
  }

  if (packages.length === 0) return <Typography color="text.secondary">{emptyMessage}</Typography>

  return <Box>
    {packages.map((pkg) => <Accordion key={pkg.id} disableGutters sx={{ border: '1px solid #e3e9f3', '&:before': { display: 'none' } }} onChange={(_event, expanded) => void handleExpand(pkg.id, expanded)}>
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
  </Box>
}
