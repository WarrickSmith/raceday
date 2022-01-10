// Integration tests for API endpoints

const request = require("supertest");
const app = require("./app");
const getRaceMeetings = require("./modules/getRaceMeetings");

describe("app.js integration tests:", () => {
  // Test for GET all Race Meetings happy path
  it("Should get all /racemeetings", async () => {
    const expectedStatus = 200;
    await request(app)
      .get("/racemeetings")
      .expect(expectedStatus)
      .expect((response) => {
        const body = response.body;
        expect(body).toHaveProperty("meetings[0].meetingName");
      });
  });

  // Test for GET all Races happy path
  it("Should get all races /allraces", async () => {
    const expectedStatus = 200;
    // get valid races url for todays racing to provide to Unit test
    const result = await getRaceMeetings();
    const racesUrl = encodeURIComponent(result.meetings[0]._links.races);

    // test getAllRaces endpoint passing racesUrl as a parameter
    await request(app)
      .get(`/allraces/${racesUrl}`)
      .expect(expectedStatus)
      .expect((response) => {
        const body = response.body;
        expect(body).toHaveProperty("races[0].raceNumber");
      });
  });
});
