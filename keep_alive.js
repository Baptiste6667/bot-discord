const http = require('http');

http.createServer(function (req, res) {
  res.write("Le bot est en ligne !");
  res.end();
}).listen(8080, () => {
  console.log("Serveur de maintien en vie prêt sur le port 8080");
});