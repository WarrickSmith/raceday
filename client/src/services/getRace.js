// Service to Connect to the RaceDay Server API and query a single race based on a provided Race URL

// return allRaces array

const getRace = async (raceUrl) => {
  console.log(`getRace service is connecting to API Server...`);
  try {
    console.log(
      "Single Race Fetch URL: ",
      `${process.env.REACT_APP_API_URL}/race/?url=` +
        encodeURIComponent(raceUrl)
    );
    const response = await fetch(
      `${process.env.REACT_APP_API_URL}/race/?url=` +
        encodeURIComponent(raceUrl),
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
