// Service to Connect to the RaceDay Server API and query all races for 'today'

// return allRaces array

const getAllRaces = async () => {
  try {
    const response = await fetch("http://localhost:5000/allraces");
    if (!response.ok) {
      throw Error(`${response.status} ${response.statusText}`);
    } else {
      const allRaces = await response.json();
      console.log(`All Races Fetched from Service - getAllRaces: `);
      return allRaces;
    }
  } catch (error) {
    console.log(
      `There has been a problem fetching All Racess (getAllRaces):
    Please re-load the web page.`,
      error
    );

    return error;
  }
};

export default getAllRaces;
