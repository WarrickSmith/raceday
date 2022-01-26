// This component will call the getAllRaces service and display a list of todays Race Meetings

// Import dependancies
import { useState, useEffect } from "react";
// import getallRaces from "../services/getAllRaces";
import "./LiveRacing.css";
import Spinner from "../Spinner";

const LiveRacing = () => {
  console.log("LiveRacing Element Rendered");
  //Render and return LiveRacing element to application - Show loading animation if promise still pending (allRaces = undefined)
  return (
    <div className="centertext">
      <h2>The LiveRacing Element has rendered</h2>
      <Spinner />
    </div>
  );
};

export default LiveRacing;
