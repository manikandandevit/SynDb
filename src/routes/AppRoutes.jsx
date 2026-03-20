import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Landing from "../features/landing/Landing";
import Dashboard from "../features/dashboard/Dashboard";

function AppRoutes() {
  return (
    <BrowserRouter>
      <div className="h-full min-h-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default AppRoutes;
