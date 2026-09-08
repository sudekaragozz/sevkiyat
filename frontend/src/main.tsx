import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import App from './App'
import './styles.css'

const theme = createTheme({
  palette: {
    primary: { main: '#1e5aa8' },
    background: { default: '#f5f7fb' },
  },
  typography: { fontFamily: 'Inter, Roboto, Arial, sans-serif' },
  shape: { borderRadius: 10 },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
