# Notas de riesgo y privacidad

Documento breve para acompañar la demo y el pitch. Pensado para que un cliente, sponsor o partner
entienda **qué es y qué no es** esta demostración, y bajo qué condiciones evolucionaría.

---

## Qué garantiza la demo actual (v0.1.0)

- **Sin afirmación de datos en vivo.** Todo lo visible son **datos sintéticos / fixtures**,
  deterministas y señalizados con banners de "modo demo". No es información en tiempo real.
- **PersonaTwin no consulta RENAPER** ni ninguna base de datos real, **no hace scraping** y **no
  contiene datos personales reales**. El caso mostrado es **sintético**.
- **Sin secretos ni credenciales** en el repositorio ni en la demo.
- **Sin backend en la demo:** es estática y de solo lectura.
- **No es un buscador de personas.** PersonaTwin es **autoverificación consentida**: el titular
  verifica sus **propios** datos, con su consentimiento. No permite consultar a terceros.

## Principios de privacidad por diseño (PersonaTwin)

Alineados con la **Ley 25.326 (Protección de Datos Personales)**:

- **Consentimiento** previo, expreso e informado, y confirmación de titularidad.
- **Minimización** de datos y **plazos de conservación** acotados.
- **Derechos ARCO** del titular demostrados en la propia interfaz: **acceso/descarga,
  rectificación, revocación de consentimiento y supresión**, con registro de actividad.
- **Auditoría** de las acciones.

## Qué NO se afirma

- ❌ No se afirma aptitud para **producción** ni operación crítica.
- ❌ No se afirma que los datos sean **reales o en vivo**.
- ❌ No se afirma **afiliación oficial** con gobierno, organismos (incluido **RENAPER**), ni
  entidades deportivas o privadas (**FIFA, AFA**, etc.).
- ❌ No se ofrece integración inmediata con sistemas de identidad reales.

## Condiciones para evolucionar a datos reales

- **CityPulse con datos reales:** ingesta **del lado servidor** de fuentes públicas (clima, sismos),
  con el navegador consumiendo snapshots preparados — nunca consultando APIs directo. Riesgo bajo,
  pero igualmente gobernado (frescura, estados de fuente, sin secretos en el repo).
- **PersonaTwin en modo real:** **solo** con **proveedor de identidad autorizado**, **convenio**
  firmado, **revisión legal** y evaluación de impacto (**DPIA**), credenciales por entorno, contacto
  de privacidad real y registro/obligaciones aplicables. Es el componente más sensible y **no se
  acelera** sin ese marco.

## Resumen para el interlocutor

> Es una **demo funcional y gobernada con datos sintéticos**. Muestra cómo se vería y cómo se
> gobernaría el producto, **sin exponer datos reales ni hacer afirmaciones que no podamos sostener**.
> El camino a datos reales es **incremental y controlado**, y la verificación de identidad real solo
> avanza con respaldo legal y un proveedor autorizado.
