# CupFutsal Caspe 2026 — Web de Resultados

Aplicación web para mostrar en tiempo real los resultados, clasificaciones y eliminatoria del torneo **CupFutsal Caspe 2026**.

---

## 📁 Estructura de archivos

```
cupfutsal-resultados-2026/
├── index.html              ← Página principal (vista pública + panel admin)
├── css/
│   └── styles.css          ← Todos los estilos (mobile-first, dark theme)
├── js/
│   ├── firebase-config.js  ← ⚠️ Pon aquí tus credenciales de Firebase
│   ├── app.js              ← Lógica principal: datos, clasificación, renderizado
│   └── admin.js            ← Panel de administración
├── assets/
│   └── logo.png            ← ⚠️ Coloca aquí el logo del torneo (PNG con fondo transparente)
└── README.md               ← Este archivo
```

---

## 🔥 Paso 1 — Crear el proyecto en Firebase

1. Ve a **[https://console.firebase.google.com](https://console.firebase.google.com)**
2. Pulsa **"Crear un proyecto"** → ponle un nombre (ej. `cupfutsal-caspe-2026`)
3. Desactiva Google Analytics si no lo necesitas → **Crear proyecto**

### Activar Firestore Database

4. En el menú izquierdo, ve a **Build → Firestore Database**
5. Pulsa **"Create database"**
6. Selecciona la región más cercana (ej. `europe-west1`)
7. En modo de seguridad:
   - Para empezar rápido: elige **"Test mode"** (caduca a los 30 días)
   - Para producción: elige **"Production mode"** y configura las reglas abajo

### Reglas de Firestore recomendadas para producción

En **Firestore → Rules**, copia estas reglas:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Cualquiera puede leer (vista pública)
    match /torneos/{torneo}/categorias/{cat} {
      allow read: if true;
      // Solo escrituras autenticadas — pero como usamos auth frontend,
      // deja escribir desde cualquier origen (ajusta si añades Firebase Auth)
      allow write: if true;
    }
  }
}
```

> **Nota de seguridad:** Las reglas `allow write: if true` permiten que cualquiera escriba. Es aceptable para un torneo local donde los datos no son sensibles. Si quieres más seguridad, añade Firebase Authentication.

---

## 🔑 Paso 2 — Copiar las credenciales de Firebase

1. En la consola de Firebase, ve a **Configuración del proyecto** (icono ⚙️) → **General**
2. En **"Tus apps"**, pulsa el icono **`</>`** (Web)
3. Registra la app (puedes llamarla `web`)
4. Copia el objeto `firebaseConfig` que aparece
5. Abre el archivo `js/firebase-config.js` y **sustituye los valores `TU_...`** por los reales:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSy...",           // ← tu API key real
  authDomain:        "mi-proyecto.firebaseapp.com",
  projectId:         "mi-proyecto",
  storageBucket:     "mi-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

---

## 🖼️ Paso 3 — Añadir el logo

1. Prepara el logo del torneo en formato **PNG con fondo transparente**
2. Guárdalo como `assets/logo.png` (reemplaza el placeholder)
3. El logo se mostrará como **marca de agua** semitransparente en el header

> **Tamaño recomendado:** 400×400 px mínimo, fondo transparente

---

## 💻 Paso 4 — Abrir la web localmente

Como la app usa módulos ES y Firebase CDN, necesitas un servidor local (no puedes abrir `index.html` directamente con doble clic).

### Opción A — VS Code + Live Server (recomendado)
1. Instala la extensión **Live Server** en VS Code
2. Abre la carpeta del proyecto en VS Code
3. Pulsa **"Go Live"** en la barra inferior

### Opción B — Node.js
```bash
npx serve .
```

### Opción C — Python
```bash
python -m http.server 8080
```

Luego abre `http://localhost:8080` en tu navegador.

---

## 🚀 Paso 5 — Subir a Netlify

1. Ve a **[https://netlify.com](https://netlify.com)** → Log in
2. Desde el dashboard, pulsa **"Add new site → Deploy manually"**
3. Arrastra toda la carpeta `cupfutsal-resultados-2026` al área de drop
4. ¡Listo! Netlify te dará una URL pública

> **Dominio personalizado:** En Netlify → Domain settings puedes configurar un dominio propio.

---

## 🔐 Panel de Administración

### Cómo acceder

1. En el pie de página de la web, hay un botón 🔒 discreto (esquina inferior derecha)
2. Al pulsarlo, se abre un modal con campo de contraseña
3. **Contraseña:** `FutSalMA#TA`
4. Una vez dentro, la sesión se mantiene mientras el navegador esté abierto

> ⚠️ Si quieres cambiar la contraseña, edita la línea `const ADMIN_PASSWORD = 'FutSalMA#TA';` en `js/admin.js`

### Pestaña "Equipos"

- Selecciona la categoría en el selector de arriba
- Edita los nombres de los 10 equipos (5 en Grupo A, 5 en Grupo B)
- Pulsa **"Guardar equipos"**
- Los cambios se reflejan en tiempo real para todos los visitantes

### Pestaña "Partidos"

- Verás todos los partidos de grupo (20 por categoría: 10 en grupo A, 10 en grupo B)
- Para cada partido:
  - **Resultado:** introduce los goles de cada equipo
  - **Día:** selecciona Viernes 24 o Sábado 25
  - **Hora:** introduce la hora (formato HH:MM)
  - **Jugado:** marca el checkbox cuando el partido se ha jugado (aparecerá en "Resultados")
- Pulsa **"Guardar"** en cada partido por separado

### Pestaña "Eliminatoria"

- Los cruces de semis se calculan **automáticamente** cuando todos los grupos están terminados
- Puedes editar manualmente los nombres de los equipos si es necesario
- Introduce resultados, día, hora y marca "Jugado" para cada ronda
- El **campeón** aparece automáticamente en la web pública cuando la final está marcada como jugada

---

## ➕ Cómo añadir o cambiar categorías

Las 6 categorías actuales son: `prebenjamin`, `benjamin`, `alevin`, `cadete`, `juvenil`, `senior`.

Para añadir una nueva categoría:

1. **En `index.html`** — añade un nuevo `<button>` en el bloque `.cat-tabs`:
   ```html
   <button class="cat-tab" role="tab" data-cat="nueva-cat">Nueva Cat</button>
   ```
   Y en el `<select id="admin-cat-select">`:
   ```html
   <option value="nueva-cat">Nueva Categoría</option>
   ```

2. **En `js/app.js`** — añade el ID al array:
   ```javascript
   export const CATEGORIAS = [..., 'nueva-cat'];
   ```

Los datos de la nueva categoría se crean automáticamente en Firebase la primera vez que alguien la visita.

---

## 📋 Checklist antes de publicar

Sustituye todos estos placeholders:

| Qué cambiar | Dónde |
|---|---|
| ⚠️ Credenciales de Firebase | `js/firebase-config.js` |
| ⚠️ Logo del torneo | `assets/logo.png` |
| ⚠️ URL pública del torneo | `index.html` (meta `og:url`) |
| ⚠️ Imagen Open Graph | `assets/og-image.jpg` (opcional, para previews en redes) |
| ⚠️ Nombres reales de equipos | Panel admin → pestaña "Equipos" |
| ⚠️ Horarios reales de partidos | Panel admin → pestaña "Partidos" |
| ⚠️ Contraseña admin (si quieres cambiarla) | `js/admin.js` línea `ADMIN_PASSWORD` |

---

## 🛠️ Tecnologías usadas

- **HTML5 + CSS3 + JavaScript vanilla** (sin frameworks, sin build tools)
- **Firebase v10** — Firestore para base de datos en tiempo real
- **Google Fonts** — Bebas Neue + Poppins
- **Mobile-first** — diseñado para móvil primero

---

*CupFutsal Caspe 2026 — Desarrollado con ❤️*
