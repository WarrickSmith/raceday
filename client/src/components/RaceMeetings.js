// This component will call the getMeetings service and display a list of todays Race Meetings

// Import dependancies
import { useState, useEffect } from "react";
import getRaceMeetings from "../services/getRaceMeetings";

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
      <div>
        <h2>Fetching race Meetings for Today...</h2>
        <img
          src={"loading.gif"}
          alt={"loading placeholder"}
          width={270}
          height={270}
        />
      </div>
    );
  } else
    console.log(`"meetings" Length for element mapping is: `, meetings.length);
  return (
    <div>
      <h3>Todays Meetings</h3>
      <ol>
        {meetings.map((meeting, index) => (
          <li key={index}>{meeting.meetingName}</li>
        ))}
      </ol>
    </div>
  );
};

export default RaceMeetings;
