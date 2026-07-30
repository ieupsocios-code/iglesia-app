import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';


// Carga todas las filas sin el límite de 1000 de Supabase
async function cargarPaginado(tabla, opciones = {}) {
  const { order, orderAsc = false, select = '*' } = opciones;
  let todas = [];
  let desde = 0;
  const BATCH = 1000;
  while (true) {
    let q = supabase.from(tabla).select(select).range(desde, desde + BATCH - 1);
    if (order) q = q.order(order, { ascending: orderAsc });
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    todas = todas.concat(data);
    if (data.length < BATCH) break;
    desde += BATCH;
  }
  return todas;
}

export function useSupabase() {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [data, setData]       = useState({
    templos: [], miembros: [], cobradores: [],
    cobranzas: [], deudasAnuales: [],
    configuracion: { id: null, cuota_mayor: 50000, cuota_menor: 25000 },
  });

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [templos, miembros, cobradores, cobranzas, deudasAnuales, cfg] = await Promise.all([
        cargarPaginado('templos',        { order: 'nombre',      orderAsc: true  }),
        cargarPaginado('miembros',       { order: 'nombre',      orderAsc: true  }),
        cargarPaginado('cobradores',     { order: 'nombre',      orderAsc: true  }),
        cargarPaginado('cobranzas',      { order: 'created_at',  orderAsc: false }),
        cargarPaginado('deudas_anuales', { order: 'anio',        orderAsc: false }),
        supabase.from('configuracion').select('*').limit(1),
      ]);
      if (cfg.error) throw cfg.error;
      setData({
        templos, miembros, cobradores, cobranzas, deudasAnuales,
        configuracion: cfg.data?.[0] || { id: null, cuota_mayor: 50000, cuota_menor: 25000 },
      });
    } catch (e) {
      setError(e.message || 'Error al conectar con Supabase');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const agregarTemplo = async (nombre) => {
    const { data: row, error } = await supabase.from('templos').insert([{ nombre }]).select().single();
    if (error) throw error;
    setData(prev => ({ ...prev, templos: [...prev.templos, row].sort((a,b) => a.nombre.localeCompare(b.nombre)) }));
    return row;
  };

  const eliminarTemplo = async (id) => {
    const { error } = await supabase.from('templos').delete().eq('id', id);
    if (error) throw error;
    setData(prev => ({ ...prev, templos: prev.templos.filter(t => t.id !== id) }));
  };

  const actualizarCuotas = async (cuota_mayor, cuota_menor) => {
    const cfg = data.configuracion;
    let row;
    if (cfg.id) {
      const { data: u, error } = await supabase.from('configuracion')
        .update({ cuota_mayor, cuota_menor, updated_at: new Date().toISOString() })
        .eq('id', cfg.id).select().single();
      if (error) throw error;
      row = u;
    } else {
      const { data: i, error } = await supabase.from('configuracion')
        .insert([{ cuota_mayor, cuota_menor }]).select().single();
      if (error) throw error;
      row = i;
    }
    setData(prev => ({ ...prev, configuracion: row }));
    return row;
  };

  const agregarMiembro = async (campos) => {
    const { categoria } = campos;
    const cuota = categoria === 'mayor' ? data.configuracion.cuota_mayor : data.configuracion.cuota_menor;
    const { data: row, error } = await supabase.from('miembros')
      .insert([{ ...campos, deuda: cuota }]).select().single();
    if (error) throw error;
    const anioActual = new Date().getFullYear();
    await supabase.from('deudas_anuales').insert([{
      miembro_id: row.id, anio: anioActual,
      importe: cuota, saldo: cuota, pagado: false,
    }]);
    await cargarTodo();
    return row;
  };

  const eliminarMiembro = async (id) => {
    const { error } = await supabase.from('miembros').delete().eq('id', id);
    if (error) throw error;
    setData(prev => ({
      ...prev,
      miembros: prev.miembros.filter(m => m.id !== id),
      deudasAnuales: prev.deudasAnuales.filter(d => d.miembro_id !== id),
    }));
  };

  const agregarCobrador = async ({ nombre, templo_id }) => {
    const { data: row, error } = await supabase.from('cobradores')
      .insert([{ nombre, templo_id }]).select().single();
    if (error) throw error;
    setData(prev => ({ ...prev, cobradores: [...prev.cobradores, row].sort((a,b) => a.nombre.localeCompare(b.nombre)) }));
    return row;
  };

  const eliminarCobrador = async (id) => {
    const { error } = await supabase.from('cobradores').delete().eq('id', id);
    if (error) throw error;
    setData(prev => ({ ...prev, cobradores: prev.cobradores.filter(c => c.id !== id) }));
  };

  const registrarCobranza = async ({ cobrador_id, miembro_id, deuda_anual_id, anio, monto, numero_recibo, fecha }) => {
    const { data: cz, error } = await supabase.from('cobranzas')
      .insert([{ cobrador_id, miembro_id, deuda_anual_id, anio, monto, numero_recibo, fecha }])
      .select().single();
    if (error) throw error;
    const deuda = data.deudasAnuales.find(d => d.id === deuda_anual_id);
    if (deuda) {
      const nuevoSaldo = Math.max(0, deuda.saldo - monto);
      await supabase.from('deudas_anuales').update({ saldo: nuevoSaldo, pagado: nuevoSaldo === 0 }).eq('id', deuda_anual_id);
    }
    const cobrador = data.cobradores.find(c => c.id === cobrador_id);
    if (cobrador) {
      await supabase.from('cobradores').update({
        total_cobrado: cobrador.total_cobrado + monto,
        cobranzas_registradas: cobrador.cobranzas_registradas + 1,
      }).eq('id', cobrador_id);
    }
    await cargarTodo();
    return cz;
  };

  const eliminarCobranza = async (cobranza) => {
    const { error } = await supabase.from('cobranzas').delete().eq('id', cobranza.id);
    if (error) throw error;
    if (cobranza.deuda_anual_id) {
      const deuda = data.deudasAnuales.find(d => d.id === cobranza.deuda_anual_id);
      if (deuda) {
        await supabase.from('deudas_anuales').update({
          saldo: Math.min(deuda.importe, deuda.saldo + cobranza.monto), pagado: false,
        }).eq('id', cobranza.deuda_anual_id);
      }
    }
    const cobrador = data.cobradores.find(c => c.id === cobranza.cobrador_id);
    if (cobrador) {
      await supabase.from('cobradores').update({
        total_cobrado: Math.max(0, cobrador.total_cobrado - cobranza.monto),
        cobranzas_registradas: Math.max(0, cobrador.cobranzas_registradas - 1),
      }).eq('id', cobrador_id);
    }
    await cargarTodo();
  };

  const generarDeudasAnio = async (anio) => {
    const { error } = await supabase.rpc('generar_deudas_anuales', { p_anio: anio });
    if (error) throw error;
    await cargarTodo();
  };

  const agregarDeudaManual = async ({ miembro_id, anio, importe }) => {
    const { data: row, error } = await supabase.from('deudas_anuales')
      .insert([{ miembro_id, anio, importe, saldo: importe, pagado: false }])
      .select().single();
    if (error) throw error;
    await cargarTodo();
    return row;
  };

  return {
    data, loading, error, cargarTodo,
    agregarTemplo, eliminarTemplo,
    actualizarCuotas,
    agregarMiembro, eliminarMiembro,
    agregarCobrador, eliminarCobrador,
    registrarCobranza, eliminarCobranza,
    generarDeudasAnio, agregarDeudaManual,
  };
}
