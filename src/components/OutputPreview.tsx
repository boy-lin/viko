import React from "react";
import VideoPreview from "./VideoPreview";

interface Props {
  config: any;
}

const OutputPreview: React.FC<Props> = ({ config }) => {
  const filePath = `${config.outputDir}/${config.outputName}.${config.format}`;
  return (
    <div className="p-4 border rounded bg-gray-50">
      {/* 输出文件路径预览 Cursor Write It */}
      <div className="font-semibold mb-2">输出文件路径预览</div>
      <div className="text-sm break-all text-blue-700">{filePath}</div>

      <VideoPreview filePath={filePath} />
    </div>
  );
};

export default OutputPreview;
