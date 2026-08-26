import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import ApiKeySettings from "./components/ApiKeySettings";
import WelcomePage from "./pages/WelcomePage";
import PlaygroundPage from "./pages/PlaygroundPage";
import DiffPage from "./pages/DiffPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import RiskAnalyzerPage from "./pages/RiskAnalyzerPage";
import BillingPage from "./pages/BillingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";

// Initialize global dependencies securely
import { initializeCredits } from "./utils/creditStore";
initializeCredits();
import { Toaster } from "react-hot-toast";

const App: React.FC = () => {
  const [keysOpen, setKeysOpen] = useState(false);

  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#0b0b0f] text-slate-100 antialiased">
          <Navbar onKeys={() => setKeysOpen(true)} />

          <main id="main-content">
            <Routes>
              <Route path="/" element={<WelcomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Protected Execution Routes */}
              <Route element={<ProtectedRoute />}>
                <Route
                  path="/playground"
                  element={
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
                      <PlaygroundPage />
                    </div>
                  }
                />
                <Route
                  path="/diff"
                  element={
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
                      <DiffPage />
                    </div>
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
                      <AnalyticsPage />
                    </div>
                  }
                />
                <Route
                  path="/risk"
                  element={
                    <div className="mx-auto w-full max-w-[1700px] px-4 sm:px-6 lg:px-8 xl:px-12 py-8">
                      <RiskAnalyzerPage />
                    </div>
                  }
                />
                <Route
                  path="/billing"
                  element={
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
                      <BillingPage />
                    </div>
                  }
                />
              </Route>

              <Route
                path="*"
                element={
                  <div className="flex flex-col items-center justify-center gap-3 py-40 text-center">
                    <p className="text-5xl font-bold text-[#1e1e2c]">404</p>
                    <p className="text-slate-600 text-sm">Page not found</p>
                    <a href="#/" className="text-amber-500 hover:text-amber-400 text-sm underline">
                      Go home
                    </a>
                  </div>
                }
              />
            </Routes>
          </main>

          {keysOpen && <ApiKeySettings onClose={() => setKeysOpen(false)} />}

          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50
                     focus:bg-amber-500 focus:text-black focus:px-3 focus:py-1.5 focus:rounded-lg focus:text-sm"
          >
            Skip to content
          </a>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: { background: '#1e1e2c', color: '#f1f5f9', border: '1px solid #2a2a38' },
              success: { iconTheme: { primary: '#10b981', secondary: '#1e1e2c' } },
              error: { iconTheme: { primary: '#ef4444', secondary: '#1e1e2c' } },
            }}
          />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
