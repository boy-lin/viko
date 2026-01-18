import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import RootLayout from "./layout/RootPage";
import HomePage from "./pages/home/v2";
import TaskListPage from "./pages/tasks/TaskListPage";
import BatchPage from "./pages/batch/BatchPage";
import CompressorPage from "./pages/compressor";
import ConverterPage from "./pages/converter";
import Mp3ConverterPage from "./pages/demo/converter";
import AudioTestPage from "./pages/demo/AudioTestPage";
import HomePageV1 from "./pages/home/HomePage";
import VideoPlayerPage from "./pages/demo/VideoPlayer";
import MyFilesPage from "./pages/myfiles";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootLayout />}>
          <Route index element={<HomePage />} />

          <Route path="compressor" element={<CompressorPage />} />
          <Route path="converter" element={<ConverterPage />} />
          <Route path="my">
            <Route path="files" element={<MyFilesPage />} />
          </Route>

          <Route path="tasks" element={<TaskListPage />} />
          <Route path="batch" element={<BatchPage />} />
          <Route path="demo">
            <Route path="mp3" element={<Mp3ConverterPage />} />
            <Route path="audio-test" element={<AudioTestPage />} />
            <Route path="v1" element={<HomePageV1 />} />
          </Route>
          <Route path="ui">
            <Route path="video-player" element={<VideoPlayerPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
