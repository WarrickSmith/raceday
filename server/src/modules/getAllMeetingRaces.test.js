// Unit test for getAllMeetingRaces

const getRaceMeetings = require("./getRaceMeetings");
const getAllMeetingRaces = require("./getAllMeetingRaces");

describe("getRaces function unit test:", () => {
  // Test for all Race Meetings happy path
  it("Should get today's races for a specific meeting", async () => {
    // get valid races url for todays racing to provide to Unit test
    const result = await getRaceMeetings();
    const racesUrl = result.meetings[0]._links.races;

    // test getRaces function with valid racesUrl as argument
    const received = await getAllMeetingRaces(racesUrl);
    expect(received).toBeObject;
    expect(received).toHaveProperty("races[0].raceNumber");
  });
});
