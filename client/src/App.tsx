import { Navigate, Route, Routes } from 'react-router'
import { AdminApp } from './pages/admin/AdminApp'
import { CustomerLayout } from './pages/customer/CustomerLayout'
import { LevelPage } from './pages/customer/LevelPage'
import { LibraryPage } from './pages/customer/LibraryPage'
import { MapPage } from './pages/customer/MapPage'
import { TaskPage } from './pages/customer/TaskPage'
import { LoginPage } from './pages/LoginPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />

      {/* Customer area */}
      <Route element={<CustomerLayout />}>
        <Route path="/map" element={<MapPage />} />
        <Route path="/level/:chapterId" element={<LevelPage />} />
        <Route path="/level/:chapterId/task/:taskId" element={<TaskPage />} />
        <Route path="/library" element={<LibraryPage />} />
      </Route>

      {/* Admin panel (password from ADMIN_PASSWORD in .env) */}
      <Route path="/admin/*" element={<AdminApp />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
