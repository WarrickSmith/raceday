// Main API Server application end point definitions. Note endpoint functionality is typically contained in a seperate module and referenced (required)
const express = require("express");
var cors = require("cors");
const app = express();

// Project Module, Schema & Utils imports
const getRaceMeetings = require("./modules/getRaceMeetings.js");
const getAllRaces = require("./modules/getAllRaces");
const getAllMeetingRaces = require("./modules/getAllMeetingRaces");
const getRace = require("./modules/getRace");

// API Server Swagger Route
const path = require("path");
const yaml = require("js-yaml");
const fs = require("fs");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = yaml.load(
  fs.readFileSync(path.join(__dirname, "../apispec.yaml"), "utf8")
);

app.use(cors()); // Prevent CORS error on client web browser
app.use(express.json());

// Race Meetings endpoint - Return an object containing today's race meetings in detail
app.get("/api/racemeetings", async (request, response) => {
  const result = await getRaceMeetings();
  if (!result.meetings.error) return response.status(200).send(result);
  else if (result.error) {
    return response.status(503).send(result);
  } else {
    return response.status(404).send({
      error: {
        code: "RESOURCE_NOT_FOUND_ERROR",
        message: "No response was received from the Server",
      },
    });
  }
});

// All Races endpoint - Return an object containing today's race meetings in detail
app.get("/api/allraces", async (request, response) => {
  const result = await getAllRaces();
  if (!result.error) return response.status(200).send(result);
  else if (result.error) {
    return response.status(503).send(result);
  } else {
    return response.status(404).send({
      error: {
        code: "RESOURCE_NOT_FOUND_ERROR",
        message: "No response was received from the Server",
      },
    });
  }
});

// All Races endpoint - Return an object containing all of today's races for a single meeting
app.get("/api/allmeetingraces/:url", async (request, response) => {
  const url = request.params.url;
  console.log("received all races URL parameter: ", url);
  const result = await getAllMeetingRaces(url);
  if (!result.races.error) return response.status(200).send(result);
  else if (result.error) {
    return response.status(503).send(result);
  } else {
    return response.status(404).send({
      error: {
        code: "RESOURCE_NOT_FOUND_ERROR",
        message: "No response was received from the Server",
      },
    });
  }
});

// A Single Race endpoint - Return an object containing details for a single race
app.get("/api/race/:url", async (request, response) => {
  const url = request.params.url;
  console.log("received single race URL parameter: ", url);
  const result = await getRace(url);
  if (!result.raceNumber.error) return response.status(200).send(result);
  else if (result.error) {
    return response.status(503).send(result);
  } else {
    return response.status(404).send({
      error: {
        code: "RESOURCE_NOT_FOUND_ERROR",
        message: "No response was received from the TAB Server",
      },
    });
  }
});

// Swagger API Server Route
app.use("/", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

module.exports = app;
