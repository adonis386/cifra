# Manual de marca — Informática González
**Uso:** pasá este documento completo a un agente IA como contexto de marca antes de diseñar, redactar, maquetar o adaptar un proyecto.

> **Aplicación en Cifra:** producto independiente. Solo se toman los **colores de acento** (`#2563EB` / hover / muted) y un crédito discreto “Desarrollado por Informática González”. UI clara por defecto; sin tipografías Tektur/Inter de marca ni chrome oscuro (sidebar, auth).

**Web:** https://informaticagonzalez.com  
**Instagram:** @informatica.gonzalez  
**Email:** contacto@informaticagonzalez.com  
**Teléfono:** +58 412 366 8513  
**WhatsApp (links del sitio):** https://wa.link/p20o4u · https://wa.link/9fgi2d  
**Ubicación:** Caracas, Venezuela  
**Posicionamiento:** Estudio / studio de desarrollo de software a medida (no agencia genérica de marketing).

---

## 1. Identidad en una frase

**Informática González** diseña y construye **software empresarial a la medida**: sistemas, apps, paneles y productos digitales para empresas, instituciones y startups en Venezuela.

Tagline de producto (sitio):
> Software Empresarial a la Medida

Statement de marca:
> Ideas audaces. Código impecable. Experiencias que importan.

Studio:
> Pensadores humanos. Creadores digitales.

Subheadline de apoyo:
> Soluciones tecnológicas seguras y escalables para empresas, instituciones y startups.

---

## 2. Personalidad de marca

| Atributo | Cómo se siente | Cómo NO se siente |
|---|---|---|
| Técnica | Clara, precisa, confiable | Jerga innecesaria o humo de IA |
| Studio | Creativa, humana, moderna | Corporativa fría o burocrática |
| Directa | Frases cortas, CTA claros | Textos largos tipo brochure genérico |
| Premium operativo | Calidad de producto digital | “Barato”, plantillas, freelance caótico |
| Local con estándar global | Venezuela + calidad internacional | Provincial o amateur |

**Tono de voz**
- Español (VE), formal-cercano (usted en propuestas; más directo en web/RRSS).
- Mayúsculas en labels/eyebrows y CTAs cortos.
- Preferir verbos de resultado: construir, operar, escalar, automatizar.
- Evitar: emojis en piezas serias, “somos los mejores”, purple-AI clichés, stock phrases genéricas.

**Vocabulario preferido**
- Sistema / plataforma / panel / portal / a medida / studio / proyectos / iniciar proyecto / hablemos
- Evitar como identidad: “startup unicornio”, “disruptivo”, “sinergias”, “soluciones 360” vacías

---

## 3. Logo y assets

| Asset | Ruta típica | Uso |
|---|---|---|
| Logo azul (principal digital) | `public/assets/logo-blue.png` | Fondos claros, PDFs, cotizaciones, favicon-related |
| Logo alterno / foto marca | `public/assets/logo-2.jpeg`, `logo-3.webp` | Studio / about / fondos oscuros con cuidado |

**Reglas**
- Nombre legal/comercial: **Informática González** (con tilde).
- Handle: **@informatica.gonzalez**
- Dominio: **informaticagonzalez.com**
- No deformar el logo; respetar aire alrededor.
- Sobre fondo claro: logo azul. Sobre fondo oscuro: preferir versión clara/contraste alto; no poner azul sobre azul saturado.
- En documentos: logo + nombre en mayúsculas espaciadas o title case limpio + línea azul `#2563eb`.

---

## 4. Color system (tokens oficiales)

Usar estos valores; no inventar una paleta púrpura/crema/terracotta.

| Token | Hex | Uso |
|---|---|---|
| `brand-bg` | `#0A0A0A` | Fondos oscuros, footer, secciones studio |
| `brand-surface` | `#111111` | Cards / superficies en modo oscuro |
| `brand-light` | `#FCFCFC` | Fondos claros principales |
| `brand-muted` | `#737373` | Texto secundario |
| `brand-border` | `#262626` | Bordes en dark |
| `brand-accent` | `#2563EB` | Azul marca, CTAs, labels, links activos |
| `brand-accent-hover` | `#1D4ED8` | Hover de CTAs |
| `brand-accent-muted` | `#DBEAFE` | Fondos suaves / highlights |

**Texto**
- Sobre claro: `#0A0A0A` / neutral-950
- Sobre oscuro: `#FCFCFC` / white; secundario `neutral-400`–`neutral-500`

**Reglas de color**
- El azul es acento, no fondo dominante de toda la pieza.
- Alternar bloques claro/oscuro como el sitio (hero dark → contenido light → studio dark).
- Selection / highlight UI: azul accent sobre texto blanco.
- Evitar glows morados, neón genérico, gradientes “AI purple”.

---

## 5. Tipografía

| Rol | Familia | Pesos | Uso |
|---|---|---|---|
| Display / títulos | **Tektur** | 400–700 | H1–H6, números grandes, headlines |
| Cuerpo / UI | **Inter** | 300–600 | Párrafos, nav, botones, forms |
| Fallback cuerpo | `system-ui, sans-serif` | — | Solo si Inter no carga |

**Jerarquía típica**
- Eyebrow / label: Inter, `text-xs`, UPPERCASE, `tracking-[0.3em]`, color accent
- Headline: Tektur, bold, tracking tight, leading ~0.95–1.1
- Body: Inter, 16–20px en web, leading relaxed
- CTA: Inter medium, `text-sm`, UPPERCASE, `tracking-widest`

**No usar como marca:** Inter + Roboto + Arial mezclados al azar; serif editorial; Comic Sans; fuentes “startup purple” genéricas.

---

## 6. UI / diseño visual

**Estética**
- Agencia digital limpia: mucho aire, tipografía fuerte, poco ornamento.
- Cards mínimas: borde fino, sin sombra multi-capa; hover → borde accent.
- Botones: rectos (sin pill redondeado exagerado), padding generoso, uppercase.
- Motion: GSAP / scroll reveal sutil; presencia, no ruido.
- Imágenes de producto reales cuando sea posible; grayscale → color en about.

**Patrones del sitio**
- Nav corta: Proyectos · Servicios · Studio · CTA “Iniciar Proyecto” / “Hablemos”
- Labels: `Studio`, `Servicios`, `Contacto` en accent uppercase
- Contenedor ancho ~1400px, padding generoso (`py-24`–`py-40`)

**Evitar**
- Dashboard clutter en landings
- Badges flotantes sobre heroes
- Cards en el hero
- Stat strips + chips + pills apilados
- Fondo crema + serif terracotta (cliché AI)
- Tema solo-púrpura

---

## 7. Servicios oficiales (catálogo)

1. Sistemas de Administración  
2. Aplicaciones Móviles  
3. Paneles Administrativos  
4. Entorno Cliente  
5. Desarrollo Web  
6. E-commerce  
7. Redes Empresariales  
8. Consultoría Tecnológica  

Frase de servicios (sitio): **“Hecho para operar.”**

---

## 8. Documentos / cotizaciones / PDFs

Cuando el agente genere PDFs o propuestas:

1. Membrete: logo azul + **INFORMÁTICA GONZÁLEZ** + subtítulo “Desarrollo de software a medida · Caracas, Venezuela”
2. Línea inferior del header en `#2563EB`
3. Títulos de sección en accent uppercase
4. Tablas con borde `#E2E8F0`, header `#F8FAFC`
5. Footer: web · Instagram · WhatsApp/email
6. No copiar nombres de otras agencias; siempre firma Informática González
7. Precios: claros, en USD cuando aplique; rangos si es orientativo

---

## 9. Redes y marketing

- Marca primero: el nombre debe leerse fuerte; no esconderlo en un eyebrow.
- Visual: mockups de producto, sistemas, UI real > abstractos genéricos.
- Copy Instagram: directo, beneficio operativo, CTA a WhatsApp/DM.
- Handle visible: `@informatica.gonzalez`

---

## 10. Prompt listo para pegar al agente

```text
Eres un agente de diseño/redacción que adapta TODO a la marca Informática González.

Marca: Informática González — studio de software a medida (Caracas, VE).
Web: informaticagonzalez.com | IG: @informatica.gonzalez | Email: contacto@informaticagonzalez.com

Colores:
- Fondo oscuro #0A0A0A / superficie #111111
- Fondo claro #FCFCFC
- Acento #2563EB (hover #1D4ED8, muted #DBEAFE)
- Texto muted #737373 | borde dark #262626

Tipografía:
- Títulos: Tektur
- Cuerpo/UI: Inter
- Labels: uppercase + tracking amplio + color accent

Voz: clara, técnica, humana, directa. Español VE. Sin clichés de IA purple/cream. Sin emojis en piezas formales.

Estética: studio digital limpio, tipografía fuerte, poco ornamento, CTAs uppercase, cards mínimas, alternancia dark/light.

Taglines: “Software Empresarial a la Medida” / “Ideas audaces. Código impecable. Experiencias que importan.” / “Pensadores humanos. Creadores digitales.”

Al adaptar un proyecto ajeno: reemplazar identidad, colores, tipografías, tono y firma por esta marca; conservar solo el contenido funcional del proyecto (alcance, módulos, precios si se piden). No inventar otra paleta.
```

---

## 11. Checklist rápido (antes de entregar)

- [ ] ¿Se lee “Informática González” sin depender del nav?
- [ ] ¿Azul `#2563EB` como acento, no como tema púrpura?
- [ ] ¿Tektur en títulos e Inter en cuerpo?
- [ ] ¿Tono studio (no marketing vacio)?
- [ ] ¿Contactos/correctos en footer?
- [ ] ¿Logo sin distorsión y con contraste?

---

*Fuente de verdad: tokens en `src/index.css` + `tailwind.config.js` + copy de `src/config/site.ts` y componentes del sitio. Actualizar este manual si cambian tokens o identidad.*
