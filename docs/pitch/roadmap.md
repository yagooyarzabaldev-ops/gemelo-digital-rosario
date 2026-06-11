# Roadmap comercial y técnico — después de v0.1.0

Cada etapa es **incremental** y mantiene las salvaguardas: sin datos en vivo falsos, sin secretos
en el repositorio, con fuente y frescura visibles. El avance es por **pilotos acotados**, no por un
"producto terminado".

Estado de referencia: **v0.1.0** es la demo estática pública, con datos sintéticos.

---

## Etapa 0 · Demo estática pública — ✅ disponible

- Frontend estático servido públicamente (GitHub Pages), solo lectura.
- CityPulse 4D y PersonaTwin navegables con **fixtures**.
- Sin backend, sin secretos, sin datos reales, sin claim de vivo.
- **Sirve para:** mostrar, vender y recibir feedback.

## Etapa 1 · Ingesta de datos públicos reales (controlada)

- Activar ingesta **del lado servidor** de fuentes públicas simples y de bajo riesgo: **clima
  (Open-Meteo)** y **sismos (USGS)**.
- El navegador sigue consumiendo **snapshots preparados**; nunca consulta APIs públicas directo.
- Frescura **real** y estados de fuente reales.
- **Se contrata como:** piloto de 1–2 capas reales para un área u operación definida.

## Etapa 2 · Backend operativo (Postgres + n8n)

- Base de datos **Postgres** con el esquema del gemelo y flujos de **n8n** para ingesta programada.
- Idempotencia, registro de ejecuciones y manejo de errores.
- Credenciales **por entorno**, nunca en el repositorio.
- **Se contrata como:** puesta en marcha del backend del piloto + operación.

## Etapa 3 · Publicador de snapshots

- Servicio que arma y publica los **snapshots** que consume el frontend, con su contrato versionado.
- Historial de snapshots y frescura por capa, auditable.
- **Se contrata como:** capa de publicación + tablero de salud de datos.

## Etapa 4 · Piloto institucional

- Despliegue acotado para un cliente o partner (municipio, puerto, industria, institución).
- Capas y área **a medida**, alertas por umbral, reportes/exportes.
- Acuerdos de datos, responsabilidades y soporte definidos.
- **Se contrata como:** **piloto pago** con alcance cerrado y métricas de éxito.

## Etapa 5 · PersonaTwin en modo real (último, condicionado)

Se aborda **al final** y solo si se cumplen **todas** las condiciones:

- **Proveedor de identidad autorizado** y **convenio** firmado.
- **Revisión legal** y evaluación de impacto (DPIA) conforme a la **Ley 25.326**.
- Credenciales por entorno, contacto de privacidad real y registro/obligaciones aplicables.
- Backend (Postgres + n8n) operativo haciendo la verificación **del lado servidor**.

Es el módulo de mayor valor, pero también el de mayor sensibilidad: **no se promete ni se acelera**
sin ese marco.

---

## Secuencia comercial sugerida

1. **Demo estática** (hecho) → mostrar y conseguir reuniones.
2. **Pitch + feedback dirigido** → validar interés y segmento.
3. **Piloto de 1–2 capas reales** (Etapas 1–2) → primer contrato acotado.
4. **Piloto institucional** (Etapas 3–4) → alcance mayor, a medida.
5. **PersonaTwin real** (Etapa 5) → solo con marco legal y proveedor autorizado.

> Cada salto comercial se apoya en el anterior ya funcionando. No se vende la Etapa 5 antes de la 1.
