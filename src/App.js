import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import { Spinner } from './components/UI';
import Login         from './pages/Login';
import Dashboard     from './pages/Dashboard';
import Miembros      from './pages/Miembros';
import Cobradores    from './pages/Cobradores';
import Cobranzas     from './pages/Cobranzas';
import Reportes      from './pages/Reportes';
import Usuarios      from './pages/Usuarios';
import ImportarMiembros from './pages/ImportarMiembros';
import Asamblea        from './pages/Asamblea';
import Configuracion from './pages/Configuracion';
import { useSupabase } from './hooks/useSupabase';
import { useAuth }     from './hooks/useAuth';

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const { session, perfil, loadingAuth, signIn, signOut, puede } = useAuth();

  const {
    data, loading, error, cargarTodo,
    agregarTemplo, eliminarTemplo,
    actualizarCuotas,
    agregarMiembro, eliminarMiembro, agregarDeudaManual, generarDeudasAnio,
    agregarCobrador, eliminarCobrador,
    registrarCobranza, eliminarCobranza,
  } = useSupabase();

  // --- Pantalla de carga inicial ---
  if (loadingAuth) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--navy)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid rgba(200,155,60,0.3)',
          borderTopColor: 'var(--gold)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // --- Pantalla de login ---
  if (!session) {
    return <Login onLogin={signIn} />;
  }

  // --- Verificar perfil activo ---
  if (perfil && !perfil.activo) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--navy)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: 'var(--white)', borderRadius: 16,
          padding: '36px 40px', textAlign: 'center', maxWidth: 380,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🚫</div>
          <h2 style={{ color: 'var(--navy)', marginBottom: 8 }}>Cuenta deshabilitada</h2>
          <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>
            Tu cuenta fue deshabilitada por el administrador.<br />
            Contactá a la administración para reactivarla.
          </p>
          <button
            onClick={signOut}
            style={{
              marginTop: 20, padding: '10px 24px',
              background: 'var(--navy)', color: 'var(--white)',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    if (loading) return <Spinner />;
    if (error) return (
      <div style={{
        background: 'var(--danger-bg)', border: '1px solid var(--danger)',
        borderRadius: 12, padding: '24px 28px', color: 'var(--danger)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Error de conexión</div>
        <div style={{ fontSize: 13 }}>{error}</div>
        <button onClick={cargarTodo} style={{
          marginTop: 14, padding: '8px 16px',
          background: 'var(--danger)', color: 'var(--white)',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
        }}>Reintentar</button>
      </div>
    );

    // Redirigir cobradores al tab correcto si intentan acceder a uno que no pueden
    const tabEfectivo = tab;

    switch (tabEfectivo) {
      case 'dashboard':
        return <Dashboard data={data} />;
      case 'miembros':
        if (!puede.verTodo) return <AccesoDenegado />;
        return <Miembros data={data} agregarMiembro={puede.gestionarMiembros ? agregarMiembro : null} eliminarMiembro={puede.gestionarMiembros ? eliminarMiembro : null} agregarDeudaManual={puede.gestionarMiembros ? agregarDeudaManual : null} generarDeudasAnio={puede.gestionarMiembros ? generarDeudasAnio : null} />;
      case 'cobradores':
        if (!puede.verTodo) return <AccesoDenegado />;
        return <Cobradores data={data} agregarCobrador={puede.gestionarCobradores ? agregarCobrador : null} eliminarCobrador={puede.gestionarCobradores ? eliminarCobrador : null} />;
      case 'cobranzas':
        return <Cobranzas
          data={data}
          registrarCobranza={puede.registrarCobranza ? registrarCobranza : null}
          eliminarCobranza={puede.eliminarCobranza ? eliminarCobranza : null}
          perfilActual={perfil}
        />;
      case 'reportes':
        if (!puede.verTodo) return <AccesoDenegado />;
        return <Reportes data={data} />;
      case 'usuarios':
        if (!puede.gestionarUsuarios) return <AccesoDenegado />;
        return <Usuarios data={data} />;
      case 'asamblea':
        return <Asamblea data={data} />;
      case 'importar':
        if (!puede.gestionarMiembros) return <AccesoDenegado />;
        return <ImportarMiembros data={data} onImportado={() => { cargarTodo(); setTab('miembros'); }} />;
      case 'configuracion':

        if (!puede.configurar) return <AccesoDenegado />;
        return <Configuracion data={data} actualizarCuotas={actualizarCuotas} agregarTemplo={agregarTemplo} eliminarTemplo={eliminarTemplo} />;
      default:
        return <Dashboard data={data} />;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--gray-50)' }}>
      <Sidebar tab={tab} setTab={setTab} perfil={perfil} onSignOut={signOut} />
      <main style={{ flex: 1, padding: '32px 36px', overflowY: 'auto', minWidth: 0 }}>
        {/* Barra superior */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          marginBottom: 24, gap: 10,
        }}>
          <button
            onClick={cargarTodo}
            style={{
              background: 'var(--white)', border: '1px solid var(--gray-200)',
              borderRadius: 8, padding: '7px 14px', fontSize: 13,
              color: 'var(--gray-600)', cursor: 'pointer', fontWeight: 500,
            }}
          >
            ↻ Actualizar
          </button>
        </div>
        {renderPage()}
      </main>
    </div>
  );
}

function AccesoDenegado() {
  return (
    <div style={{
      textAlign: 'center', padding: '80px 20px',
      color: 'var(--gray-400)',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <h3 style={{ color: 'var(--navy)', marginBottom: 8 }}>Acceso restringido</h3>
      <p style={{ fontSize: 14 }}>Tu rol no tiene permisos para ver esta sección.</p>
    </div>
  );
}
