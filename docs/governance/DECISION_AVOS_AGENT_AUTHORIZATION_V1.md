# DECISIÓN — Autorización de AVOS en Neuralítica, V1

| Campo | Valor |
|---|---|
| Identificador | `DECISION-AVOS-AGENT-AUTHORIZATION-V1` |
| Estado | **PROPOSED_FOR_REGISTRATION.** Efectiva al merge. |
| Dónde vive este archivo | `AGASocial/neuralitica-marketing`, `docs/governance/DECISION_AVOS_AGENT_AUTHORIZATION_V1.md` |
| Dónde se registra | `AGASocial/neuralitica-marketing`, `docs/governance/DECISION_AVOS_AGENT_AUTHORIZATION_V1.md` |
| Quién lo registra | Los mantenedores, con un PR que ellos abren y aprueban. AVOS no lo fusiona y no lo copia a ese repo. |

Este texto está listo para que Neuralítica lo registre. Hasta que ese PR esté fusionado en `AGASocial/neuralitica-marketing`, AVOS no tiene autoridad allí, no abre PRs y `$desarrollar` sigue en cuarentena.

## Decisión

Gabriel Vega, como mantenedor de Neuralítica, delega en Erick Valderrama (`erickgvl`) la dirección de AVOS dentro de Neuralítica, con el alcance de esta decisión y con nada más.

La delegación no transfiere el producto, el roadmap, los deploys ni la cuarentena del orquestador. No es un GO de la Junta de PulsoSites. No cambia `READINESS`.

## Partes

| Persona | Cuenta | Papel en esta decisión |
|---|---|---|
| Erick Valderrama | `erickgvl` | Recibe la dirección de AVOS dentro del alcance. Aprueba y puede fusionar solo las clases delegadas. |
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
3. **Erick puede aprobar y fusionar** los PRs de esas clases sin intervención de Gabriel. Hace falta CI verde y el SHA del head fijado: la aprobación vale para ese SHA. Si el head se mueve, la aprobación no viaja.
4. **Presupuesto:** USD 0, o un tope explícito que se escriba al registrar la decisión (`budget_usd_cap`). A0 no gasta. No hay `model_call` mientras la cuota sea 0.
5. **Vigencia:** 90 días desde el merge de esta decisión en Neuralítica. **Revocable en cualquier momento** por Erick o por Gabriel, con un comentario en el PR de la decisión o con un PR que la revierta. La revocación de Gabriel sale de la cuenta designada.

## Reservado a Gabriel y Erick en conjunto

Hace falta el acuerdo de los dos. Erick no lo decide solo. AVOS no lo propone como trabajo delegado.

- Producto y roadmap: Instagram, el worker de Fly y staging.
- Deploys e infraestructura.
- Credenciales, datos de cliente y publicaciones.
- Reactivar `$desarrollar` o el master-orchestrator.
- Modificar o ampliar esta delegación, incluida la cuenta designada de Gabriel y la lista de clases.

## Identidad y atribución

AVOS trabaja por Cursor. Cada PR que abra declara que lo abre AVOS y enlaza esta decisión una vez registrada.

AVOS no presenta sus commits, sus descripciones ni sus comentarios como aprobación humana. Un comentario escrito por el agente, aunque la sesión esté a nombre de Erick, no es la aprobación de Erick. La aprobación y el merge de Erick salen de la cuenta `erickgvl`. La firma de Gabriel sale solo de la cuenta designada.

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
- la CI del head no está verde;
- el head no está fijado, o el SHA cambió después de la aprobación;
- la clase no está en la lista delegada;
- el trabajo es producto, roadmap, Instagram, Fly, staging, deploy, infraestructura, credenciales, datos de cliente, publicación, reactivación de `$desarrollar`, o un cambio de esta delegación;
- se cuentan `gabrielvega` y `byagasocial` como dos firmantes;
- AVOS presenta una escritura propia como aprobación humana.

## Cómo se registra

1. Un humano abre un PR en `AGASocial/neuralitica-marketing` con este texto en `docs/governance/DECISION_AVOS_AGENT_AUTHORIZATION_V1.md`, y lo enlaza desde `AGENTS.md`.
2. Erick aprueba desde `erickgvl`.
3. Gabriel aprueba desde la cuenta designada (`byagasocial`).
4. Un humano fusiona ese PR. AVOS no lo fusiona.
5. Después de ese merge se puede copiar el registro al manifiesto de AVOS como `neuralitica_authorization.status = RECORDED`, con `gabriel_approving_login` igual a la cuenta designada, las clases de arriba, `branches` `avos/*`, `autonomy_level` `A2`, el tope de presupuesto y `expires_at` a 90 días.
6. Hasta ese merge, AVOS no abre PRs en Neuralítica.
