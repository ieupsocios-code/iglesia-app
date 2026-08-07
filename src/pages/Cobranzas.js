// v5.0 - cobrador puede editar sus cobranzas
import React, { useState, useEffect } from 'react';
import { Card, Button, Modal, FormField, Badge, Toast } from '../components/UI';
import { supabase } from '../lib/supabaseClient';

export default function Cobranzas({ data, registrarCobranza, eliminarCobranza, perfilActual }) {
  const { cobranzas, miembros, cobradores, templos, deudasAnuales } = data;
  const [modalOpen, setModalOpen]     = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [cobranzaEditando, setCobranzaEditando] = useState(null);
  const [toast, setToast]             = useState(null);
  const [saving, setSaving]           = useState(false);
  const [filtroCobradorId, setFiltroCobradorId] = useState('');
  const [filtroAnio, setFiltroAnio]   = useState('');
  const [busqueda, setBusqueda]       = useState('');

  const [miCobradorId, setMiCobradorId] = useState(null);
  const esAdmin   = perfilActual?.rol === 'admin';
  const esConsulta = perfilActual?.rol === 'consulta';

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    cobrador_id: '', miembro_id: '', numero_recibo: '',
    fecha: today, aniosSeleccionados: {},
  });

  const [formEdit, setFormEdit] = useState({
    numero_recibo: '', fecha: '', monto: '',
  });

  // ── Buscar cobrador vinculado ─────────────────────────────
  useEffect(() => {
    const buscarMiCobrador = async () => {
      if (!perfilActual?.id) return;
      const { data: cobVinculado } = await supabase
        .from('cobradores').select('id').eq('perfil_id', perfilActual.id).limit(1);
      if (cobVinculado?.length > 0) {
        const id = cobVinculado[0].id;
        setMiCobradorId(id);
        setForm(f => ({ ...f, cobrador_id: id }));
      } else if (!esAdmin && !esConsulta) {
        const cobPorTemplo = cobradores.find(c => c.templo_id === perfilActual.templo_id);
        if (cobPorTemplo) {
          setMiCobradorId(cobPorTemplo.id);
          setForm(f => ({ ...f, cobrador_id: cobPorTemplo.id }));
        }
      }
    };
    buscarMiCobrador();
  }, [perfilActual, cobradores, esAdmin, esConsulta]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fmt = (n) => n?.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });

  // ── Deudas del miembro seleccionado ──────────────────────
  const deudasDelMiembro = form.miembro_id
    ? deudasAnuales.filter(d => d.miembro_id === parseInt(form.miembro_id) && !d.pagado).sort((a,b) => a.anio - b.anio)
    : [];

  const handleMiembroChange = (miembro_id) => {
    setForm(f => ({ ...f, miembro_id, aniosSeleccionados: {} }));
  };

  const toggleAnio = (deudaId, saldo) => {
    setForm(f => {
      const sel = { ...f.aniosSeleccionados };
      if (sel[deudaId] !== undefined) delete sel[deudaId];
      else sel[deudaId] = saldo;
      return { ...f, aniosSeleccionados: sel };
    });
  };

  const cambiarMonto = (deudaId, monto) => {
    setForm(f => ({ ...f, aniosSeleccionados: { ...f.aniosSeleccionados, [deudaId]: monto } }));
  };

  const seleccionarTodos = () => {
    const todos = {};
    deudasDelMiembro.forEach(d => { todos[d.id] = d.saldo; });
    setForm(f => ({ ...f, aniosSeleccionados: todos }));
  };

  const totalACobrar = Object.values(form.aniosSeleccionados).reduce((s,m) => s + (parseInt(m) || 0), 0);
  const aniosCount   = Object.keys(form.aniosSeleccionados).length;

  // ── Registrar cobranza ────────────────────────────────────
  const handleGuardar = async () => {
    if (!form.cobrador_id || !form.miembro_id || !form.numero_recibo || aniosCount === 0) return;
    setSaving(true);
    try {
      for (const [deudaId, monto] of Object.entries(form.aniosSeleccionados)) {
        if (!monto || parseInt(monto) === 0) continue;
        const deuda = deudasAnuales.find(d => d.id === parseInt(deudaId));
        await registrarCobranza({
          cobrador_id:    parseInt(form.cobrador_id),
          miembro_id:     parseInt(form.miembro_id),
          deuda_anual_id: parseInt(deudaId),
          anio:           deuda?.anio,
          monto:          parseInt(monto),
          numero_recibo:  form.numero_recibo,
          fecha:          form.fecha,
        });
      }
      setForm(f => ({
        ...f, miembro_id: '', aniosSeleccionados: {},
        numero_recibo: '', fecha: today,
        cobrador_id: miCobradorId || (esAdmin ? '' : f.cobrador_id),
      }));
      setModalOpen(false);
      showToast(`Cobranza registrada — ${aniosCount} año${aniosCount > 1 ? 's' : ''} abonado${aniosCount > 1 ? 's' : ''}`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Abrir editar cobranza ─────────────────────────────────
  const abrirEditar = (cz) => {
    setCobranzaEditando(cz);
    setFormEdit({
      numero_recibo: cz.numero_recibo || '',
      fecha:         cz.fecha || today,
      monto:         cz.monto || '',
    });
    setModalEditar(true);
  };

  // ── Guardar edición de cobranza ───────────────────────────
  const handleGuardarEdicion = async () => {
    if (!formEdit.numero_recibo || !formEdit.monto || !formEdit.fecha) return;
    setSaving(true);
    try {
      const montoNuevo  = parseInt(formEdit.monto);
      const montoViejo  = cobranzaEditando.monto;
      const diferencia  = montoNuevo - montoViejo;

      // Actualizar la cobranza
      const { error } = await supabase.from('cobranzas').update({
        numero_recibo: formEdit.numero_recibo,
        fecha:         formEdit.fecha,
        monto:         montoNuevo,
      }).eq('id', cobranzaEditando.id);
      if (error) throw error;

      // Actualizar saldo de la deuda anual si cambió el monto
      if (diferencia !== 0 && cobranzaEditando.deuda_anual_id) {
        const deuda = deudasAnuales.find(d => d.id === cobranzaEditando.deuda_anual_id);
        if (deuda) {
          const nuevoSaldo = Math.max(0, deuda.saldo - diferencia);
          await supabase.from('deudas_anuales').update({
            saldo:  nuevoSaldo,
            pagado: nuevoSaldo === 0,
          }).eq('id', cobranzaEditando.deuda_anual_id);
        }
      }

      // Actualizar totales del cobrador si cambió el monto
      if (diferencia !== 0) {
        const cobrador = cobradores.find(c => c.id === cobranzaEditando.cobrador_id);
        if (cobrador) {
          await supabase.from('cobradores').update({
            total_cobrado: Math.max(0, cobrador.total_cobrado + diferencia),
          }).eq('id', cobrador.id);
        }
      }

      setModalEditar(false);
      showToast('Cobranza actualizada correctamente');
      if (window.__cargarTodo) window.__cargarTodo();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Anular cobranza ───────────────────────────────────────
  const handleEliminar = async (cz) => {
    if (!window.confirm(`¿Anular cobranza ${cz.numero_recibo}?`)) return;
    try {
      await eliminarCobranza(cz);
      showToast('Cobranza anulada');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // ── Verificar si el usuario puede editar una cobranza ─────
  const puedeEditarCobranza = (cz) => {
    if (esAdmin) return true;
    if (esConsulta) return false;
    // Cobrador puede editar solo sus propias cobranzas
    return miCobradorId && cz.cobrador_id === miCobradorId;
  };

  const aniosDisponibles = [...new Set(cobranzas.map(c => c.anio).filter(Boolean))].sort((a,b) => b - a);

  const filtradas = cobranzas
    .filter(c => esAdmin ? (!filtroCobradorId || c.cobrador_id === parseInt(filtroCobradorId)) : (miCobradorId ? c.cobrador_id === miCobradorId : true))
    .filter(c => !filtroAnio || c.anio === parseInt(filtroAnio))
    .filter(c => {
      if (!busqueda) return true;
      const m  = miembros.find(m => m.id === c.miembro_id);
      const co = cobradores.find(co => co.id === c.cobrador_id);
      return (
        c.numero_recibo?.toLowerCase().includes(busqueda.toLowerCase()) ||
        m?.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        co?.nombre.toLowerCase().includes(busqueda.toLowerCase())
      );
    });

  const miembrosFiltrados = esAdmin || esConsulta
    ? miembros
    : miembros.filter(m => m.templo_id === perfilActual?.templo_id);

  const miCobrador = cobradores.find(c => c.id === miCobradorId);

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>Cobranzas</h2>
          <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 2 }}>
            {filtradas.length} de {cobranzas.length} registros
            {miCobrador && !esAdmin && !esConsulta && (
              <span style={{ marginLeft: 8, background: 'var(--gold-pale)', color: 'var(--warning)', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
                Cobrador: {miCobrador.nombre}
              </span>
            )}
          </div>
        </div>
        {registrarCobranza && !esConsulta && (
          <Button onClick={() => setModalOpen(true)}>+ Registrar cobranza</Button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input placeholder="Buscar por recibo, miembro…" value={busqueda}
          onChange={e => setBusqueda(e.target.value)} style={{ width: 240 }} />
        {esAdmin && (
          <select value={filtroCobradorId} onChange={e => setFiltroCobradorId(e.target.value)} style={{ width: 190 }}>
            <option value="">Todos los cobradores</option>
            {cobradores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
        <select value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)} style={{ width: 140 }}>
          <option value="">Todos los años</option>
          {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                {['Fecha','N° Recibo','Año','Cobrador','Templo','Miembro','Categoría','Monto','Acciones'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-400)' }}>
                  No hay cobranzas registradas
                </td></tr>
              ) : filtradas.map(c => {
                const miembro  = miembros.find(m => m.id === c.miembro_id);
                const cobrador = cobradores.find(co => co.id === c.cobrador_id);
                const templo   = templos.find(t => t.id === cobrador?.templo_id);
                const puedEditar = puedeEditarCobranza(c);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--gray-100)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-50)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '11px 14px', color: 'var(--gray-600)', fontSize: 12 }}>{c.fecha}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--navy)', background: 'var(--gray-100)', padding: '2px 7px', borderRadius: 4 }}>
                        {c.numero_recibo}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ background: 'var(--gold-pale)', color: 'var(--warning)', fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 99 }}>
                        {c.anio || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--navy)' }}>{cobrador?.nombre || '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--gray-600)' }}>{templo?.nombre || '—'}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 500 }}>{miembro?.nombre || '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <Badge variant={miembro?.categoria || 'default'}>
                        {miembro?.categoria === 'mayor' ? 'Mayor' : miembro?.categoria === 'menor' ? 'Menor' : '—'}
                      </Badge>
                    </td>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--success)' }}>{fmt(c.monto)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {puedEditar && (
                          <Button size="sm" variant="ghost" onClick={() => abrirEditar(c)}>✎ Editar</Button>
                        )}
                        {esAdmin && eliminarCobranza && (
                          <Button size="sm" variant="ghost" onClick={() => handleEliminar(c)}
                            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>Anular</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal registrar cobranza */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Registrar cobranza" width={540}>
        <div style={{ display: 'grid', gap: 16 }}>
          <FormField label="Cobrador">
            {miCobradorId && !esAdmin ? (
              <div style={{
                background: 'var(--navy)', color: 'var(--white)',
                borderRadius: 8, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600,
              }}>
                <span>💼</span>
                {miCobrador?.nombre}
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 'auto' }}>
                  {templos.find(t => t.id === miCobrador?.templo_id)?.nombre}
                </span>
              </div>
            ) : (
              <select value={form.cobrador_id} onChange={e => setForm(f => ({ ...f, cobrador_id: e.target.value }))}>
                <option value="">Seleccionar cobrador…</option>
                {cobradores.map(c => {
                  const t = templos.find(t => t.id === c.templo_id);
                  return <option key={c.id} value={c.id}>{c.nombre} — {t?.nombre || 'Todos los templos'}</option>;
                })}
              </select>
            )}
          </FormField>

          <FormField label="Miembro" required>
            <select value={form.miembro_id} onChange={e => handleMiembroChange(e.target.value)}>
              <option value="">Seleccionar miembro…</option>
              {miembrosFiltrados.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </FormField>

          {form.miembro_id && (
            <FormField label="Años a abonar">
              {deudasDelMiembro.length === 0 ? (
                <div style={{ background: 'var(--success-bg)', color: 'var(--success)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                  ✓ Este miembro no tiene deudas pendientes
                </div>
              ) : (
                <div style={{ border: '1.5px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)' }}>
                      {deudasDelMiembro.length} año{deudasDelMiembro.length > 1 ? 's' : ''} pendiente{deudasDelMiembro.length > 1 ? 's' : ''}
                    </span>
                    <button onClick={seleccionarTodos} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--navy)', textDecoration: 'underline', padding: 0 }}>
                      Seleccionar todos
                    </button>
                  </div>
                  {deudasDelMiembro.map(d => {
                    const sel = form.aniosSeleccionados[d.id] !== undefined;
                    return (
                      <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '32px 60px 1fr 120px', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--gray-100)', background: sel ? 'rgba(28,43,75,0.03)' : 'transparent' }}>
                        <input type="checkbox" checked={sel} onChange={() => toggleAnio(d.id, d.saldo)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                        <span style={{ fontWeight: 700, fontSize: 14, color: sel ? 'var(--navy)' : 'var(--gray-600)' }}>{d.anio}</span>
                        <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                          <div>Cuota: {fmt(d.importe)}</div>
                          <div style={{ color: 'var(--danger)', fontWeight: 600 }}>Debe: {fmt(d.saldo)}</div>
                        </div>
                        {sel ? (
                          <input type="number" min="1" max={d.saldo} value={form.aniosSeleccionados[d.id]}
                            onChange={e => cambiarMonto(d.id, e.target.value)} style={{ fontSize: 13, padding: '5px 8px' }} />
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--gray-200)' }}>—</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </FormField>
          )}

          {aniosCount > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, background: 'var(--navy)', borderRadius: 10, padding: '14px 16px' }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>Años</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--white)' }}>{aniosCount}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>Total</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>{fmt(totalACobrar)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>Recibo</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{form.numero_recibo || '—'}</div>
              </div>
            </div>
          )}

          {form.miembro_id && deudasDelMiembro.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="N° Recibo (talonario)" required>
                <input placeholder="Ej: T01-00123" value={form.numero_recibo}
                  onChange={e => setForm(f => ({ ...f, numero_recibo: e.target.value }))} />
              </FormField>
              <FormField label="Fecha de cobro">
                <input type="date" value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </FormField>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="gold" onClick={handleGuardar}
              disabled={saving || !form.cobrador_id || !form.miembro_id || aniosCount === 0 || !form.numero_recibo || totalACobrar === 0}>
              {saving ? 'Registrando…' : aniosCount > 1
                ? `Registrar ${aniosCount} años — ${fmt(totalACobrar)}`
                : `Registrar cobranza — ${fmt(totalACobrar)}`
              }
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal editar cobranza */}
      <Modal open={modalEditar} onClose={() => setModalEditar(false)} title={`Editar cobranza — Año ${cobranzaEditando?.anio}`}>
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Info de la cobranza */}
          {cobranzaEditando && (
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, color: 'var(--gray-600)' }}>
                <div><span style={{ color: 'var(--gray-400)' }}>Miembro: </span>
                  <strong>{miembros.find(m => m.id === cobranzaEditando.miembro_id)?.nombre}</strong>
                </div>
                <div><span style={{ color: 'var(--gray-400)' }}>Año: </span>
                  <strong style={{ color: 'var(--navy)' }}>{cobranzaEditando.anio}</strong>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="N° Recibo" required>
              <input placeholder="Ej: T01-00123" value={formEdit.numero_recibo}
                onChange={e => setFormEdit(f => ({ ...f, numero_recibo: e.target.value }))} />
            </FormField>
            <FormField label="Fecha de cobro" required>
              <input type="date" value={formEdit.fecha}
                onChange={e => setFormEdit(f => ({ ...f, fecha: e.target.value }))} />
            </FormField>
          </div>

          <FormField label="Monto" required>
            <input type="number" min="1" value={formEdit.monto}
              onChange={e => setFormEdit(f => ({ ...f, monto: e.target.value }))} />
          </FormField>

          {cobranzaEditando && parseInt(formEdit.monto) !== cobranzaEditando.monto && formEdit.monto && (
            <div style={{
              background: parseInt(formEdit.monto) > cobranzaEditando.monto ? 'var(--success-bg)' : 'var(--warning-bg)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13,
              color: parseInt(formEdit.monto) > cobranzaEditando.monto ? 'var(--success)' : 'var(--warning)',
            }}>
              Monto original: {fmt(cobranzaEditando.monto)} →
              Nuevo: {fmt(parseInt(formEdit.monto) || 0)}
              {' '}({parseInt(formEdit.monto) > cobranzaEditando.monto ? '+' : ''}{fmt((parseInt(formEdit.monto) || 0) - cobranzaEditando.monto)})
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setModalEditar(false)}>Cancelar</Button>
            <Button variant="gold" onClick={handleGuardarEdicion}
              disabled={saving || !formEdit.numero_recibo || !formEdit.monto || !formEdit.fecha}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
