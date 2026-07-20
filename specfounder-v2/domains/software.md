# Perfil de dominio — Software (sistema · app · API · web)

> **domain:** `software`
> **Salida:** metodologías de código (`openspec` · `github-spec-kit` · `generic-sdd`).
> **Espina:** ver `_spine.md`. Este perfil es el original de SpecFounder; las 6 ranuras conservan su nombre clásico.

Aplica a cualquier stack/tecnología (no está casado con ninguno): sistemas backend, apps móviles/escritorio, APIs, sitios y aplicaciones web, CLIs, librerías, etc.

## Mapeo de ranuras → secciones

| Ranura | Sección (software) |
|---|---|
| 1 Visión | **Visión del Producto** |
| 2 Actores | **Usuarios y Casos de Uso** |
| 3 Elementos | **Funcionalidades por Módulo** |
| 4 Estructura/Flujo | **Flujos de Usuario** |
| 5 Forma | **Arquitectura** |
| 6 Restricciones | **Requisitos No Funcionales** |

## Preguntas guía
Son las del Entrevistador (`agents/interviewer.md`, guion base S1–S6). Este perfil usa ese guion tal cual.

## Extensión — servicios que consumen APIs (microservicios, integraciones, workers)

Actívala cuando el sistema a especificar **consume APIs de terceros o de otros servicios internos** (típico: un microservicio orquestador). Añade estas preguntas ad-hoc al guion base — en modo `nuevo-con-material` (sf-brief), la mayoría llega precargada del brief y se confirma por lote; pregunta solo lo `[ausente]`:

- **S2.Qa (Actores):** ¿quién consume ESTE servicio? (otros servicios, un frontend, un cron, humanos vía panel). Los sistemas también son actores.
- **S3.Qa (Contrato expuesto):** ¿qué expone el servicio — endpoints, eventos, colas — y con qué forma de respuesta? Es la funcionalidad observable número uno de un servicio.
- **S4.Qa (Resiliencia por dependencia):** por CADA API consumida: ¿qué pasa si falla, tarda o devuelve error? ¿Reintentos (cuántos, con qué espera)? ¿Timeout? ¿Fallback o se propaga el error? ¿La operación es idempotente si se repite? — Son los error paths del flujo; sin ellos el spec de un servicio integrador no sirve.
- **S5.Qa (Inventario de APIs consumidas):** por API: base URL, autenticación, endpoints usados, estructura clave de respuesta, límites (rate limits, cuotas). Va a la tabla "APIs consumidas" del SPEC §5.
- **S6.Qa (Operación):** manejo de secretos/credenciales de las APIs · observabilidad (logs/trazas de cada llamada externa) · SLA propio vs SLA de los terceros (no prometas 99.9% orquestando APIs de 99%) · ¿qué pasa si un tercero cambia su contrato?

**Glosario en integraciones:** las entidades de los schemas de las APIs externas se canonizan explícitamente contra el dominio propio ("el `customer` de la API de pagos ES nuestro **Cliente**" o "NO lo es — capturar ambos"). Es el punto donde más se rompe la igualdad semántica.

**ADRs típicos de esta extensión:** elección de cada API de tercero (difícil de revertir), síncrono vs colas/eventos, estrategia de reintentos/idempotencia global.

## Canon / Glosario
Términos únicos del dominio del software (entidades, conceptos de negocio). No conceptos generales de programación.

## Decisiones irreversibles
ADRs clásicos: elección de base de datos, patrón de arquitectura, proveedor de auth, etc., cuando cumplen los 3 criterios.

## Notas
- En Sección 5 (Arquitectura) el agente pregunta el stack/tecnología que usa el equipo; **no asume ninguno**. Si el usuario dice "a decidir", el Arquitecto propone una opción concreta y justificada.
