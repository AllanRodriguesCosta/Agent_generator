// Servidor de exemplo (Express) só para o raio X encontrar as rotas.
import express from "express";
const app = express();
app.use(express.static("."));
app.get("/api/produtos", (_req, res) => res.json([]));
app.post("/api/contato", (_req, res) => res.status(204).end());
app.post("/api/pedidos", (_req, res) => res.status(201).end());
app.listen(3000);
