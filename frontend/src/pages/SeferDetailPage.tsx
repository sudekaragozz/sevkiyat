import { Alert, Box, Button, CircularProgress } from '@mui/material'
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined'
import { useNavigate, useParams } from 'react-router-dom'
import { SeferDetailView } from '../components/SeferDetailView'
import { useReferenceData } from '../context/ReferenceDataContext'

export default function SeferDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { seferById, vehicles, employees, branchNames, employeeNames, sefersLoading, seferError, reloadSefers } = useReferenceData()

  const sefer = id ? seferById.get(Number(id)) : undefined

  if (sefersLoading && !sefer) return <CircularProgress />

  if (!sefer) {
    return <Box>
      <Button startIcon={<ArrowBackOutlinedIcon />} onClick={() => navigate('/sefers')} sx={{ mb: 2 }}>Seferler listesine dön</Button>
      <Alert severity="error">{seferError ?? 'Sefer bulunamadı.'}</Alert>
    </Box>
  }

  return <SeferDetailView
    key={sefer.id}
    sefer={sefer}
    vehicles={vehicles}
    employees={employees}
    branchNames={branchNames}
    employeeNames={employeeNames}
    seferById={seferById}
    onBack={() => navigate('/sefers')}
    onPackagesChanged={() => void reloadSefers()}
  />
}
