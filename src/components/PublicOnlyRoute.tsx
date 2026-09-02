import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Prevent signed-in users from returning to registration or login screens. */
const PublicOnlyRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-amber-500/30 border-t-amber-500" />
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/playground" replace /> : <Outlet />;
};

export default PublicOnlyRoute;
