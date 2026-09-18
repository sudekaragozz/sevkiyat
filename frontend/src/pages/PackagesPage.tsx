import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Pagination, Typography } from '@mui/material'
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined'
import { AgGridReact } from '@ag-grid-community/react'
import type { ColDef, ICellRendererParams } from '@ag-grid-community/core'
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { useReferenceData } from '../context/ReferenceDataContext'
import { nameOf, normalize } from '../api/utils'
import type { Package, PaginatedPackages } from '../types'

const gridModules = [ClientSideRowModelModule]

function InceleCell({ data }: ICellRendererParams<Package>) {
  const navigate = useNavigate()
  if (!data) return null
  return <Button size="small" variant="outlined" onClick={() => navigate(`/packages/${data.id}`)}>İncele</Button>
}

export default function PackagesPage() {
  const { employeeNames, branchNames, seferById, reloadReferences } = useReferenceData()
  const [packages, setPackages] = useState<Package[]>([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadPackages = useCallback(async (pageNumber: number) => {
    setLoading(true); setLoadError(null)
    try {
      const response = await fetch(`/api/packages/?page_number=${pageNumber}&page_size=${pageSize}`)
      if (!response.ok) throw new Error(`Sunucu yanıtı: ${response.status}`)
      const data = await response.json() as PaginatedPackages | Package[]
      setPackages(normalize(data))
      setTotalPages(Array.isArray(data) ? 1 : data.total_pages ?? 1)
      setPage(Array.isArray(data) ? pageNumber : data.page_number ?? pageNumber)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Paketler alınamadı.')
    } finally {
      setLoading(false)
    }
  }, [pageSize])

  useEffect(() => { void loadPackages(page) }, [page, loadPackages])

  const columns = useMemo<ColDef<Package>[]>(() => [
    { field: 'id', headerName: 'ID', width: 75 },
    { field: 'tracking_number', headerName: 'Takip numarası', minWidth: 175 },
    { field: 'employee', headerName: 'Çalışan', valueFormatter: ({ value }) => nameOf(employeeNames, value) },
    { field: 'origin_branch', headerName: 'Çıkış', valueFormatter: ({ value }) => nameOf(branchNames, value) },
    { field: 'destination_branch', headerName: 'Varış', valueFormatter: ({ value }) => nameOf(branchNames, value) },
    {
      headerName: 'Durum',
      minWidth: 150,
      // Paket bir seferdeyse (sefer tamamlanana kadar current_branch boştur) "Yolda" gösterilir;
      // sefer yoksa ve bir şubedeyse o şube adı; her ikisi de boşsa (sadece teslim akışının
      // sonunda oluşan durum) "Teslim Edildi" gösterilir.
      valueGetter: ({ data }) => {
        if (!data) return ''
        if (data.sefer != null) return 'Yolda'
        if (data.current_branch != null) return nameOf(branchNames, data.current_branch)
        return 'Teslim Edildi'
      },
    },
    { field: 'recipient_name', headerName: 'Alıcı' },
    { field: 'payment_type', headerName: 'Ödeme' },
    { headerName: '', width: 130, sortable: false, filter: false, resizable: false, cellRenderer: InceleCell },
  ], [employeeNames, branchNames, seferById])

  return <Box>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
      <Box><Typography variant="h4" fontWeight={700}>Paketler</Typography><Typography color="text.secondary">Detay için İncele butonuna tıklayın.</Typography></Box>
      <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={() => { void reloadReferences(); void loadPackages(page) }}>Yenile</Button>
    </Box>
    {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}
    {loading ? <CircularProgress /> : <>
      <Box className="ag-theme-quartz grid-shell">
        <AgGridReact modules={gridModules} rowData={packages} columnDefs={columns} defaultColDef={{ sortable: true, filter: true, resizable: true, flex: 1 }} />
      </Box>
      {totalPages > 1 && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}><Pagination count={totalPages} page={page} onChange={(_event: ChangeEvent<unknown>, value: number) => setPage(value)} color="primary" /></Box>}
    </>}
  </Box>
}
