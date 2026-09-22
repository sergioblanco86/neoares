# Contrato de internacionalización de NeoAres

## 1. Idiomas y preferencia

```ts
type SupportedLocale = "es" | "en";
type LanguagePreference = "system" | SupportedLocale;
```

- Una instalación nueva usa `system`.
- Se recorren los idiomas preferidos del sistema y se elige el primer idioma
  soportado.
- Si ninguno está soportado, el fallback es inglés.
- Una preferencia manual prevalece sobre el sistema hasta que el usuario vuelva
  a elegir `system`.
- El cambio se aplica sin reiniciar y se guarda atómicamente en
  `data/app-state.json`.

## 2. Interfaz

- El selector vive en el extremo derecho de la barra superior.
- La pantalla sin conexión conserva el mismo selector; cambiar idioma nunca
  requiere internet.
- Las opciones son Automático, English y Español. No se usan banderas.
- El control soporta teclado, foco visible, Escape y cierre al pulsar fuera.
- `document.documentElement.lang` refleja siempre el idioma resuelto.

## 3. Catálogos

Los catálogos canónicos son:

```text
src/i18n/locales/es.ts
src/i18n/locales/en.ts
```

Ambos deben contener exactamente las mismas claves. Las variables dinámicas se
interpolan con `{nombre}` y nunca se concatenan dentro del componente cuando el
orden gramatical pueda variar.

## 4. Límites

Se traducen la interfaz, accesibilidad, validaciones, estados, errores, menú
nativo y el instalador de Windows. No se traducen nombres de DJs, géneros,
intenciones, artistas, canciones, canales ni demás contenido del catálogo o
introducido por el usuario.

El idioma de interfaz no cambia la curaduría, las búsquedas ni la reproducción.

## 5. Errores

Los procesos de escritorio y audio devuelven códigos estables. El renderer los
convierte en mensajes localizados. Los detalles técnicos se registran para
diagnóstico, pero no se muestran como frases dependientes de un idioma.

## 6. Menú e instalador

- Cambiar el idioma reconstruye inmediatamente el menú nativo de NeoAres.
- El instalador de Windows incluye tablas English y Spanish y elige según el
  idioma de Windows.
- El ejecutable, el nombre NeoAres y los metadatos técnicos no se traducen.

## 7. Criterios de aceptación

- Un sistema inglés inicia en inglés y uno español inicia en español.
- Español, English y Automático sobreviven al reinicio.
- No hay destello inicial en otro idioma.
- No quedan claves ausentes ni catálogos vacíos.
- Cambiar idioma no reinicia, pausa ni modifica una sesión.
- Los textos técnicos persistidos se guardan como estado semántico, no como una
  frase ya traducida.
- La migración desde `AppState` versión 1 no pierde el último DJ ni la sesión.
