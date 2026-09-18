import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import { ReferenceDataProvider } from './context/ReferenceDataContext'
import AcceptancePage from './pages/AcceptancePage'
import PackageDetailPage from './pages/PackageDetailPage'
import PackagesPage from './pages/PackagesPage'
import SeferDetailPage from './pages/SeferDetailPage'
import SefersPage from './pages/SefersPage'

export default function App() {
  return <ReferenceDataProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/acceptance" replace />} />
          <Route path="acceptance" element={<AcceptancePage />} />
          <Route path="packages" element={<PackagesPage />} />
          <Route path="packages/:id" element={<PackageDetailPage />} />
          <Route path="sefers" element={<SefersPage />} />
          <Route path="sefers/:id" element={<SeferDetailPage />} />
          <Route path="*" element={<Navigate to="/acceptance" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </ReferenceDataProvider>
}
