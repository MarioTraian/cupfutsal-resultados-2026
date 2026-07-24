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
  doc, getDoc, setDoc, updateDoc, onSnapshot, deleteField
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import {
  GRUPOS_CATEGORIA,
  ELIMINATORIA_CATEGORIA,
  generarDatosIniciales,
  getNombreEquipo,
  escHtml
} from './app.js';

const ADMIN_PASSWORD    = 'FutSalMA#TA';
const SESSION_KEY       = 'cupfutsal_admin_auth';
const CLOUDINARY_CLOUD  = 'dibczh9c3';
const CLOUDINARY_PRESET = 'cupfutsal_logos';
const PISTAS            = ['Pista 1', 'Pista 2'];

/* ───────────────────────────────────────────────
   2. ESTADO DEL ADMIN
─────────────────────────────────────────────── */
let adminCatActual   = 'infantil'; // categoría seleccionada en el panel admin
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
    case 'equipos':      renderTabEquipos();      break;
    case 'partidos':     renderTabPartidos();     break;
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
  const ref = doc(db, 'torneos', 'caspe2026', 'categorias', adminCatActual);
  await updateDoc(ref, { [`logos.${grupo}_${idx}`]: logoUrl });
}

async function eliminarLogo(grupo, idx, nombre) {
  const confirmar = confirm(`¿Eliminar el logo de "${nombre}"?\n\nEl logo dejará de mostrarse en la web.`);
  if (!confirmar) return;

  if (!isFirebaseConfigured) return;
  try {
    const ref = doc(db, 'torneos', 'caspe2026', 'categorias', adminCatActual);
    await updateDoc(ref, { [`logos.${grupo}_${idx}`]: deleteField() });
    mostrarToast('🗑️ Logo eliminado', 'success');
  } catch (err) {
    console.error(err);
    mostrarToast('❌ Error al eliminar el logo', 'error');
  }
}

/* ───────────────────────────────────────────────
   6. PESTAÑA: EQUIPOS
─────────────────────────────────────────────── */
function renderTabEquipos() {
  const form = document.getElementById('admin-equipos-form');
  if (!form || !adminData) return;

  const grupos = GRUPOS_CATEGORIA[adminCatActual] ?? [];

  form.innerHTML = '';
  grupos.forEach(({ key, nombre }) => {
    const nombres = adminData.equipos?.[key] ?? [];
    form.appendChild(crearBloqueGrupo(key, nombre, nombres));
  });
}

function crearBloqueGrupo(grupo, etiqueta, nombres) {
  const block = document.createElement('div');
  block.className = 'admin-group-block';

  const titulo = document.createElement('h3');
  titulo.className = 'admin-group-title';
  titulo.textContent = etiqueta;
  block.appendChild(titulo);

  nombres.forEach((nombre, i) => block.appendChild(crearFilaEquipo(grupo, i, nombre)));

  return block;
}

function crearFilaEquipo(grupo, idx, nombre) {
  const row = document.createElement('div');
  row.className = 'admin-equipo-row';

  // ── Contenedor logo (botón subir + botón eliminar) ──
  let logoUrl = adminData?.logos?.[`${grupo}_${idx}`] || null;

  const fileInput = document.createElement('input');
  fileInput.type   = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';

  const logoBtn = document.createElement('button');
  logoBtn.type      = 'button';
  logoBtn.className = 'btn-logo-upload';

  const btnDeleteLogo = document.createElement('button');
  btnDeleteLogo.type      = 'button';
  btnDeleteLogo.className = 'btn-logo-delete';
  btnDeleteLogo.title     = 'Eliminar logo';
  btnDeleteLogo.setAttribute('aria-label', `Eliminar logo de ${nombre}`);
  btnDeleteLogo.textContent = '🗑';

  const actualizarLogoArea = (url) => {
    logoBtn.innerHTML = '';
    if (url) {
      const img = document.createElement('img');
      img.src       = url;
      img.className = 'logo-preview-admin';
      img.alt       = 'Logo del equipo';
      logoBtn.title = 'Cambiar logo';
      logoBtn.appendChild(img);
      btnDeleteLogo.style.display = '';
    } else {
      logoBtn.textContent = '🖼';
      logoBtn.title       = 'Subir logo (clic para elegir imagen)';
      btnDeleteLogo.style.display = 'none';
    }
  };
  actualizarLogoArea(logoUrl);

  logoBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    logoBtn.disabled = true;
    logoBtn.textContent = '⏳';
    try {
      const url = await subirLogoCloudinary(file);
      await guardarLogo(grupo, idx, url);
      logoUrl = url;
      actualizarLogoArea(url);
      mostrarToast('✅ Logo actualizado', 'success');
    } catch (err) {
      console.error(err);
      mostrarToast('❌ Error al subir el logo', 'error');
      actualizarLogoArea(logoUrl);
    }
    logoBtn.disabled = false;
    fileInput.value  = '';
  });

  btnDeleteLogo.addEventListener('click', async () => {
    await eliminarLogo(grupo, idx, nombre);
    logoUrl = null;
    actualizarLogoArea(null);
  });

  // ── Número ──
  const num = document.createElement('span');
  num.className   = 'admin-equipo-num';
  num.textContent = `${idx + 1}.`;

  // ── Input nombre ──
  const input = document.createElement('input');
  input.type      = 'text';
  input.className = 'admin-text-input equipo-input';
  input.dataset.grupo = grupo;
  input.dataset.idx   = String(idx);
  input.value       = nombre;
  input.placeholder = `Nombre equipo ${idx + 1}`;
  input.maxLength   = 40;
  input.setAttribute('aria-label', `Equipo ${idx + 1} del grupo ${grupo}`);

  row.appendChild(logoBtn);
  row.appendChild(btnDeleteLogo);
  row.appendChild(fileInput);
  row.appendChild(num);
  row.appendChild(input);

  return row;
}

async function guardarEquipos() {
  if (!adminData) return;

  const form   = document.getElementById('admin-equipos-form');
  const grupos = GRUPOS_CATEGORIA[adminCatActual] ?? [];
  const updates = {};

  grupos.forEach(({ key }) => {
    const nombres = [];
    form.querySelectorAll(`.equipo-input[data-grupo="${key}"]`).forEach((input, i) => {
      nombres.push(input.value.trim() || `Equipo ${i + 1}`);
    });
    updates[`equipos.${key}`] = nombres;
  });

  try {
    const ref = doc(db, 'torneos', 'caspe2026', 'categorias', adminCatActual);
    await updateDoc(ref, updates);
    mostrarToast('✅ Equipos guardados correctamente', 'success');
  } catch (err) {
    console.error(err);
    mostrarToast('❌ Error al guardar. Inténtalo de nuevo.', 'error');
  }
}

/* ───────────────────────────────────────────────
   7. PESTAÑA: PARTIDOS DE GRUPO
─────────────────────────────────────────────── */
function renderTabPartidos() {
  const form = document.getElementById('admin-partidos-form');
  if (!form || !adminData) return;

  const { equipos, partidos } = adminData;
  const grupos = GRUPOS_CATEGORIA[adminCatActual] ?? [];

  form.innerHTML = grupos.map(({ key, nombre }) => {
    const partidosGrupo = (partidos ?? []).filter(p => p.grupo === key);
    return `
      <h3 class="admin-grupo-header">${escHtml(nombre)}</h3>
      <div class="admin-partidos-grupo" data-grupo="${escHtml(key)}">
        ${partidosGrupo.map(p => renderPartidoAdminCard(p, equipos)).join('')}
      </div>`;
  }).join('');

  // Delegación de eventos: escuchar clicks en los botones "Guardar"
  form.querySelectorAll('.admin-save-partido-btn').forEach(btn => {
    btn.addEventListener('click', () => guardarPartido(btn.dataset.partidoId));
  });
}

function opcionesPista(seleccionada) {
  const vacia = `<option value="" ${!seleccionada ? 'selected' : ''}>Pista</option>`;
  const resto = PISTAS.map(p => `<option value="${escHtml(p)}" ${p === seleccionada ? 'selected' : ''}>${escHtml(p)}</option>`).join('');
  return vacia + resto;
}

function renderPartidoAdminCard(partido, equipos) {
  const local     = getNombreEquipo(equipos, partido.grupo, partido.localIdx);
  const visitante = getNombreEquipo(equipos, partido.grupo, partido.visitanteIdx);
  const gl  = partido.golLocal     ?? '';
  const gv  = partido.golVisitante ?? '';
  const dia = partido.dia          ?? '';
  const hora = partido.hora        ?? '';
  const pista = partido.pista      ?? '';

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
        <select
          class="admin-dia-select"
          data-campo="pista"
          data-partido-id="${escHtml(partido.id)}"
          aria-label="Pista del partido"
        >${opcionesPista(pista)}</select>
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

  const glInput    = card.querySelector('[data-campo="golLocal"]');
  const gvInput    = card.querySelector('[data-campo="golVisitante"]');
  const diaSelect  = card.querySelector('[data-campo="dia"]');
  const horaInput  = card.querySelector('[data-campo="hora"]');
  const pistaSelect = card.querySelector('[data-campo="pista"]');
  const jugadoCb   = card.querySelector('[data-campo="jugado"]');

  const gl      = glInput?.value    !== '' ? parseInt(glInput.value, 10)   : null;
  const gv      = gvInput?.value    !== '' ? parseInt(gvInput.value, 10)   : null;
  const dia     = diaSelect?.value  || null;
  const hora    = horaInput?.value  || null;
  const pista   = pistaSelect?.value || null;
  const jugado  = jugadoCb?.checked ?? false;

  // Encontrar índice del partido en el array
  const partidos    = [...(adminData.partidos ?? [])];
  const idx         = partidos.findIndex(p => p.id === partidoId);
  if (idx === -1) {
    mostrarToast('❌ Partido no encontrado', 'error');
    return;
  }

  partidos[idx] = { ...partidos[idx], golLocal: gl, golVisitante: gv, dia, hora, pista, jugado };

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
   8. PESTAÑA: ELIMINATORIA
─────────────────────────────────────────────── */
function renderTabEliminatoria() {
  const form = document.getElementById('admin-eliminatoria-form');
  if (!form || !adminData) return;

  const { eliminatoria = {} } = adminData;
  const rondas = ELIMINATORIA_CATEGORIA[adminCatActual] ?? [];

  form.innerHTML = `
    <div class="admin-hint" style="margin-bottom:1rem">
      Introduce manualmente los equipos de cada ronda de eliminatoria a medida que se van definiendo.
    </div>
    ${rondas.map(({ key, label }) => {
      const datos = eliminatoria[key] ?? {};
      return renderElimAdminCard(key, label, datos.equipoLocal ?? '', datos.equipoVisitante ?? '', datos);
    }).join('')}
  `;

  form.querySelectorAll('.admin-save-elim-btn').forEach(btn => {
    btn.addEventListener('click', () => guardarEliminatoria(btn.dataset.ronda));
  });
}

function renderElimAdminCard(ronda, label, localNombre, visitanteNombre, datos) {
  const gl    = datos?.golLocal     ?? '';
  const gv    = datos?.golVisitante ?? '';
  const dia   = datos?.dia          ?? '';
  const hora  = datos?.hora         ?? '';
  const pista = datos?.pista        ?? '';

  return `
    <div class="admin-elim-card">
      <h3 class="admin-elim-label">${escHtml(label)}</h3>
      <div class="admin-elim-equipos">
        <div class="admin-elim-equipo-block">
          <label for="elim-${ronda}-local">Equipo Local</label>
          <input
            type="text"
            id="elim-${ronda}-local"
            class="admin-text-input"
            value="${escHtml(localNombre ?? '')}"
            placeholder="Nombre del equipo"
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
            placeholder="Nombre del equipo"
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
        <select
          class="admin-dia-select"
          data-campo="pista"
          data-ronda="${ronda}"
          aria-label="Pista"
        >${opcionesPista(pista)}</select>
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
  const pista = getValue('pista')?.value  || null;
  const jugado= getValue('jugado')?.checked ?? false;

  const updatePath = `eliminatoria.${ronda}`;

  try {
    const ref = doc(db, 'torneos', 'caspe2026', 'categorias', adminCatActual);
    await updateDoc(ref, {
      [updatePath]: { equipoLocal, equipoVisitante, golLocal: gl, golVisitante: gv, dia, hora, pista, jugado }
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

  // ── Botón "← Resultados" — volver a vista pública sin cerrar sesión ──
  document.getElementById('admin-back-public')?.addEventListener('click', cerrarAdmin);

  // ── Botón "Cerrar" en el panel admin ──
  document.getElementById('admin-close-panel')?.addEventListener('click', () => {
    cerrarSesion();
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
