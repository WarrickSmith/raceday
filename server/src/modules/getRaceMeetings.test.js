// Unit test for getRaceMeetings

const getRaceMeetings = require("./getRaceMeetings");

describe("getRaceMeetings function unit test:", () => {
  // Test for all Race Meetings happy path

  jest.setTimeout(10000); // allow time for api server response

  it("Should get today's racemeetings", async () => {
    const received = await getRaceMeetings();
    expect(received).toHaveProperty("meetings[0].meetingName");
  });
});
