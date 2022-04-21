// Service to Connect to the RaceDay Server API and query a single Meeting and return the Meetings races
// based on a provided meeting URL

// return all Meeting Races array

const getMeeetingRaces = async (url) => {
  console.log(`getMeetingRaces service is connecting to API Server...`);
  try {
    const response = await fetch(
      `${process.env.REACT_APP_API_URL}/allmeetingraces/?url=` +
        encodeURIComponent(url),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!response.ok) {
      throw Error(`${response.status} ${response.statusText}`);
    } else {
      const raceData = await response.json();
      return raceData;
    }
  } catch (error) {
    console.log(
      `There has been a problem fetching Meeting Races (getMeetingRaces):
        Please re-load the web page.`,
      error
    );

    return error;
  }
};

export default getMeeetingRaces;
