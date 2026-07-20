# SPEC — <Nombre del Proyecto>

> Especificación neutral de metodología (capa de fundación SDD).
> El adaptador de `methodologies/` la transforma a OpenSpec / Spec-Kit / SDD genérico.
> Fuente de verdad compartida entre el equipo y los agentes de IA.

---

## 1. Visión del Producto
*Qué es, para quién, qué problema resuelve y cómo sabremos que funciona. En lenguaje no técnico.*

- **Visión (≤ 2 párrafos):**
- **Usuario principal:**
- **Problema que resuelve:**

### Criterios de éxito (medibles, agnósticos de tecnología)
- **SC-1:** [p. ej. "Un usuario registra un gasto en menos de 30 segundos"]
- **SC-2:** [p. ej. "El saldo del grupo es correcto en el 100% de los cierres de cuenta"]

### Fuera de alcance (v1)
- [Qué NO hace esta versión, explícitamente — la lista que evita el scope creep]

### Supuestos
- [Lo que se da por cierto sin haberlo validado aún]

---

## 2. Usuarios y Casos de Uso
*Roles concretos con acciones concretas. Sin perfiles de marketing.*

- **[Rol]:** [acción 1], [acción 2], [acción 3]
- **Acciones solo de admin:**
- **Usuario anónimo (no autenticado):**

---

## 3. Funcionalidades por Módulo
*Comportamiento observable. "El usuario puede…" / "El sistema hace/calcula/envía automáticamente…".
Cada módulo lleva su prioridad: **P1** (MVP: sin esto no hay producto) · **P2** (importante) · **P3** (deseable).*

### Módulo: [nombre] — Prioridad: P1
- El usuario puede…
- El sistema automáticamente…

### Módulo: [nombre] — Prioridad: P2
- …

---

## 4. Flujos de Usuario
*Pasos exactos de cada acción crítica. Happy path + error path.*

### Flujo: [Nombre de la acción]
1. El usuario…
2. El sistema…
3. El usuario…
- **[Error en paso N]:** El sistema muestra…

---

## 5. Arquitectura
*Estructura técnica. Decisiones grandes → ADR.*

- **Plataforma:** (web / móvil / ambos / servicio)
- **Backend:** (propio / BaaS / serverless)
- **Stack y restricciones:**
- **Almacenamiento de datos:** (SQL / NoSQL / híbrido)
- **Autenticación:** (propia / OAuth / SAML)
- **Integraciones de terceros:**
- **Contrato expuesto (si es un servicio):** endpoints/eventos que ofrece y quién los consume.

### APIs consumidas *(si aplica — extensión de servicios/integraciones)*
| API | Base URL | Auth | Endpoints usados | Respuesta clave | Límites | Resiliencia (timeout/reintentos/fallback) |
|---|---|---|---|---|---|---|
| | | | | | | |

---

## 6. Requisitos No Funcionales
*Las restricciones invisibles que destruyen proyectos en producción.*

- **Concurrencia (usuarios simultáneos v1):**
- **Datos sensibles y protección:**
- **Offline / conectividad limitada:**
- **Idiomas / i18n:**
- **SLAs / tiempos de respuesta:**
- **Restricciones de hosting / región:**
