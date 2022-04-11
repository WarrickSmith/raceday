// Function to Connect to the Australian TAB API and query a singe race meeting for 'today'

// Meeting URL is passed to this function when called (obtainded from getRaceMeetings)

// This function will return an object with race details for the provided meeting URL

const fetch = require("node-fetch"); // Used to support asynch-await-fetch

const getAllMeetingRaces = async (meetingUrl, next) => {
  try {
    // Fetch object containing races for 'today' for a specific meting
    const result = await fetch(meetingUrl, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    const races = await result.json();
    return races;
  } catch (err) {
    next(err);
  }
};

module.exports = getAllMeetingRaces;
