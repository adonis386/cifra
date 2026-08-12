# Manual de marca — Informática González (aplicación a Cifra)

> El archivo local `manual-marca-informatica-gonzalez.md` no estaba disponible en el entorno del agente.
> Esta guía resume el **sistema de marca implementado** en [informaticagonzalez.com](https://www.informaticagonzalez.com)
> (tokens de `src/index.css` del repo de marca) y cómo Cifra lo usa.

## Identidad

| Elemento | Valor |
|----------|--------|
| Estudio | Informática González |
| Producto | **Cifra** — Contabilidad Venezuela |
| Sitio | https://www.informaticagonzalez.com |
| Tono | Español B2B, confiado, operativo (“hecho para operar”) |

## Color

| Token | Hex | Uso en Cifra |
|-------|-----|--------------|
| `--brand-bg` | `#0A0A0A` | Sidebar, panel auth, nav móvil |
| `--brand-surface` | `#111111` | Superficies oscuras elevadas |
| `--brand-light` | `#FCFCFC` | Fondos claros / panel formulario |
| `--brand-muted` | `#737373` | Texto secundario |
| `--brand-border` | `#262626` | Bordes en UI oscura |
| `--brand-accent` | `#2563EB` | CTA, links, ítem activo, selección |
| `--brand-accent-hover` | `#1D4ED8` | Hover de acento |
| `--brand-accent-muted` | `#DBEAFE` | Fondos soft / badges |

Éxito: `#15803D` · Error: `#DC2626`

## Tipografía

| Rol | Familia | Uso |
|-----|---------|-----|
| Display | **Tektur** 400–700 | Wordmark Cifra, títulos de página (`font-display`) |
| UI / cuerpo | **Inter** 300–700 | Formularios, tablas, navegación |
| Mono | Geist Mono | RIF, códigos |

Labels de marca: uppercase + tracking ~`0.22em` (clase `.label-brand`).

## Forma y motion

- Esquinas contenidas: `--radius-md/lg = 8px` (evitar pills / radios grandes).
- Transiciones: ~`300ms`.
- Respeta `prefers-reduced-motion`.

## Logo

Assets en `web/public/brand/`:

| Archivo | Uso |
|---------|-----|
| `ig-logo-white.webp` | Sobre fondo oscuro (sidebar, auth) |
| `ig-logo-dark.jpeg` | Sobre fondo claro |
| `ig-logo-blue.png` | Favicon / marca azul |

Clear space: no saturar el monograma; en producto se muestra como “powered by” junto al wordmark **Cifra** (Tektur).

## Aplicación en el producto

1. Auth: panel oscuro full-bleed con logo IG + hero **Cifra**; formulario sobre `#FCFCFC`.
2. App shell: sidebar `#0A0A0A`, activo `#2563EB`, contenido claro.
3. CTAs: `bg-brand-accent` / hover `accent-hover`.
4. Metadata / autor: Informática González.

## Archivos clave

- `web/src/app/globals.css` — tokens
- `web/src/app/layout.tsx` — fuentes
- `web/src/app/(auth)/layout.tsx` — branding login/signup
- `web/src/components/app-shell.tsx` — shell con marca
- `web/public/brand/*` — logos
