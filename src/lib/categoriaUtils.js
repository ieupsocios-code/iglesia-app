/**
 * Calcula la edad en años completos a partir de una fecha de nacimiento.
 * @param {string|Date} fechaNac - Fecha en formato 'yyyy-mm-dd' o Date
 * @returns {number|null} edad en años o null si la fecha es inválida
 */
export function calcularEdad(fechaNac) {
  if (!fechaNac) return null;
  const nac  = new Date(fechaNac);
  if (isNaN(nac)) return null;
  const hoy  = new Date();
  let edad   = hoy.getFullYear() - nac.getFullYear();
  const m    = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

/**
 * Determina la categoría según la edad.
 * Hasta 17 años inclusive → 'menor'
 * 18 años en adelante    → 'mayor'
 * Sin fecha              → 'mayor' (por defecto)
 */
export function categoriaSegunEdad(fechaNac) {
  const edad = calcularEdad(fechaNac);
  if (edad === null) return 'mayor'; // sin dato → mayor por defecto
  return edad <= 17 ? 'menor' : 'mayor';
}

/**
 * Convierte fecha d/m/yyyy o d-m-yyyy a yyyy-mm-dd para la BD.
 */
export function parsearFecha(str) {
  if (!str) return null;
  const limpio = str.trim();
  // Intentar d/m/yyyy o d-m-yyyy
  const sep = limpio.includes('/') ? '/' : '-';
  const partes = limpio.split(sep);
  if (partes.length === 3) {
    const [d, m, a] = partes;
    if (a.length === 4) {
      const iso = `${a}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      if (!isNaN(Date.parse(iso))) return iso;
    }
    // Podría venir yyyy-mm-dd
    if (d.length === 4) {
      const iso = `${d}-${m.padStart(2,'0')}-${a.padStart(2,'0')}`;
      if (!isNaN(Date.parse(iso))) return iso;
    }
  }
  return null;
}

/**
 * Etiqueta legible de la categoría.
 */
export function labelCategoria(categoria, fechaNac) {
  const edad = calcularEdad(fechaNac);
  const cat  = categoria === 'menor' ? 'Menor' : 'Mayor';
  return edad !== null ? `${cat} (${edad} años)` : cat;
}
