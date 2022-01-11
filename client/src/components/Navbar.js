// This component shows a consistent header at the tope of the application page with links to live racing and race data

import "./Navbar.css";
import { Link } from "react-router-dom";
import Logo from "../logo.png";
import LoginButton from "./LoginButton";

const Navbar = () => {
  console.log("Navbar Component Rendered!");
  return (
    <nav className="navbar">
      <div className="container">
        <Link to="/" className="navbar-title">
          <img src={Logo} alt="company logo" width="100" />
        </Link>
        <ul className="nav">
          <li className="nav-item">
            <Link to="/" className="nav-link">
              Home
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/raceday" className="nav-link">
              Live Racing
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/racedata" className="nav-link">
              Race Data
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/about" className="nav-link">
              About
            </Link>
          </li>
          <li className="nav-item">
            <LoginButton />
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
