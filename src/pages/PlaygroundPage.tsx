import React from "react";
import InferencePlayground from "../components/InferencePlayground";

const PlaygroundPage: React.FC = () => (
  <div className="flex flex-col gap-6">
    <div>
      <h1 className="text-2xl font-bold text-white">Inference Playground</h1>
      <p className="text-sm text-slate-400 mt-1">
        Submit prompts via text or audio and stream model responses in real time.
      </p>
    </div>
    <InferencePlayground />
  </div>
);

export default PlaygroundPage;
