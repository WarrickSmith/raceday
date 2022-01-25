// Unit test for getAllRaces

const getAllRaces = require("./getAllRaces");

describe("getAllRaces module unit test:", () => {
  // Test for all Race Meetings happy path
  it("Should get all today's races", async () => {
    const received = await getAllRaces();
    console.log(received);
    expect(received).toHaveProperty("meetings[0].meetingName");
  });
});
