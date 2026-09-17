// Route guard for company pages (dashboard + logistics). Redirects
// unauthenticated visitors to /login, preserving the target path.
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";
import { PageSpinner } from "../components/ui.jsx";

export default function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageSpinner />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
