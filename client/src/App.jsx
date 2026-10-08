import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import { AuthProvider } from './context/AuthContext'; 
import MainLayout from './layouts/MainLayout';
import EmailLoginPage from './pages/EmailLoginPage';
import LoginPage from './pages/LoginPage';
import TournamentSelectPage from './pages/TournamentSelectPage';
import TournamentTeamSelector from './pages/TournamentTeamSelector';
import DashboardPage from './pages/DashboardPage';
import AuctionPage from './pages/AuctionPage';
import PlayerListPage from './pages/PlayerListPage';
import TeamsPage from './pages/TeamsPage';
import RulesPage from './pages/RulesPage';
import SelectPlayingXI from './pages/SelectPlayingXI';
import PointsTablePage from './pages/PointsTablePage';
import TradePage from './pages/TradePage';
import MatchCentrePage from './pages/MatchCentrePage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import ErrorBoundary from './components/ErrorBoundary';
import RequireAuth from './components/RequireAuth';
import RequireAdmin from './components/RequireAdmin';
import MainMenuPage from './pages/MainMenuPage';
import PlayerPointsPage from './pages/PlayerPointsPage';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SocketProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/email-login" element={<EmailLoginPage />} />
              <Route path="/main-menu" element={<MainMenuPage />} />
              <Route path="/tournaments" element={<TournamentSelectPage />} />
              <Route path="/tournaments/:id/teams" element={<TournamentTeamSelector />} />
              <Route path="/login" element={<LoginPage />} />

              <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />

              {/* Protected Routes */}
              <Route element={<RequireAuth />}>
                <Route path="/" element={<MainLayout />}>
                  <Route index element={<Navigate to="/main-menu" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="auction" element={<AuctionPage />} />
                  <Route path="players" element={<PlayerListPage />} />
                  <Route path="teams" element={<TeamsPage />} />
                  <Route path="trade" element={<TradePage />} />
                  <Route path="rules" element={<RulesPage />} />
                  <Route path="select-playing-xi" element={<SelectPlayingXI />} />
                  <Route path="points-table" element={<PointsTablePage />} />
                  <Route path="match-centre" element={<MatchCentrePage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="player-points" element={<PlayerPointsPage />} />
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<div className="p-10 text-center"><h1>404 - Page Not Found</h1><a href="/login" className="text-blue-500">Go Home</a></div>} />
            </Routes>
          </BrowserRouter>
        </SocketProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
