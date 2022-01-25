// Function to Connect to the Australian TAB API and query all races for 'today'

// Process
// - fetch all race meetings.
// - Parse racemeetings array and map result with race details including the race 'self' link for race runner details
// - sort result by race start Time
// - return allRaces array

const getRaceMeetings = require("./getRaceMeetings.js");
const getAllMeetingRaces = require("./getAllMeetingRaces");
const fetch = require("node-fetch"); // Used to support asynch-await-fetch

const getAllRaces = async () => {
  // fetch all meetings from the APi
  const raceMeetings = await getRaceMeetings();
  const allMeetings = raceMeetings.meetings;
  console.log(`Number of meetings: ${allMeetings.length}`);

  // Parse all race meetings and find url to the meetings' races. Return urls' in an array (allRaceLinks)
  const allRaceLinks = allMeetings
    .map((meeting, index) => {
      if (meeting._links !== undefined) {
        return meeting._links.races;
      }
    })
    .filter((notUndefined) => notUndefined !== undefined);

  // Parse allRaceLinks, fetch array of races for each url. Store races in an array of single race URL's.
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
  allRaces = allRaces.flat();
  return allRaces;

  // Could return multiple objects within an object, ie, raceMeetisgs, allRaces
};
module.exports = getAllRaces;
