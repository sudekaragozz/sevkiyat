import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Alert, AppBar, Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography } from '@mui/material'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined'
import { drawerWidth } from '../constants'
import { useReferenceData } from '../context/ReferenceDataContext'

const navItems = [
  { path: '/acceptance', label: 'Kargo Kabul', icon: <AddBoxOutlinedIcon /> },
  { path: '/packages', label: 'Paketler', icon: <Inventory2OutlinedIcon /> },
  { path: '/sefers', label: 'Seferler', icon: <LocalShippingOutlinedIcon /> },
]

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { referenceError } = useReferenceData()

  return <Box sx={{ display: 'flex', minHeight: '100vh' }}>
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar><LocalShippingOutlinedIcon sx={{ mr: 1.5 }} /><Typography variant="h6" fontWeight={700}>Sevkiyat Yönetimi</Typography></Toolbar>
    </AppBar>
    <Drawer variant="permanent" sx={{ width: drawerWidth, flexShrink: 0, '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' } }}>
      <Toolbar />
      <List sx={{ px: 1, pt: 2 }}>
        {navItems.map((item) => (
          <ListItemButton key={item.path} selected={location.pathname.startsWith(item.path)} onClick={() => navigate(item.path)}>
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Drawer>
    <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 }, mt: 8, overflow: 'hidden' }}>
      {referenceError && <Alert severity="error" sx={{ mb: 3 }}>{referenceError}</Alert>}
      <Outlet />
    </Box>
  </Box>
}
