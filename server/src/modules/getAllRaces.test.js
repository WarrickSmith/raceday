// Unit test for getAllRaces

const getAllRaces = require("./getAllRaces");

describe("getAllRaces module unit test:", () => {
  // Test for all Race Meetings happy path

  jest.setTimeout(10000); // allow time for api server response

  it("Should get all today's races", async () => {
    const received = await getAllRaces();
    expect(received[0]).toHaveProperty("RaceLink");
    expect(received[0]).toHaveProperty("RaceName");
  });
});
