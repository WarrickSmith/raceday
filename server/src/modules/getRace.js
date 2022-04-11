// Function to Connect to the Australian TAB API and query a singe race for details

// A single Race URL is passed to this function when called (obtainded from getAllRaces)

// This function will return an object with race details for the provided race URL

const fetch = require("node-fetch"); // Used to support asynch-await-fetch

const getRace = async (raceUrl, next) => {
  try {
    // Fetch object containing races for 'today'
    const result = await fetch(raceUrl, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    const race = await result.json();
    return race;
  } catch (err) {
    next(error);
  }
};

module.exports = getRace;
