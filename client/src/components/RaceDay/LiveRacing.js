// This component will call the getAllRaces service and display a list of todays Race Meetings

// Import dependancies
import { useState, useEffect } from "react";
import getAllRaces from "../../services/getAllRaces";
import "./LiveRacing.css";
import Spinner from "../Spinner";

// Get 'all races' data
const LiveRacing = () => {
  console.log("LiveRacing Element Rendered");
  // Create stateful variable to store allRaces data
  const [allRaces, setAllRaces] = useState();

  // Run useEffect once to initially fetch allRaces data
  useEffect(() => {
    const loadAllRaces = async () => {
      const result = await getAllRaces();
      setAllRaces(result);
      return;
    };
    loadAllRaces();
  }, []);

  //Render and return LiveRacing element to application - Show loading animation if promise still pending (allRaces = undefined)
  if (allRaces === undefined) {
    return (
      <div className="centertext">
        <h2>The LiveRacing Element has rendered</h2>
        <Spinner />
      </div>
    );
  } else console.log("Number of races today: ", allRaces.length);

  // Map allRaces array and build elements for relevant array items
  return (
    <div className="meetings-container">
      <div>
        <h2>Race</h2>
        <ol>
          {allRaces.map((race, index) => (
            <li key={index + race.RaceName}>{race.RaceName}</li>
          ))}
        </ol>
      </div>
      <div>
        <h2>Time</h2>
        <ol>
          {allRaces.map((race, index) => (
            <li key={index + race.RaceStartTime}>{race.RaceStartTime}</li>
          ))}
        </ol>
      </div>
      <div>
        <h2>Type</h2>
        <ol>
          {allRaces.map((race, index) => (
            <li key={index + race.RaceType}>{race.RaceType}</li>
          ))}
        </ol>
      </div>
    </div>
  );
};

export default LiveRacing;
