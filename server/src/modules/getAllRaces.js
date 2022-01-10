// Function to Connect to the Australian TAB API and query a singe race meeting for 'today'

// Meeting URL is passed to this function when called (obtainded from getRaceMeetings)

// This function will return an object with race details for the provided meeting URL

const fetch = require("node-fetch"); // Used to support asynch-await-fetch

const getAllRaces = async (meetingUrl) => {
  try {
    // Fetch object containing races for 'today'
    console.log("\x1b[36m%s\x1b[0m", "module - fetching todays Race data...");
    let result = await fetch(meetingUrl);
    const races = await result.json();
    console.log("\x1b[36m%s\x1b[0m", "All Races Fetched");
    return races;
  } catch (error) {
    console.log(
      "\x1b[31m%s\x1b[0m",
      "An API Server error has occurred fetching Races Data in module 'getRaces'"
    );
    return {
      error: {
        code: "SERVICE_UNAVAILABLE_ERROR",
        message:
          "No response was received from TAB Corp API the Server for getRaces",
      },
    };
  }
};

module.exports = getAllRaces;
