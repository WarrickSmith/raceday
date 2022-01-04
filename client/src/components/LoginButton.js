// This component displays a Log In/Log out button in the page header. It's status is dependant on the user being successfully authenticated by auth0

import "./LoginButton.css";
// import { useAuth0 } from "@auth0/auth0-react";

const LoginButton = () => {
  //   const { loginWithRedirect, logout, isAuthenticated, isLoading } = useAuth0();

  //   if (isLoading) {
  //     return <p>Loading login details...</p>;
  //   }

  //   if (isAuthenticated) {
  //     return (
  //       <button
  //         className="btn-login"
  //         onClick={() => logout({ returnTo: window.location.origin })}
  //       >
  //         Log Out
  //       </button>
  //     );
  //   }

  //   return (
  //     <button className="btn-login" onClick={() => loginWithRedirect()}>
  //       Log In
  //     </button>
  //   );
  // };

  return <button className="btn-login">Log In</button>;
};
export default LoginButton;
