const express = require("express");
var cors = require("cors");
const app = express();
const fetch = require("node-fetch");

app.use(cors());
app.use(express.json());

// Default Endpoint Route Get all Race Meetings
app.get("/", async (request, response) => {
  return response.send("Hello There Mates!!");
});

app.get("/racemeetings", async (request, response) => {
  const result = await fetch(
    // `https://api.tatts.com/svc/sales/vmax/web/data/racing`
    "https://api.beta.tab.com.au/v1/tab-info-service/racing/dates?jurisdiction=NSW"
  );
  const newRaceday = await result.json();
  console.log(`RaceDay Meetings Fetched: `);
  return response.send(newRaceday);
});

module.exports = app;
