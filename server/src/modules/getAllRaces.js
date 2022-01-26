// Function to Connect to the Australian TAB API and query all races for 'today'

// Module Process Overview
// - fetch all race meetings from getRaceMeetings module.
// - Parse raceMeetings array and map result, returning an array of links to all of a meetings races (allRaceLinks)
// - Parse allRaceLinks array and map result, returning an array of links to individual races  (allRaces)
// - Parse allRaces and return an array of individual race details (raceData) and a link to the race for furture refresh
// - sort raceData  by race start Time
// - return raceData array

const getRaceMeetings = require("./getRaceMeetings.js");
const getAllMeetingRaces = require("./getAllMeetingRaces");
const getRace = require("./getRace");
const fetch = require("node-fetch"); // Used to support asynch-await-fetch

const getAllRaces = async () => {
  try {
    // - fetch all race meetings from getRaceMeetings module.
    const raceMeetings = await getRaceMeetings();
    const allMeetings = raceMeetings.meetings;
    console.log(`Number of meetings: ${allMeetings.length}`);

    // - Parse raceMeetings array and map result, returning an array of links to all of a meetings races (allRaceLinks)
    const allRaceLinks = allMeetings
      .map((meeting, index) => {
        if (meeting._links !== undefined) {
          return meeting._links.races;
        }
      })
      .filter((notUndefined) => notUndefined !== undefined);

    // - Parse allRaceLinks array and map result, returning an array of links to individual races  (allRaces)
    let allRaces = await Promise.all(
      allRaceLinks
        .map(async (race) => {
          const result = await getAllMeetingRaces(race);
          const raceList = result.races.map((race) => {
            return race._links.self;
          });
          return raceList;
        })
        .filter((notUndefined) => notUndefined !== undefined)
    );
    allRaces = allRaces.flat(); // Flatten theallRaces array from '[[w,x],[y,z]] to [w,x,y,z]

    // - Parse allRaces and return an array 'subset' individual race details (raceData) and a link to the race for furture race detail fetch/refresh
    const raceData = await Promise.all(
      allRaces
        .map(async (race) => {
          const result = await getRace(race);
          const raceDetail = [
            {
              RaceLink: race,
              RaceStartTime: result.raceStartTime,
              RaceNumber: result.raceNumber,
              RaceName: result.raceName,
              RaceDistance: result.raceDistance,
              RaceStatus: result.raceStatus,
              MeetingName: result.meeting.meetingName,
              VenueMnemonic: result.meeting.venueMnemonic,
              MeetingDate: result.meeting.meetingDate,
              Location: result.meeting.location,
              RaceType: result.meeting.raceType,
              MeetingCode: result.meeting.meetingCode,
            },
          ];

          return raceDetail;
        })
        .filter((notUndefined) => notUndefined !== undefined)
    );

    // NOTE: Could return multiple objects within an object, ie, raceMeetisgs, allRaces
    return raceData
      .flat()
      .sort((a, b) =>
        new Date(a.RaceStartTime) > new Date(b.RaceStartTime) ? 1 : -1
      ); // Flatten the raceData array of objects from '[[{w,x},{y,z}]] to [{w,x},{y,z}] THEN sort ascending by RaceStartTime
  } catch (error) {
    // Error handling
    console.log(
      "\x1b[31m%s\x1b[0m",
      "An API Server error has occurred fetching Races Data in module 'getALRaces'"
    );
    return {
      error: {
        code: "SERVICE_UNAVAILABLE_ERROR",
        message:
          "No response was received from TAB Corp API the Server for getAllRaces",
      },
    };
  }
};

module.exports = getAllRaces;
