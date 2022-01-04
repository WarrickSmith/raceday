// This component shows a consistent header at the tope of the application page with links to live racing and race data

import "./Header.css";
import { Link } from "react-router-dom";
import Logo from "../logo.png";
import LoginButton from "./LoginButton";

const Header = () => {
  return (
    <header className="header">
      <div className="container">
        <Link to="/" className="header-title">
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
    </header>
  );
};

export default Header;
