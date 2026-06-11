/* ═══════════════════════════════════════════════════════════════════
   APP.JS — Lógica principal de la vista pública
   CupFutsal Caspe 2026
   ─────────────────────────────────────────────────────────────────
   Secciones:
   1. Imports y constantes
   2. Estado de la app
   3. Utilidades de datos (round-robin, clasificación)
   4. Inicialización de datos en Firebase
   5. Lógica de carga de categoría (Firestore listener)
   6. Renderizado: Resultados
   7. Renderizado: Clasificación
   8. Renderizado: Próximos partidos
   9. Renderizado: Eliminatoria
   10. Navegación por categorías
   11. Animaciones (scroll reveal)
   12. Bootstrap / arranque
   ═══════════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────
   1. IMPORTS Y CONSTANTES
─────────────────────────────────────────────── */
import { db, isFirebaseConfigured } from './firebase-config.js';
import {
  doc, getDoc, setDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Importar módulo admin (inicializa el panel de administración)
import './admin.js';

// IDs de las 6 categorías
export const CATEGORIAS = ['benjamin', 'alevin', 'infantil', 'cadete', 'juvenilsenior'];

// Nombres de los días tal como se mostrarán en la web
export const DIAS = {
  viernes: 'Viernes 24',
  sabado:  'Sábado 25'
};

/* ───────────────────────────────────────────────
   2. ESTADO DE LA APP
─────────────────────────────────────────────── */
let categoriaActual  = 'benjamin'; // pestaña activa por defecto
let unsubscribeFn    = null;      // función para cancelar el listener de Firestore

/* ───────────────────────────────────────────────
   3. UTILIDADES DE DATOS
─────────────────────────────────────────────── */

/**
 * Genera los partidos round-robin para un grupo de 5 equipos.
 * Cada equipo juega contra los otros 4 → 10 partidos por grupo.
 * @param {string} grupo  'A' o 'B'
 * @returns {Array} Array de objetos partido
 */
export function generarRoundRobin(grupo) {
  const partidos = [];
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      partidos.push({
        id:           `${grupo}_${i}_${j}`,
        grupo:        grupo,
        localIdx:     i,
        visitanteIdx: j,
        golLocal:     null,
        golVisitante: null,
        jugado:       false,
        dia:          null,
        hora:         null
      });
    }
  }
  return partidos; // 10 partidos
}

/**
 * Obtiene el nombre de un equipo por su grupo e índice.
 * @param {object} equipos  { grupoA: [...], grupoB: [...] }
 * @param {string} grupo    'A' o 'B'
 * @param {number} idx      0–4
 * @returns {string}
 */
export function getNombreEquipo(equipos, grupo, idx) {
  return grupo === 'A'
    ? (equipos?.grupoA?.[idx] ?? `Equipo ${idx + 1}`)
    : (equipos?.grupoB?.[idx] ?? `Equipo ${idx + 6}`);
}

export function getLogoEquipo(equipos, grupo, idx) {
  const key = grupo === 'A' ? 'logosA' : 'logosB';
  return equipos?.[key]?.[idx] || null;
}

function logoHtml(url, nombre, lado) {
  const inicial = escHtml((nombre || '?')[0].toUpperCase());
  const img = url
    ? `<img class="eq-logo" src="${escHtml(url)}" alt="" loading="lazy" aria-hidden="true">`
    : `<span class="eq-logo eq-logo-inicial" aria-hidden="true">${inicial}</span>`;
  return lado === 'local'
    ? `<span class="eq-logo-nombre">${escHtml(nombre)}</span>${img}`
    : `${img}<span class="eq-logo-nombre">${escHtml(nombre)}</span>`;
}

/**
 * Calcula la clasificación de un grupo a partir de los partidos jugados.
 * Criterios de desempate: Pts → DG → GF → nombre alfabético.
 * @param {object} equipos
 * @param {Array}  partidos
 * @param {string} grupo     'A' o 'B'
 * @returns {Array} Tabla ordenada
 */
export function calcularClasificacion(equipos, partidos, grupo) {
  const nombresGrupo = grupo === 'A' ? (equipos?.grupoA ?? []) : (equipos?.grupoB ?? []);
  const tabla = nombresGrupo.map((nombre, idx) => ({
    nombre, idx, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0
  }));

  const partidosGrupo = (partidos ?? []).filter(p => p.grupo === grupo && p.jugado);

  for (const partido of partidosGrupo) {
    const local     = tabla[partido.localIdx];
    const visitante = tabla[partido.visitanteIdx];
    if (!local || !visitante) continue;

    const gl = Number(partido.golLocal)     ?? 0;
    const gv = Number(partido.golVisitante) ?? 0;

    local.pj++;     visitante.pj++;
    local.gf  += gl; local.gc  += gv;
    visitante.gf += gv; visitante.gc += gl;

    if (gl > gv) {
      local.g++;     local.pts     += 3;
      visitante.p++;
    } else if (gl < gv) {
      visitante.g++; visitante.pts += 3;
      local.p++;
    } else {
      local.e++;     local.pts++;
      visitante.e++; visitante.pts++;
    }
  }

  tabla.forEach(t => { t.dg = t.gf - t.gc; });
  tabla.sort((a, b) =>
    b.pts  - a.pts  ||
    b.dg   - a.dg   ||
    b.gf   - a.gf   ||
    a.nombre.localeCompare(b.nombre, 'es')
  );

  return tabla;
}

/**
 * Determina el ganador de un partido de eliminatoria.
 * Devuelve el nombre del equipo ganador, o null si no se ha jugado.
 */
function getGanador(equipoLocal, equipoVisitante, golLocal, golVisitante) {
  if (golLocal === null || golLocal === undefined) return null;
  const gl = Number(golLocal);
  const gv = Number(golVisitante);
  if (gl > gv) return equipoLocal;
  if (gv > gl) return equipoVisitante;
  return null; // empate (no debería ocurrir en eliminatoria)
}

/* ───────────────────────────────────────────────
   4. INICIALIZACIÓN DE DATOS POR DEFECTO
─────────────────────────────────────────────── */

/**
 * Genera los datos por defecto para una categoría cuando aún no existen en Firestore.
 * @param {string} categoriaId
 * @returns {object} Documento inicial
 */
export function generarDatosIniciales(categoriaId) {
  return {
    equipos: categoriaId === 'juvenilsenior'
      ? {
          grupoA: ['Equipo 1', 'Equipo 2', 'Equipo 3', 'Equipo 4', 'Equipo 5', 'Equipo 11'],
          grupoB: ['Equipo 6', 'Equipo 7', 'Equipo 8', 'Equipo 9', 'Equipo 10', 'Equipo 12']
        }
      : {
          grupoA: ['Equipo 1', 'Equipo 2', 'Equipo 3', 'Equipo 4', 'Equipo 5'],
          grupoB: ['Equipo 6', 'Equipo 7', 'Equipo 8', 'Equipo 9', 'Equipo 10']
        },
    partidos: [
      ...generarRoundRobin('A'),
      ...generarRoundRobin('B')
    ],
    eliminatoria: {
      sf1: {
        equipoLocal:      null,
        equipoVisitante:  null,
        golLocal:         null,
        golVisitante:     null,
        jugado:           false,
        dia:              null,
        hora:             null
      },
      sf2: {
        equipoLocal:      null,
        equipoVisitante:  null,
        golLocal:         null,
        golVisitante:     null,
        jugado:           false,
        dia:              null,
        hora:             null
      },
      final: {
        equipoLocal:      null,
        equipoVisitante:  null,
        golLocal:         null,
        golVisitante:     null,
        jugado:           false,
        dia:              null,
        hora:             null
      }
    }
  };
}

/**
 * Asegura que existe el documento de la categoría en Firestore.
 * Si no existe, lo crea con los datos por defecto.
 */
async function asegurarCategoriaInicializada(categoriaId) {
  const ref  = doc(db, 'torneos', 'caspe2026', 'categorias', categoriaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, generarDatosIniciales(categoriaId));
  }
}

/* ───────────────────────────────────────────────
   5. CARGA DE CATEGORÍA — Firestore real-time
─────────────────────────────────────────────── */

/**
 * Cambia la categoría activa: cancela el listener anterior y suscribe al nuevo.
 * Si los datos no existen en Firestore, los inicializa primero.
 */
async function cargarCategoria(categoriaId) {
  // Cancelar listener previo
  if (unsubscribeFn) {
    unsubscribeFn();
    unsubscribeFn = null;
  }

  mostrarCargando(true);

  try {
    await asegurarCategoriaInicializada(categoriaId);

    const ref = doc(db, 'torneos', 'caspe2026', 'categorias', categoriaId);
    unsubscribeFn = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        mostrarCargando(false);
        renderizarTodo(data);
      } else {
        mostrarError('No se encontraron datos para esta categoría.');
      }
    }, (err) => {
      console.error('Error Firestore:', err);
      mostrarError('Error de conexión con Firebase. Revisa la configuración.');
    });

  } catch (err) {
    console.error('Error al inicializar categoría:', err);
    mostrarError('No se pudo conectar a Firebase. Verifica tus credenciales en js/firebase-config.js');
  }
}

/* ───────────────────────────────────────────────
   6. RENDERIZADO: RESULTADOS
─────────────────────────────────────────────── */
function renderizarResultados(data) {
  const container = document.getElementById('resultados-container');
  const section   = document.getElementById('seccion-resultados');
  if (!container) return;

  const { equipos, partidos } = data;
  const jugados = (partidos ?? []).filter(p => p.jugado);

  section.classList.remove('hidden');

  if (!jugados.length) {
    container.innerHTML = `
      <p class="empty-msg">
        Aún no hay resultados. ¡Vuelve pronto!
      </p>`;
    return;
  }

  // Ordenar: primero los del día viernes, luego sábado, luego sin día
  const ordenDia = { viernes: 0, sabado: 1 };
  jugados.sort((a, b) => {
    const da = ordenDia[a.dia] ?? 2;
    const db = ordenDia[b.dia] ?? 2;
    if (da !== db) return da - db;
    // Misma hora → orden por hora
    return (a.hora ?? '').localeCompare(b.hora ?? '');
  });

  const html = jugados.map(p => {
    const local     = getNombreEquipo(equipos, p.grupo, p.localIdx);
    const visitante = getNombreEquipo(equipos, p.grupo, p.visitanteIdx);
    const gl        = p.golLocal     ?? 0;
    const gv        = p.golVisitante ?? 0;
    const gLocal    = Number(gl);
    const gVisit    = Number(gv);
    const localWin  = gLocal  > gVisit;
    const visitWin  = gVisit  > gLocal;

    return `
      <div class="partido-card reveal">
        <span class="partido-grupo-badge">Grupo ${p.grupo}</span>
        <span class="partido-equipo local ${localWin ? 'text-gold' : ''}">
          ${logoHtml(getLogoEquipo(equipos, p.grupo, p.localIdx), local, 'local')}
        </span>
        <span class="partido-marcador">${gl} – ${gv}</span>
        <span class="partido-equipo visitante ${visitWin ? 'text-gold' : ''}">
          ${logoHtml(getLogoEquipo(equipos, p.grupo, p.visitanteIdx), visitante, 'visitante')}
        </span>
      </div>`;
  }).join('');

  container.innerHTML = html;
  setupReveal(container);
}

/* ───────────────────────────────────────────────
   7. RENDERIZADO: CLASIFICACIÓN
─────────────────────────────────────────────── */
function renderizarClasificacion(data) {
  const container = document.getElementById('clasificacion-container');
  const section   = document.getElementById('seccion-clasificacion');
  if (!container) return;

  section.classList.remove('hidden');

  const grupos = ['A', 'B'];
  container.innerHTML = grupos.map(grupo => {
    const tabla = calcularClasificacion(data.equipos, data.partidos, grupo);
    return `
      <div class="clasificacion-grupo reveal">
        <h3 class="grupo-titulo">Grupo ${grupo}</h3>
        <div class="tabla-wrapper">
          <table class="tabla-clasificacion" aria-label="Clasificación Grupo ${grupo}">
            <thead>
              <tr>
                <th>Equipo</th>
                <th title="Partidos Jugados">PJ</th>
                <th title="Ganados">G</th>
                <th title="Empatados">E</th>
                <th title="Perdidos">P</th>
                <th title="Goles a Favor">GF</th>
                <th title="Goles en Contra">GC</th>
                <th title="Diferencia de Goles">DG</th>
                <th title="Puntos">Pts</th>
              </tr>
            </thead>
            <tbody>
              ${tabla.map((equipo, pos) => `
                <tr>
                  <td class="celda-equipo">${escHtml(equipo.nombre)}</td>
                  <td>${equipo.pj}</td>
                  <td>${equipo.g}</td>
                  <td>${equipo.e}</td>
                  <td>${equipo.p}</td>
                  <td>${equipo.gf}</td>
                  <td>${equipo.gc}</td>
                  <td>${equipo.dg > 0 ? '+' : ''}${equipo.dg}</td>
                  <td class="celda-pts">${equipo.pts}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="tabla-leyenda">● Clasificados para semifinales</p>
      </div>`;
  }).join('');

  setupReveal(container);
}

/* ───────────────────────────────────────────────
   8. RENDERIZADO: PRÓXIMOS PARTIDOS
─────────────────────────────────────────────── */
function renderizarProximos(data) {
  const container = document.getElementById('proximos-container');
  const section   = document.getElementById('seccion-proximos');
  if (!container) return;

  section.classList.remove('hidden');
  const { equipos, partidos } = data;
  const pendientes = (partidos ?? []).filter(p => !p.jugado);

  if (!pendientes.length) {
    container.innerHTML = `
      <p class="empty-msg">
        ¡Todos los partidos de grupo han sido jugados!
      </p>`;
    return;
  }

  // Ordenar: con hora primero, luego sin hora; dentro de cada grupo por día y hora
  const ordenDia = { viernes: 0, sabado: 1 };
  const conHora    = pendientes.filter(p => p.hora).sort((a, b) => {
    const da = ordenDia[a.dia] ?? 2;
    const db = ordenDia[b.dia] ?? 2;
    if (da !== db) return da - db;
    return (a.hora ?? '').localeCompare(b.hora ?? '');
  });
  const sinHora = pendientes.filter(p => !p.hora);
  const ordenados = [...conHora, ...sinHora];

  const html = ordenados.map(p => {
    const local     = getNombreEquipo(equipos, p.grupo, p.localIdx);
    const visitante = getNombreEquipo(equipos, p.grupo, p.visitanteIdx);
    const horaTexto = p.hora ?? '--:--';
    const diaTexto  = p.dia  ? DIAS[p.dia] : 'Por confirmar';

    return `
      <div class="proximo-card reveal">
        <div class="proximo-hora-bloque">
          <span class="proximo-hora">${escHtml(horaTexto)}</span>
          <span class="proximo-dia">${escHtml(diaTexto)}</span>
        </div>
        <div class="proximo-partido-grid">
          <span class="partido-equipo local">
            ${logoHtml(getLogoEquipo(equipos, p.grupo, p.localIdx), local, 'local')}
          </span>
          <span class="partido-marcador pendiente">vs</span>
          <span class="partido-equipo visitante">
            ${logoHtml(getLogoEquipo(equipos, p.grupo, p.visitanteIdx), visitante, 'visitante')}
          </span>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = html;
  setupReveal(container);
}

/* ───────────────────────────────────────────────
   9. RENDERIZADO: ELIMINATORIA
─────────────────────────────────────────────── */
function renderizarEliminatoria(data) {
  const container = document.getElementById('eliminatoria-container');
  const section   = document.getElementById('seccion-eliminatoria');
  if (!container) return;

  section.classList.remove('hidden');
  const { equipos, partidos, eliminatoria } = data;

  // Comprobar si todos los partidos de grupo están jugados
  const totalGrupo      = (partidos ?? []).length;
  const jugadosGrupo    = (partidos ?? []).filter(p => p.jugado).length;
  const gruposTerminados = totalGrupo > 0 && jugadosGrupo === totalGrupo;

  // Calcular clasificaciones para derivar cruces SF
  const clasificA = calcularClasificacion(equipos, partidos, 'A');
  const clasificB = calcularClasificacion(equipos, partidos, 'B');

  // SF1: 1º Grupo A vs 2º Grupo B
  // SF2: 1º Grupo B vs 2º Grupo A
  // Usar override manual (equipoLocal/equipoVisitante en Firebase) si están definidos
  const sf1LocalAuto      = gruposTerminados ? (clasificA[0]?.nombre ?? null) : null;
  const sf1VisitanteAuto  = gruposTerminados ? (clasificB[1]?.nombre ?? null) : null;
  const sf2LocalAuto      = gruposTerminados ? (clasificB[0]?.nombre ?? null) : null;
  const sf2VisitanteAuto  = gruposTerminados ? (clasificA[1]?.nombre ?? null) : null;

  const sf1 = eliminatoria?.sf1   ?? {};
  const sf2 = eliminatoria?.sf2   ?? {};
  const fin = eliminatoria?.final ?? {};

  const sf1Local     = sf1.equipoLocal      ?? sf1LocalAuto     ?? null;
  const sf1Visitante = sf1.equipoVisitante  ?? sf1VisitanteAuto ?? null;
  const sf2Local     = sf2.equipoLocal      ?? sf2LocalAuto     ?? null;
  const sf2Visitante = sf2.equipoVisitante  ?? sf2VisitanteAuto ?? null;

  // Ganadores de SF para determinar equipos de la final
  const sf1Ganador = sf1.jugado ? getGanador(sf1Local, sf1Visitante, sf1.golLocal, sf1.golVisitante) : null;
  const sf2Ganador = sf2.jugado ? getGanador(sf2Local, sf2Visitante, sf2.golLocal, sf2.golVisitante) : null;

  const finLocal     = fin.equipoLocal     ?? sf1Ganador ?? null;
  const finVisitante = fin.equipoVisitante ?? sf2Ganador ?? null;
  const campeon      = fin.jugado ? getGanador(finLocal, finVisitante, fin.golLocal, fin.golVisitante) : null;

  const aviso = !gruposTerminados ? (() => {
    const porJugar = totalGrupo - jugadosGrupo;
    return `<p class="pendiente-grupos-msg reveal">
      Los cruces de eliminatoria se definirán cuando terminen los ${porJugar}
      partido${porJugar !== 1 ? 's' : ''} de grupo pendiente${porJugar !== 1 ? 's' : ''}.
    </p>`;
  })() : '';

  const gridHTML = `
    <div class="eliminatoria-grid">
      ${renderBracketCard('SEMIFINAL 1', sf1Local, sf1Visitante, sf1, '🥅')}
      ${renderBracketCard('SEMIFINAL 2', sf2Local, sf2Visitante, sf2, '🥅')}
      ${renderBracketCard('🏆 FINAL',    finLocal,  finVisitante, fin, '🏆', true)}
    </div>`;

  const campeonHTML = campeon ? `
    <div class="campeon-card reveal">
      <span class="campeon-trofeo" aria-label="Trofeo">🏆</span>
      <p class="campeon-label">Campeón</p>
      <p class="campeon-nombre">${escHtml(campeon)}</p>
    </div>` : '';

  container.innerHTML = aviso + gridHTML + campeonHTML;
  setupReveal(container);
}

/**
 * Genera el HTML de una tarjeta de enfrentamiento de eliminatoria.
 */
function renderBracketCard(label, localNombre, visitanteNombre, datos, icono, esFinal = false) {
  const localDisplay     = localNombre     ?? 'Por definir';
  const visitanteDisplay = visitanteNombre ?? 'Por definir';
  const localPorDef      = !localNombre;
  const visitantePorDef  = !visitanteNombre;

  const gl = datos?.golLocal;
  const gv = datos?.golVisitante;
  const jugado = datos?.jugado;

  const localGana    = jugado && gl !== null && Number(gl) > Number(gv);
  const visitanteGana= jugado && gv !== null && Number(gv) > Number(gl);

  const horaTexto  = datos?.hora ? `${DIAS[datos.dia] ?? ''} · ${datos.hora}` : '';

  return `
    <div class="bracket-match-card ${esFinal ? 'final-card' : ''} reveal">
      <div class="bracket-ronda-label ${esFinal ? 'final-label' : ''}">
        ${icono} ${label}
        ${horaTexto ? `<span class="bracket-horario">${escHtml(horaTexto)}</span>` : ''}
      </div>
      <div class="bracket-equipos">
        <span class="bracket-equipo local
          ${localPorDef    ? 'por-definir' : ''}
          ${localGana      ? 'ganador'     : ''}">${escHtml(localDisplay)}</span>
        <span class="bracket-score ${(!jugado || gl === null) ? 'pendiente' : ''}">
          ${jugado && gl !== null ? `${gl} – ${gv}` : 'vs'}
        </span>
        <span class="bracket-equipo visitante
          ${visitantePorDef ? 'por-definir' : ''}
          ${visitanteGana   ? 'ganador'     : ''}">${escHtml(visitanteDisplay)}</span>
      </div>
    </div>`;
}

/* ───────────────────────────────────────────────
   ORQUESTADOR: renderiza todas las secciones
─────────────────────────────────────────────── */
function renderizarTodo(data) {
  // Animar salida suave del contenido anterior
  const main = document.getElementById('main-content');
  main.classList.add('cat-fade-in');
  setTimeout(() => main.classList.remove('cat-fade-in'), 300);

  renderizarResultados(data);
  renderizarClasificacion(data);
  renderizarProximos(data);
  renderizarEliminatoria(data);
}

/* ───────────────────────────────────────────────
   10. NAVEGACIÓN POR CATEGORÍAS
─────────────────────────────────────────────── */
function inicializarNavCategorias() {
  const tabs = document.querySelectorAll('.cat-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const cat = tab.dataset.cat;
      if (cat === categoriaActual) return;

      // Actualizar UI de tabs
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      // Centrar el tab activo en la barra (scroll horizontal)
      tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

      categoriaActual = cat;

      // Ocultar secciones mientras carga
      ocultarSecciones();

      // Cargar nuevos datos
      if (isFirebaseConfigured) {
        cargarCategoria(cat);
      }
    });
  });
}

function ocultarSecciones() {
  ['resultados', 'clasificacion', 'proximos', 'eliminatoria'].forEach(id => {
    const el = document.getElementById(`seccion-${id}`);
    if (el) el.classList.add('hidden');
  });
  mostrarCargando(true);
}

/* ───────────────────────────────────────────────
   11. ANIMACIONES DE SCROLL REVEAL
─────────────────────────────────────────────── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

/**
 * Observa todos los elementos .reveal dentro de un contenedor.
 * Llámala después de renderizar contenido dinámico.
 */
export function setupReveal(container) {
  container.querySelectorAll('.reveal').forEach(el => {
    el.classList.remove('visible');
    revealObserver.observe(el);
  });
}

/* ───────────────────────────────────────────────
   HELPERS DE UI
─────────────────────────────────────────────── */
function mostrarCargando(mostrar) {
  const el = document.getElementById('loading-state');
  const err = document.getElementById('error-state');
  if (el)  el.classList.toggle('hidden', !mostrar);
  if (err) err.classList.add('hidden');
}

function mostrarError(mensaje) {
  const el  = document.getElementById('error-state');
  const msg = document.getElementById('error-message');
  const loading = document.getElementById('loading-state');
  if (loading) loading.classList.add('hidden');
  if (msg) msg.textContent = mensaje;
  if (el)  el.classList.remove('hidden');
  ocultarSecciones();
  mostrarCargando(false);
}

/**
 * Escapa caracteres HTML para evitar XSS en innerHTML.
 */
export function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/* ───────────────────────────────────────────────
   12. BOOTSTRAP
─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar navegación por categorías
  inicializarNavCategorias();

  // Hacer scroll para que la pestaña activa por defecto sea visible
  setTimeout(() => {
    const tabActiva = document.querySelector('.cat-tab.active');
    if (tabActiva) {
      tabActiva.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, 100);

  // Cargar datos o mostrar aviso si Firebase no está configurado
  if (!isFirebaseConfigured) {
    mostrarError(
      'Firebase no está configurado. Abre js/firebase-config.js y rellena tus credenciales.'
    );
    return;
  }

  // Cargar la categoría por defecto
  cargarCategoria(categoriaActual);
});
