// Function to Connect to the Australian TAB API and query all race meetings for 'today'

// REf URL to get active links for todays racing - https://api.beta.tab.com.au/v1/tab-info-service/racing/dates?jurisdiction=NSW
// This will return an object with links for todays and the next few days race meetings.
// Example - todays  meeting link will likely in this format: "meetings": "https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/YYYY-MM-DD/meetings?jurisdiction=NSW"

// Function to query 'all meeetings', then select a link to 'todays meetings'. Then fetch 'todays meeting' data and store in an object. Return the meetings object
// Ref Meetings Overview: https://api.beta.tab.com.au/v1/tab-info-service/racing/dates?jurisdiction=NSW

const fetch = require("node-fetch"); // Used to support asynch-await-fetch

const getRaceMeetings = async () => {
  try {
    // Fetch object containing links to meetings for 'today', 'tomorrow' etc
    console.log("\x1b[36m%s\x1b[0m", "module - fetching race meeting data...");
    let result = await fetch(
      "https://api.beta.tab.com.au/v1/tab-info-service/racing/dates?jurisdiction=NSW"
    );
    const RaceMeetings = await result.json();
    const raceDay = RaceMeetings.dates[0]._links.meetings; // [0]=today, [1]=tomorrow, etc.
    console.log("\x1b[36m%s\x1b[0m", "All Meetings Fetched");

    // Fetch 'Today's' race meeting data object using raceDay as the fetch link
    console.log(
      "\x1b[36m%s\x1b[0m",
      "module - fetching Today's race meeting data..."
    );
    result = await fetch(raceDay);
    const meetingsToday = await result.json();
    console.log("\x1b[36m%s\x1b[0m", "Today's Meetings Fetched");
    return meetingsToday;
  } catch (error) {
    console.log(
      "\x1b[31m%s\x1b[0m",
      "An API Server error has occurred fetching Race Meeting Data in module 'getRaceMeetings'"
    );
    return {
      error: {
        code: "SERVICE_UNAVAILABLE_ERROR",
        message:
          "No response was received from TAB Corp API the Server for getRaceMeetings",
      },
    };
  }
};

module.exports = getRaceMeetings;