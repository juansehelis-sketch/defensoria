/**
 * Componente raíz: define el ruteo y protege las rutas que requieren login.
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import ClaveNueva from './pages/ClaveNueva'
import Dashboard from './pages/Dashboard'
import Listado from './pages/Listado'
import ExpedienteDetail from './pages/ExpedienteDetail'
import Proyectos from './pages/Proyectos'
import Audiencias from './pages/Audiencias'
import Reportes from './pages/Reportes'
import Modelos from './pages/Modelos'
import Legajos from './pages/Legajos'
import Usuarios from './pages/Usuarios'
import Mapa from './pages/Mapa'
import Chat from './pages/Chat'
import { UIHost } from './ui'

function RutaProtegida({ children }) {
  const { usuario, cargando } = useAuth()
  if (cargando) {
    return <div className="loading-center"><span className="spin" /></div>
  }
  if (!usuario) return <Navigate to="/login" replace />
  // Contraseña reiniciada por el administrador: obligar a elegir una nueva
  // antes de mostrar cualquier pantalla.
  if (usuario.debe_cambiar_clave) return <ClaveNueva />
  return children
}

export default function App() {
  const { usuario, cargando } = useAuth()

  return (
    <>
    <Routes>
      <Route
        path="/login"
        element={cargando ? null : (usuario ? <Navigate to="/" replace /> : <Login />)}
      />
      <Route
        path="/"
        element={<RutaProtegida><Layout /></RutaProtegida>}
      >
        <Route index element={<Dashboard />} />
        <Route path="expedientes" element={<Listado />} />
        <Route path="expedientes/:id" element={<ExpedienteDetail />} />
        <Route path="legajos" element={<Legajos />} />
        <Route path="a-la-firma" element={<Proyectos />} />
        <Route path="audiencias" element={<Audiencias />} />
        <Route path="modelos" element={<Modelos />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="chat" element={<Chat />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="usuarios" element={usuario && ['admin', 'defensora'].includes(usuario.rol) ? <Usuarios /> : <Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <UIHost />
    </>
  )
}
