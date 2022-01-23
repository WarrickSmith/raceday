// Unit test for getRace

const getRaceMeetings = require("./getRaceMeetings");
const getAllMeetingRaces = require("./getAllMeetingRaces");
const getRace = require("./getRace");

describe("getRace function unit test:", () => {
  // Test for a single Race happy path
  it("Should get details for a single raceg", async () => {
    // get valid races url for todays racing to enable obtaining a list of races
    let result = await getRaceMeetings();
    const racesUrl = result.meetings[0]._links.races;
    console.log(`Races URL is: ${racesUrl}`);

    // get a valid race URL to provide to the getRace unit test
    result = await getAllMeetingRaces(racesUrl);
    const raceUrl = result.races[0]._links.self;
    console.log(`race URL is: ${raceUrl}`);

    // test getRaces function with valid racesUrl as argument
    const received = await getRace(raceUrl);
    expect(received).toBeObject;
    expect(received).toHaveProperty("raceName");
  });
});
