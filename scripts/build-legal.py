# Genera privacidad.html y terminos.html con el diseño del sitio a partir del contenido de cada sección.
import re, html, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent

def sections_from(path):
    s = (ROOT / path).read_text()
    if '<div class="lg-body">' in s:  # ya generado: tomar la fuente guardada
        s = (ROOT / f"scripts/legal-src/{path}").read_text()
    body = s[s.index('<p class="doc-upd">'):s.index('</main>')]
    body = body[body.index('</p>') + 4:]
    intro, *parts = re.split(r'<h2>\d+\.\s*', body)
    secs = []
    for p in parts:
        title, rest = p.split('</h2>', 1)
        secs.append((title.strip(), rest.strip()))
    return intro.strip(), secs

HEAD = '''<!doctype html>
<html lang="es" data-theme="day">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} · Urban Nest</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#5E1028">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/assets/img/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<script>
  (function () {{
    var t; try {{ t = localStorage.getItem("un-theme"); }} catch (e) {{}}
    if (t !== "day" && t !== "night") {{ var h = new Date().getHours(); t = h >= 7 && h < 19 ? "day" : "night"; }}
    document.documentElement.setAttribute("data-theme", t);
  }})();
</script>
<link rel="stylesheet" href="/assets/site.css">
</head>
<body class="lg-page">
<header class="lg-hdr">
  <a class="brand" href="/" aria-label="Urban Nest, ir al sitio"><img src="/assets/img/urban-nest-logo.webp" alt="" width="36" height="30"><span>Urban Nest</span></a>
  <nav class="lg-actions" aria-label="Acciones">
    <a class="lg-link" href="/">Volver al sitio</a>
    <a class="btn btn-primary lg-cta" href="/#contacto">Pedí tu cotización</a>
  </nav>
</header>

<section class="lg-hero">
  <div class="lg-wrap">
    <nav class="lg-tabs" aria-label="Documentos legales">
      <a href="/privacidad"{priv_on}>Privacidad</a>
      <a href="/terminos"{terms_on}>Términos</a>
    </nav>
    <h1>{title}</h1>
  </div>
</section>

<main class="lg-wrap lg-main" id="contenido">
  <aside class="lg-toc" aria-label="Contenido">
    <p class="lg-toc-t">Contenido</p>
    <ol>{toc}</ol>
  </aside>
  <div class="lg-body">
    <div class="lg-intro">{intro}</div>
    {sections}
  </div>
</main>

<footer class="ft">
  <div class="wrap">
    <div class="ft-top">
      <div class="ft-brand">
        <a class="brand" href="/"><img src="/assets/img/urban-nest-logo.webp" alt="" width="31" height="26"><span>Urban Nest</span></a>
        <p>Gestión profesional de departamentos en Airbnb en Buenos Aires.</p>
      </div>
      <nav class="ft-cols" aria-label="Pie de página">
        <div><p class="ft-h">Sitio</p><a href="/#reserva">Servicios</a><a href="/#resultados">Resultados</a><a href="/#simulador">Simulador</a><a href="/Urban_Nest_Presentacion_Propietarios.pdf" download data-pdf="footer">Presentación en PDF</a></div>
        <div><p class="ft-h">Contacto</p><a href="mailto:un.urbannest@gmail.com">un.urbannest@gmail.com</a><a href="/#contacto">Pedí tu cotización</a></div>
        <div><p class="ft-h">Legal</p><a href="/privacidad">Política de privacidad</a><a href="/terminos">Términos y condiciones</a></div>
      </nav>
    </div>
    <div class="ft-bot"><span>© 2026 Urban Nest. Todos los derechos reservados.</span><span>Buenos Aires, Argentina</span></div>
  </div>
</footer>
<script>
  // Índice: marca la sección que se está leyendo
  (function () {{
    var links = [].slice.call(document.querySelectorAll(".lg-toc a"));
    var secs = links.map(function (a) {{ return document.querySelector(a.getAttribute("href")); }});
    var io = new IntersectionObserver(function (es) {{
      es.forEach(function (e) {{ if (e.isIntersecting) {{ var i = secs.indexOf(e.target); links.forEach(function (l, k) {{ l.classList.toggle("on", k === i); }}); }} }});
    }}, {{ rootMargin: "-30% 0px -60% 0px" }});
    secs.forEach(function (s) {{ if (s) io.observe(s); }});
  }})();
</script>
</body>
</html>
'''

def build(path, title, desc, lead, summary, contact_t):
    intro, secs = sections_from(path)
    toc = "".join(f'<li><a href="#s{i+1}"><span>{i+1:02d}</span>{t}</a></li>' for i, (t, _) in enumerate(secs))
    body = "".join(f'<section class="lg-sec" id="s{i+1}"><p class="lg-n">{i+1:02d}</p><h2>{t}</h2>{c}</section>' for i, (t, c) in enumerate(secs))
    out = HEAD.format(title=title, desc=desc, lead=lead, toc=toc, sections=body, intro=intro,
                      summary="".join(f"<li>{x}</li>" for x in summary), contact_t=contact_t,
                      priv_on=' aria-current="page"' if path == "privacidad.html" else "",
                      terms_on=' aria-current="page"' if path == "terminos.html" else "")
    (ROOT / path).write_text(out)

if __name__ == "__main__":
    src = ROOT / "scripts/legal-src"
    src.mkdir(exist_ok=True)
    for f in ("privacidad.html", "terminos.html"):
        cur = (ROOT / f).read_text()
        if '<div class="lg-body">' not in cur: (src / f).write_text(cur)
    build("privacidad.html", "Política de privacidad", "Cómo Urban Nest recopila, usa y protege los datos personales que compartís en este sitio.",
          "Qué datos nos compartís, para qué los usamos y cómo los cuidamos. Sin letra chica.",
          ["Solo usamos los datos que completás en el formulario.", "Los usamos para responderte y enviarte el análisis de tu departamento.",
           "No vendemos ni cedemos tus datos, y el sitio no usa cookies de seguimiento.", "Podés pedirnos que los corrijamos o los borremos cuando quieras."],
          "¿Querés consultar, corregir o borrar tus datos?")
    build("terminos.html", "Términos y condiciones", "Condiciones de uso del sitio de Urban Nest, alcance de las simulaciones y estimaciones.",
          "Las reglas claras para usar este sitio y entender nuestras estimaciones.",
          ["El sitio es informativo: el servicio se acuerda en un contrato firmado.", "Las simulaciones son estimaciones prudentes, no una garantía de ingresos.",
           "El recorrido en 3D es una recreación ilustrativa.", "Rigen las leyes argentinas y tus derechos como consumidor."],
          "¿Tenés alguna duda sobre estos términos?")
    print("ok")
