// v2.0 - calculo de edad para categoria + match de templos robusto
import React, { useState, useRef } from 'react';
import { Card, CardHeader, Button, Badge, Toast } from '../components/UI';
import { supabase } from '../lib/supabaseClient';
import { categoriaSegunEdad, parsearFecha, calcularEdad } from '../lib/categoriaUtils';

function normalizarTexto(t) {
  return (t || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchTemplo(temploCSV, templos) {
  if (!temploCSV || !templos.length) return null;
  const norm = normalizarTexto(temploCSV);

  // 1. Coincidencia exacta (normalizada)
  let match = templos.find(t => normalizarTexto(t.nombre) === norm);
  if (match) return match;

  // 2. El CSV contiene el nombre del templo
  match = templos.find(t => norm.includes(normalizarTexto(t.nombre)));
  if (match) return match;

  // 3. El nombre del templo contiene lo que dice el CSV
  match = templos.find(t => normalizarTexto(t.nombre).includes(norm));
  if (match) return match;

  // 4. Cualquier palabra del CSV de más de 3 letras aparece en el nombre
  const palabras = norm.split(/\s+/).filter(p => p.length > 3);
  for (const p of palabras) {
    match = templos.find(t => normalizarTexto(t.nombre).includes(p));
    if (match) return match;
  }

  return null;
}

function parsearCSV(texto) {
  const lineas = texto.split('\n').filter(l => l.trim());
  if (lineas.length < 2) return [];
  const sep = lineas[0].includes('\t') ? '\t' : ',';

  const encabezados = lineas[0].split(sep).map(h =>
    h.trim().replace(/^"|"$/g, '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  );

  return lineas.slice(1).map(linea => {
    const valores = linea.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    encabezados.forEach((h, i) => { obj[h] = valores[i] || ''; });
    return obj;
  }).filter(r => Object.values(r).some(v => v.trim()));
}

function mapearMiembro(row, templos, configuracion) {
  const get = (...keys) => {
    for (const k of keys) {
      const found = Object.keys(row).find(rk =>
        rk === k || rk.includes(k) || k.includes(rk)
      );
      if (found && row[found]?.trim()) return row[found].trim();
    }
    return '';
  };

  const apellido    = get('apellidos', 'apellido');
  const nombres     = get('nombres', 'nombre');
  const nombre      = [apellido, nombres].filter(Boolean).join(' ');
  const nroSocio    = get('n_de_socio', 'n_socio', 'nro', 'socio', 'numero');
  const temploCSV   = get('templo');
  const fechaNacStr = get('fecha_de_nacimiento', 'fecha_nac', 'nacimiento', 'fecha');
  const fechaNac    = parsearFecha(fechaNacStr);

  // ── Categoría basada en edad ──────────────────────────────
  const categoria = categoriaSegunEdad(fechaNac);
  const edad      = calcularEdad(fechaNac);

  // ── Match de templo ───────────────────────────────────────
  const temploMatch = matchTemplo(temploCSV, templos);
  const cuota = categoria === 'mayor'
    ? configuracion.cuota_mayor
    : configuracion.cuota_menor;

  return {
    nombre:           nombre || '(Sin nombre)',
    apellido,
    categoria,
    edad,
    fecha_nacimiento: fechaNac,
    templo_id:        temploMatch?.id || null,
    templo_csv:       temploCSV,
    deuda:            cuota,
    nro_socio:        nroSocio,
    cuit:             get('cuit'),
    documento:        get('documento', 'dni', 'doc'),
    lugar_nacimiento: get('lugar_de_nacimiento', 'lugar_nac'),
    nacionalidad:     get('nacionalidad') || 'Argentina',
    sexo:             get('sexo'),
    estado_civil:     get('estado_civil'),
    domicilio:        get('domicilio'),
    ciudad:           get('ciudad'),
    provincia:        get('provincia'),
    celular:          get('n_celular', 'celular', 'telefono'),
    email:            get('e_mail', 'email', 'correo'),
    observacion:      get('obsercacion', 'observacion', 'obs'),
    ocupacion:        get('ocupacion'),
  };
}

export default function ImportarMiembros({ data, onImportado }) {
  const { templos, configuracion } = data;
  const [paso, setPaso]           = useState(1);
  const [preview, setPreview]     = useState([]);
  const [errores, setErrores]     = useState([]);
  const [importing, setImporting] = useState(false);
  const [progreso, setProgreso]   = useState(0);
  const [resultado, setResultado] = useState(null);
  const [toast, setToast]         = useState(null);
  const [anioDeuda, setAnioDeuda] = useState(new Date().getFullYear());
  const fileRef = useRef();

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fmt = (n) => n?.toLocaleString('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 0,
  });

  const handleArchivo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const texto = ev.target.result;
      const rows  = parsearCSV(texto);
      if (!rows.length) {
        showToast('No se encontraron datos en el archivo', 'error');
        return;
      }
      const mapeados  = rows.map(r => mapearMiembro(r, templos, configuracion));
      setPreview(mapeados);
      setErrores(mapeados.filter(m => !m.templo_id));
      setPaso(2);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImportar = async () => {
    setImporting(true);
    setProgreso(0);
    let importados = 0, omitidos = 0, errCount = 0;
    const anioActual = parseInt(anioDeuda);
    const validos = preview.filter(m => m.templo_id);

    for (let i = 0; i < validos.length; i++) {
      const m = validos[i];
      setProgreso(Math.round(((i + 1) / validos.length) * 100));
      try {
        // Verificar duplicado por nro_socio o documento
        if (m.nro_socio || m.documento) {
          const filtros = [];
          if (m.nro_socio) filtros.push(`nro_socio.eq.${m.nro_socio}`);
          if (m.documento) filtros.push(`documento.eq.${m.documento}`);
          const { data: existe } = await supabase
            .from('miembros').select('id').or(filtros.join(',')).limit(1);
          if (existe?.length) { omitidos++; continue; }
        }

        const { data: nuevo, error } = await supabase.from('miembros').insert([{
          nombre:           m.nombre,
          apellido:         m.apellido,
          categoria:        m.categoria,
          templo_id:        m.templo_id,
          deuda:            m.deuda,
          nro_socio:        m.nro_socio  || null,
          cuit:             m.cuit       || null,
          documento:        m.documento  || null,
          fecha_nacimiento: m.fecha_nacimiento || null,
          lugar_nacimiento: m.lugar_nacimiento || null,
          nacionalidad:     m.nacionalidad || 'Argentina',
          sexo:             m.sexo       || null,
          estado_civil:     m.estado_civil || null,
          domicilio:        m.domicilio  || null,
          ciudad:           m.ciudad     || null,
          provincia:        m.provincia  || null,
          celular:          m.celular    || null,
          email:            m.email      || null,
          observacion:      m.observacion || null,
          ocupacion:        m.ocupacion  || null,
        }]).select().single();

        if (error) throw error;

        await supabase.from('deudas_anuales').insert([{
          miembro_id: nuevo.id,
          anio:       anioActual,
          importe:    m.deuda,
          saldo:      m.deuda,
          pagado:     false,
        }]);

        importados++;
      } catch (e) {
        console.error('Error importando', m.nombre, e);
        errCount++;
      }
    }

    setResultado({ importados, omitidos, errores: errCount, total: validos.length });
    setPaso(3);
    setImporting(false);
    if (onImportado) onImportado();
  };

  const conTemplo    = preview.filter(m => m.templo_id);
  const sinTemplo    = preview.filter(m => !m.templo_id);
  const menoresCount = conTemplo.filter(m => m.categoria === 'menor').length;
  const mayoresCount = conTemplo.filter(m => m.categoria === 'mayor').length;

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>Importar miembros</h2>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 2 }}>
          Desde Google Sheets exportado como CSV
        </div>
      </div>

      {/* Pasos */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {['Subir archivo', 'Vista previa', 'Resultado'].map((label, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: paso > i + 1 ? 'var(--success)' : paso === i + 1 ? 'var(--navy)' : 'var(--gray-200)',
              color: paso >= i + 1 ? 'var(--white)' : 'var(--gray-400)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
            }}>{paso > i + 1 ? '✓' : i + 1}</div>
            <span style={{ fontSize: 13, color: paso === i + 1 ? 'var(--navy)' : 'var(--gray-400)', fontWeight: paso === i + 1 ? 600 : 400 }}>
              {label}
            </span>
            {i < 2 && <div style={{ width: 24, height: 1, background: 'var(--gray-200)' }} />}
          </div>
        ))}
      </div>

      {/* Paso 1 */}
      {paso === 1 && (
        <Card>
          <CardHeader title="Subir archivo CSV" subtitle="Exportado desde Google Sheets" />
          <div style={{ padding: '24px' }}>
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.7 }}>
              <strong>Columnas requeridas:</strong> Apellidos, Nombres, templo<br />
              <strong>Categoría:</strong> se calcula automáticamente — hasta 17 años = Menor, 18+ = Mayor<br />
              <strong>Duplicados:</strong> se omiten socios con el mismo N° socio o documento
            </div>
            <div
              onClick={() => fileRef.current.click()}
              style={{
                border: '2px dashed var(--gray-200)', borderRadius: 12,
                padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.background = 'var(--gray-50)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', marginBottom: 6 }}>
                Click para seleccionar archivo
              </div>
              <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Formatos: .csv, .tsv, .txt</div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleArchivo} style={{ display: 'none' }} />
          </div>
        </Card>
      )}

      {/* Paso 2: Vista previa */}
      {paso === 2 && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 12 }}>
            {[
              { label: 'Total en archivo',      value: preview.length,  color: 'var(--navy)' },
              { label: 'Con templo asignado',   value: conTemplo.length, color: 'var(--success)' },
              { label: 'Sin templo (omitidos)', value: sinTemplo.length, color: 'var(--danger)' },
              { label: 'Mayores (18+)',          value: mayoresCount,    color: 'var(--navy)' },
              { label: 'Menores (≤17)',          value: menoresCount,    color: 'var(--warning)' },
            ].map(item => (
              <div key={item.label} style={{
                background: 'var(--white)', border: '1px solid var(--gray-200)',
                borderRadius: 12, padding: '14px 16px',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gray-400)' }}>{item.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: item.color, marginTop: 4, fontFamily: 'Georgia, serif' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Templos sin match */}
          {sinTemplo.length > 0 && (
            <Card>
              <CardHeader title="⚠ Sin templo asignado" subtitle="Serán omitidos" />
              <div style={{ padding: '0 0 8px' }}>
                {[...new Set(sinTemplo.map(m => m.templo_csv))].map(t => (
                  <div key={t} style={{ padding: '10px 24px', borderBottom: '1px solid var(--gray-100)', fontSize: 13 }}>
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>"{t}"</span>
                    <span style={{ color: 'var(--gray-400)', marginLeft: 8 }}>→ no coincide con ningún templo registrado</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Año de deuda */}
          <Card>
            <CardHeader title="Año de deuda inicial" />
            <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="number" min="2000" max="2099" value={anioDeuda}
                onChange={e => setAnioDeuda(e.target.value)} style={{ width: 120 }} />
              <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>
                Mayores: {fmt(configuracion.cuota_mayor)} · Menores: {fmt(configuracion.cuota_menor)}
              </span>
            </div>
          </Card>

          {/* Tabla preview */}
          <Card>
            <CardHeader title={`Primeros ${Math.min(preview.length, 10)} registros`} />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                    {['N° Socio','Nombre','Edad','Categoría','Templo CSV','Templo asignado','Estado'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 10).map((m, i) => {
                    const templo = templos.find(t => t.id === m.templo_id);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                        <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 11 }}>{m.nro_socio || '—'}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--navy)' }}>{m.nombre}</td>
                        <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--gray-600)' }}>
                          {m.edad !== null ? `${m.edad} años` : '—'}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <Badge variant={m.categoria}>
                            {m.categoria === 'mayor' ? 'Mayor' : 'Menor'}
                          </Badge>
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--gray-400)' }}>{m.templo_csv || '—'}</td>
                        <td style={{ padding: '9px 12px', fontSize: 11 }}>{templo?.nombre || '—'}</td>
                        <td style={{ padding: '9px 12px' }}>
                          {m.templo_id
                            ? <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: 11 }}>✓ OK</span>
                            : <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 11 }}>✗ Sin templo</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Progreso */}
          {importing && (
            <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: 'var(--navy)' }}>Importando…</span>
                <span style={{ color: 'var(--gray-400)' }}>{progreso}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progreso}%`, background: 'var(--navy)', borderRadius: 99, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={() => { setPaso(1); setPreview([]); setErrores([]); }}>← Volver</Button>
            <Button
              variant="gold"
              onClick={handleImportar}
              disabled={importing || conTemplo.length === 0}
            >
              {importing
                ? `Importando… ${progreso}%`
                : `Importar ${conTemplo.length} miembros (${mayoresCount} mayores · ${menoresCount} menores)`
              }
            </Button>
          </div>
        </div>
      )}

      {/* Paso 3: Resultado */}
      {paso === 3 && resultado && (
        <Card>
          <div style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>
              {resultado.errores === 0 ? '✅' : '⚠️'}
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', marginBottom: 24 }}>
              Importación completada
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, maxWidth: 480, margin: '0 auto 32px' }}>
              <div style={{ background: 'var(--success-bg)', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--success)' }}>{resultado.importados}</div>
                <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>Importados</div>
              </div>
              <div style={{ background: 'var(--warning-bg)', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--warning)' }}>{resultado.omitidos}</div>
                <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 4 }}>Duplicados omitidos</div>
              </div>
              <div style={{ background: resultado.errores > 0 ? 'var(--danger-bg)' : 'var(--gray-50)', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: resultado.errores > 0 ? 'var(--danger)' : 'var(--gray-400)' }}>{resultado.errores}</div>
                <div style={{ fontSize: 12, color: resultado.errores > 0 ? 'var(--danger)' : 'var(--gray-400)', marginTop: 4 }}>Errores</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="ghost" onClick={() => { setPaso(1); setPreview([]); setErrores([]); setResultado(null); }}>
                Importar otro archivo
              </Button>
              <Button onClick={() => onImportado && onImportado()}>
                Ver miembros →
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
