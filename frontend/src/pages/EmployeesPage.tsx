import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Typography } from '@mui/material'
import { AgGridReact } from '@ag-grid-community/react'
import type { ColDef, ICellRendererParams } from '@ag-grid-community/core'
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { useReferenceData } from '../context/ReferenceDataContext'
import type { Employee } from '../types'

const gridModules = [ClientSideRowModelModule]
const roleLabel: Record<string, string> = { DRIVER: 'Şoför', COURIER: 'Kurye' }

function InceleCell({ data }: ICellRendererParams<Employee>) {
  const navigate = useNavigate()
  if (!data) return null
  return <Button size="small" variant="outlined" onClick={() => navigate(`/employees/${data.id}`)}>İncele</Button>
}

export default function EmployeesPage() {
  const { employees } = useReferenceData()

  const columns = useMemo<ColDef<Employee>[]>(() => [
    { field: 'id', headerName: 'ID', width: 90 },
    { field: 'name', headerName: 'Ad', minWidth: 200 },
    { field: 'role', headerName: 'Rol', valueFormatter: ({ value }) => roleLabel[value] ?? value },
    { headerName: '', width: 130, sortable: false, filter: false, resizable: false, cellRenderer: InceleCell },
  ], [])

  return <Box>
    <Typography variant="h4" fontWeight={700}>Çalışanlar</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>Detay için İncele butonuna tıklayın.</Typography>
    <Box className="ag-theme-quartz grid-shell">
      <AgGridReact modules={gridModules} rowData={employees} columnDefs={columns} defaultColDef={{ sortable: true, filter: true, resizable: true, flex: 1 }} />
    </Box>
  </Box>
}
