// Unit test to check getRaces module is obtaning an object containinag all race data for a spcific race based on the URL passed

import getAllRaces from "./getAllRaces";
import getRace from "./getRace";
jest.setTimeout(20000); // allow time for api server response

describe("Unit Test for service-module getRace", () => {
  // Test single Race object gets returned from API server endpoint /race/:url
  jest.setTimeout(20000); // allow time for api server response
  it("Should fetch and return an object containing 'race' data from API Server for a single race URL", async () => {
    // get dependancies and test getRace
    const allRaces = await getAllRaces();
    const raceUrl = await allRaces[0].RaceLink;
    const received = await getRace(raceUrl);

    //Test received result from getRace
    expect(received).toHaveProperty("raceName");
    expect(received).toHaveProperty("runners");
    expect(received).toHaveProperty("pools");
  });
});
