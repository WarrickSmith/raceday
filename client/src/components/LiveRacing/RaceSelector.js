// This component will return an Element to select a race from todays races

// Import dependancies
import "./RaceSelector.css";

// Render RaceSelector Element
const RaceSelector = ({ allRaces, currentRace, setCurrentRace }) => {
  console.log(`RaceSelector Element Loading...`);

  // Event handler for selecting different race from dropdown list
  const handleOnChange = (event) => {
    console.log(`A change has been detected!`);
    console.log(`event.target.value: ${event.target.value}`);
    // use parseInt to ensure numeric type is forced, otherwise may default to text
    setCurrentRace(parseInt(event.target.value));
  };

  // Event handler for clicking on 'NEXT SCHEDULED RACE'
  const handleOnClick = (event) => {
    console.log(`A click event has been detected!`);
    // setCurrentRace(getNextRace(raceList));
    console.log(`current race is: ${currentRace}`);
    const dateNow = new Date();
    const raceIndex = allRaces.findIndex(
      (race) => new Date(race.RaceStartTime) >= dateNow
    );
    console.log(`RaceIndex is ${raceIndex}`);
    setCurrentRace(raceIndex);
  };

  // Event handler for clicking on '<<' decrease race by one
  const handleOnClickMinus = () => {
    if (currentRace > 0) {
      setCurrentRace((previousRace) => previousRace - 1);
    }
  };

  // Event handler for clicking on '>>' increase race by one
  const handleOnClickPlus = () => {
    const numberOfRaces = allRaces.length;
    if (currentRace < numberOfRaces - 1) {
      setCurrentRace((previousRace) => previousRace + 1);
    }
  };

  // Confirm current Race is being updates as appropriate
  console.log(`Current Active Race: `, currentRace);

  return (
    <>
      <div className="raceselector-container meetings-container">
        {allRaces && (
          <select
            className="race-select-textbox"
            id="raceList"
            name="raceList"
            value={currentRace}
            onChange={handleOnChange}
          >
            {allRaces.map((race, index) => (
              <option key={race.RaceStartTime + race.RaceName} value={index}>
                {/* format date field to shorten width of rendered sttring */}
                {`${new Date(race.RaceStartTime).toLocaleString("en-nz", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })} - Race ${race.RaceNumber} @ ${race.MeetingName} (${
                  race.RaceType
                })`}
              </option>
            ))}
          </select>
        )}
        <div className="selector-buttons">
          <button
            className="button-minus"
            onClick={handleOnClickMinus}
          >{`<<`}</button>
          <button className="button-next" onClick={handleOnClick}>
            NEXT SCHEDULED RACE
          </button>
          <button
            className="button-plus"
            onClick={handleOnClickPlus}
          >{`>>`}</button>
        </div>
      </div>
    </>
  );
};
export default RaceSelector;
