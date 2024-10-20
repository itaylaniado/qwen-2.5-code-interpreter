import React from "react";

interface ProgressBoxProps {
  progress: string;
}

const ProgressBox: React.FC<ProgressBoxProps> = ({ progress }) => {
  return (
    <div className="w-full max-w-md mb-6 bg-card rounded-lg shadow-md overflow-hidden">
      <div className="px-4 py-3 bg-accent">
        <h3 className="text-accent-foreground font-semibold">Loading Progress</h3>
      </div>
      <div className="p-4">
        <p className="text-card-foreground text-sm break-words">{progress}</p>
      </div>
    </div>
  );
};

export default ProgressBox;
