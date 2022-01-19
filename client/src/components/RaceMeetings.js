// This component will call the getMeetings service and display a list of todays Race Meetings

// Import dependancies
import { useState, useEffect } from "react";
import getRaceMeetings from "../services/getRaceMeetings";
import "./RaceMeetings.css";
import "./Spinner";
import Spinner from "./Spinner";

// Get race meetings data
const RaceMeetings = () => {
  // Create stateful variable to store meetingsData
  const [meetings, setMeetings] = useState();

  // Run useEffect once to initially fetch meetingsData
  useEffect(() => {
    const loadMeetings = async () => {
      const result = await getRaceMeetings();
      setMeetings(result.meetings);
      return result;
    };
    loadMeetings();
  }, []);

  //Render and return elements to application - Show loading gif if promise still pending (meetings = undefined)

  if (meetings === undefined) {
    return (
      <div className="centertext">
        <h2>Fetching Race Meetings for Today...</h2>
        <Spinner />
      </div>
    );
  } else
    console.log(`"meetings" Length for element mapping is: `, meetings.length);
  return (
    <>
      <div className="container">
        <div>
          <h2>Meeting</h2>
          <ol>
            {meetings.map((meeting, index) => (
              <li key={index + meeting.meetingName}>{meeting.meetingName}</li>
            ))}
          </ol>
        </div>
        <div>
          <h2>Location</h2>
          <ol>
            {meetings.map((meeting, index) => (
              <li key={index + meeting.location}>{meeting.location}</li>
            ))}
          </ol>
        </div>
        <div>
          <h2>Type</h2>
          <ol>
            {meetings.map((meeting, index) => (
              <li key={index + meeting.raceType}>{meeting.raceType}</li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
};

export default RaceMeetings;
