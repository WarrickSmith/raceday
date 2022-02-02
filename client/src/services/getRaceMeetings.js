// Service to Connect to the RaceDay Server API and query all race meeting for 'today'

// return raceMeetingsToday array

const getRaceMeetings = async () => {
  try {
    const response = await fetch("http://localhost:5000/racemeetings");
    if (!response.ok) {
      throw Error(`${response.status} ${response.statusText}`);
    } else {
      const raceMeetingsToday = await response.json();
      console.log(`RaceDay Meetings Fetched from Service - getRaceMeetings: `);
      return raceMeetingsToday;
    }
  } catch (error) {
    console.log(
      `There has been a problem fetching Race Meetings (getRaceMeetings):
  Please re-load the web page.`,
      error
    );
    return error;
  }
};

export default getRaceMeetings;
