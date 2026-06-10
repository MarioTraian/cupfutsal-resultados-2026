/* ═══════════════════════════════════════════════════════════════════
   FIREBASE CONFIG — CupFutsal Caspe 2026
   ─────────────────────────────────────────────────────────────────
   INSTRUCCIONES RÁPIDAS:
   1. Ve a https://console.firebase.google.com
   2. Crea un proyecto (o abre uno existente)
   3. Ve a Configuración del proyecto → Tus apps → Web (</>)
   4. Registra la app y copia los valores de firebaseConfig
   5. Sustituye los valores de "TU_..." por los reales aquí abajo
   6. Activa Firestore: Ve a Build → Firestore Database → Create database
      Elige modo "production" (o "test" para pruebas)
   ═══════════════════════════════════════════════════════════════════ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── SUSTITUYE AQUÍ tus credenciales de Firebase ────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCmeWZSoFFYN9KA0UfbfNiVaXbLqKs0Kz8",
  authDomain:        "cupfutsal-caspe-2026.firebaseapp.com",
  projectId:         "cupfutsal-caspe-2026",
  storageBucket:     "cupfutsal-caspe-2026.firebasestorage.app",
  messagingSenderId: "807628615532",
  appId:             "1:807628615532:web:a0c28cb3d87a560b234d49"
};
// ────────────────────────────────────────────────────────────────────

// Detectar si las credenciales son placeholders (para mostrar aviso claro)
export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith('TU_');

let app, db;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  db  = getFirestore(app);
} else {
  console.warn(
    '⚠️ Firebase no configurado. Abre js/firebase-config.js y rellena tus credenciales.\n' +
    'Mientras tanto la web se muestra en modo demo sin datos reales.'
  );
}

export { db };
