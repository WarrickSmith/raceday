// Unit test for getAllRaces

const getAllRaces = require("./getAllRaces");

describe("getAllRaces module unit test:", () => {
  // Test for all Race Meetings happy path
  it("Should get all today's races", async () => {
    const received = await getAllRaces();
    expect(received[0]).toHaveProperty("RaceLink");
    expect(received[0]).toHaveProperty("RaceName");
  });
});
