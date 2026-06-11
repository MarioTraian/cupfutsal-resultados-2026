/* ═══════════════════════════════════════════════════════════════════
   ADMIN.JS — Panel de administración
   CupFutsal Caspe 2026
   ─────────────────────────────────────────────────────────────────
   Secciones:
   1. Imports y constantes
   2. Estado del admin
   3. Autenticación (frontend, sessionStorage)
   4. Apertura / cierre del panel
   5. Logos — Cloudinary upload
   6. Pestaña: Equipos
   7. Pestaña: Partidos de grupo
   8. Pestaña: Eliminatoria
   9. Toast de notificaciones
   10. Bootstrap del admin
   ═══════════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────
   1. IMPORTS Y CONSTANTES
─────────────────────────────────────────────── */
import { db, isFirebaseConfigured } from './firebase-config.js';
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import {
  CATEGORIAS,
  DIAS,
  generarDatosIniciales,
  getNombreEquipo,
  calcularClasificacion,
  escHtml
} from './app.js';

const ADMIN_PASSWORD    = 'FutSalMA#TA';
const SESSION_KEY       = 'cupfutsal_admin_auth';
const CLOUDINARY_CLOUD  = 'dibczh9c3';
const CLOUDINARY_PRESET = 'cupfutsal_logos';

/* ───────────────────────────────────────────────
   2. ESTADO DEL ADMIN
─────────────────────────────────────────────── */
let adminCatActual   = 'benjamin';  // categoría seleccionada en el panel admin
let adminTabActual   = 'equipos'; // pestaña activa del panel admin
let adminData        = null;       // datos actuales de la categoría
let adminUnsubscribe = null;       // listener de Firestore para el admin

/* ───────────────────────────────────────────────
   3. AUTENTICACIÓN
─────────────────────────────────────────────── */
function estaAutenticado() {
  return sessionStorage.getItem(SESSION_KEY) === 'true';
}

function autenticar() {
  sessionStorage.setItem(SESSION_KEY, 'true');
}

function cerrarSesion() {
  sessionStorage.removeItem(SESSION_KEY);
}

/* ───────────────────────────────────────────────
   4. APERTURA / CIERRE DEL PANEL
─────────────────────────────────────────────── */
function abrirAdmin() {
  const overlay     = document.getElementById('admin-overlay');
  const loginScreen = document.getElementById('admin-login-screen');
  const panel       = document.getElementById('admin-panel');

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // bloquear scroll del fondo

  if (estaAutenticado()) {
    loginScreen.classList.add('hidden');
    panel.classList.remove('hidden');
    cargarAdminCategoria(adminCatActual);
  } else {
    loginScreen.classList.remove('hidden');
    panel.classList.add('hidden');
    // Enfocar el campo de contraseña
    setTimeout(() => {
      document.getElementById('admin-password')?.focus();
    }, 100);
  }
}

function cerrarAdmin() {
  const overlay = document.getElementById('admin-overlay');
  overlay.classList.add('hidden');
  document.body.style.overflow = '';

  // Cancelar listener de Firestore del admin
  if (adminUnsubscribe) {
    adminUnsubscribe();
    adminUnsubscribe = null;
  }
}

/* ───────────────────────────────────────────────
   CARGA DE DATOS ADMIN (listener Firestore)
─────────────────────────────────────────────── */
async function cargarAdminCategoria(catId) {
  if (!isFirebaseConfigured) {
    mostrarToast('Firebase no configurado. Revisa firebase-config.js', 'error');
    return;
  }

  // Cancelar listener previo
  if (adminUnsubscribe) {
    adminUnsubscribe();
    adminUnsubscribe = null;
  }

  // Asegurar que el documento existe
  const ref  = doc(db, 'torneos', 'caspe2026', 'categorias', catId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, generarDatosIniciales(catId));
  }

  // Suscribirse a cambios en tiempo real
  adminUnsubscribe = onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      adminData = snap.data();
      renderizarTabActual();
    }
  }, (err) => {
    console.error('Admin Firestore error:', err);
    mostrarToast('Error al cargar datos de Firebase', 'error');
  });
}

function renderizarTabActual() {
  switch (adminTabActual) {
    case 'equipos':     renderTabEquipos();     break;
    case 'partidos':    renderTabPartidos();    break;
    case 'eliminatoria': renderTabEliminatoria(); break;
  }
}

/* ───────────────────────────────────────────────
   5. LOGOS — Cloudinary upload
─────────────────────────────────────────────── */
async function subirLogoCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: 'POST', body: fd }
  );
  if (!res.ok) throw new Error(`Cloudinary ${res.status}`);
  const json = await res.json();
  return json.secure_url;
}

async function guardarLogo(grupo, idx, logoUrl) {
  if (!isFirebaseConfigured) return;
  const grupoKey = grupo === 'A' ? 'logosA' : 'logosB';
  const lista = [...(adminData.equipos?.[grupoKey] ?? [])];
  while (lista.length <= idx) lista.push(null);
  lista[idx] = logoUrl;
  const ref = doc(db, 'torneos', 'caspe2026', 'categorias', adminCatActual);
  await updateDoc(ref, { [`equipos.${grupoKey}`]: lista });
}

/* ───────────────────────────────────────────────
   6. PESTAÑA: EQUIPOS
─────────────────────────────────────────────── */
function renderTabEquipos() {
  const form = document.getElementById('admin-equipos-form');
  if (!form || !adminData) return;

  const grupoA = adminData.equipos?.grupoA ?? [];
  const grupoB = adminData.equipos?.grupoB ?? [];

  form.innerHTML = '';
  form.appendChild(crearBloqueGrupo('A', grupoA));
  form.appendChild(crearBloqueGrupo('B', grupoB));
}

function crearBloqueGrupo(grupo, nombres) {
  const block = document.createElement('div');
  block.className = 'admin-group-block';

  const titulo = document.createElement('h3');
  titulo.className = 'admin-group-title';
  titulo.textContent = `Grupo ${grupo}`;
  block.appendChild(titulo);

  nombres.forEach((nombre, i) => block.appendChild(crearFilaEquipo(grupo, i, nombre)));

  const btnAdd = document.createElement('button');
  btnAdd.type = 'button';
  btnAdd.className = 'btn-equipo-add';
  btnAdd.textContent = '+ Añadir equipo';
  btnAdd.addEventListener('click', () => añadirEquipo(grupo));
  block.appendChild(btnAdd);

  return block;
}

function crearFilaEquipo(grupo, idx, nombre) {
  const row = document.createElement('div');
  row.className = 'admin-equipo-row';

  // ── Botón logo ──
  const grupoKey = grupo === 'A' ? 'logosA' : 'logosB';
  const logoUrl  = adminData?.equipos?.[grupoKey]?.[idx] || null;

  const fileInput = document.createElement('input');
  fileInput.type  = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';

  const logoBtn = document.createElement('button');
  logoBtn.type  = 'button';
  logoBtn.className = 'btn-logo-upload';
  logoBtn.title = 'Subir logo del equipo';
  logoBtn.setAttribute('aria-label', `Subir logo de ${nombre}`);

  const actualizarLogoBtn = (url) => {
    logoBtn.innerHTML = '';
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'logo-preview-admin';
      img.alt = '';
      logoBtn.appendChild(img);
    } else {
      logoBtn.textContent = '📷';
    }
  };
  actualizarLogoBtn(logoUrl);

  logoBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    logoBtn.disabled = true;
    logoBtn.textContent = '⏳';
    try {
      const url = await subirLogoCloudinary(file);
      await guardarLogo(grupo, idx, url);
      actualizarLogoBtn(url);
      mostrarToast('✅ Logo actualizado', 'success');
    } catch (err) {
      console.error(err);
      mostrarToast('❌ Error al subir el logo', 'error');
      actualizarLogoBtn(logoUrl);
    }
    logoBtn.disabled = false;
    fileInput.value  = '';
  });

  // ── Número ──
  const num = document.createElement('span');
  num.className = 'admin-equipo-num';
  num.textContent = `${idx + 1}.`;

  // ── Input nombre ──
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'admin-text-input equipo-input';
  input.dataset.grupo = grupo;
  input.dataset.idx = String(idx);
  input.value = nombre;
  input.placeholder = `Nombre equipo ${idx + 1}`;
  input.maxLength = 40;
  input.setAttribute('aria-label', `Equipo ${idx + 1} del grupo ${grupo}`);

  // ── Botón eliminar ──
  const btnRemove = document.createElement('button');
  btnRemove.type = 'button';
  btnRemove.className = 'btn-equipo-remove';
  btnRemove.textContent = '×';
  btnRemove.title = 'Eliminar equipo';
  btnRemove.setAttribute('aria-label', `Eliminar equipo ${idx + 1} del grupo ${grupo}`);
  btnRemove.addEventListener('click', () => eliminarEquipo(grupo, idx, nombre));

  row.appendChild(logoBtn);
  row.appendChild(fileInput);
  row.appendChild(num);
  row.appendChild(input);
  row.appendChild(btnRemove);

  return row;
}

async function añadirEquipo(grupo) {
  if (!adminData || !isFirebaseConfigured) return;

  const grupoKey = grupo === 'A' ? 'grupoA' : 'grupoB';
  const lista = [...(adminData.equipos?.[grupoKey] ?? [])];
  const siguiente = lista.length + 1;
  const nuevoNombre = `Equipo ${siguiente}`;
  lista.push(nuevoNombre);

  try {
    const ref = doc(db, 'torneos', 'caspe2026', 'categorias', adminCatActual);
    await updateDoc(ref, { [`equipos.${grupoKey}`]: lista });
    mostrarToast(`✅ "${nuevoNombre}" añadido al Grupo ${grupo}`, 'success');
  } catch (err) {
    console.error(err);
    mostrarToast('❌ Error al añadir equipo', 'error');
  }
}

async function eliminarEquipo(grupo, idx, nombre) {
  if (!adminData || !isFirebaseConfigured) return;

  const confirmar = confirm(
    `¿Eliminar "${nombre}" del Grupo ${grupo}?\n\n` +
    `También se eliminarán todos sus partidos asociados.\n` +
    `Esta acción no se puede deshacer.`
  );
  if (!confirmar) return;

  const grupoKey = grupo === 'A' ? 'grupoA' : 'grupoB';
  const lista = [...(adminData.equipos?.[grupoKey] ?? [])];
  lista.splice(idx, 1);

  // Eliminar partidos del equipo y ajustar índices de los restantes
  const partidos = (adminData.partidos ?? [])
    .filter(p => {
      if (p.grupo !== grupo) return true;
      return p.localIdx !== idx && p.visitanteIdx !== idx;
    })
    .map(p => {
      if (p.grupo !== grupo) return p;
      return {
        ...p,
        localIdx:     p.localIdx     > idx ? p.localIdx     - 1 : p.localIdx,
        visitanteIdx: p.visitanteIdx > idx ? p.visitanteIdx - 1 : p.visitanteIdx,
      };
    });

  try {
    const ref = doc(db, 'torneos', 'caspe2026', 'categorias', adminCatActual);
    await updateDoc(ref, { [`equipos.${grupoKey}`]: lista, partidos });
    mostrarToast(`✅ "${nombre}" eliminado del Grupo ${grupo}`, 'success');
  } catch (err) {
    console.error(err);
    mostrarToast('❌ Error al eliminar equipo', 'error');
  }
}

async function guardarEquipos() {
  if (!adminData) return;

  const form = document.getElementById('admin-equipos-form');
  const nuevoGrupoA = [];
  const nuevoGrupoB = [];

  form.querySelectorAll('.equipo-input[data-grupo="A"]').forEach((input, i) => {
    nuevoGrupoA.push(input.value.trim() || `Equipo ${i + 1}`);
  });
  form.querySelectorAll('.equipo-input[data-grupo="B"]').forEach((input, i) => {
    nuevoGrupoB.push(input.value.trim() || `Equipo ${i + 6}`);
  });

  try {
    const ref = doc(db, 'torneos', 'caspe2026', 'categorias', adminCatActual);
    await updateDoc(ref, {
      'equipos.grupoA': nuevoGrupoA,
      'equipos.grupoB': nuevoGrupoB
    });
    mostrarToast('✅ Equipos guardados correctamente', 'success');
  } catch (err) {
    console.error(err);
    mostrarToast('❌ Error al guardar. Inténtalo de nuevo.', 'error');
  }
}

/* ───────────────────────────────────────────────
   6. PESTAÑA: PARTIDOS DE GRUPO
─────────────────────────────────────────────── */
function renderTabPartidos() {
  const form = document.getElementById('admin-partidos-form');
  if (!form || !adminData) return;

  const { equipos, partidos } = adminData;
  const grupoA = (partidos ?? []).filter(p => p.grupo === 'A');
  const grupoB = (partidos ?? []).filter(p => p.grupo === 'B');

  form.innerHTML = `
    <h3 class="admin-grupo-header">Grupo A</h3>
    <div class="admin-partidos-grupo" data-grupo="A">
      ${grupoA.map(p => renderPartidoAdminCard(p, equipos)).join('')}
    </div>
    <h3 class="admin-grupo-header">Grupo B</h3>
    <div class="admin-partidos-grupo" data-grupo="B">
      ${grupoB.map(p => renderPartidoAdminCard(p, equipos)).join('')}
    </div>`;

  // Delegación de eventos: escuchar clicks en los botones "Guardar"
  form.querySelectorAll('.admin-save-partido-btn').forEach(btn => {
    btn.addEventListener('click', () => guardarPartido(btn.dataset.partidoId));
  });
}

function renderPartidoAdminCard(partido, equipos) {
  const local     = getNombreEquipo(equipos, partido.grupo, partido.localIdx);
  const visitante = getNombreEquipo(equipos, partido.grupo, partido.visitanteIdx);
  const gl  = partido.golLocal     ?? '';
  const gv  = partido.golVisitante ?? '';
  const dia = partido.dia          ?? '';
  const hora = partido.hora        ?? '';

  return `
    <div class="admin-partido-card" id="admin-partido-${escHtml(partido.id)}">
      <div class="admin-partido-equipos">
        ${escHtml(local)}
        <span class="admin-partido-sep">vs</span>
        ${escHtml(visitante)}
      </div>
      <div class="admin-partido-controls">
        <div class="admin-score-group">
          <input
            type="number"
            class="admin-score-input"
            min="0" max="99"
            placeholder="–"
            value="${escHtml(String(gl))}"
            data-campo="golLocal"
            data-partido-id="${escHtml(partido.id)}"
            aria-label="Goles ${escHtml(local)}"
          >
          <span class="admin-score-sep">–</span>
          <input
            type="number"
            class="admin-score-input"
            min="0" max="99"
            placeholder="–"
            value="${escHtml(String(gv))}"
            data-campo="golVisitante"
            data-partido-id="${escHtml(partido.id)}"
            aria-label="Goles ${escHtml(visitante)}"
          >
        </div>
        <select
          class="admin-dia-select"
          data-campo="dia"
          data-partido-id="${escHtml(partido.id)}"
          aria-label="Día del partido"
        >
          <option value="" ${!dia ? 'selected' : ''}>Día</option>
          <option value="viernes" ${dia === 'viernes' ? 'selected' : ''}>Viernes 24</option>
          <option value="sabado"  ${dia === 'sabado'  ? 'selected' : ''}>Sábado 25</option>
        </select>
        <input
          type="time"
          class="admin-hora-input"
          value="${escHtml(hora)}"
          data-campo="hora"
          data-partido-id="${escHtml(partido.id)}"
          aria-label="Hora del partido"
        >
        <label class="admin-jugado-label">
          <input
            type="checkbox"
            data-campo="jugado"
            data-partido-id="${escHtml(partido.id)}"
            ${partido.jugado ? 'checked' : ''}
            aria-label="Marcar como jugado"
          >
          Jugado
        </label>
        <button
          class="btn btn-outline-gold admin-save-partido-btn"
          data-partido-id="${escHtml(partido.id)}"
          title="Guardar este partido"
        >Guardar</button>
      </div>
    </div>`;
}

async function guardarPartido(partidoId) {
  if (!adminData || !isFirebaseConfigured) return;

  // Leer los valores del formulario para este partido
  const card      = document.getElementById(`admin-partido-${partidoId}`);
  if (!card) return;

  const glInput   = card.querySelector('[data-campo="golLocal"]');
  const gvInput   = card.querySelector('[data-campo="golVisitante"]');
  const diaSelect = card.querySelector('[data-campo="dia"]');
  const horaInput = card.querySelector('[data-campo="hora"]');
  const jugadoCb  = card.querySelector('[data-campo="jugado"]');

  const gl      = glInput?.value    !== '' ? parseInt(glInput.value, 10)   : null;
  const gv      = gvInput?.value    !== '' ? parseInt(gvInput.value, 10)   : null;
  const dia     = diaSelect?.value  || null;
  const hora    = horaInput?.value  || null;
  const jugado  = jugadoCb?.checked ?? false;

  // Encontrar índice del partido en el array
  const partidos    = [...(adminData.partidos ?? [])];
  const idx         = partidos.findIndex(p => p.id === partidoId);
  if (idx === -1) {
    mostrarToast('❌ Partido no encontrado', 'error');
    return;
  }

  partidos[idx] = { ...partidos[idx], golLocal: gl, golVisitante: gv, dia, hora, jugado };

  try {
    const ref = doc(db, 'torneos', 'caspe2026', 'categorias', adminCatActual);
    await updateDoc(ref, { partidos });
    mostrarToast('✅ Partido guardado', 'success');
  } catch (err) {
    console.error(err);
    mostrarToast('❌ Error al guardar. Inténtalo de nuevo.', 'error');
  }
}

/* ───────────────────────────────────────────────
   7. PESTAÑA: ELIMINATORIA
─────────────────────────────────────────────── */
function renderTabEliminatoria() {
  const form = document.getElementById('admin-eliminatoria-form');
  if (!form || !adminData) return;

  const { equipos, partidos, eliminatoria } = adminData;

  // Calcular cruces automáticos
  const clasificA = calcularClasificacion(equipos, partidos, 'A');
  const clasificB = calcularClasificacion(equipos, partidos, 'B');

  const totalGrupo    = (partidos ?? []).length;
  const jugadosGrupo  = (partidos ?? []).filter(p => p.jugado).length;
  const gruposListos  = totalGrupo > 0 && jugadosGrupo === totalGrupo;

  const sf1Datos = eliminatoria?.sf1   ?? {};
  const sf2Datos = eliminatoria?.sf2   ?? {};
  const finDatos = eliminatoria?.final ?? {};

  // Equipos auto (si grupos terminados)
  const sf1LocalAuto     = gruposListos ? (clasificA[0]?.nombre ?? '') : '';
  const sf1VisitanteAuto = gruposListos ? (clasificB[1]?.nombre ?? '') : '';
  const sf2LocalAuto     = gruposListos ? (clasificB[0]?.nombre ?? '') : '';
  const sf2VisitanteAuto = gruposListos ? (clasificA[1]?.nombre ?? '') : '';

  const aviso = !gruposListos
    ? `<div class="admin-hint" style="margin-bottom:1rem;color:var(--gold)">
        ⚠️ Los grupos no han terminado. Los equipos de SF se auto-rellenarán al terminar.
       </div>`
    : '';

  form.innerHTML = `
    ${aviso}
    ${renderElimAdminCard('sf1', 'SEMIFINAL 1',
      sf1Datos.equipoLocal     ?? sf1LocalAuto,
      sf1Datos.equipoVisitante ?? sf1VisitanteAuto,
      sf1Datos)}
    ${renderElimAdminCard('sf2', 'SEMIFINAL 2',
      sf2Datos.equipoLocal     ?? sf2LocalAuto,
      sf2Datos.equipoVisitante ?? sf2VisitanteAuto,
      sf2Datos)}
    ${renderElimAdminCard('final', '🏆 FINAL',
      finDatos.equipoLocal     ?? (sf1Datos.jugado ? getGanadorNombre(sf1Datos, sf1LocalAuto, sf1VisitanteAuto) : ''),
      finDatos.equipoVisitante ?? (sf2Datos.jugado ? getGanadorNombre(sf2Datos, sf2LocalAuto, sf2VisitanteAuto) : ''),
      finDatos)}
  `;

  form.querySelectorAll('.admin-save-elim-btn').forEach(btn => {
    btn.addEventListener('click', () => guardarEliminatoria(btn.dataset.ronda));
  });
}

function getGanadorNombre(datos, localFallback, visitanteFallback) {
  if (!datos.jugado) return '';
  const local     = datos.equipoLocal     ?? localFallback;
  const visitante = datos.equipoVisitante ?? visitanteFallback;
  const gl = Number(datos.golLocal ?? 0);
  const gv = Number(datos.golVisitante ?? 0);
  if (gl > gv) return local;
  if (gv > gl) return visitante;
  return '';
}

function renderElimAdminCard(ronda, label, localNombre, visitanteNombre, datos) {
  const gl    = datos?.golLocal     ?? '';
  const gv    = datos?.golVisitante ?? '';
  const dia   = datos?.dia          ?? '';
  const hora  = datos?.hora         ?? '';

  return `
    <div class="admin-elim-card">
      <h3 class="admin-elim-label">${label}</h3>
      <div class="admin-elim-equipos">
        <div class="admin-elim-equipo-block">
          <label for="elim-${ronda}-local">Equipo Local</label>
          <input
            type="text"
            id="elim-${ronda}-local"
            class="admin-text-input"
            value="${escHtml(localNombre ?? '')}"
            placeholder="Auto desde clasificación"
            data-campo="equipoLocal"
            data-ronda="${ronda}"
            maxlength="40"
          >
        </div>
        <div class="admin-elim-equipo-block">
          <label for="elim-${ronda}-visitante">Equipo Visitante</label>
          <input
            type="text"
            id="elim-${ronda}-visitante"
            class="admin-text-input"
            value="${escHtml(visitanteNombre ?? '')}"
            placeholder="Auto desde clasificación"
            data-campo="equipoVisitante"
            data-ronda="${ronda}"
            maxlength="40"
          >
        </div>
      </div>
      <div class="admin-partido-controls">
        <div class="admin-score-group">
          <input
            type="number"
            class="admin-score-input"
            min="0" max="99"
            placeholder="–"
            value="${escHtml(String(gl))}"
            data-campo="golLocal"
            data-ronda="${ronda}"
            aria-label="Goles local eliminatoria ${ronda}"
          >
          <span class="admin-score-sep">–</span>
          <input
            type="number"
            class="admin-score-input"
            min="0" max="99"
            placeholder="–"
            value="${escHtml(String(gv))}"
            data-campo="golVisitante"
            data-ronda="${ronda}"
            aria-label="Goles visitante eliminatoria ${ronda}"
          >
        </div>
        <select
          class="admin-dia-select"
          data-campo="dia"
          data-ronda="${ronda}"
          aria-label="Día"
        >
          <option value="" ${!dia ? 'selected' : ''}>Día</option>
          <option value="viernes" ${dia === 'viernes' ? 'selected' : ''}>Viernes 24</option>
          <option value="sabado"  ${dia === 'sabado'  ? 'selected' : ''}>Sábado 25</option>
        </select>
        <input
          type="time"
          class="admin-hora-input"
          value="${escHtml(hora)}"
          data-campo="hora"
          data-ronda="${ronda}"
          aria-label="Hora"
        >
        <label class="admin-jugado-label">
          <input
            type="checkbox"
            data-campo="jugado"
            data-ronda="${ronda}"
            ${datos?.jugado ? 'checked' : ''}
          >
          Jugado
        </label>
        <button
          class="btn btn-outline-gold admin-save-elim-btn"
          data-ronda="${ronda}"
          style="margin-left:auto"
        >Guardar</button>
      </div>
    </div>`;
}

async function guardarEliminatoria(ronda) {
  if (!adminData || !isFirebaseConfigured) return;

  // Leer todos los campos con data-ronda = ronda
  const form = document.getElementById('admin-eliminatoria-form');
  if (!form) return;

  const getValue = (campo) => form.querySelector(`[data-campo="${campo}"][data-ronda="${ronda}"]`);

  const equipoLocal     = getValue('equipoLocal')?.value?.trim()     || null;
  const equipoVisitante = getValue('equipoVisitante')?.value?.trim() || null;
  const glEl  = getValue('golLocal');
  const gvEl  = getValue('golVisitante');
  const gl    = glEl?.value  !== '' ? parseInt(glEl.value, 10)  : null;
  const gv    = gvEl?.value  !== '' ? parseInt(gvEl.value, 10)  : null;
  const dia   = getValue('dia')?.value    || null;
  const hora  = getValue('hora')?.value   || null;
  const jugado= getValue('jugado')?.checked ?? false;

  const key = ronda === 'final' ? 'final' : ronda; // 'sf1', 'sf2', 'final'
  const updatePath = `eliminatoria.${key}`;

  try {
    const ref = doc(db, 'torneos', 'caspe2026', 'categorias', adminCatActual);
    await updateDoc(ref, {
      [updatePath]: { equipoLocal, equipoVisitante, golLocal: gl, golVisitante: gv, dia, hora, jugado }
    });
    mostrarToast(`✅ ${ronda.toUpperCase()} guardado`, 'success');
  } catch (err) {
    console.error(err);
    mostrarToast('❌ Error al guardar. Inténtalo de nuevo.', 'error');
  }
}

/* ───────────────────────────────────────────────
   9. TOAST DE NOTIFICACIONES
─────────────────────────────────────────────── */
let toastTimeout = null;

export function mostrarToast(mensaje, tipo = 'success') {
  // Crear el toast si no existe
  let toast = document.getElementById('admin-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = mensaje;
  toast.className   = `toast ${tipo}`;

  // Animar entrada
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  // Ocultar tras 2.5s
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

/* ───────────────────────────────────────────────
   10. BOOTSTRAP DEL ADMIN
─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  // ── Botón que abre el admin (pie de página) ──
  document.getElementById('admin-btn')?.addEventListener('click', abrirAdmin);

  // ── Botón "Cancelar" en pantalla de login ──
  document.getElementById('admin-close-login')?.addEventListener('click', cerrarAdmin);

  // ── Botón "Cerrar" en el panel admin ──
  document.getElementById('admin-close-panel')?.addEventListener('click', () => {
    cerrarSesion(); // cerrar también la sesión al cerrar el panel
    cerrarAdmin();
  });

  // ── Botón "Acceder" — validar contraseña ──
  document.getElementById('admin-login-btn')?.addEventListener('click', intentarLogin);
  document.getElementById('admin-password')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') intentarLogin();
  });

  // ── Selector de categoría del admin ──
  document.getElementById('admin-cat-select')?.addEventListener('change', (e) => {
    adminCatActual = e.target.value;
    cargarAdminCategoria(adminCatActual);
  });

  // ── Pestañas internas del admin ──
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.adminTab;
      cambiarAdminTab(tabId);
    });
  });

  // ── Botón "Guardar equipos" ──
  document.getElementById('admin-save-equipos')?.addEventListener('click', guardarEquipos);

  // ── Cerrar modal haciendo clic fuera del contenido (en el overlay) ──
  // (solo en la pantalla de login)
  document.getElementById('admin-overlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('admin-overlay')) {
      if (!estaAutenticado()) cerrarAdmin();
    }
  });

  // ── Escape para cerrar el admin (solo en login) ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('admin-overlay');
      if (!overlay.classList.contains('hidden')) {
        if (!estaAutenticado()) cerrarAdmin();
      }
    }
  });
});

function intentarLogin() {
  const input     = document.getElementById('admin-password');
  const errorMsg  = document.getElementById('admin-error-msg');
  const loginScrn = document.getElementById('admin-login-screen');
  const panel     = document.getElementById('admin-panel');

  if (!input) return;

  if (input.value === ADMIN_PASSWORD) {
    autenticar();
    errorMsg?.classList.add('hidden');
    input.value = '';

    // Transición a panel
    loginScrn.classList.add('hidden');
    panel.classList.remove('hidden');

    // Inicializar el panel con la categoría por defecto
    cargarAdminCategoria(adminCatActual);
  } else {
    errorMsg?.classList.remove('hidden');
    input.value = '';
    input.focus();
    // Animación de shake ya aplicada en CSS con la clase admin-error
    errorMsg.style.animation = 'none';
    requestAnimationFrame(() => {
      errorMsg.style.animation = '';
    });
  }
}

function cambiarAdminTab(tabId) {
  adminTabActual = tabId;

  // Actualizar estilos de tabs
  document.querySelectorAll('.admin-tab').forEach(t => {
    const activo = t.dataset.adminTab === tabId;
    t.classList.toggle('active', activo);
    t.setAttribute('aria-selected', activo ? 'true' : 'false');
  });

  // Mostrar/ocultar contenido de tabs
  document.querySelectorAll('.admin-tab-content').forEach(content => {
    content.classList.add('hidden');
  });

  const tabContent = document.getElementById(`admin-tab-${tabId}`);
  if (tabContent) tabContent.classList.remove('hidden');

  // Re-renderizar si ya hay datos
  if (adminData) renderizarTabActual();
}
