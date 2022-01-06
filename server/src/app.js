const express = require("express");
var cors = require("cors");
const app = express();
const fetch = require("node-fetch");

app.use(cors());
app.use(express.json());

// Default Endpoint Route Get all Race Meetings
app.get("/", async (request, response) => {
  return response
    .status(200)
    .send("This is a default route with no information!!");
});

app.get("/racemeetings", async (request, response) => {
  const result = await fetch(
    // `https://api.tatts.com/svc/sales/vmax/web/data/racing`
    "https://api.beta.tab.com.au/v1/tab-info-service/racing/dates?jurisdiction=NSW"
  );
  const RaceMeetings = await result.json();
  const raceDay = RaceMeetings.dates[0]._links.meetings;
  console.log(raceDay);
  const result2 = await fetch(raceDay);
  const RaceMeetings2 = await result2.json();
  console.log(`RaceDay Meetings Fetched: `);
  console.log(RaceMeetings2.meetings[0].meetingName);
  return response.send(RaceMeetings2);
});

module.exports = app;
