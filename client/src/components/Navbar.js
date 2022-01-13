// This component shows a consistent header at the tope of the application page with links to live racing and race data

import "./Navbar.css";
import { Link } from "react-router-dom";
import React, { useState } from "react";
import Logo from "../logo.png";
import { MdClose } from "react-icons/md";
import { FiMenu } from "react-icons/fi";
import { FaHome } from "react-icons/fa";
import { FaHorseHead } from "react-icons/fa";
import { FaDatabase } from "react-icons/fa";
import { FaInfoCircle } from "react-icons/fa";

const Navbar = () => {
  console.log("Navbar Component Rendered!");

  // Use useState and handleToggle to track hamburger open/close status
  const [navbarOpen, setNavbarOpen] = useState(false);
  const handleToggle = () => {
    setNavbarOpen((prev) => !prev);
  };
  const closeMenu = () => {
    setNavbarOpen(false);
  };

  // Return the nav bar elements
  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        <img
          src={Logo}
          alt="company logo"
          width="75"
          onClick={() => closeMenu()}
        />
      </Link>
      <button className="btn-burger" onClick={handleToggle}>
        {navbarOpen ? (
          <MdClose className="burger" />
        ) : (
          <FiMenu className="burger" />
        )}
      </button>
      <ul className={`menunav ${navbarOpen ? " showMenu" : ""}`}>
        <li className="nav-item">
          <Link to="/" className="nav-link" onClick={() => closeMenu()}>
            <FaHome className="icon" /> Home
          </Link>
        </li>
        <li className="nav-item">
          <Link to="/raceday" className="nav-link" onClick={() => closeMenu()}>
            <FaHorseHead className="icon" /> Live Racing
          </Link>
        </li>
        <li className="nav-item">
          <Link to="/racedata" className="nav-link" onClick={() => closeMenu()}>
            <FaDatabase className="icon" /> Race Data
          </Link>
        </li>
        <li className="nav-item">
          <Link to="/about" className="nav-link" onClick={() => closeMenu()}>
            <FaInfoCircle className="icon" /> About
          </Link>
        </li>
      </ul>
    </nav>
  );
};

export default Navbar;
