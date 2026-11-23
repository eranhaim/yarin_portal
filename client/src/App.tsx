import { Navigate, Route, Routes } from 'react-router'
import { AdminApp } from './pages/admin/AdminApp'
import { CharacterPage } from './pages/customer/CharacterPage'
import { CoachChatPage, CoachesPage } from './pages/customer/CoachesPage'
import { CustomerLayout } from './pages/customer/CustomerLayout'
import { LevelPage } from './pages/customer/LevelPage'
import { LibraryPage } from './pages/customer/LibraryPage'
import { MapPage } from './pages/customer/MapPage'
import { RewardsPage } from './pages/customer/RewardsPage'
import { SkillsPage } from './pages/customer/SkillsPage'
import { TaskPage } from './pages/customer/TaskPage'
import { JoinPage } from './pages/JoinPage'
import { LoginPage } from './pages/LoginPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      {/* "Bring a friend" landing page (no login). */}
      <Route path="/join/:code" element={<JoinPage />} />

      {/* Customer area: the game */}
      <Route element={<CustomerLayout />}>
        <Route path="/map" element={<MapPage />} />
        <Route path="/level/:chapterId" element={<LevelPage />} />
        <Route path="/level/:chapterId/task/:taskId" element={<TaskPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/coach" element={<CoachesPage />} />
        <Route path="/coach/:id" element={<CoachChatPage />} />
        <Route path="/rewards" element={<RewardsPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/character" element={<CharacterPage />} />
      </Route>

      {/* Admin panel */}
      <Route path="/admin/*" element={<AdminApp />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
