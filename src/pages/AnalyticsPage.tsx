import React from "react";
import AnalyticsDashboard from "../components/AnalyticsDashboard";

const AnalyticsPage: React.FC = () => (
  <div className="flex flex-col gap-6">
    <div>
      <h1 className="text-2xl font-bold text-white">Analytics Dashboard</h1>
      <p className="text-sm text-slate-400 mt-1">
        Visualise token throughput, latency, and similarity across inference sessions.
      </p>
    </div>
    <AnalyticsDashboard />
  </div>
);

export default AnalyticsPage;
