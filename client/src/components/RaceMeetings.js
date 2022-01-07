// This component will call the getMeetings service and display a list of todays Race Meetings

// Import dependancies
import getRaceMeetings from "../services/getRaceMeetings";

// Get race meetings data
const RaceMeetings = () => {
  const result = getRaceMeetings();
  console.log(result);
  return <div>Done!</div>;
};

export default RaceMeetings;
