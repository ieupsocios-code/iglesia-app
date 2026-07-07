import React from 'react';
import logoWhite from '../assets/logo-white.png';

const NAV = [
  { id: 'dashboard',     icon: '⊞', label: 'Dashboard',      rol: ['admin','cobrador','consulta'] },
  { id: 'miembros',      icon: '✦', label: 'Miembros',       rol: ['admin','consulta'] },
  { id: 'cobradores',    icon: '◈', label: 'Cobradores',     rol: ['admin','consulta'] },
  { id: 'cobranzas',     icon: '◎', label: 'Cobranzas',      rol: ['admin','cobrador','consulta'] },
  { id: 'reportes',      icon: '▦', label: 'Reportes',       rol: ['admin','consulta'] },
  { id: 'usuarios',      icon: '◉', label: 'Usuarios',       rol: ['admin'] },
  { id: 'importar',      icon: '⇪', label: 'Importar socios', rol: ['admin'] },
  { id: 'asamblea',      icon: '🏛', label: 'Asamblea',       rol: ['admin','cobrador'] },
  { id: 'configuracion', icon: '◧', label: 'Configuración',  rol: ['admin'] },
];

const ROL_BADGE = {
  admin:    { label: 'Admin',    bg: 'rgba(200,155,60,0.25)', color: 'var(--gold-light)' },
  cobrador: { label: 'Cobrador', bg: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' },
  consulta: { label: 'Consulta', bg: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.6)' },
};

export default function Sidebar({ tab, setTab, perfil, onSignOut }) {
  const rol = perfil?.rol || 'consulta';
  const navFiltrado = NAV.filter(item => item.rol.includes(rol));
  const rb = ROL_BADGE[rol] || ROL_BADGE.consulta;

  return (
    <aside style={{
      width: 240,
      minHeight: '100vh',
      background: 'var(--navy)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '28px 24px 22px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 10,
      }}>
        <img src={logoWhite} alt="Unión Pentecostal"
          style={{ width: 44, height: 44, objectFit: 'contain' }} />
        <div>
          <div style={{
            fontFamily: 'Georgia, serif',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--gold)',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
          }}>Unión Pentecostal</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
            Gestión de socios
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '14px 12px' }}>
        {navFiltrado.map(item => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 12px', marginBottom: 2,
                borderRadius: 8, border: 'none',
                background: active ? 'rgba(200,155,60,0.18)' : 'transparent',
                color: active ? 'var(--gold-light)' : 'rgba(255,255,255,0.58)',
                fontSize: 13.5, fontWeight: active ? 600 : 400,
                textAlign: 'left', cursor: 'pointer',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: 6,
                background: active ? 'var(--gold)' : 'rgba(255,255,255,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12,
                color: active ? 'var(--navy)' : 'rgba(255,255,255,0.45)',
                flexShrink: 0,
              }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Usuario logueado */}
      {perfil && (
        <div style={{
          padding: '14px 16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'var(--gold)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: 'var(--navy)', flexShrink: 0,
            }}>
              {perfil.nombre?.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: 'var(--white)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {perfil.nombre}
              </div>
              <div style={{
                display: 'inline-block', marginTop: 3,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase',
                background: rb.bg, color: rb.color,
                padding: '2px 7px', borderRadius: 99,
              }}>
                {rb.label}
              </div>
            </div>
          </div>
          {perfil.templos && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 10, paddingLeft: 2 }}>
              {perfil.templos.nombre}
            </div>
          )}
          <button
            onClick={onSignOut}
            style={{
              width: '100%', padding: '7px 12px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 7, color: 'rgba(255,255,255,0.5)',
              fontSize: 12, cursor: 'pointer',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          >
            Cerrar sesión
          </button>
        </div>
      )}

      {/* Siempre visible si el perfil no cargó */}
      {!perfil && onSignOut && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={onSignOut}
            style={{
              width: '100%', padding: '7px 12px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 7, color: 'rgba(255,255,255,0.5)',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </aside>
  );
}
