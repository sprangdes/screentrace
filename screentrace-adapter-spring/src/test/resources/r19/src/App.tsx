import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { useAuth } from './auth';

function RequireAuth({ children }) {
  const { me, loading } = useAuth();
  if (loading) return null;
  if (!me) return <Navigate to="/login" replace />;
  return children;
}

function RequireCustomer({ children }) {
  const { me } = useAuth();
  if (me?.role !== 'ROLE_USER') return <Navigate to="/manage" replace />;
  return children;
}

function RequireBusiness({ children }) {
  const { me } = useAuth();
  if (me?.role !== 'ROLE_BUSINESS') return <Navigate to="/dashboard" replace />;
  return children;
}

function LoginPage() {
  return <main><h1>Login</h1><Link to="/register">Register</Link></main>;
}

function RegisterPage() {
  return <main><h1>Register</h1><Link to="/login">Back</Link></main>;
}

function DashboardPage() {
  return <main><h1>Dashboard</h1><Link to="/reservations">My reservations</Link><Link to="/manage">Manage</Link></main>;
}

function ReservationsPage() {
  return <main><h1>Reservations</h1><Link to="/dashboard">Back</Link></main>;
}

function ManagePage() {
  return <main><h1>Manage</h1><Link to="/dashboard">Dashboard</Link></main>;
}

function Orphan() {
  return <main><h1>Orphan</h1></main>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RequireAuth><Navigate to="/dashboard" replace /></RequireAuth>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<RequireAuth><RequireCustomer><DashboardPage /></RequireCustomer></RequireAuth>} />
      <Route path="/reservations" element={<RequireAuth><RequireCustomer><ReservationsPage /></RequireCustomer></RequireAuth>} />
      <Route path="/manage" element={<RequireAuth><RequireBusiness><ManagePage /></RequireBusiness></RequireAuth>} />
      <Route path="/orphan" element={<RequireAuth><Orphan /></RequireAuth>} />
    </Routes>
  );
}
