// v1.0 - control de acceso a asamblea
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Card, CardHeader, Button, Modal, FormField, Badge, Toast } from '../components/UI';

export default function Asamblea({ data }) {
  const { miembros, templos, deudasAnuales } = data;

  const [asambleas, setAsambleas]         = useState([]);
  const [asambleaActiva, setAsambleaActiva] = useState(null);
  const [asistencia, setAsistencia]       = useState([]);
  const [modalNueva, setModalNueva]       = useState(false);
  const [modalReporte, setModalReporte]   = useState(false);
  const [tab, setTab]                     = useState('acceso'); // acceso | reporte
  const [toast, setToast]                 = useState(null);
  const [saving, setSaving]               = useState(false);
  const [busqueda, setBusqueda]           = useState('');
  const [resultados, setResultados]       = useState([]);
  const [ultimoIngreso, setUltimoIngreso] = useState(null);
  const busquedaRef                       = useRef();

  const [formNueva, setFormNueva] = useState({
    nombre: `Asamblea ${new Date().getFullYear()}`,
    fecha: new Date().toISOString().split('T')[0],
    descripcion: '',
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fmt = (n) => n?.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });

  // ── Cargar asambleas ──────────────────────────────────────
  const cargarAsambleas = useCallback(async () => {
    const { data: rows } = await supabase.from('asambleas').select('*').order('fecha', { ascending: false });
    setAsambleas(rows || []);
    const activa = (rows || []).find(a => a.activa);
    if (activa) {
      setAsambleaActiva(activa);
      cargarAsistencia(activa.id);
    }
  }, []);

  const cargarAsistencia = async (asambleaId) => {
    const { data: rows } = await supabase
      .from('asistencia_asamblea')
      .select('*')
      .eq('asamblea_id', asambleaId)
      .order('hora_ingreso', { ascending: false });
    setAsistencia(rows || []);
  };

  useEffect(() => { cargarAsambleas(); }, [cargarAsambleas]);

  // ── Buscar socio ──────────────────────────────────────────
  useEffect(() => {
    if (!busqueda.trim()) { setResultados([]); return; }
    const q = busqueda.toLowerCase();
    const encontrados = miembros.filter(m =>
      m.nombre?.toLowerCase().includes(q) ||
      m.nro_socio?.toString().includes(q) ||
      m.documento?.includes(q) ||
      m.cuit?.includes(q)
    ).slice(0, 6);
    setResultados(encontrados);
  }, [busqueda, miembros]);

  // ── Estado del socio ──────────────────────────────────────
  const estadoSocio = (miembro) => {
    const deudas = deudasAnuales.filter(d => d.miembro_id === miembro.id && !d.pagado);
    const deudaTotal = deudas.reduce((s, d) => s + d.saldo, 0);
    const aniosPendientes = deudas.map(d => d.anio).sort();
    const yaIngreso = asistencia.some(a => a.miembro_id === miembro.id);
    return { deudaTotal, aniosPendientes, yaIngreso, conDeuda: deudaTotal > 0 };
  };

  // ── Registrar ingreso ─────────────────────────────────────
  const registrarIngreso = async (miembro, forzar = false) => {
    if (!asambleaActiva) { showToast('No hay asamblea activa', 'error'); return; }
    const estado = estadoSocio(miembro);

    if (estado.yaIngreso) {
      showToast(`${miembro.nombre} ya ingresó a esta asamblea`, 'error');
      return;
    }

    if (estado.conDeuda && !forzar) {
      // Mostrar advertencia pero no bloquear
      setUltimoIngreso({ miembro, estado, requiereConfirmacion: true });
      return;
    }

    setSaving(true);
    try {
      await supabase.from('asistencia_asamblea').insert([{
        asamblea_id:     asambleaActiva.id,
        miembro_id:      miembro.id,
        deuda_al_momento: estado.deudaTotal,
        con_deuda:       estado.conDeuda,
      }]);
      await cargarAsistencia(asambleaActiva.id);
      setUltimoIngreso({ miembro, estado, requiereConfirmacion: false });
      setBusqueda('');
      setResultados([]);
      busquedaRef.current?.focus();
      showToast(
        estado.conDeuda
          ? `⚠ ${miembro.nombre} ingresó CON deuda pendiente`
          : `✓ ${miembro.nombre} ingresó correctamente`,
        estado.conDeuda ? 'error' : 'success'
      );
    } catch (e) {
      if (e.message?.includes('unique')) {
        showToast(`${miembro.nombre} ya fue registrado`, 'error');
      } else {
        showToast(e.message, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Crear asamblea ────────────────────────────────────────
  const crearAsamblea = async () => {
    setSaving(true);
    try {
      // Desactivar otras asambleas activas
      await supabase.from('asambleas').update({ activa: false }).eq('activa', true);
      const { data: nueva } = await supabase.from('asambleas').insert([{
        nombre:      formNueva.nombre,
        fecha:       formNueva.fecha,
        descripcion: formNueva.descripcion,
        activa:      true,
      }]).select().single();
      setAsambleaActiva(nueva);
      setAsistencia([]);
      setModalNueva(false);
      await cargarAsambleas();
      showToast('Asamblea creada y activada');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const cerrarAsamblea = async () => {
    if (!window.confirm('¿Cerrar esta asamblea? No se podrán registrar más ingresos.')) return;
    await supabase.from('asambleas').update({ activa: false }).eq('id', asambleaActiva.id);
    setAsambleaActiva(null);
    await cargarAsambleas();
    showToast('Asamblea cerrada');
  };

  // ── Exportar reporte ──────────────────────────────────────
  const exportarReporte = () => {
    const filas = [
      ['Hora ingreso','N° Socio','Nombre','Documento','CUIT','Categoría','Templo','Con deuda','Deuda al momento'].join(',')
    ];
    asistencia.forEach(a => {
      const m = miembros.find(mb => mb.id === a.miembro_id);
      const t = templos.find(t => t.id === m?.templo_id);
      filas.push([
        new Date(a.hora_ingreso).toLocaleTimeString('es-AR'),
        m?.nro_socio || '',
        `"${m?.nombre || ''}"`,
        m?.documento || '',
        m?.cuit || '',
        m?.categoria || '',
        `"${t?.nombre || ''}"`,
        a.con_deuda ? 'SÍ' : 'NO',
        a.deuda_al_momento || 0,
      ].join(','));
    });
    const csv  = filas.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    link.download = `asamblea_${asambleaActiva?.fecha || 'reporte'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── Estadísticas ──────────────────────────────────────────
  const totalIngresaron   = asistencia.length;
  const sinDeuda          = asistencia.filter(a => !a.con_deuda).length;
  const conDeuda          = asistencia.filter(a => a.con_deuda).length;
  const mayoresIngresaron = asistencia.filter(a => miembros.find(m => m.id === a.miembro_id)?.categoria === 'mayor').length;
  const menoresIngresaron = asistencia.filter(a => miembros.find(m => m.id === a.miembro_id)?.categoria === 'menor').length;

  // ── Reporte por templo ────────────────────────────────────
  const porTemplo = templos.map(t => {
    const miembrosTemplo = miembros.filter(m => m.templo_id === t.id);
    const ingresaron     = asistencia.filter(a => miembrosTemplo.some(m => m.id === a.miembro_id));
    return { templo: t, total: miembrosTemplo.length, ingresaron: ingresaron.length };
  }).filter(r => r.total > 0);

  const estiloTab = (activo) => ({
    padding: '8px 20px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: activo ? 600 : 400,
    borderBottom: activo ? '2px solid var(--navy)' : '2px solid transparent',
    background: 'transparent', color: activo ? 'var(--navy)' : 'var(--gray-400)',
    transition: 'all 0.15s',
  });

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>Control de Asamblea</h2>
          <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 2 }}>
            {asambleaActiva
              ? <>Asamblea activa: <strong style={{ color: 'var(--navy)' }}>{asambleaActiva.nombre}</strong> — {asambleaActiva.fecha}</>
              : 'No hay asamblea activa'
            }
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {asambleaActiva && (
            <>
              <Button variant="ghost" onClick={exportarReporte}>↓ Exportar</Button>
              <Button variant="ghost" onClick={cerrarAsamblea}>Cerrar asamblea</Button>
            </>
          )}
          <Button onClick={() => setModalNueva(true)}>+ Nueva asamblea</Button>
        </div>
      </div>

      {/* Sin asamblea activa */}
      {!asambleaActiva && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏛</div>
          <h3 style={{ color: 'var(--navy)', marginBottom: 8 }}>No hay asamblea activa</h3>
          <p style={{ color: 'var(--gray-400)', fontSize: 14, marginBottom: 24 }}>
            Creá una nueva asamblea para empezar a registrar el ingreso de socios
          </p>
          <Button onClick={() => setModalNueva(true)}>+ Crear asamblea</Button>
        </div>
      )}

      {/* Con asamblea activa */}
      {asambleaActiva && (
        <>
          {/* Tabs */}
          <div style={{ borderBottom: '1px solid var(--gray-200)', marginBottom: 24, display: 'flex', gap: 0 }}>
            <button style={estiloTab(tab === 'acceso')} onClick={() => setTab('acceso')}>Control de acceso</button>
            <button style={estiloTab(tab === 'reporte')} onClick={() => setTab('reporte')}>Reporte de asistencia</button>
          </div>

          {/* TAB: ACCESO */}
          {tab === 'acceso' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* Panel búsqueda */}
              <div style={{ display: 'grid', gap: 16 }}>
                {/* Buscador */}
                <Card>
                  <CardHeader title="Buscar socio" subtitle="Por nombre, N° socio, documento o CUIT" />
                  <div style={{ padding: '16px 24px' }}>
                    <input
                      ref={busquedaRef}
                      autoFocus
                      placeholder="Escribí nombre, N° socio o documento…"
                      value={busqueda}
                      onChange={e => setBusqueda(e.target.value)}
                      style={{ width: '100%', fontSize: 16, padding: '12px 14px' }}
                    />
                  </div>

                  {/* Resultados */}
                  {resultados.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--gray-100)' }}>
                      {resultados.map(m => {
                        const estado = estadoSocio(m);
                        const templo = templos.find(t => t.id === m.templo_id);
                        return (
                          <div key={m.id} style={{
                            padding: '14px 24px',
                            borderBottom: '1px solid var(--gray-100)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: estado.yaIngreso ? 'var(--gray-50)' : 'var(--white)',
                          }}>
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 15 }}>
                                {m.nombre}
                                {m.nro_socio && <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 8 }}>#{m.nro_socio}</span>}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                                {templo?.nombre} · {m.categoria} · DNI {m.documento || '—'}
                              </div>
                              {estado.conDeuda && (
                                <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3, fontWeight: 600 }}>
                                  ⚠ Deuda: {fmt(estado.deudaTotal)} — años {estado.aniosPendientes.join(', ')}
                                </div>
                              )}
                            </div>
                            <div style={{ flexShrink: 0, marginLeft: 12 }}>
                              {estado.yaIngreso ? (
                                <span style={{ fontSize: 12, color: 'var(--gray-400)', background: 'var(--gray-100)', padding: '5px 12px', borderRadius: 99 }}>
                                  Ya ingresó ✓
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant={estado.conDeuda ? 'ghost' : 'primary'}
                                  style={estado.conDeuda ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : {}}
                                  onClick={() => registrarIngreso(m)}
                                  disabled={saving}
                                >
                                  {estado.conDeuda ? '⚠ Ingresar' : 'Ingresar ✓'}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {busqueda && resultados.length === 0 && (
                    <div style={{ padding: '20px 24px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                      No se encontró ningún socio
                    </div>
                  )}
                </Card>

                {/* Último ingreso */}
                {ultimoIngreso && !ultimoIngreso.requiereConfirmacion && (
                  <div style={{
                    borderRadius: 12, padding: '16px 20px',
                    background: ultimoIngreso.estado.conDeuda ? 'var(--danger-bg)' : 'var(--success-bg)',
                    border: `1px solid ${ultimoIngreso.estado.conDeuda ? 'var(--danger)' : 'var(--success)'}`,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, color: ultimoIngreso.estado.conDeuda ? 'var(--danger)' : 'var(--success)' }}>
                      {ultimoIngreso.estado.conDeuda ? '⚠ Ingresó con deuda' : '✓ Último ingreso registrado'}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>
                      {ultimoIngreso.miembro.nombre}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 4 }}>
                      {ultimoIngreso.miembro.categoria} · #{ultimoIngreso.miembro.nro_socio || '—'}
                      {ultimoIngreso.estado.conDeuda && ` · Deuda: ${fmt(ultimoIngreso.estado.deudaTotal)}`}
                    </div>
                  </div>
                )}

                {/* Confirmación ingreso con deuda */}
                {ultimoIngreso?.requiereConfirmacion && (
                  <div style={{
                    borderRadius: 12, padding: '16px 20px',
                    background: 'var(--warning-bg)',
                    border: '1px solid var(--gold)',
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>
                      ⚠ {ultimoIngreso.miembro.nombre} tiene deuda pendiente
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--warning)', marginBottom: 12 }}>
                      Debe {fmt(ultimoIngreso.estado.deudaTotal)} — años {ultimoIngreso.estado.aniosPendientes.join(', ')}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="sm" variant="ghost" onClick={() => setUltimoIngreso(null)}>Cancelar</Button>
                      <Button size="sm" variant="gold" onClick={() => registrarIngreso(ultimoIngreso.miembro, true)}>
                        Ingresar de todas formas
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Panel métricas en tiempo real */}
              <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
                {/* Contador principal */}
                <div style={{
                  background: 'var(--navy)', borderRadius: 16, padding: '28px 28px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                    Socios presentes
                  </div>
                  <div style={{ fontSize: 72, fontWeight: 700, color: 'var(--white)', lineHeight: 1, fontFamily: 'Georgia, serif' }}>
                    {totalIngresaron}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
                    de {miembros.length} socios registrados
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mayores</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--navy)', marginTop: 4 }}>{mayoresIngresaron}</div>
                  </div>
                  <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Menores</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--navy)', marginTop: 4 }}>{menoresIngresaron}</div>
                  </div>
                  <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sin deuda</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>{sinDeuda}</div>
                  </div>
                  <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Con deuda</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--danger)', marginTop: 4 }}>{conDeuda}</div>
                  </div>
                </div>

                {/* Por templo */}
                <Card>
                  <CardHeader title="Por templo" />
                  <div style={{ padding: '0 0 4px' }}>
                    {porTemplo.map(r => (
                      <div key={r.templo.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 20px', borderBottom: '1px solid var(--gray-100)',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{r.templo.nombre}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 80, height: 6, background: 'var(--gray-100)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${r.total > 0 ? (r.ingresaron / r.total) * 100 : 0}%`, background: 'var(--navy)', borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', minWidth: 40, textAlign: 'right' }}>
                            {r.ingresaron}/{r.total}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* TAB: REPORTE */}
          {tab === 'reporte' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <Button variant="ghost" onClick={exportarReporte}>↓ Exportar a Sheets</Button>
              </div>
              <Card>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                      {['Hora','N° Socio','Nombre','Documento','CUIT','Categoría','Templo','Estado deuda'].map(h => (
                        <th key={h} style={{
                          padding: '11px 16px', textAlign: 'left',
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                          textTransform: 'uppercase', color: 'var(--gray-400)', whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {asistencia.length === 0 ? (
                      <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--gray-400)' }}>
                        Aún no hay socios registrados en esta asamblea
                      </td></tr>
                    ) : asistencia.map(a => {
                      const m = miembros.find(mb => mb.id === a.miembro_id);
                      const t = templos.find(t => t.id === m?.templo_id);
                      return (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--gray-100)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-50)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '11px 16px', color: 'var(--gray-600)', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {new Date(a.hora_ingreso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontSize: 11 }}>{m?.nro_socio || '—'}</td>
                          <td style={{ padding: '11px 16px', fontWeight: 600, color: 'var(--navy)' }}>{m?.nombre || '—'}</td>
                          <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontSize: 11 }}>{m?.documento || '—'}</td>
                          <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontSize: 11 }}>{m?.cuit || '—'}</td>
                          <td style={{ padding: '11px 16px' }}>
                            <Badge variant={m?.categoria}>{m?.categoria === 'mayor' ? 'Mayor' : 'Menor'}</Badge>
                          </td>
                          <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--gray-600)' }}>{t?.nombre || '—'}</td>
                          <td style={{ padding: '11px 16px' }}>
                            {a.con_deuda
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>⚠ Con deuda — {fmt(a.deuda_al_momento)}</span>
                              : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>✓ Al día</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Modal nueva asamblea */}
      <Modal open={modalNueva} onClose={() => setModalNueva(false)} title="Nueva asamblea">
        <div style={{ display: 'grid', gap: 16 }}>
          <FormField label="Nombre de la asamblea" required>
            <input value={formNueva.nombre} onChange={e => setFormNueva(f => ({ ...f, nombre: e.target.value }))} />
          </FormField>
          <FormField label="Fecha" required>
            <input type="date" value={formNueva.fecha} onChange={e => setFormNueva(f => ({ ...f, fecha: e.target.value }))} />
          </FormField>
          <FormField label="Descripción">
            <input placeholder="Asamblea ordinaria, extraordinaria…" value={formNueva.descripcion} onChange={e => setFormNueva(f => ({ ...f, descripcion: e.target.value }))} />
          </FormField>
          <div style={{ background: 'var(--warning-bg)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--warning)' }}>
            Al crear una nueva asamblea se cerrará automáticamente la que esté activa.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setModalNueva(false)}>Cancelar</Button>
            <Button onClick={crearAsamblea} disabled={saving || !formNueva.nombre}>
              {saving ? 'Creando…' : 'Crear asamblea'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
