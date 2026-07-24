/* ═══════════════════════════════════════════════════════════════════
   APP.JS — Lógica principal de la vista pública
   CupFutsal Caspe 2026
   ─────────────────────────────────────────────────────────────────
   Secciones:
   1. Imports y constantes
   2. Estado de la app
   3. Utilidades de datos (clasificación)
   4. Datos iniciales por categoría (equipos, partidos, eliminatoria)
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

// IDs de las 2 categorías del torneo
export const CATEGORIAS = ['infantil', 'juvenilsenior'];

export const CATEGORIA_LABELS = {
  infantil:      'Infantil',
  juvenilsenior: 'Juvenil / Sénior'
};

// Nombres de los días tal como se mostrarán en la web
export const DIAS = {
  viernes: 'Viernes 24',
  sabado:  'Sábado 25'
};

// Grupos de cada categoría (clave interna + etiqueta visible)
export const GRUPOS_CATEGORIA = {
  infantil: [
    { key: 'A', nombre: 'Grupo Único' }
  ],
  juvenilsenior: [
    { key: 'G1', nombre: 'Grupo 1' },
    { key: 'G2', nombre: 'Grupo 2' },
    { key: 'G3', nombre: 'Grupo 3' }
  ]
};

// Rondas de la fase eliminatoria de cada categoría (asignación manual de equipos)
export const ELIMINATORIA_CATEGORIA = {
  infantil: [
    { key: 'cuartos1',  label: 'Cuartos de Final' },
    { key: 'cuartos2',  label: 'Cuartos de Final' },
    { key: 'semifinal', label: 'Semifinal' },
    { key: 'final',     label: 'Final Infantil', esFinal: true }
  ],
  juvenilsenior: [
    { key: 'cuartos1',     label: 'Cuartos de Final' },
    { key: 'cuartos2',     label: 'Cuartos de Final' },
    { key: 'semifinalB',   label: 'Semifinal B' },
    { key: 'tercerpuesto', label: '3º y 4º puesto' },
    { key: 'final',        label: 'Final Sénior', esFinal: true }
  ]
};

/* ───────────────────────────────────────────────
   2. ESTADO DE LA APP
─────────────────────────────────────────────── */
let categoriaActual  = 'infantil'; // pestaña activa por defecto
let unsubscribeFn    = null;      // función para cancelar el listener de Firestore

/* ───────────────────────────────────────────────
   3. UTILIDADES DE DATOS
─────────────────────────────────────────────── */

/**
 * Obtiene el nombre de un equipo por su grupo e índice.
 * @param {object} equipos  { [grupoKey]: [...nombres] }
 * @param {string} grupo    clave del grupo
 * @param {number} idx
 * @returns {string}
 */
export function getNombreEquipo(equipos, grupo, idx) {
  return equipos?.[grupo]?.[idx] ?? `Equipo ${idx + 1}`;
}

export function getLogoEquipo(logos, grupo, idx) {
  return logos?.[`${grupo}_${idx}`] || null;
}

function logoHtml(url, nombre, lado) {
  const inicial = escHtml((nombre || '?')[0].toUpperCase());
  const fallback = `this.outerHTML='<span class=\\'eq-logo eq-logo-inicial\\' aria-hidden=\\'true\\'>${inicial}</span>'`;
  const img = url
    ? `<img class="eq-logo" src="${escHtml(url)}" alt="" loading="lazy" aria-hidden="true" onerror="${fallback}">`
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
 * @param {string} grupo     clave del grupo
 * @returns {Array} Tabla ordenada
 */
export function calcularClasificacion(equipos, partidos, grupo) {
  const nombresGrupo = equipos?.[grupo] ?? [];
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
   4. DATOS INICIALES POR CATEGORÍA
─────────────────────────────────────────────── */

let contadorPartido = 0;

/** Crea un objeto partido con id autogenerado. */
function crearPartido(grupo, localIdx, visitanteIdx, dia, hora, pista) {
  contadorPartido++;
  return {
    id: `${grupo}_${contadorPartido}`,
    grupo, localIdx, visitanteIdx,
    golLocal: null, golVisitante: null,
    jugado: false,
    dia, hora, pista
  };
}

/** Crea un slot vacío de eliminatoria (equipos y horario definidos manualmente por el admin). */
function crearSlotEliminatoria(dia, hora, pista) {
  return {
    equipoLocal: null, equipoVisitante: null,
    golLocal: null, golVisitante: null,
    jugado: false,
    dia: dia ?? null, hora: hora ?? null, pista: pista ?? null
  };
}

/**
 * Genera los datos iniciales de la categoría INFANTIL:
 * Grupo único de 4 equipos (FUT TEAM, Filósofos, Cojos United, Mástercher Piti),
 * round-robin completo (6 partidos, repartidos entre viernes y sábado) + eliminatoria.
 */
function datosInicialesInfantil() {
  contadorPartido = 0;
  // idx: 0 FUT TEAM · 1 Filósofos · 2 Cojos United · 3 Mástercher Piti
  const equipos = { A: ['FUT TEAM', 'Filósofos', 'Cojos United', 'Mástercher Piti'] };
  const logos = {
    A_0: 'logosequipos/futteam.jpg',
    A_1: 'logosequipos/filosofos.jpg',
    A_3: 'logosequipos/manchesterpiti.jpg'
  };
  const partidos = [
    crearPartido('A', 0, 1, 'viernes', '18:40', 'Pista 1'),
    crearPartido('A', 0, 2, 'viernes', '20:00', 'Pista 1'),
    crearPartido('A', 1, 2, 'viernes', '21:20', 'Pista 1'),
    crearPartido('A', 3, 0, 'sabado',  '13:00', 'Pista 1'),
    crearPartido('A', 3, 1, 'sabado',  '15:00', 'Pista 1'),
    crearPartido('A', 3, 2, 'sabado',  '16:20', 'Pista 1')
  ];
  const eliminatoria = {
    cuartos1:  crearSlotEliminatoria('sabado', '17:00', 'Pista 1'),
    cuartos2:  crearSlotEliminatoria('sabado', '17:40', 'Pista 1'),
    semifinal: crearSlotEliminatoria('sabado', '18:20', 'Pista 1'),
    final:     crearSlotEliminatoria('sabado', '20:00', 'Pista 1')
  };
  return { equipos, logos, partidos, eliminatoria };
}

/**
 * Genera los datos iniciales de la categoría JUVENIL/SÉNIOR:
 * 3 grupos con round-robin completo (viernes + sesión de noche) + eliminatoria del sábado.
 */
function datosInicialesJuvenilSenior() {
  contadorPartido = 0;
  // Grupo 1 — idx: 0 Bar Micaffe · 1 Rocky FC · 2 Miguelín Pipas · 3 Brigavins · 4 Atlas
  // Grupo 2 — idx: 0 Pub Bana 2000 · 1 NoPartyBoys · 2 Insolens · 3 Joga Bonito · 4 Inter Junior
  // Grupo 3 — idx: 0 Racing de Albacete · 1 Real Suciedad FC · 2 La Cantera FC · 3 Masturbinho y sus Apóstoles
  const equipos = {
    G1: ['Bar Micaffe', 'Rocky FC', 'Miguelín Pipas', 'Brigavins', 'Atlas'],
    G2: ['Pub Bana 2000', 'NoPartyBoys', 'Insolens', 'Joga Bonito', 'Inter Junior'],
    G3: ['Racing de Albacete', 'Real Suciedad FC', 'La Cantera FC', 'Masturbinho y sus Apóstoles']
  };
  const logos = {
    G1_0: 'logosequipos/miccafe.png',
    G1_1: 'logosequipos/rockyfc.jpg',
    G1_2: 'logosequipos/miguelinpipas.jpg',
    G1_4: 'logosequipos/atlas.jpg',
    G2_0: 'logosequipos/pubbana.jpg',
    G2_1: 'logosequipos/nopartyboys.jpg',
    G2_2: 'logosequipos/INSOLENS.jpg',
    G2_4: 'logosequipos/interjunior.jpg',
    G3_2: 'logosequipos/lacantera.jpg',
    G3_3: 'logosequipos/masturbinhoysusdiscipulos.jpg'
  };

  const partidos = [
    // ── Grupo 3 — viernes tarde ──
    crearPartido('G3', 0, 1, 'viernes', '18:00', 'Pista 1'),
    crearPartido('G3', 2, 3, 'viernes', '18:00', 'Pista 2'),
    crearPartido('G3', 0, 2, 'viernes', '19:20', 'Pista 1'),
    crearPartido('G3', 1, 3, 'viernes', '19:20', 'Pista 2'),
    crearPartido('G3', 0, 3, 'viernes', '20:40', 'Pista 1'),
    crearPartido('G3', 1, 2, 'viernes', '20:40', 'Pista 2'),

    // ── Grupo Infantil interlazado en Pista 1 (ver categoría Infantil) + Grupo 1 en Pista 2 ──
    crearPartido('G1', 1, 2, 'viernes', '18:40', 'Pista 2'),
    crearPartido('G1', 4, 3, 'viernes', '20:00', 'Pista 2'),
    crearPartido('G1', 0, 1, 'viernes', '21:20', 'Pista 2'),

    // ── Sesión de noche ──
    crearPartido('G2', 0, 1, 'viernes', '22:00', 'Pista 1'),
    crearPartido('G2', 2, 3, 'viernes', '22:00', 'Pista 2'),
    crearPartido('G1', 0, 3, 'viernes', '22:40', 'Pista 1'),
    crearPartido('G1', 2, 4, 'viernes', '22:40', 'Pista 2'),
    crearPartido('G2', 0, 2, 'viernes', '23:20', 'Pista 1'),
    crearPartido('G2', 3, 4, 'viernes', '23:20', 'Pista 2'),
    crearPartido('G1', 0, 2, 'sabado',  '00:00', 'Pista 1'),
    crearPartido('G1', 1, 4, 'sabado',  '00:00', 'Pista 2'),
    crearPartido('G2', 0, 3, 'sabado',  '00:40', 'Pista 1'),
    crearPartido('G2', 1, 4, 'sabado',  '00:40', 'Pista 2'),
    crearPartido('G1', 0, 4, 'sabado',  '01:20', 'Pista 1'),
    crearPartido('G1', 2, 3, 'sabado',  '01:20', 'Pista 2'),
    crearPartido('G2', 0, 4, 'sabado',  '02:00', 'Pista 1'),
    crearPartido('G2', 1, 2, 'sabado',  '02:00', 'Pista 2'),
    crearPartido('G1', 1, 3, 'sabado',  '02:40', 'Pista 1'),
    // 02:40 Pista 2 — pista libre (sin partido)
    crearPartido('G2', 1, 3, 'sabado',  '03:20', 'Pista 1'),
    crearPartido('G2', 2, 4, 'sabado',  '03:20', 'Pista 2')
  ];

  const eliminatoria = {
    cuartos1:     crearSlotEliminatoria('sabado', '17:00', 'Pista 1'),
    cuartos2:     crearSlotEliminatoria('sabado', '17:40', 'Pista 1'),
    semifinalB:   crearSlotEliminatoria('sabado', '19:10', 'Pista 1'),
    tercerpuesto: crearSlotEliminatoria('sabado', '20:40', 'Pista 1'),
    final:        crearSlotEliminatoria('sabado', '21:40', 'Pista 1')
  };

  return { equipos, logos, partidos, eliminatoria };
}

/**
 * Genera los datos por defecto para una categoría cuando aún no existen en Firestore.
 * @param {string} categoriaId
 * @returns {object} Documento inicial
 */
export function generarDatosIniciales(categoriaId) {
  return categoriaId === 'infantil'
    ? datosInicialesInfantil()
    : datosInicialesJuvenilSenior();
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

/** Devuelve una función que traduce la clave de un grupo a su etiqueta visible. */
function grupoLabelPorClave(categoriaId) {
  const grupos = GRUPOS_CATEGORIA[categoriaId] ?? [];
  const mapa = Object.fromEntries(grupos.map(g => [g.key, g.nombre]));
  return (key) => mapa[key] ?? key;
}

/* ───────────────────────────────────────────────
   6. RENDERIZADO: GRUPOS (equipos + clasificación)
─────────────────────────────────────────────── */
function renderizarGrupos(data) {
  const container = document.getElementById('grupos-container');
  const section   = document.getElementById('seccion-grupos');
  if (!container) return;

  section.classList.remove('hidden');

  const logos  = data.logos || {};
  const grupos = GRUPOS_CATEGORIA[categoriaActual] ?? [];

  container.innerHTML = grupos.map(({ key: grupo, nombre }) => {
    const nombresEquipos = data.equipos?.[grupo] ?? [];
    const tabla = calcularClasificacion(data.equipos, data.partidos, grupo);

    const rosterHtml = nombresEquipos.map((nombreEquipo, idx) => {
      const logoUrl = getLogoEquipo(logos, grupo, idx);
      const inicial = escHtml((nombreEquipo || '?')[0].toUpperCase());
      const fallback = `this.outerHTML='<span class=\\'eq-logo eq-logo-inicial\\' aria-hidden=\\'true\\'>${inicial}</span>'`;
      const logoEl = logoUrl
        ? `<img class="eq-logo" src="${escHtml(logoUrl)}" alt="" loading="lazy" aria-hidden="true" onerror="${fallback}">`
        : `<span class="eq-logo eq-logo-inicial" aria-hidden="true">${inicial}</span>`;
      return `<span class="roster-chip">${logoEl}${escHtml(nombreEquipo)}</span>`;
    }).join('');

    return `
      <div class="clasificacion-grupo reveal">
        <h3 class="grupo-titulo">${escHtml(nombre)}</h3>
        <div class="grupo-roster">${rosterHtml}</div>
        <div class="tabla-wrapper">
          <table class="tabla-clasificacion" aria-label="Clasificación ${escHtml(nombre)}">
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
              ${tabla.map((equipo) => {
                const logoUrl = getLogoEquipo(logos, grupo, equipo.idx);
                const inicial = escHtml((equipo.nombre || '?')[0].toUpperCase());
                const fallback = `this.outerHTML='<span class=\\'eq-logo eq-logo-inicial\\' aria-hidden=\\'true\\'>${inicial}</span>'`;
                const logoEl = logoUrl
                  ? `<img class="eq-logo" src="${escHtml(logoUrl)}" alt="" loading="lazy" aria-hidden="true" onerror="${fallback}">`
                  : `<span class="eq-logo eq-logo-inicial" aria-hidden="true">${inicial}</span>`;
                return `
                <tr>
                  <td class="celda-equipo">
                    <span class="celda-equipo-inner">
                      ${logoEl}
                      ${escHtml(equipo.nombre)}
                    </span>
                  </td>
                  <td>${equipo.pj}</td>
                  <td>${equipo.g}</td>
                  <td>${equipo.e}</td>
                  <td>${equipo.p}</td>
                  <td>${equipo.gf}</td>
                  <td>${equipo.gc}</td>
                  <td>${equipo.dg > 0 ? '+' : ''}${equipo.dg}</td>
                  <td class="celda-pts">${equipo.pts}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  setupReveal(container);
}

/* ───────────────────────────────────────────────
   7. RENDERIZADO: HORARIOS (calendario completo + resultados)
─────────────────────────────────────────────── */
function renderizarHorarios(data) {
  const container = document.getElementById('horarios-container');
  const section   = document.getElementById('seccion-horarios');
  if (!container) return;

  section.classList.remove('hidden');

  const { equipos, partidos, logos = {} } = data;
  const todos = [...(partidos ?? [])];

  if (!todos.length) {
    container.innerHTML = `
      <p class="empty-msg">
        Aún no hay partidos programados. ¡Vuelve pronto!
      </p>`;
    return;
  }

  // Ordenar cronológicamente: día → hora. Sin día/hora al final.
  const ordenDia = { viernes: 0, sabado: 1 };
  todos.sort((a, b) => {
    const da = ordenDia[a.dia] ?? 2;
    const db = ordenDia[b.dia] ?? 2;
    if (da !== db) return da - db;
    return (a.hora ?? '').localeCompare(b.hora ?? '');
  });

  const grupoLabel = grupoLabelPorClave(categoriaActual);

  let diaAnterior;
  const filas = todos.map(p => {
    const local     = getNombreEquipo(equipos, p.grupo, p.localIdx);
    const visitante = getNombreEquipo(equipos, p.grupo, p.visitanteIdx);
    const gl = Number(p.golLocal ?? 0);
    const gv = Number(p.golVisitante ?? 0);
    const localWin = p.jugado && gl > gv;
    const visitWin = p.jugado && gv > gl;

    let cabeceraDia = '';
    if (p.dia !== diaAnterior) {
      diaAnterior = p.dia;
      cabeceraDia = `<h3 class="horario-dia-titulo">${escHtml(p.dia ? DIAS[p.dia] : 'Día por confirmar')}</h3>`;
    }

    const badge = `${escHtml(grupoLabel(p.grupo))}${p.pista ? ` · ${escHtml(p.pista)}` : ''}`;

    return `
      ${cabeceraDia}
      <div class="proximo-card horario-card reveal">
        <div class="proximo-hora-bloque">
          <span class="proximo-hora">${escHtml(p.hora ?? '--:--')}</span>
          <span class="proximo-dia">${p.pista ? escHtml(p.pista) : '—'}</span>
        </div>
        <div class="proximo-partido-grid">
          <span class="partido-equipo local ${localWin ? 'text-gold' : ''}">
            ${logoHtml(getLogoEquipo(logos, p.grupo, p.localIdx), local, 'local')}
          </span>
          <span class="partido-marcador ${p.jugado ? '' : 'pendiente'}">
            ${p.jugado ? `${p.golLocal ?? 0} – ${p.golVisitante ?? 0}` : 'vs'}
          </span>
          <span class="partido-equipo visitante ${visitWin ? 'text-gold' : ''}">
            ${logoHtml(getLogoEquipo(logos, p.grupo, p.visitanteIdx), visitante, 'visitante')}
          </span>
        </div>
        <span class="partido-grupo-badge">${badge}</span>
      </div>`;
  }).join('');

  container.innerHTML = filas;
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
  const { eliminatoria = {} } = data;
  const rondas = ELIMINATORIA_CATEGORIA[categoriaActual] ?? [];

  const cardsHTML = rondas.map(({ key, label, esFinal }) => {
    const datos = eliminatoria[key] ?? {};
    return renderBracketCard(label, datos.equipoLocal, datos.equipoVisitante, datos, esFinal ? '🏆' : '🥅', !!esFinal);
  }).join('');

  const finalRonda = rondas.find(r => r.esFinal);
  const finalDatos = finalRonda ? (eliminatoria[finalRonda.key] ?? {}) : {};
  const campeon = finalDatos.jugado
    ? getGanador(finalDatos.equipoLocal, finalDatos.equipoVisitante, finalDatos.golLocal, finalDatos.golVisitante)
    : null;

  const campeonHTML = campeon ? `
    <div class="campeon-card reveal">
      <span class="campeon-trofeo" aria-label="Trofeo">🏆</span>
      <p class="campeon-label">Campeón</p>
      <p class="campeon-nombre">${escHtml(campeon)}</p>
    </div>` : '';

  container.innerHTML = `<div class="eliminatoria-grid">${cardsHTML}</div>${campeonHTML}`;
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

  const pistaTexto = datos?.pista ? ` · ${datos.pista}` : '';
  const horaTexto  = datos?.hora ? `${DIAS[datos.dia] ?? ''} · ${datos.hora}${pistaTexto}` : '';

  return `
    <div class="bracket-match-card ${esFinal ? 'final-card' : ''} reveal">
      <div class="bracket-ronda-label ${esFinal ? 'final-label' : ''}">
        ${icono} ${escHtml(label)}
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

  renderizarGrupos(data);
  renderizarHorarios(data);
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
  ['grupos', 'horarios', 'eliminatoria'].forEach(id => {
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
