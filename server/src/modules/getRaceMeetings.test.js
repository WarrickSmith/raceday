// Unit test for getRaceMeetings

const getRaceMeetings = require("./getRaceMeetings");

describe("getRaceMeetings function unit test:", () => {
  // Test for all Race Meetings happy path
  it("Should get today's racemeetings", async () => {
    const received = await getRaceMeetings();
    expect(received).toHaveProperty("meetings[0].meetingName");
  });
});
