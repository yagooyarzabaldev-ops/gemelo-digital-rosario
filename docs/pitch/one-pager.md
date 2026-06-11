# Gemelo Digital Rosario — Resumen comercial

**Versión:** v0.1.0 · demo pública en vivo
**Fecha:** junio 2026

---

## Qué es

**Gemelo Digital Rosario** es una plataforma de gemelo digital territorial para **Rosario, Gran
Rosario, el corredor del Paraná y Villa Constitución**. Reúne datos territoriales públicos en una
única vista operativa, navegable en el navegador, con trazabilidad de fuente y frescura de cada
dato.

Está compuesta por dos módulos:

- **CityPulse 4D** — gemelo digital territorial: mapa de la región con capas de clima, calidad de
  aire, focos de calor, sismos y puntos de interés, panel de alertas, indicadores (KPIs), línea de
  tiempo e inspector de detalle.
- **PersonaTwin** — verificación de identidad **consentida y autoservicio**: una persona verifica
  sus **propios** datos, con su consentimiento, y los ve como un gemelo personal. Pensado con
  privacidad por diseño.

Hoy ambos están disponibles como **demo pública, sin instalar nada**.

## Qué problema resuelve

La información territorial relevante (clima, calidad del aire, incendios, sismos, infraestructura,
estado de las fuentes) está **dispersa, sin contexto espacial común y sin trazabilidad**. No hay
una vista única que muestre, al mismo tiempo, *qué está pasando, dónde, desde qué fuente y qué tan
fresco es el dato*.

Gemelo Digital Rosario propone esa **capa de visualización y gobierno de datos**: una sala de
situación territorial donde cada capa expone su fuente, su frescura y su estado (incluyendo estados
vacíos o de error, mostrados de forma explícita y honesta).

## Para quién

- **Gobiernos locales / municipios** — monitoreo territorial y sala de situación.
- **Puertos, logística y corredor fluvial** — visibilidad ambiental y operativa del eje Paraná.
- **Industria** — contexto territorial y ambiental de sus operaciones.
- **Sponsors y comercio local** — presencia en una plataforma territorial gobernada.
- **Partners institucionales de innovación** — base para pilotos y desarrollo conjunto.

## Qué muestra la demo

Demo pública en vivo (datos sintéticos / fixtures):

- **Landing:** https://yagooyarzabaldev-ops.github.io/gemelo-digital-rosario/
- **CityPulse 4D:** https://yagooyarzabaldev-ops.github.io/gemelo-digital-rosario/apps/web/
- **PersonaTwin:** https://yagooyarzabaldev-ops.github.io/gemelo-digital-rosario/apps/web/verify/

En **CityPulse 4D**: la región con el río Paraná, capas activables, barra de KPIs, panel de
alertas, línea de tiempo con reproducción, e inspector por marcador con su fuente y frescura.

En **PersonaTwin**: pantalla de consentimiento, verificación de un caso sintético, gemelo personal
con sus datos, y los derechos del titular (acceso/descarga, rectificación, revocación y supresión)
con registro de actividad.

## Por qué es seguro y gobernado

- **Sin afirmación de datos en vivo:** todo lo visible es **dato sintético / fixture**, claramente
  señalizado con banners de demo.
- **Sin backend, sin secretos, sin credenciales** en la demo.
- **PersonaTwin no consulta RENAPER ni ninguna base real**, no hace scraping y **no contiene datos
  personales reales**. Está diseñado bajo la lógica de la **Ley 25.326** (consentimiento, datos
  mínimos, derechos ARCO, auditoría).
- Cada capa muestra **fuente, frescura y estado** — incluidos los estados vacíos y de error.

## Próximo paso comercial

Un **piloto acotado con datos públicos reales controlados** (p. ej. clima vía Open-Meteo y sismos
vía USGS), con ingesta gobernada del lado servidor y frescura real — manteniendo todas las
salvaguardas. **PersonaTwin en modo real** se aborda por separado y **solo** con proveedor
autorizado, convenio y revisión legal.

> *Aviso:* Gemelo Digital Rosario es un proyecto independiente en etapa de demostración. **No
> representa ni implica afiliación oficial** con ningún gobierno, organismo (incluido RENAPER) ni
> entidad deportiva o privada. No se afirma aptitud para producción.
