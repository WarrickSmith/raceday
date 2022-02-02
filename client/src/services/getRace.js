// Service to Connect to the RaceDay Server API and query a single race based on a provided Race URL

// return allRaces array

const getRace = async (raceUrl) => {
  console.log(`getRace service is connecting to API Server...`);
  try {
    const response = await fetch(
      "http://localhost:5000/race/" + encodeURIComponent(raceUrl)
    );
    if (!response.ok) {
      throw Error(`${response.status} ${response.statusText}`);
    } else {
      const raceData = await response.json();
      console.log(`Race Data Fetched from Service - getRace: `);
      return raceData;
    }
  } catch (error) {
    console.log(
      `There has been a problem fetching Race Data (getRace):
      Please re-load the web page.`,
      error
    );

    return error;
  }
};

export default getRace;
