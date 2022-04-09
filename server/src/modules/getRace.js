// Function to Connect to the Australian TAB API and query a singe race for details

// A single Race URL is passed to this function when called (obtainded from getAllRaces)

// This function will return an object with race details for the provided race URL

const fetch = require("node-fetch"); // Used to support asynch-await-fetch

const getRace = async (raceUrl) => {
  try {
    // Fetch object containing races for 'today'
    console.log(
      "\x1b[36m%s\x1b[0m",
      "module - fetching data for a single race..."
    );
    const result = await fetch(raceUrl, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    const race = await result.json();
    console.log("\x1b[36m%s\x1b[0m", "Single Race Data Fetched");
    return race;
  } catch (error) {
    console.log(
      "\x1b[31m%s\x1b[0m",
      "An API Server error has occurred fetching Race Data in module 'getRace'"
    );
    return {
      error: {
        code: "SERVICE_UNAVAILABLE_ERROR",
        message:
          "No response was received from TAB Corp API the Server for getRace",
      },
    };
  }
};

module.exports = getRace;
