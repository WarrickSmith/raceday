// This component will call the getAllRaces service and display a list of todays Race Meetings

// Import dependancies
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import getAllRaces from "../../services/getAllRaces";
import "./LiveRacing.css";
import Spinner from "../Spinner";
import RaceSelector from "./RaceSelector";
import RaceData from "./RaceData";

// Get 'all races' data
const LiveRacing = () => {
  console.log("LiveRacing Element Rendered");
  // Create stateful variable to store allRaces data
  const [allRaces, setAllRaces] = useState();
  // Create stateful variable to track currently selected Race
  const [currentRace, setCurrentRace] = useState(0);

  // Run useEffect once to initially fetch allRaces data and set relevant variables
  useEffect(() => {
    const loadAllRaces = async () => {
      const result = await getAllRaces();
      // find and set current race (currentRace) based on current local time
      if (!result.length) {
        setAllRaces("ERROR!");
        return;
      }
      const dateNow = new Date();
      const raceIndex = result.findIndex(
        (race) => new Date(race.RaceStartTime) >= dateNow
      );
      // update variable states to trigger re-render of relevant elements
      setCurrentRace(raceIndex);
      setAllRaces(result);
      return;
    };
    loadAllRaces();
  }, []);

  //Render and return LiveRacing element to application - Show loading animation if promise still pending (allRaces = undefined)
  if (allRaces === "ERROR!") {
    return (
      <div className="centertext">
        <h2>Error fetching All Races for Today!</h2>
        <Link to="/" className="nav-link">
          <h3>'Click Me' to Show Meetings</h3>
        </Link>
      </div>
    );
  } else if (allRaces === undefined) {
    return (
      <div className="centertext">
        <h2>The LiveRacing Element Rendering...</h2>
        <Spinner />
      </div>
    );
  } else console.log("Number of races today: ", allRaces.length);

  // Map allRaces array and build elements for relevant array items
  return (
    <div className="liveracing-container">
      <RaceSelector
        allRaces={allRaces}
        currentRace={currentRace}
        setCurrentRace={setCurrentRace}
      />
      <RaceData raceUrl={allRaces[currentRace].RaceLink} />
    </div>
  );
};

export default LiveRacing;
