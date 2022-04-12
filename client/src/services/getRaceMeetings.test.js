// Unit test to check getRaceMeetings is obtaing an object containinag race meeting data for 'today' from the API Server /racemeetings endpoint.

import getRaceMeetings from "./getRaceMeetings";

describe("Unit Test for service-moduler getRaceMeetings", () => {
  // Test racemeetings object get returned from API server endpoint \racemeetings

  jest.setTimeout(10000); // allow time for api server response

  it("Should fetch and return an object containing racemeetings data from API Servr \racemeetings", async () => {
    // test getRaces function returns an object with the 'meetingName' key to confirm data is present in the object returned.
    const received = await getRaceMeetings();
    expect(received).toHaveProperty("meetings");
    expect(received.meetings[0]).toHaveProperty("meetingName");
  });
});
