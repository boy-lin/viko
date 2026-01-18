import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import RootLayout from "./layout/RootPage";
import HomePage from "./pages/home/v2";
import HomePageOld from "./pages/home/HomePage";
import TaskListPage from "./pages/tasks/TaskListPage";
import BatchPage from "./pages/batch/BatchPage";
import AudioTestPage from "./pages/audio-test/AudioTestPage";
import Mp3ConverterPage from "./pages/mp3/converter";
import ConverterPage from "./pages/converter/v2/v2";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootLayout />}>
          <Route index element={<HomePage />} />
          <Route path="tasks" element={<TaskListPage />} />
          <Route path="batch" element={<BatchPage />} />
          <Route path="audio-test" element={<AudioTestPage />} />
          <Route path="mp3/converter" element={<Mp3ConverterPage />} />
          <Route path="converter" element={<ConverterPage />} />
        </Route>
        <Route path="/old" element={<HomePageOld />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
