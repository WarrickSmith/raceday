// Unit test to check getRaceMeetings is obtaing an object containinag race meeting data for 'today' from the API Server /racemeetings endpoint.

import getRaceMeetings from "./getRaceMeetings";

describe("Unit Test for service-moduler getRaceMeetings", () => {
  // Test racemeetings object get returned from API server endpoint \racemeetings

  it("Should fetch and return an object containing racemeetings data from API Servr \racemeetings", async () => {
    // test getRaces function returns an object with the 'meetingName' key to confirm data is present in the object returned.
    const received = await getRaceMeetings();
    console.log(`Data Received: ${received}`);
    expect(received).toHaveProperty("meetings[0].meetingName");
  });
});
