// This page shows all Races for a particular Meeting

// Import dependancies
import { useState, useEffect } from "react";
import getMeetingRaces from "../services/getMeetingRaces";
import "./MeetingRaces.css";
import Spinner from "./Spinner";
import { Link } from "react-router-dom";

//Get Races data for a Meeting
const MeetingRaces = (props) => {
  console.log("MeetingRaces Component Called!");
  // Create stateful variable to store meeting race data
  const [meetingRaces, setMeetingRaces] = useState();
  const url = props.url;

  // Run useEffect once to initially fetch meetingRaces
  useEffect(() => {
    const loadRaces = async () => {
      const result = await getMeetingRaces(url);
      setMeetingRaces(result.races);
    };
    loadRaces();
  }, [url]);

  //Render and return meetingRaces element to application - Show loading animation if promise still pending (meetingRaces = undefined)

  if (meetingRaces === undefined) {
    return (
      <div className="centertext">
        <h2>Fetching Meeting Info...</h2>
        <Spinner />
      </div>
    );
  } else console.log("Races: ", meetingRaces);
  return (
    <div className="meetingraces-container">
      <div>
        <h2>Race</h2>
        <ol>
          {meetingRaces.map((race, index) => (
            <li key={index + race.raceNumber}>{race.raceNumber}</li>
          ))}
        </ol>
      </div>
      <div>
        <h2>Name</h2>
        <ol>
          {meetingRaces.map((race, index) => (
            <li key={index + race.raceName}>
              {race._links.self !== undefined && (
                <Link
                  to={"races/" + encodeURIComponent(race._links.races)}
                  className="link-text"
                >
                  {race.raceName}
                </Link>
              )}
              {race._links === undefined && (
                <Link to={"/"} className="link-text">
                  {race.raceName}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h2>Distance</h2>
        <ol>
          {meetingRaces.map((race, index) => (
            <li key={index + race.raceDistance + race.raceName}>
              {race.raceDistance}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h2>Runners</h2>
        <ol>
          {meetingRaces.map((race, index) => (
            <li key={index + race.raceName + race.numberOfStarters}>
              {race.numberOfStarters}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

export default MeetingRaces;
