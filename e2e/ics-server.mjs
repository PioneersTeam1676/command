// Minimal calendar server for the ICS e2e test. GET /cal.ics serves the current text; POST /set replaces it.
import http from "node:http";

let body = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//e2e//EN\r\nEND:VCALENDAR\r\n";
http
  .createServer((req, res) => {
    if (req.url === "/health") return res.end("ok");
    if (req.url === "/cal.ics" && req.method === "GET") {
      res.setHeader("content-type", "text/calendar");
      return res.end(body);
    }
    if (req.url === "/set" && req.method === "POST") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        body = Buffer.concat(chunks).toString("utf8");
        res.end("ok");
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  })
  .listen(3199, "127.0.0.1");
