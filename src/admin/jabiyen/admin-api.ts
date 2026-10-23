import "server-only";
import express from "express";
import dashboardHero from "./dashboard-hero";
import catalog from "./catalog";
import navigation from "./navigation";
import products from "./products";
import variants from "./variants";
import dataTables from "./data-tables";
import adminLogin from "./admin-login";

const app = express();
app.use((req, _res, next) => {
  const prefix = "/api/jabiyen-admin";
  if (req.url.startsWith(prefix)) req.url = "/api" + req.url.slice(prefix.length);
  next();
});
app.use(express.json());
app.use(adminLogin);
app.use(dashboardHero);
app.use(catalog);
app.use(navigation);
app.use(products);
app.use(variants);
app.use(dataTables);

export default app;
