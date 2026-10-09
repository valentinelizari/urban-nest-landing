# Urban Nest · Sitio para propietarios

Sitio estático para captar propietarios en Buenos Aires.

- **Recorrido 3D** (`assets/tour.js`, Three.js y sus complementos en `vendor/`, cargados con un import map): Buenos Aires de día o de noche, el Obelisco,
  nuestros departamentos marcados y el ingreso por una ventana al interior del Urban Nest Obelisco. En escritorio avanza con el scroll; en celular se reproduce solo como portada.
- **Día y noche**: botón en el encabezado. Por defecto sigue la hora del visitante (de 7 a 19, día) y recuerda su elección.
- **Formulario** → función pública `registrar_lead_publico` de Supabase (migración en `supabase/migrations/`).
  Valida los datos, tiene límites anti abuso y crea el lead en `public.leads` con estado `Nuevo`.
- **Presentación PDF**: `Urban_Nest_Presentacion_Propietarios.pdf`, generada desde `pdf/presentacion.html`.

## Regenerar el PDF

```bash
python3 -m http.server 8765 &        # servidor estático en la raíz
npm i -g playwright                    # una sola vez
node scripts/build-pdf.mjs
```

Deploy: Vercel, conectado al repositorio, sin build.
