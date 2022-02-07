// This component will return an Element to show race specific data for the race URL provided

// Import dependancies
import { useState, useEffect } from "react";
import Spinner from "../Spinner";
import getRace from "../../services/getRace";
import "./RaceData.css";

// Return RaceData element
const RaceData = ({ raceUrl }) => {
  console.log("RaceData Element Loading...");
  // Create stateful variable to track current RaceData
  const [raceData, setRaceData] = useState();

  // Run useEffect once to initially fetch raceData by passing raceUrl to getRace()
  useEffect(() => {
    const loadRace = async () => {
      const result = await getRace(raceUrl);
      setRaceData(result);
      return;
    };
    try {
      loadRace();
    } catch (error) {
      return (
        <>
          <h3>An error Has Occurred fetching Data for a single race</h3>
          <p>error</p>
        </>
      );
    }
  }, [raceUrl]);

  // render a spinner until raceData is returned
  if (raceData === undefined) {
    return (
      <div className="centertext">
        <h2>Awaiting RaceData...</h2>
        <p>Current Race URL is: {raceUrl}</p>
        <Spinner />
      </div>
    );
  }
  // Render raceData information for a specific race (raceUrl)
  else
    return (
      <div className="racedata-container">
        <h2>RaceData:</h2>
        <h3>Race Type: {raceData.meeting.raceType}</h3>
        <p>Current Race number: {raceData.raceNumber} </p>
        <p>Race Name: {raceData.raceName}</p>
        <p>Race Distance: {raceData.raceDistance}</p>
        <p>RUNNERS:</p>
        <ol className="messy">
          {raceData.runners.map((runner, index) => (
            <li key={index + runner.runnerName}>
              &nbsp;&nbsp;{" "}
              <img alt="" src={runner.silkURL} width="20" height="20"></img>
              &nbsp;&nbsp;
              {runner.runnerName}
            </li>
          ))}
        </ol>
      </div>
    );
};

export default RaceData;
