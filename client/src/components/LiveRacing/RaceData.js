// This component will return an Element to show race specific data for the race URL provided

// Import dependancies
import Spinner from "../Spinner";

// Return RaceData element
const RaceData = ({ raceUrl }) => {
  console.log("RaceData Element Loading...", raceUrl);
  if (raceUrl === undefined) {
    return (
      <div className="centertext">
        <h2>Awaiting RaceData...</h2>
        <Spinner />
      </div>
    );
  } else
    return (
      <div className="racedata-container">
        <h2>RaceData Element Loading...</h2>
        <p>Current Race URL is: {raceUrl}</p>
      </div>
    );
};

export default RaceData;
