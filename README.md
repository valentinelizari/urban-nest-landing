# Urban Nest · Landing para propietarios

Landing estática (un solo `index.html`) para captar propietarios en Buenos Aires.

- **Formulario de contacto** → llama a la función pública `registrar_lead_publico` de Supabase,
  que valida los datos, aplica límites anti-abuso y crea el lead en `public.leads` con estado `Nuevo`.
  El navegador solo usa la clave publicable: no puede leer ni modificar la tabla `leads`.
- **Presentación PDF**: `Urban_Nest_Presentacion_Propietarios.pdf`, descargable desde el hero,
  la banda final, el formulario (después de enviar) y el pie.
- Deploy: Vercel, proyecto estático sin build (`vercel.json` define headers).

La migración de la función está en `supabase/migrations/`.
