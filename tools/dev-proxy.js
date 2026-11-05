// Proxy de développement : sert l'app Flutter web ET l'API Next.js sur la MÊME origine
// (http://localhost:8090), pour que Chrome n'applique pas de règles CORS que l'app
// native, elle, ne subira jamais. Développement uniquement : rien de ceci n'est déployé.
//   /api/*  -> serveur Next.js local (branche feat/mobile-bearer), port API_PORT
//   le reste -> serveur Flutter web (`flutter run -d web-server --web-port 8091`)
// L'en-tête Host d'origine est conservé : l'API voit Origin == Host et accepte la requête.
// Lancer le Next local lui aussi sur la boucle locale seulement :
//   npx next dev --webpack -H 127.0.0.1 -p 3100
const http = require("http");

const PORT = Number(process.env.PROXY_PORT || 8090);
const API_PORT = Number(process.env.API_PORT || 3100);
const APP_PORT = Number(process.env.APP_PORT || 8091);

http
  .createServer((req, res) => {
    const target = req.url.startsWith("/api/") ? API_PORT : APP_PORT;
    const upstream = http.request(
      { host: "127.0.0.1", port: target, path: req.url, method: req.method, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res); // flux NDJSON transmis tel quel, sans mise en tampon
      },
    );
    upstream.on("error", (e) => {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Proxy : service sur le port ${target} injoignable (${e.code}).`);
    });
    req.pipe(upstream);
  })
  // 127.0.0.1 uniquement : le Next local tourne avec les secrets de production (clé IA),
  // il ne doit jamais être joignable depuis le réseau (revue sécurité C3a, M-1).
  .listen(PORT, "127.0.0.1", () => console.log(`proxy prêt sur http://localhost:${PORT} (api:${API_PORT}, app:${APP_PORT})`));
