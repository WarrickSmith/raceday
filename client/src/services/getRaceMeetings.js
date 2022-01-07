// Service to Connect to the Australian TAB API and query all race meeting for 'today'

// REf URL to get active links for todays racing - https://api.beta.tab.com.au/v1/tab-info-service/racing/dates?jurisdiction=NSW
// This will return an object with links for todays and the next few days race meetings.
// Example - todays  meeting link will likely in this format: "meetings": "https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/YYYY-MM-DD/meetings?jurisdiction=NSW"

// Initialise Variables and arrays for Meetings Overview, Resulting Meetings link for 'today', Resulting object for Todays Meeting Data

// GET Meetings Overview: https://api.beta.tab.com.au/v1/tab-info-service/racing/dates?jurisdiction=NSW

// Query meetings data using GET 'Link for Today' and assign to meeting data array.

// return Meeting Data array

const getRaceMeetings = async () => {
  try {
    const response = await fetch("http://localhost:5000/racemeetings");
    if (!response.ok) {
      throw Error(`${response.status} ${response.statusText}`);
    } else {
      const raceMeetingsToday = await response.json();
      console.log(`RaceDay Meetings Fetched: `, raceMeetingsToday);
      return raceMeetingsToday;
    }
  } catch (error) {
    alert(
      `There has been a problem fetching Race Meetings (getRaceMeetings):
  Please re-load the web page.`,
      error
    );
    return;
  }
};

export default getRaceMeetings;
