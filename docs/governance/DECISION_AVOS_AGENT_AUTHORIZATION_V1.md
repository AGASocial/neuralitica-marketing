# DECISIÓN — Autorización de AVOS en Neuralítica, V1

| Campo | Valor |
|---|---|
| Identificador | `DECISION-AVOS-AGENT-AUTHORIZATION-V1` |
| Estado | **PROPOSED_FOR_REGISTRATION.** Efectiva al merge. |
| Dónde vive este archivo | `AGASocial/neuralitica-marketing`, `docs/governance/DECISION_AVOS_AGENT_AUTHORIZATION_V1.md` |
| Dónde se registra | `AGASocial/neuralitica-marketing`, `docs/governance/DECISION_AVOS_AGENT_AUTHORIZATION_V1.md` |
| Quién lo registra | Los mantenedores, con un PR que ellos abren y aprueban. AVOS no lo fusiona. |

Este texto está listo para que Neuralítica lo registre. Hasta que ese PR esté fusionado en `AGASocial/neuralitica-marketing`, AVOS no tiene autoridad allí, no abre otros PRs y `$desarrollar` sigue en cuarentena.

## Excepción de este PR de registro

El PR #6 (`avos/decision-avos-agent-authorization-v1`) lo abrió un agente como excepción bajo el GO 2 de Gabriel en https://github.com/AGASocial/neuralitica-marketing/issues/4#issuecomment-6196175686. Esa excepción no es autoridad operativa general previa. No autoriza otros PRs, no fusiona este y no adelanta el alcance delegado.

## Decisión

Gabriel Vega, como mantenedor de Neuralítica, delega en Erick Valderrama (`erickgvl`) la dirección de AVOS dentro de Neuralítica, con el alcance de esta decisión y con nada más.

La delegación no transfiere el producto, el roadmap, los deploys ni la cuarentena del orquestador. No es un GO de la Junta de PulsoSites. No cambia `READINESS`.

## Partes

| Persona | Cuenta | Papel en esta decisión |
|---|---|---|
| Erick Valderrama | `erickgvl` | Recibe la dirección de AVOS dentro del alcance. Fusiona solo las clases delegadas, y solo con Human Gate. |
| Gabriel Vega | Una sola cuenta designada: `byagasocial`. | Delega. Firma con esa cuenta. Conserva, junto con Erick, lo reservado. |

Erick confirmó que `gabrielvega` y `byagasocial` son las dos cuentas de Gabriel Vega. `byagasocial` dio el GO 2 en https://github.com/AGASocial/neuralitica-marketing/issues/4#issuecomment-6196175686. Gabriel usa **una** cuenta designada para firmar esta decisión y cualquier revocación. La cuenta designada es `byagasocial`. `gabrielvega` es la misma persona: un comentario desde esa cuenta no es una segunda aprobación. Cambiar la cuenta designada es modificar esta delegación y exige a los dos.

## Alcance delegado

1. **AVOS, a través de Cursor, solo puede abrir Draft PRs en ramas `avos/*`.** No fusiona, no empuja a `main`, no cierra issues y no comenta como si fuera un mantenedor.
2. **Clases permitidas**, y ninguna otra:
   - dejar la CI en verde;
   - parches de dependencia y de seguridad dentro del mismo major;
   - tests;
   - tipado y lint;
   - documentación.
3. **Erick puede fusionar** los PRs de esas clases sin intervención de Gabriel, solo después del Human Gate de ese PR y de ese SHA de head. Hace falta CI verde, salvo un PR de reparación de CI mientras dure el bootstrap. La aprobación vale para ese SHA. Si el head se mueve, la aprobación no viaja.
4. **Presupuesto:** USD 0, o un tope explícito que se escriba al registrar la decisión (`budget_usd_cap`). A0 no gasta. No hay `model_call` mientras la cuota sea 0.
5. **Vigencia:** 90 días desde el merge de esta decisión en Neuralítica. **Revocable en cualquier momento** por Erick o por Gabriel, con un comentario en el PR de la decisión o con un PR que la revierta. La revocación de Gabriel sale de la cuenta designada.

## Bootstrap de CI

El texto que Gabriel autorizó exige CI verde. En `main` (`48731ce`) no lo está. El run https://github.com/AGASocial/neuralitica-marketing/actions/runs/38764427554 deja tres jobs en rojo:

| Job | Errores que fallan |
|---|---|
| typecheck | 321 |
| lint | 474 |
| tests | 11 |

Nombres de tests que fallan en esa línea base: `cross-tenant broll clip → failed without spawn`; `fails without spawn when input asset client_id mismatches job`; `fails without spawn when base asset client_id mismatches job`; `Phase B-M1: voiceoverTimingHash mismatch → failed, spawn never called`; `Phase B-M1: malformed non-empty voiceoverTimingHash → CONFIG fail, no spawn`; `happy path updates publish columns and returns published slot`; `returns LLM component breakdown and totals`; `flags over-budget when actual exceeds cap`; `auto-chain does not revert branding`; `happy Preferencias path only touches neuramark_visual_preferences`; `happy path upserts Preferencias only — no job/strategy tables`.

**Esta cláusula cambia las condiciones que Gabriel aceptó.** No rige solo con este texto. Hace falta el acuerdo explícito de Erick y de Gabriel (`byagasocial`) antes del merge de esta decisión.

Mientras el bootstrap esté abierto, un PR puede no tener CI verde solo si es de reparación de CI y cumple todo esto:

- es solo reparación de CI de esos tres jobs (tipado, lint o tests ya en rojo). No cubre documentación, parches de dependencia ni nada reservado;
- cero regresiones nuevas frente a la línea base registrada: en cada job, el mismo número de errores o menos; ningún nombre de test que falle y que la línea base no tuviera;
- el conteo de errores baja de forma estricta en al menos un job;
- el PR incluye los números de la línea base contra la que se compara y la evidencia de la comparación.

La línea base inicial es la tabla de arriba. Cada PR de reparación que se fusiona la sustituye por sus conteos nuevos, solo hacia abajo, y esos números quedan en ese PR. El siguiente se compara con esa línea base ya bajada.

El bootstrap termina solo cuando los tres jobs están verdes. No se reabre. Desde ese momento hace falta CI verde en todo PR delegado.

## Reservado a Gabriel y Erick en conjunto

Hace falta el acuerdo de los dos. Erick no lo decide solo. AVOS no lo propone como trabajo delegado.

- Producto y roadmap: Instagram, el worker de Fly y staging.
- Deploys e infraestructura.
- Credenciales, datos de cliente y publicaciones.
- Reactivar `$desarrollar` o el master-orchestrator.
- Modificar o ampliar esta delegación, incluida la cuenta designada de Gabriel y la lista de clases.

## Identidad y atribución

AVOS trabaja por Cursor. Cada PR que abra declara que lo abre AVOS y enlaza esta decisión una vez registrada.

AVOS no presenta sus commits, sus descripciones ni sus comentarios como aprobación humana. Un comentario escrito por el agente, aunque la sesión esté a nombre de Erick, no es la aprobación de Erick.

La identidad de GitHub `erickgvl` por sí sola no prueba una aprobación humana: los agentes también la usan. Un agente nunca trata como aprobación lo que él mismo escribe con `erickgvl` (commit, comentario, review o descripción de PR).

El merge bajo esta delegación exige un Human Gate inequívoco, uno de estos dos:

- un GO explícito de Erick, en su chat con Grok Bot, que nombre el PR y el SHA del head, copiado en el PR con origen `human_chat_go`;
- o un review de aprobación en GitHub desde una cuenta de mantenedor que los agentes no usan: `byagasocial` o `gabrielvega`.

Copiar el GO en el PR no es la aprobación. La aprobación es el mensaje de Erick en ese chat, o el review de una de esas dos cuentas. Donde esta decisión exige a los dos, un solo Human Gate no sustituye al otro. La firma de Gabriel sale solo de la cuenta designada.

## Rastro de auditoría

Cada PR de AVOS enlaza, en la descripción:

- el path y el commit de esta decisión en Neuralítica, después del registro;
- el SHA base del snapshot verificado;
- el SHA del head propuesto y, si Erick fusiona, el SHA del head fusionado;
- la clase de tarea;
- el resultado de CI.

Ese rastro no es un GO. No entra al ledger de PulsoSites. El ledger de GOs de Neuralítica en AVOS sigue vacío: esta decisión no lo llena.

## Condiciones de parada

AVOS no abre el PR, y Erick no fusiona bajo esta delegación, si ocurre cualquiera de estas:

- esta decisión no está fusionada en `AGASocial/neuralitica-marketing`;
- pasaron los 90 días, o alguien la revocó;
- la CI del head no está verde, salvo un PR de reparación de CI que cumpla el bootstrap mientras siga abierto;
- no hay Human Gate para ese PR y ese SHA de head;
- el head no está fijado, o el SHA cambió después de la aprobación;
- la clase no está en la lista delegada;
- el trabajo es producto, roadmap, Instagram, Fly, staging, deploy, infraestructura, credenciales, datos de cliente, publicación, reactivación de `$desarrollar`, o un cambio de esta delegación;
- se cuentan `gabrielvega` y `byagasocial` como dos firmantes;
- AVOS presenta una escritura propia como aprobación humana.

## Cómo se registra

1. Un humano abre un PR en `AGASocial/neuralitica-marketing` con este texto en `docs/governance/DECISION_AVOS_AGENT_AUTHORIZATION_V1.md`, y lo enlaza desde `AGENTS.md`. El PR #6 es la excepción ya abierta bajo el GO 2. No se repite.
2. Erick da el Human Gate: un GO en su chat con Grok Bot que nombre este PR y el SHA del head, registrado en el PR con origen `human_chat_go`. Un review o comentario desde `erickgvl` no basta.
3. Gabriel aprueba desde la cuenta designada (`byagasocial`). El bootstrap de CI cambia lo que él aceptó: los dos tienen que aceptarlo de forma explícita.
4. Un humano fusiona ese PR. AVOS no lo fusiona.
5. Después de ese merge se puede copiar el registro al manifiesto de AVOS como `neuralitica_authorization.status = RECORDED`, con `gabriel_approving_login` igual a la cuenta designada, las clases de arriba, `branches` `avos/*`, `autonomy_level` `A2`, el tope de presupuesto y `expires_at` a 90 días.
6. Hasta ese merge, AVOS no abre otros PRs en Neuralítica.

## Cambios respecto al texto autorizado por Gabriel

Frente a `avos-core` `abb7cd46704807f761c27f868ab4f7d71ccbeef1` (`docs/ventures/neuralitica/DECISION_AVOS_AGENT_AUTHORIZATION_V1.proposed.md`):

- **Estado.** `PROPUESTA. No registrada.` pasa a `PROPOSED_FOR_REGISTRATION`, efectiva al merge.
- **Ubicación.** Deja `avos-core` `docs/ventures/neuralitica/DECISION_AVOS_AGENT_AUTHORIZATION_V1.proposed.md`. Vive y se registra en `docs/governance/DECISION_AVOS_AGENT_AUTHORIZATION_V1.md`. `AGENTS.md` lo enlaza.
- **Cuenta.** El default `byagasocial` queda fijado como la cuenta designada.
- **GO.** El GO del hotfix en `#4` queda citado como el GO 2 de Gabriel: https://github.com/AGASocial/neuralitica-marketing/issues/4#issuecomment-6196175686.
- **Excepción de registro.** El PR #6 lo abrió un agente bajo ese GO 2. No es autoridad operativa general. El texto autorizado decía que AVOS no copia este archivo a este repo.
- **Bootstrap de CI.** Cambia la CI verde que Gabriel aceptó. Línea base del run 38764427554: typecheck 321, lint 474, tests 11. Solo PRs de reparación de CI, sin regresiones nuevas, con baja estricta en al menos un job, números y evidencia en el PR, y fin automático cuando los tres jobs estén verdes. Exige acuerdo explícito de Erick y de Gabriel (`byagasocial`) antes del merge.
- **Human Gate.** La cuenta `erickgvl` ya no basta como aprobación. Hace falta el GO de Erick en el chat con Grok Bot (PR y SHA, origen `human_chat_go`) o un review de `byagasocial` / `gabrielvega`.

No cambian la cuarentena de `$desarrollar`, lo reservado a los dos, las clases, las ramas `avos/*`, el presupuesto ni la vigencia.
