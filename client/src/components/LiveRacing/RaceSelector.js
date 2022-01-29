// This component will return an Element to select a race from todays races

// Import dependancies
import Spinner from "../Spinner";

// Render Element
const RaceSelector = ({ allRaces }) => {
  return (
    <>
      <div className="centertext">
        <Spinner />
      </div>
      <div>
        <h2>Race</h2>
        <ol>
          {allRaces.map((race, index) => (
            <li key={index + race.RaceName}>{race.RaceName}</li>
          ))}
        </ol>
      </div>
    </>
  );
};
export default RaceSelector;
