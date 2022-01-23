// Integration tests for API endpoints

const request = require("supertest");
const app = require("./app");
const getAllMeetingRaces = require("./modules/getAllMeetingRaces");
const getRaceMeetings = require("./modules/getRaceMeetings");

describe("app.js integration tests:", () => {
  // Test for GET all Race Meetings happy path
  it("Should get all racemeetings - /racemeetings", async () => {
    const expectedStatus = 200;
    await request(app)
      .get("/racemeetings")
      .expect(expectedStatus)
      .expect((response) => {
        const body = response.body;
        expect(body).toHaveProperty("meetings[0].meetingName");
      });
  });

  // Test for GET all Races for a specific meeting happy path
  it("Should get all races for a meeting - /allmeetingraces", async () => {
    const expectedStatus = 200;

    // get valid races url for todays racing to provide to Unit test
    const result = await getRaceMeetings();
    const racesUrl = encodeURIComponent(result.meetings[0]._links.races);

    // test getAllRaces endpoint passing racesUrl as a parameter
    await request(app)
      .get(`/allmeetingraces/${racesUrl}`)
      .expect(expectedStatus)
      .expect((response) => {
        const body = response.body;
        expect(body).toHaveProperty("races[0].raceNumber");
      });
  });

  // Test for GET Single Race happy path
  it("Should get a single race - /race", async () => {
    const expectedStatus = 200;

    // get valid races url for todays racing to enable obtaining a list of races
    let result = await getRaceMeetings();
    const racesUrl = result.meetings[0]._links.races;
    console.log(`Races URL is: ${racesUrl}`);

    // get a valid race URL to provide to the getRace unit test
    result = await getAllMeetingRaces(racesUrl);
    const raceUrl = encodeURIComponent(result.races[0]._links.self);
    console.log(`race URL is: ${raceUrl}`);

    // test getAllRaces endpoint passing racesUrl as a parameter
    await request(app)
      .get(`/race/${raceUrl}`)
      .expect(expectedStatus)
      .expect((response) => {
        const body = response.body;
        expect(body).toHaveProperty("raceName");
      });
  });
});
