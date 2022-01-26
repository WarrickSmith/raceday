// Unit test to check getAllRaces module is obtaing an object containinag all races for the day from the API Server /allraces endpoint.

import getAllRaces from "./getAllRaces";

describe("Unit Test for service-moduler getAllRaces", () => {
  // Test allraces object gets returned from API server endpoint \allraces

  jest.setTimeout(10000); // allow time for api server response
  it("Should fetch and return an object containing 'all races' data from API Server allraces", async () => {
    // test getRaces function returns an object with the 'meetingName' key to confirm data is present in the object returned.
    const received = await getAllRaces();
    expect(received[0]).toHaveProperty("RaceLink");
    expect(received[0]).toHaveProperty("RaceName");
  });
});
