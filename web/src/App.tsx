import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth, RequireRole } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { MyProfilePage } from './pages/MyProfilePage';
import { GoalsPage } from './pages/GoalsPage';
import { MyCoachesPage } from './pages/MyCoachesPage';
import { FindCoachPage } from './pages/FindCoachPage';
import { MembersPage } from './pages/admin/MembersPage';
import { MemberDetailPage } from './pages/admin/MemberDetailPage';
import { GymsPage } from './pages/admin/GymsPage';
import { ExercisesPage } from './pages/admin/ExercisesPage';
import { CoachClientsPage } from './pages/coach/CoachClientsPage';
import { CoachProfilePage } from './pages/coach/CoachProfilePage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/profile" element={<MyProfilePage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/my-coaches" element={<MyCoachesPage />} />
            <Route path="/find-a-coach" element={<FindCoachPage />} />

            <Route element={<RequireRole roles={['COACH']} />}>
              <Route path="/coach/clients" element={<CoachClientsPage />} />
              <Route path="/coach/profile" element={<CoachProfilePage />} />
            </Route>

            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route path="/admin/members" element={<MembersPage />} />
              <Route path="/admin/members/:id" element={<MemberDetailPage />} />
              <Route path="/admin/gyms" element={<GymsPage />} />
              <Route path="/admin/exercises" element={<ExercisesPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
