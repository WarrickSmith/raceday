// Main API Server application end point definitions. Note endpoint functionality is typically contained in a seperate module and referenced (required)
const express = require("express");
var cors = require("cors");
const app = express();

// Project Module, Schema & Utils imports
const getRaceMeetings = require("./modules/getRaceMeetings.js");

app.use(cors()); // Prevent CORS error on client web browser
app.use(express.json());

// Default Endpoint Route Get all Race Meetings
app.get("/", async (request, response) => {
  return response
    .status(200)
    .send("This is a default route with no information!!");
});

// Race Meetings endpoint - Return an object containing tody's race meetings in detail
app.get("/racemeetings", async (request, response) => {
  const result = await getRaceMeetings();
  if (result.meetings) return response.status(200).send(result);
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

module.exports = app;
