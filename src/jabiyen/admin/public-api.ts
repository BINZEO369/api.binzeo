import "server-only";
import express from "express";
import catalog from "./catalog";
import publicCatalog from "./public-catalog";
import checkout from "./checkout";
import navigation from "./navigation";
import content from "./content";
import footerHome from "./footer-home";
import paymentHandoff from "./payment-handoff";

const app = express();
app.use((req, _res, next) => {
  const prefix = "/api/jabiyen-public";
  if (req.url.startsWith(prefix)) req.url = "/api" + req.url.slice(prefix.length);
  next();
});
app.use(paymentHandoff);
app.use(checkout);
app.use(publicCatalog);
app.use(catalog);
app.use(navigation);
app.use(content);
app.use(footerHome);

export default app;
