const express = require("express");
const router = express.Router();

// Project Module, Schema & Utils imports
const getRaceMeetings = require("../modules/getRaceMeetings.js");
const getAllRaces = require("../modules/getAllRaces");
const getAllMeetingRaces = require("../modules/getAllMeetingRaces");
const getRace = require("../modules/getRace");

// Race Meetings endpoint - Return an object containing today's race meetings in detail
router.get("/racemeetings", async (request, response) => {
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
router.get("/allraces", async (request, response) => {
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
router.get("/allmeetingraces/", async (request, response) => {
  const { url } = request.query;
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
router.get("/race/", async (request, response) => {
  // const url = request.params.url;
  const { url } = request.query;
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

module.exports = router;
