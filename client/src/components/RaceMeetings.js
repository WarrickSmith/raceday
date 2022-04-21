// This component will call the getMeetings service and display a list of todays Race Meetings

// Import dependancies
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import getRaceMeetings from "../services/getRaceMeetings";
import "./RaceMeetings.css";
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
      return;
    };
    loadMeetings();
  }, []);

  //Render and return meetings element to application - Show loading animation if promise still pending (meetings = undefined)

  if (meetings === undefined) {
    return (
      <div className="centertext">
        <h2>Fetching Meeting Info...</h2>
        <Spinner />
      </div>
    );
  } else
    console.log(`"meetings" Length for element mapping is: ${meetings.length}`);

  // Map meetings array and build elements for relevant array items
  return (
    <div className="meetings-container">
      <div>
        <h2>Meeting</h2>
        <ol>
          {meetings.map((meeting, index) => (
            <li key={index + meeting.meetingName}>
              {meeting._links !== undefined && (
                <Link
                  to={"races/" + encodeURIComponent(meeting._links.races)}
                  className="link-text"
                >
                  {meeting.meetingName}
                </Link>
              )}
              {meeting._links === undefined && (
                <Link to={"/"} className="link-text">
                  {meeting.meetingName}
                </Link>
              )}
            </li>
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
  );
};

export default RaceMeetings;
