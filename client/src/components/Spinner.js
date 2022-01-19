// This component creates a 'spinner' to display when awaiting an action or response
// Credit to Kalidas M  https://codepen.io/kalidasm/embed/RwNXQxw?height=448&theme-id=dark&default-tab=js,result */

import "./Spinner.css";

const Spinner = () => (
  <div className="lds-spinner">
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
  </div>
);

export default Spinner;
