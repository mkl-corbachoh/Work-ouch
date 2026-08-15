# Kinetic Dark - sistema visual propuesto

## Procedencia

Extraido mediante el MCP de Stitch el 2026-08-15 del unico proyecto accesible,
titulado `Diario de Entrenamiento`, cuya interfaz usa la marca `work-ouch!`.

- Project ID: `3057831273409740715`
- Sistema principal propuesto: `Kinetic Dark`
- Asset ID: `2230c943d38742fb86232f9a28bed91c`
- Sistema alternativo del proyecto: `Kinetic Performance`
- Asset alternativo: `9a93d55cced6411ba5132c8adac8c744`

Los tres HTML visibles usan los tokens de Kinetic Dark (`#131313`, `#caf300`,
Archivo Narrow, Inter y JetBrains Mono), aunque el tema general devuelto al
listar el proyecto contiene Kinetic Performance. Para evitar mezclar sistemas,
esta propuesta adopta Kinetic Dark. La decision sigue sujeta a revision de la
spec draft.

## Principios

- Intensidad controlada: precisa, rapida y motivadora sin ruido decorativo.
- Alto contraste para gimnasio y baja iluminacion.
- Jerarquia por capas tonales y bordes, no por sombras pesadas.
- Lima electrica reservada para accion primaria, foco y estado activo.
- Mobile-first con controles utilizables con una mano y durante esfuerzo.
- Datos grandes y condensados; instrucciones en una tipografia de lectura.
- El estado nunca depende solo del color, glow o animacion.

## Tokens de color

Los nombres siguientes son semanticos para produccion. Los valores proceden del
sistema Kinetic Dark y de sus pantallas visibles.

| Token propuesto | Valor | Uso |
|---|---|---|
| `--color-canvas` | `#131313` | Fondo principal |
| `--color-surface-lowest` | `#0e0e0e` | Pozos y tablas densas |
| `--color-surface-low` | `#1c1b1b` | Cards principales |
| `--color-surface` | `#201f1f` | Inputs y controles |
| `--color-surface-high` | `#2a2a2a` | Controles elevados |
| `--color-surface-highest` | `#353534` | Overlays y seleccion inactiva |
| `--color-surface-bright` | `#393939` | Hover/pressed de superficie |
| `--color-text` | `#e5e2e1` | Texto principal |
| `--color-text-muted` | `#c5c9ac` | Texto secundario |
| `--color-outline` | `#8f9378` | Borde/foco secundario |
| `--color-outline-subtle` | `#444932` | Divisores y bordes de card |
| `--color-accent` | `#caf300` | CTA, activo y foco |
| `--color-accent-dim` | `#b0d500` | Variante contenida |
| `--color-on-accent` | `#171e00` | Texto/icono sobre accent |
| `--color-error` | `#ffb4ab` | Error accesible sobre oscuro |
| `--color-error-container` | `#93000a` | Fondo de error |
| `--color-on-error` | `#690005` | Contenido sobre error claro |

El export de Stitch llama `primary` a `#ffffff` y usa `primary-fixed` para la
lima. Produccion no conservara esa ambiguedad: `accent` representa siempre la
lima interactiva.

### Escala RPE de referencia

| RPE | Color Stitch | Requisito de produccion |
|---|---|---|
| 6 | `#4ade80` | Mostrar tambien numero/texto |
| 7 | `#84cc16` | Mostrar tambien numero/texto |
| 8 | `#eab308` | Mostrar tambien numero/texto |
| 9 | `#f97316` | Mostrar tambien numero/texto |
| 10 | `#ef4444` | Mostrar tambien numero/texto |

El contrato admite RPE 1-10. La UI no debe limitar el dominio a 6-10 solo porque
las referencias visuales muestran ese subconjunto.

## Tipografia

| Estilo | Familia | Tamano | Peso | Line-height | Tracking |
|---|---|---:|---:|---:|---:|
| `display-lg` | Archivo Narrow | 48px | 700 | 1.1 | -0.02em |
| `headline-lg` | Archivo Narrow | 32px | 600 | 1.2 | normal |
| `headline-lg-mobile` | Archivo Narrow | 28px | 600 | 1.2 | normal |
| `headline-md` | Archivo Narrow | 24px | 600 | 1.2 | normal |
| `data-lg` | Archivo Narrow | 32px | 700 | 1 | -0.01em |
| `body-lg` | Inter | 18px | 400 | 1.5 | normal |
| `body-md` | Inter | 16px | 400 | 1.5 | normal |
| `label-md` | JetBrains Mono | 14px | 500 | 1.2 | normal |

- Archivo Narrow comunica fuerza y permite cifras grandes en poco espacio.
- Inter se reserva para instrucciones, formularios y lectura continua.
- JetBrains Mono se usa en metadata, timestamps, unidades y etiquetas tecnicas;
  no en parrafos largos.
- Cifras de temporizador y series usan `font-variant-numeric: tabular-nums`.
- Se definen fallbacks de sistema y el contenido no espera a la fuente remota.

## Espaciado y grid

- Unidad base: 4px.
- `xs`: 4px.
- `sm`: 8px.
- `md`: 16px.
- `lg`: 24px.
- `xl`: 32px.
- Margen horizontal movil: 20px cuando el viewport lo permite.
- Target tactil minimo: 48 por 48 CSS px.
- Grid movil: 4 columnas.
- Grid escritorio: 12 columnas.
- Cards en listas: gap 16px.
- Elementos dentro de una card: gap 8px.
- Separacion de secciones: 24-40px segun densidad.

La app debe funcionar desde 320px. A esa anchura el margen puede reducirse de
forma controlada para conservar targets y evitar scroll horizontal.

## Radios

| Token | Valor | Uso |
|---|---|---|
| `sm` | 4px | Microelementos |
| `default` | 8px | Botones, chips e inputs |
| `md` | 12px | Grupos y controles grandes |
| `lg` | 16px | Cards de workout y dialogos |
| `xl` | 24px | Contenedores protagonistas, con moderacion |
| `full` | 9999px | Pills, progress y botones circulares |

Los HTML visibles configuran hasta 12px en Tailwind pero usan tambien 16/24px
en clases y design docs. Los tokens de produccion deben declarar esos valores de
forma explicita, no depender de aliases accidentales del export.

## Elevacion

1. Canvas: `#131313`.
2. Card: `#1c1b1b` con borde 1px `#444932` o equivalente con contraste sutil.
3. Control: `#201f1f` o `#2a2a2a`.
4. Overlay: superficie al 70-95% con `backdrop-filter: blur(20px)` solo donde sea
   util y con fallback opaco.
5. Activo: borde lima y glow suave maximo de 5-12px a baja opacidad.

No se usan sombras grandes para comunicar estado. Reduced motion y ausencia de
backdrop filter no deben degradar comprension.

## Componentes

### Boton primario

- Fondo accent y texto on-accent.
- Peso 600-700.
- Altura movil habitual 56px; 72px solo para la accion dominante del modo
  Focus.
- Estado disabled distinguible por opacidad, cursor y texto; no solo color.
- Press puede reducir escala de forma leve si reduced motion no esta activo.

### Boton secundario y ghost

- Secundario: fondo transparente, borde 1px accent, texto accent.
- Ghost: texto principal o muted, sin fondo permanente.
- Las acciones destructivas usan semantica error y confirmacion; cancelar un
  workout no debe parecer una accion neutra accidental.

### Cards

- Fondo surface-low, borde 1px subtle y padding 16px.
- Titulos de datos pueden usar label-md; nombres de ejercicios usan
  headline-md/headline-lg-mobile.
- No depender de fotografias. La API no expone imagen de ejercicio.

### Inputs

- Altura minima 48px; preferencia 56px en workout.
- Fondo surface o surface-high, label persistente y unidad visible.
- Foco con outline de al menos 2px y separacion suficiente; no solo bottom
  border.
- Los campos numericos permiten teclado directo ademas de +/-.

### Controles numericos

- +/- de al menos 48px con nombre accesible completo.
- Valor central grande en Archivo Narrow y numeros tabulares.
- Incremento visible o documentado; no asumir siempre 1.25kg.
- Minimos y maximos siguen el contrato, no los valores de muestra de Stitch.

### Selector RPE

- Chips de al menos 48px.
- Numero y, cuando haya espacio, descripcion textual.
- Seleccion indicada por borde, peso/icono y `aria-pressed` o radio semantico,
  ademas del color.

### Progreso

- Barra con track surface-highest y fill accent.
- Siempre acompanada por texto actual/total.
- No mostrar porcentaje hasta aprobar una formula derivada de datos reales.

### Temporizador

- Numeros tabulares y controles pausar/anadir/saltar cuando se definan.
- Estado local y efimero; no aparenta sincronizacion con servidor.
- No usa live region cada segundo.

### Navegacion

- Navegacion inferior movil de hasta cuatro destinos, 84px incluida safe area.
- Fondo glass con fallback opaco.
- Destino activo con icono, label y accent; no solo glow.
- El workout activo puede suprimir la navegacion y usar cierre con confirmacion.

## Movimiento

- Transiciones de 120-200ms para color, opacity y transform.
- No animar continuamente salvo un temporizador/progreso que lo necesite.
- `prefers-reduced-motion: reduce` elimina scale, smooth scrolling, pulsos y
  transiciones no esenciales.
- La vibracion de muestra de Focus no se asume disponible ni necesaria.

## Imagenes e iconos

- Los assets fotograficos de Stitch son referencias de composicion, no contenido
  autorizado ni proporcionado por la Training API.
- `videoUrl` puede habilitar una accion de tecnica, pero no una miniatura
  inventada.
- Iconos deben incluir label visible o nombre accesible; Material Symbols del
  HTML exportado no obliga a usar esa libreria en produccion.

## Correcciones obligatorias frente al HTML de Stitch

- No copiar Tailwind por CDN, scripts inline ni handlers DOM directos.
- No usar `maximum-scale=1` ni `user-scalable=no`; el zoom debe permanecer.
- No ocultar scrollbars globalmente. Solo puede ocultarse una barra local si el
  control sigue siendo descubrible y accesible.
- No fijar valores, textos, porcentajes o imagenes de ejemplo como datos reales.
- No usar colores sin comprobar contraste en el contexto final.
- No convertir cada variante en componentes duplicados.
- No presentar incrementos, RPE 6-10 o tiempos de descanso de muestra como
  reglas de dominio.
