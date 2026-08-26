import React from "react";
import DiffView from "../components/DiffView";

const DiffPage: React.FC = () => (
  <div className="flex flex-col gap-6">
    <div>
      <h1 className="text-2xl font-bold text-white">Model Output Diff View</h1>
      <p className="text-sm text-slate-400 mt-1">
        Compare outputs from two model versions using the Anchor-Based Token Diff (ABTD) algorithm.
      </p>
    </div>
    <DiffView />
  </div>
);

export default DiffPage;
