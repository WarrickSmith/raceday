// This page shows a list of Races

import MeetingRaces from "../components/MeetingRaces";
import "./Races.css";
import { useParams } from "react-router-dom";

function Races() {
  const { url } = useParams();
  return (
    <>
      <main className="races-container">
        <h2>Meeting Races</h2>
        <MeetingRaces url={url} />
      </main>
    </>
  );
}

export default Races;
